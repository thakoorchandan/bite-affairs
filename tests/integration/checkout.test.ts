import { beforeEach, describe, expect, it, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { and, count, eq, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { closeDb, getDb, schema } from "@/db";
import { createOrder, transitionOrderStatus, recordCodCollection, claimGuestOrders, verifyTrackingToken } from "@/services/order.service";
import { getTrackingView } from "@/services/order-query.service";
import { buildQuote } from "@/services/quote.service";
import { address, createCoupon, createCustomer, friesWithPeriPeri, guest, key, product, resetDatabase } from "./helpers";

beforeEach(resetDatabase);
afterAll(() => closeDb());

const { categories, products, orders, orderItems, orderStatusHistory, payments, coupons, couponRedemptions, businessSettings, users } = schema;

async function tableCount(table: PgTable, where?: SQL) {
  const db = await getDb();
  const [r] = await db.select({ n: count() }).from(table).where(where);
  return r.n;
}

async function getOrder(id: string) {
  const db = await getDb();
  const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return o;
}

async function getCouponByCode(code: string) {
  const db = await getDb();
  const [c] = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);
  return c;
}

async function createAdmin() {
  const db = await getDb();
  const [u] = await db.insert(users).values({ name: "Owner", email: "owner@example.com", passwordHash: "x", role: "ADMIN" }).returning();
  return { type: "ADMIN" as const, id: u.id };
}

describe("seed", () => {
  it("imports the real menu from the poster", async () => {
    expect(await tableCount(categories)).toBe(10);
    expect(await tableCount(products)).toBe(33);
    expect((await product("chicken-seekh-kabab")).price).toBe(29500);
    expect((await product("spicy-masala-maggi")).price).toBe(8600);
  });
});

describe("guest checkout (Scenario 1)", () => {
  it("creates a COD order with server-calculated totals and a secure tracking token", async () => {
    const pizza = await product("margaretta-pizza");
    const { fries, groupId, optionId } = await friesWithPeriPeri();
    const result = await createOrder({
      idempotencyKey: key(),
      items: [
        { productId: pizza.id, quantity: 2, selections: [] },
        { productId: fries.id, quantity: 1, selections: [{ groupId, optionIds: [optionId] }] },
      ],
      customer: guest,
      fulfilment: "DELIVERY",
      address,
      paymentMethod: "COD",
    });
    expect(result.status).toBe("PLACED");
    expect(result.orderNumber).toMatch(/^BA\d{6}-001$/);
    // 2 × 191 + (173 + 17) + 30 delivery
    expect(result.total).toBe(2 * 19100 + 17300 + 1700 + 3000);

    const order = await getOrder(result.orderId);
    const db = await getDb();
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(orderItems.position);
    expect(order.isGuest).toBe(true);
    expect(items[1].selections[0].options[0].name).toBe("Extra Peri Peri");
    expect(order.trackingTokenHash).not.toBe(result.trackingToken);
    expect(await tableCount(payments, and(eq(payments.orderId, order.id), eq(payments.status, "PENDING"), eq(payments.method, "COD")))).toBe(1);
    expect(await tableCount(orderStatusHistory, eq(orderStatusHistory.orderId, order.id))).toBe(1);

    expect(await getTrackingView(result.orderNumber, result.trackingToken)).not.toBeNull();
    expect(await getTrackingView(result.orderNumber, "x".repeat(40))).toBeNull();
    expect(await getTrackingView(result.orderNumber, undefined)).toBeNull();
  });

  it("is idempotent: retrying the same submission returns the same order", async () => {
    const pizza = await product("paneer-pizza");
    const input = { idempotencyKey: key(), items: [{ productId: pizza.id, quantity: 1, selections: [] }], customer: guest, fulfilment: "DELIVERY" as const, address, paymentMethod: "COD" as const };
    const [a, b] = await Promise.allSettled([createOrder(input), createOrder(input)]);
    const ok = [a, b].filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof createOrder>>>[];
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const again = await createOrder(input);
    expect(again.duplicate).toBe(true);
    expect(again.orderNumber).toBe(ok[0].value.orderNumber);
    expect(await tableCount(orders)).toBe(1);
  });

  it("ignores any client-supplied price fields", async () => {
    const pizza = await product("chicken-loaded-pizza");
    const res = await createOrder({
      idempotencyKey: key(),
      items: [{ productId: pizza.id, quantity: 1, selections: [], price: 1, unitPrice: 1 } as never],
      customer: guest,
      fulfilment: "PICKUP",
      paymentMethod: "COD",
      ...({ total: 100, pricing: { total: 100 } } as object),
    });
    expect(res.total).toBe(29000);
  });
});

describe("checkout guards (security)", () => {
  it("blocks unavailable products", async () => {
    const pizza = await product("mushroom-pizza");
    await (await getDb()).update(products).set({ isAvailable: false }).where(eq(products.id, pizza.id));
    await expect(createOrder({ idempotencyKey: key(), items: [{ productId: pizza.id, quantity: 1, selections: [] }], customer: guest, fulfilment: "PICKUP", paymentMethod: "COD" })).rejects.toThrow(/sold out/);
  });

  it("blocks products in disabled categories", async () => {
    const maggi = await product("cheese-maggi");
    await (await getDb()).update(categories).set({ isActive: false }).where(eq(categories.id, maggi.categoryId));
    await expect(createOrder({ idempotencyKey: key(), items: [{ productId: maggi.id, quantity: 1, selections: [] }], customer: guest, fulfilment: "PICKUP", paymentMethod: "COD" })).rejects.toThrow(/no longer/);
  });

  it("blocks immediate ordering when the kitchen is closed (Scenario 7)", async () => {
    await (await getDb()).update(businessSettings).set({ kitchen: { mode: "CLOSED" } }).where(eq(businessSettings.key, "default"));
    const pizza = await product("paneer-pizza");
    await expect(createOrder({ idempotencyKey: key(), items: [{ productId: pizza.id, quantity: 1, selections: [] }], customer: guest, fulfilment: "PICKUP", paymentMethod: "COD" })).rejects.toThrow(/closed/i);
  });

  it("blocks unserviceable PIN codes", async () => {
    const pizza = await product("paneer-pizza");
    await expect(
      createOrder({ idempotencyKey: key(), items: [{ productId: pizza.id, quantity: 1, selections: [] }], customer: guest, fulfilment: "DELIVERY", address: { ...address, pincode: "110001" }, paymentMethod: "COD" }),
    ).rejects.toThrow(/don't deliver/);
  });

  it("rejects online payment when Razorpay is not configured, without creating an order", async () => {
    const pizza = await product("paneer-pizza");
    await expect(createOrder({ idempotencyKey: key(), items: [{ productId: pizza.id, quantity: 1, selections: [] }], customer: guest, fulfilment: "PICKUP", paymentMethod: "RAZORPAY" })).rejects.toThrow(/Online payment/);
    expect(await tableCount(orders)).toBe(0);
  });

  it("does not let a saved address belonging to someone else be used", async () => {
    const pizza = await product("paneer-pizza");
    const user = await createCustomer();
    await expect(
      createOrder({ idempotencyKey: key(), items: [{ productId: pizza.id, quantity: 1, selections: [] }], customer: guest, fulfilment: "DELIVERY", savedAddressId: randomUUID(), paymentMethod: "COD" }, { userId: user.id }),
    ).rejects.toThrow(/not found/);
  });
});

describe("coupons", () => {
  it("applies a valid coupon and rejects invalid ones", async () => {
    await createCoupon();
    const pizza = await product("veggie-loaded-pizza");
    const items = [{ productId: pizza.id, quantity: 1, selections: [] }];
    const good = await buildQuote({ items, fulfilment: "PICKUP", couponCode: "welcome10" });
    expect(good.coupon?.applied).toBe(true);
    expect(good.totals.couponDiscount).toBe(2440);
    const bad = await buildQuote({ items, fulfilment: "PICKUP", couponCode: "FAKE50" });
    expect(bad.coupon?.applied).toBe(false);
    expect(bad.totals.couponDiscount).toBe(0);
    await expect(createOrder({ idempotencyKey: key(), items, customer: guest, fulfilment: "PICKUP", paymentMethod: "COD", couponCode: "FAKE50" })).rejects.toThrow(/valid/);
  });

  it("enforces per-customer limits and releases the redemption on rejection", async () => {
    await createCoupon();
    const pizza = await product("veggie-loaded-pizza");
    const items = [{ productId: pizza.id, quantity: 1, selections: [] }];
    const first = await createOrder({ idempotencyKey: key(), items, customer: guest, fulfilment: "PICKUP", paymentMethod: "COD", couponCode: "WELCOME10" });
    await expect(createOrder({ idempotencyKey: key(), items, customer: guest, fulfilment: "PICKUP", paymentMethod: "COD", couponCode: "WELCOME10" })).rejects.toThrow(/already used/);
    await transitionOrderStatus({ orderId: first.orderId, to: "REJECTED", reason: "Out of stock" }, { type: "ADMIN" });
    expect((await getCouponByCode("WELCOME10")).usedCount).toBe(0);
    expect(await tableCount(couponRedemptions, eq(couponRedemptions.released, false))).toBe(0);
    await expect(createOrder({ idempotencyKey: key(), items, customer: guest, fulfilment: "PICKUP", paymentMethod: "COD", couponCode: "WELCOME10" })).resolves.toBeTruthy();
  });

  it("never over-redeems a limited coupon under concurrent checkouts", async () => {
    await createCoupon({ code: "ONLY2", usageLimit: 2, perCustomerLimit: 0 });
    const pizza = await product("golden-corn-pizza");
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) =>
        createOrder({ idempotencyKey: key(), items: [{ productId: pizza.id, quantity: 1, selections: [] }], customer: { name: "Buyer", phone: `98300000${10 + i}` }, fulfilment: "PICKUP", paymentMethod: "COD", couponCode: "ONLY2" }),
      ),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(2);
    expect((await getCouponByCode("ONLY2")).usedCount).toBe(2);
  });
});

