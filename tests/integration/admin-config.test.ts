import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { count, eq, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { closeDb, getDb, schema } from "@/db";
import { deleteCategory, deleteCoupon, moderateReview, patchProduct, saveCoupon, saveProduct } from "@/services/admin-catalog.service";
import { saveDeliveryZone, setKitchenMode, updateKitchenControl, updatePaymentSettings } from "@/services/admin-config.service";
import { deleteMedia, registerUpload } from "@/services/media.service";
import { getProfitReport, saveExpense } from "@/services/finance.service";
import { createOrder, transitionOrderStatus, recordCodCollection } from "@/services/order.service";
import { defaultRange } from "@/services/finance.service";
import { createCustomer, guest, key, product, resetDatabase } from "./helpers";

const { businessSettings, categories, couponRedemptions, coupons, deliveryZones, expenses, orders, productCosts, productMedia, products, reviews, users } = schema;

beforeEach(resetDatabase);
afterEach(() => vi.unstubAllGlobals());
afterAll(() => closeDb());

async function categoryId(slug: string) {
  const db = await getDb();
  const [c] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  return c.id;
}

async function getProduct(id: string) {
  const db = await getDb();
  const [p] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return p;
}

async function getCoupon(id: string) {
  const db = await getDb();
  const [c] = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
  return c;
}

async function tableCount(table: PgTable, where?: SQL) {
  const db = await getDb();
  const [r] = await db.select({ n: count() }).from(table).where(where);
  return r.n;
}

const baseProduct = async (over: Record<string, unknown> = {}) => ({
  name: "Paneer Pizza",
  categoryId: await categoryId("pizza"),
  price: "155.50",
  discountedPrice: "",
  isVeg: true,
  preparationMinutes: "15",
  spiceLevel: "1",
  tags: "Cheesy, cheesy, Paneer",
  ...over,
});

describe("products", () => {
  it("converts rupees to paise and keeps slugs unique", async () => {
    const res = await saveProduct(null, await baseProduct());
    expect(res.slug).toBe("paneer-pizza-2"); // seeded "paneer-pizza" already exists
    const doc = await getProduct(res.id);
    expect(doc!.price).toBe(15550);
    expect(doc!.discountedPrice).toBeNull();
    expect(doc!.tags).toEqual(["cheesy", "paneer"]);
    expect(doc!.displayOrder).toBeGreaterThan(0);

    await expect(saveProduct(null, await baseProduct({ slug: "margaretta-pizza" }))).rejects.toThrow(/slug/);
  });

  it("rejects discounted prices that are not lower than the price", async () => {
    await expect(saveProduct(null, await baseProduct({ price: "200", discountedPrice: "200" }))).rejects.toThrow(/lower than the price/);
    const ok = await saveProduct(null, await baseProduct({ name: "Offer Pizza", price: "200", discountedPrice: "179.99" }));
    expect((await getProduct(ok.id))!.discountedPrice).toBe(17999);

    await expect(patchProduct(ok.id, { price: "150" })).rejects.toThrow(/lower than the price/);
    await patchProduct(ok.id, { discountedPrice: null });
    expect((await getProduct(ok.id))!.discountedPrice).toBeNull();
    await patchProduct(ok.id, { isAvailable: false });
    expect((await getProduct(ok.id))!.isAvailable).toBe(false);
  });
});

describe("categories", () => {
  it("blocks deleting a category with products unless they are moved", async () => {
    const maggi = await categoryId("maggi");
    const pasta = await categoryId("pasta");
    await expect(deleteCategory(maggi)).rejects.toThrow(/still has 3 product/);
    const res = await deleteCategory(maggi, pasta);
    expect(res.moved).toBe(3);
    expect(await tableCount(categories, eq(categories.id, maggi))).toBe(0);
    expect(await tableCount(products, eq(products.categoryId, pasta))).toBe(5);
  });
});

describe("coupons", () => {
  it("stores percent as basis points and flat as paise, and validates rules", async () => {
    const pct = await saveCoupon(null, { code: "weekend12", type: "PERCENT", value: "12.5", maxDiscount: "60", perCustomerLimit: "1" });
    const c = await getCoupon(pct.id);
    expect(c!.code).toBe("WEEKEND12");
    expect(c!.value).toBe(1250);
    expect(c!.maxDiscount).toBe(6000);

    const flat = await saveCoupon(null, { code: "FLAT50", type: "FLAT", value: "50", minOrderAmount: "300" });
    const f = await getCoupon(flat.id);
    expect(f!.value).toBe(5000);
    expect(f!.minOrderAmount).toBe(30000);
    expect(f!.perCustomerLimit).toBe(0);

    await expect(saveCoupon(null, { code: "FLAT50", type: "FLAT", value: "10" })).rejects.toThrow(/already exists/);
    await expect(saveCoupon(null, { code: "BAD", type: "PERCENT", value: "150" })).rejects.toThrow(/between/);
    await expect(saveCoupon(null, { code: "FREE", type: "PERCENT", value: "100" })).rejects.toThrow(/cap/);
    await expect(saveCoupon(null, { code: "DATES", type: "FLAT", value: "10", startsAt: "2026-11-10T10:00", endsAt: "2026-11-01T10:00" })).rejects.toThrow(/after start/);

    const dated = await saveCoupon(null, { code: "DIWALI", type: "FLAT", value: "10", startsAt: "2026-11-08T00:00" });
    // Midnight IST = 18:30 UTC the previous day.
    expect((await getCoupon(dated.id))!.startsAt!.toISOString()).toBe("2026-11-07T18:30:00.000Z");
  });

  it("deactivates instead of deleting a coupon that has been redeemed", async () => {
    const { id } = await saveCoupon(null, { code: "USED", type: "FLAT", value: "10" });
    const db = await getDb();
    // A redemption needs a real order: create one through the checkout path.
    const pizza = await product("margaretta-pizza");
    const o = await createOrder({ idempotencyKey: key(), items: [{ productId: pizza.id, quantity: 1, selections: [] }], customer: guest, fulfilment: "PICKUP", paymentMethod: "COD" });
    await db.insert(couponRedemptions).values({ couponId: id, code: "USED", orderId: o.orderId, customerKey: "phone:9830000000", discount: 1000 });
    expect((await deleteCoupon(id)).deactivated).toBe(true);
    expect((await getCoupon(id))!.isActive).toBe(false);
    const { id: unused } = await saveCoupon(null, { code: "UNUSED", type: "FLAT", value: "10" });
    expect((await deleteCoupon(unused)).deactivated).toBe(false);
  });
});

describe("delivery zones and settings", () => {
  it("validates 6-digit PIN codes, de-duplicates them and reports overlaps", async () => {
    await expect(saveDeliveryZone(null, { name: "Bad", pincodes: "700091, 70009", deliveryFee: "20" })).rejects.toThrow(/Invalid PIN/);
    await expect(saveDeliveryZone(null, { name: "Empty", pincodes: "  ", deliveryFee: "20" })).rejects.toThrow(/at least one/);
    const res = await saveDeliveryZone(null, { name: "Salt Lake", pincodes: "700091\n700064, 700091 700001", areas: "Sector V, Sector V", deliveryFee: "25", estimatedMinutes: "30" });
    expect(res.overlapping).toEqual(["700001 (Test zone)"]);
    const db = await getDb();
    const [zone] = await db.select().from(deliveryZones).where(eq(deliveryZones.id, res.id)).limit(1);
    expect(zone!.pincodes).toEqual(["700091", "700064", "700001"]);
    expect(zone!.areas).toEqual(["Sector V"]);
    expect(zone!.deliveryFee).toBe(2500);
  });

  it("refuses to enable Razorpay without keys and keeps one payment method", async () => {
    await expect(updatePaymentSettings({ codEnabled: true, codMaxOrderAmount: "0", razorpayEnabled: true })).rejects.toThrow(/RAZORPAY_KEY_ID/);
    await expect(updatePaymentSettings({ codEnabled: false, codMaxOrderAmount: "0", razorpayEnabled: false })).rejects.toThrow(/at least one/);
  });

  it("kitchen form saves don't undo a quick pause", async () => {
    await setKitchenMode("PAUSED", 30);
    await updateKitchenControl({ mode: "AUTO", preordersEnabled: true, preorderMaxDaysAhead: "3", closedMessage: "Closed", pausedMessage: "Back soon", temporaryClosureActive: false, delayAlertMinutes: "40" });
    const db = await getDb();
    const [s] = await db.select().from(businessSettings).where(eq(businessSettings.key, "default")).limit(1);
    const kitchen = s.kitchen as Record<string, unknown>;
    expect(kitchen.mode).toBe("PAUSED");
    expect(kitchen.pausedUntil).toBeTruthy();
    expect(new Date(kitchen.pausedUntil as string).getTime()).toBeGreaterThan(Date.now());
    expect(kitchen.preordersEnabled).toBe(true);
    expect(kitchen.delayAlertMinutes).toBe(40);
  });
});

describe("finance report", () => {
  it("computes revenue, estimated cost and expenses from real orders", async () => {
    const pizza = await product("margaretta-pizza");
    const fries = await product("french-fries");
    const db = await getDb();
    await db.insert(productCosts).values({ productId: pizza.id, ingredientCost: 6000, packagingCost: 1000 }); // ₹70 per pizza
    const [adminUser] = await db.insert(users).values({ name: "Owner", email: "owner@example.com", passwordHash: "x", role: "ADMIN" }).returning();
    const admin = { type: "ADMIN" as const, id: adminUser.id };

    const o1 = await createOrder({ idempotencyKey: key(), items: [{ productId: pizza.id, quantity: 2, selections: [] }], customer: guest, fulfilment: "DELIVERY", address: { houseNumber: "1", street: "Park Street", city: "Kolkata", pincode: "700001" }, paymentMethod: "COD" });
    const o2 = await createOrder({ idempotencyKey: key(), items: [{ productId: fries.id, quantity: 1, selections: [] }], customer: { name: "Other", phone: "9830099999" }, fulfilment: "PICKUP", paymentMethod: "COD" });
    // A cancelled order must not count.
    const o3 = await createOrder({ idempotencyKey: key(), items: [{ productId: pizza.id, quantity: 5, selections: [] }], customer: { name: "Third", phone: "9830088888" }, fulfilment: "PICKUP", paymentMethod: "COD" });
    await transitionOrderStatus({ orderId: o3.orderId, to: "CANCELLED", reason: "Customer called" }, admin);
    for (const o of [o1, o2]) {
      await transitionOrderStatus({ orderId: o.orderId, to: "DELIVERED", override: true, reason: "Test delivery" }, admin);
    }
    await recordCodCollection({ orderId: o1.orderId, amountCollected: o1.total }, admin);

    const { from, to } = defaultRange();
    await saveExpense(null, { category: "GAS", amount: "450", incurredOn: to, paymentMode: "CASH" });
    await saveExpense(null, { category: "RAW_MATERIALS", amount: "1000.25", incurredOn: to, paymentMode: "UPI", vendor: "Market" });
    expect(await tableCount(expenses)).toBe(2);

    const r = await getProfitReport(from, to);
    expect(r.orders).toBe(2);
    expect(r.grossRevenue).toBe(2 * 19100 + 17300);
    expect(r.deliveryRevenue).toBe(3000);
    expect(r.netSales).toBe(2 * 19100 + 17300 + 3000);
    expect(r.estimatedProductCost).toBe(2 * 7000); // fries have no cost data
    expect(r.unitsSold).toBe(3);
    expect(r.unitsWithoutCost).toBe(1);
    expect(r.recordedExpenses).toBe(45000 + 100025);
    expect(r.expensesByCategory.GAS).toBe(45000);
    expect(r.netOperatingResult).toBe(r.netSales - r.recordedExpenses);
    expect(r.estimatedGrossProfit).toBe(r.netSales - 14000);
    expect(r.estimatedNetAfterOverheads).toBe(r.estimatedGrossProfit - 45000);
    expect(r.daily.at(-1)!.orders).toBe(2);
    expect((await tableCount(orders, eq(orders.status, "DELIVERED")))).toBe(2);
  });
});

describe("media library", () => {
  const cfg = { cloudName: "demo", apiKey: "key", apiSecret: "secret-secret", folder: "bite-affairs" };
  const sign = (publicId: string, version: number) => createHash("sha1").update(`public_id=${publicId}&version=${version}${cfg.apiSecret}`).digest("hex");
  const upload = (publicId: string, etag: string) => ({
    public_id: publicId,
    version: 1700000000,
    signature: sign(publicId, 1700000000),
    secure_url: `https://res.cloudinary.com/demo/image/upload/v1700000000/${publicId}.jpg`,
    resource_type: "image" as const,
    format: "jpg",
    bytes: 120_000,
    width: 1200,
    height: 900,
    etag,
    original_filename: "pizza",
  });

  it("verifies signatures, de-duplicates by etag and cleans up references on delete", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ result: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(registerUpload({ ...upload("bite-affairs/products/a", "e1"), signature: "0".repeat(40) }, undefined, cfg)).rejects.toThrow(/verified/);
    await expect(registerUpload(upload("someone-else/a", "e1"), undefined, cfg)).rejects.toThrow(/outside/);

    const first = await registerUpload(upload("bite-affairs/products/a", "e1"), undefined, cfg);
    expect(first.duplicate).toBe(false);
    const dup = await registerUpload(upload("bite-affairs/products/b", "e1"), undefined, cfg);
    expect(dup.duplicate).toBe(true);
    expect(dup.media.id).toBe(first.media.id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cloudinary.com/v1_1/demo/image/destroy");
    expect(String(init.body)).toContain("public_id=bite-affairs%2Fproducts%2Fb");
    expect(await tableCount(productMedia)).toBe(1);

    const pizza = await product("paneer-pizza");
    const db = await getDb();
    await db.update(products).set({ image: { url: first.media.url }, gallery: [{ url: first.media.url }, { url: "/images/menu/pizza.webp" }] }).where(eq(products.id, pizza.id));
    await deleteMedia(first.media.id, cfg);
    const after = await getProduct(pizza.id);
    expect(after!.image).toBeNull();
    expect(after!.gallery.map((g: { url: string }) => g.url)).toEqual(["/images/menu/pizza.webp"]);
    expect(await tableCount(productMedia)).toBe(0);
  });
});

describe("reviews", () => {
  it("recomputes product rating from approved reviews only", async () => {
    const pizza = await product("paneer-pizza");
    const db = await getDb();
    const user = await createCustomer("9876500077");
    const base = { orderId: randomUUID(), productId: pizza.id, productName: pizza.name, userId: user.id };
    const [r1] = await db.insert(reviews).values({ ...base, orderItemId: randomUUID(), rating: 5 }).returning();
    const [r2] = await db.insert(reviews).values({ ...base, orderItemId: randomUUID(), rating: 2 }).returning();
    await moderateReview(r1.id, { status: "APPROVED", adminReply: "Thank you!" });
    expect((await getProduct(pizza.id))!.ratingAverage).toBe(5);
    await moderateReview(r2.id, { status: "APPROVED" });
    const p = await getProduct(pizza.id);
    expect(p!.ratingAverage).toBe(3.5);
    expect(p!.ratingCount).toBe(2);
    await moderateReview(r2.id, { status: "HIDDEN" });
    expect((await getProduct(pizza.id))!.ratingCount).toBe(1);
  });
});
