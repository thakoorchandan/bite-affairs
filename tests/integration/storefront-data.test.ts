import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb, schema, withTransaction } from "@/db";
import { getBusinessHours, getBusinessSettings, getHomeContentData, getKitchenStatus, updateBusinessHours, updateBusinessSettings, updateHomeContentData } from "@/services/settings.service";
import { fetchPublicMenu, fetchPublicProductBySlug } from "@/services/catalog.service";
import { buildQuote } from "@/services/quote.service";
import { checkServiceability } from "@/services/delivery.service";
import { consumeCoupon, findEligibleCoupon, releaseCouponForOrder } from "@/services/coupon.service";
import { createCoupon, createCustomer, friesWithPeriPeri, product, resetDatabase } from "./helpers";

beforeEach(resetDatabase);
afterAll(() => closeDb());

describe("settings, hours and content", () => {
  it("applies defaults, merges patches section by section and round-trips Dates", async () => {
    const before = await getBusinessSettings();
    expect(before.kitchen.mode).toBe("OPEN"); // helpers open the kitchen
    expect(before.delivery.pickupEnabled).toBe(true);
    expect(before.tax).toEqual({ rateBps: 0, inclusive: true, label: "GST" });

    const until = new Date(Date.now() + 3600_000);
    const after = await updateBusinessSettings({ contactPhone: "9000000000", kitchen: { mode: "PAUSED", pausedUntil: until }, delivery: { defaultFee: 4000 } });
    expect(after.contactPhone).toBe("9000000000");
    expect(after.kitchen.mode).toBe("PAUSED");
    expect(after.kitchen.pausedUntil?.getTime()).toBe(until.getTime());
    expect(after.kitchen.preordersEnabled).toBe(false); // untouched keys survive
    expect(after.delivery.defaultFee).toBe(4000);
    expect(after.delivery.enabled).toBe(true);
    expect((await getKitchenStatus()).state).toBe("PAUSED");

    const closure = await updateBusinessSettings({ kitchen: { temporaryClosure: { active: true, message: "Renovation" } } });
    expect(closure.kitchen.mode).toBe("PAUSED"); // a nested patch never resets sibling keys
    expect(closure.kitchen.temporaryClosure).toMatchObject({ active: true, message: "Renovation", from: null });
  });

  it("stores hours and storefront content", async () => {
    const h = await getBusinessHours();
    expect(h.weekly).toHaveLength(7);
    const next = await updateBusinessHours({ specialDates: [{ date: "2026-12-25", isClosed: true, slots: [] }] });
    expect(next.specialDates).toHaveLength(1);
    expect(next.weekly).toHaveLength(7);

    const c = await getHomeContentData();
    expect(c.hero.heading).toMatch(/Real Chinese/);
    expect(c.combos.categoryId).toBeTruthy(); // from the seed
    const c2 = await updateHomeContentData({ hero: { heading: "New heading" }, announcement: { text: "Hi", isActive: true } });
    expect(c2.hero.heading).toBe("New heading");
    expect(c2.hero.subheading).toBe(c.hero.subheading);
    expect(c2.announcement).toEqual({ text: "Hi", isActive: true });
  });
});

describe("catalog", () => {
  it("returns the public menu and product detail with customisation groups", async () => {
    const menu = await fetchPublicMenu();
    expect(menu.categories).toHaveLength(10);
    expect(menu.products).toHaveLength(33);
    expect(menu.categories[0].productCount).toBe(6);
    expect(menu.products[0].categoryName).toBe("Sandwiches");
    expect(menu.products.find((p) => p.slug === "french-fries")!.hasCustomisations).toBe(true);

    const detail = await fetchPublicProductBySlug("french-fries");
    expect(detail!.customisationGroups[0].options[0]).toMatchObject({ name: "Extra Peri Peri", priceDelta: 1700 });
    expect(await fetchPublicProductBySlug("nope")).toBeNull();

    const db = await getDb();
    await db.update(schema.products).set({ isActive: false }).where(eq(schema.products.slug, "french-fries"));
    expect(await fetchPublicProductBySlug("french-fries")).toBeNull();
    expect((await fetchPublicMenu()).products).toHaveLength(32);
  });
});