describe("order lifecycle (Scenarios 3–5)", () => {
  it("moves through the lifecycle, rejects invalid jumps and stale double-clicks, and tracks COD separately", async () => {
    const wrap = await product("mexican-chicken-wrap");
    const o = await createOrder({ idempotencyKey: key(), items: [{ productId: wrap.id, quantity: 1, selections: [] }], customer: guest, fulfilment: "DELIVERY", address, paymentMethod: "COD" });
    const admin = await createAdmin();

    await expect(transitionOrderStatus({ orderId: o.orderId, to: "DELIVERED" }, admin)).rejects.toThrow(/Cannot/);
    await transitionOrderStatus({ orderId: o.orderId, to: "CONFIRMED", expectedFrom: "PLACED" }, admin);
    await expect(transitionOrderStatus({ orderId: o.orderId, to: "CONFIRMED", expectedFrom: "PLACED" }, admin)).rejects.toThrow(/already updated/);
    await transitionOrderStatus({ orderId: o.orderId, to: "PREPARING" }, admin);
    await transitionOrderStatus({ orderId: o.orderId, to: "READY" }, admin);
    await expect(recordCodCollection({ orderId: o.orderId, amountCollected: o.total }, admin)).rejects.toThrow(/out for delivery/);
    await transitionOrderStatus({ orderId: o.orderId, to: "OUT_FOR_DELIVERY" }, admin);
    await transitionOrderStatus({ orderId: o.orderId, to: "DELIVERED" }, admin);

    let order = await getOrder(o.orderId);
    expect(order.status).toBe("DELIVERED");
    expect(order.paymentStatus).toBe("PENDING"); // delivery does NOT mark COD collected
    expect(order.codCollected).toBe(false);
    expect(order.deliveryAssignedTo).toBe(admin.id);

    await recordCodCollection({ orderId: o.orderId, amountCollected: o.total }, admin);
    await expect(recordCodCollection({ orderId: o.orderId, amountCollected: o.total }, admin)).rejects.toThrow(/already/);
    order = await getOrder(o.orderId);
    expect(order.paymentStatus).toBe("PAID");
    expect(order.timeline.map((t) => t.status)).toEqual(["PLACED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"]);
    expect(await tableCount(orderStatusHistory, eq(orderStatusHistory.orderId, order.id))).toBe(6);

    const view = await getTrackingView(o.orderNumber, o.trackingToken);
    expect(view!.status).toBe("DELIVERED");
    expect(view!.phoneMasked).not.toContain(guest.phone);
  });

  it("requires a reason to reject, and logs overrides", async () => {
    const wrap = await product("mexican-chicken-wrap");
    const o = await createOrder({ idempotencyKey: key(), items: [{ productId: wrap.id, quantity: 1, selections: [] }], customer: guest, fulfilment: "PICKUP", paymentMethod: "COD" });
    await expect(transitionOrderStatus({ orderId: o.orderId, to: "REJECTED" }, { type: "ADMIN" })).rejects.toThrow(/reason/);
    await transitionOrderStatus({ orderId: o.orderId, to: "DELIVERED", override: true, reason: "Handed over at counter" }, { type: "ADMIN" });
    const [h] = await (await getDb()).select().from(orderStatusHistory).where(and(eq(orderStatusHistory.orderId, o.orderId), eq(orderStatusHistory.to, "DELIVERED")));
    expect(h.isOverride).toBe(true);
  });
});

describe("registered customers (Scenario 2)", () => {
  it("links orders to the user and lets guests claim orders only with the secret token", async () => {
    const user = await createCustomer("9876500002");
    const pizza = await product("paneer-pizza");
    const mine = await createOrder({ idempotencyKey: key(), items: [{ productId: pizza.id, quantity: 1, selections: [] }], customer: { name: "Test", phone: "9876500002" }, fulfilment: "PICKUP", paymentMethod: "COD" }, { userId: user.id });
    expect((await getOrder(mine.orderId)).userId).toBe(user.id);

    const guestOrder = await createOrder({ idempotencyKey: key(), items: [{ productId: pizza.id, quantity: 1, selections: [] }], customer: guest, fulfilment: "PICKUP", paymentMethod: "COD" });
    expect(await claimGuestOrders(user.id, [{ orderNumber: guestOrder.orderNumber, token: "wrong-token-wrong-token-wrong" }])).toBe(0);
    expect(verifyTrackingToken(guestOrder.orderNumber, guestOrder.trackingToken)).toBe(true);
    expect(await claimGuestOrders(user.id, [{ orderNumber: guestOrder.orderNumber, token: guestOrder.trackingToken }])).toBe(1);
    // Another user's order can't be viewed via user id alone
    const other = await createCustomer("9876500003");
    expect(await getTrackingView(mine.orderNumber, null, other.id)).toBeNull();
    expect(await getTrackingView(mine.orderNumber, null, user.id)).not.toBeNull();
  });
});