describe("delivery, quote and coupons", () => {
  it("checks PIN serviceability from zones", async () => {
    const s = await getBusinessSettings();
    expect(await checkServiceability("700001", s)).toMatchObject({ serviceable: true, deliveryFee: 3000, estimatedMinutes: 25 });
    expect((await checkServiceability("110001", s)).serviceable).toBe(false);
    expect((await checkServiceability("12", s)).reason).toMatch(/6-digit/);
    const off = await updateBusinessSettings({ delivery: { suspended: true } });
    expect((await checkServiceability("700001", off)).serviceable).toBe(false);
  });

  it("prices a cart from the database and applies coupons", async () => {
    await createCoupon();
    const { fries, groupId, optionId } = await friesWithPeriPeri();
    const pizza = await product("margaretta-pizza");
    const items = [
      { productId: pizza.id, quantity: 2, selections: [] },
      { productId: fries.id, quantity: 1, selections: [{ groupId, optionIds: [optionId] }] },
    ];
    const q = await buildQuote({ items, fulfilment: "DELIVERY", pincode: "700001", couponCode: "welcome10" });
    expect(q.issues).toEqual([]);
    expect(q.totals.subtotal).toBe(2 * 19100 + 17300 + 1700);
    expect(q.coupon).toMatchObject({ applied: true, code: "WELCOME10" });
    expect(q.totals.couponDiscount).toBe(Math.floor(q.totals.subtotal / 10));
    expect(q.totals.deliveryFee).toBe(3000);
    expect(q.totals.total).toBe(q.totals.subtotal - q.totals.couponDiscount + 3000);
    expect(q.couponDoc?.id).toBeTruthy();

    const bad = await buildQuote({ items: [{ productId: "not-a-uuid", quantity: 1, selections: [] }], fulfilment: "PICKUP" });
    expect(bad.blockingReasons[0]).toMatch(/no longer on the menu/);
    const out = await buildQuote({ items, fulfilment: "DELIVERY", pincode: "110001" });
    expect(out.blockingReasons.join(" ")).toMatch(/don't deliver/);
  });

  it("enforces coupon rules: limits, per-customer use, first order, expiry", async () => {
    const db = await getDb();
    const c = await createCoupon({ code: "ONCE", perCustomerLimit: 1, firstOrderOnly: true });
    expect((await findEligibleCoupon("nope!", {})).error).toMatch(/isn't valid/);
    expect((await findEligibleCoupon("ONCE", { phone: "9830000099" })).coupon?.id).toBe(c.id);

    const u = await createCustomer("9876522222");
    const [o] = await db.insert(schema.orders).values({ orderNumber: "BA000000-901", idempotencyKey: "k901", userId: u.id, isGuest: false, customerName: "X", customerPhone: "9876522222", itemsSubtotal: 100, subtotal: 100, total: 100, paymentMethod: "COD", status: "PLACED", trackingTokenHash: "h" }).returning();
    expect((await findEligibleCoupon("ONCE", { userId: u.id })).error).toMatch(/first order/);
    await db.insert(schema.couponRedemptions).values({ couponId: c.id, code: "ONCE", orderId: o.id, userId: u.id, customerKey: "phone:9876522222", discount: 50 });
    expect((await findEligibleCoupon("ONCE", { phone: "9876522222" })).error).toMatch(/already used/);

    await db.update(schema.coupons).set({ endsAt: new Date(Date.now() - 1000) }).where(eq(schema.coupons.id, c.id));
    expect((await findEligibleCoupon("ONCE", {})).error).toMatch(/expired/);
  });

  it("never over-consumes a limited coupon and releases a use idempotently", async () => {
    const db = await getDb();
    const c = await createCoupon({ code: "TWO", usageLimit: 2, perCustomerLimit: 0 });
    const outcomes = await Promise.all(Array.from({ length: 6 }, () => withTransaction((tx) => consumeCoupon(c.id, tx))));
    expect(outcomes.filter(Boolean)).toHaveLength(2);
    expect((await db.select().from(schema.coupons).where(eq(schema.coupons.id, c.id)))[0].usedCount).toBe(2);

    const u = await createCustomer("9876533333");
    const [o] = await db.insert(schema.orders).values({ orderNumber: "BA000000-902", idempotencyKey: "k902", userId: u.id, isGuest: false, customerName: "X", customerPhone: "9876533333", itemsSubtotal: 100, subtotal: 100, total: 100, paymentMethod: "COD", status: "PLACED", trackingTokenHash: "h" }).returning();
    await db.insert(schema.couponRedemptions).values({ couponId: c.id, code: "TWO", orderId: o.id, customerKey: "phone:9876533333", discount: 50 });
    await releaseCouponForOrder(o.id);
    await releaseCouponForOrder(o.id); // second call is a no-op
    expect((await db.select().from(schema.coupons).where(eq(schema.coupons.id, c.id)))[0].usedCount).toBe(1);
  });
});
