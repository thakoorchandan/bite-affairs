import { afterAll, describe, expect, it } from "vitest";
import { asc, count, eq, closeDb, getDb, schema } from "@/db";
import { getTrackingView } from "@/services/order-query.service";
import { createDemoAdmin, loadDemoData, simulateIncomingOrder } from "../../scripts/demo-data";
import { resetDatabase } from "./helpers";

const { orders, orderItems, payments, reviews, users, counters } = schema;

afterAll(() => closeDb());

describe("demo sample data", () => {
  it("generates consistent orders, payments and live board data", async () => {
    await resetDatabase(); // empties every table and re-seeds the real menu
    const db = await getDb();
    // The demo creates its own delivery zones.
    await db.delete(schema.deliveryZones);
    const summary = await loadDemoData();
    await createDemoAdmin();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const total = async (table: any, where?: any) => (await db.select({ n: count() }).from(table).where(where))[0].n;

    expect(summary.orders).toBeGreaterThan(100);
    expect(await total(users, eq(users.role, "ADMIN"))).toBe(1);
    expect(await total(payments)).toBe(summary.orders);

    // Every order's total equals subtotal − coupon + delivery (tax inclusive / 0%).
    const allOrders = await db.select().from(orders);
    const lineSums = new Map<string, number>();
    for (const i of await db.select().from(orderItems)) lineSums.set(i.orderId, (lineSums.get(i.orderId) ?? 0) + i.lineTotal);
    for (const o of allOrders) {
      expect(o.total).toBe(o.subtotal - o.couponDiscount + o.deliveryFee);
      expect(lineSums.get(o.id)).toBe(o.subtotal);
      expect(o.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
    }
    // Live board has orders in each active column.
    for (const status of ["PLACED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] as const) {
      expect(await total(orders, eq(orders.status, status))).toBeGreaterThan(0);
    }
    // History spans ~30 days.
    const [oldest] = await db.select().from(orders).orderBy(asc(orders.createdAt)).limit(1);
    expect(Date.now() - oldest.createdAt.getTime()).toBeGreaterThan(25 * 86_400_000);
    expect(await total(reviews, eq(reviews.status, "APPROVED"))).toBeGreaterThan(0);
    expect(await getTrackingView(summary.riyaTracking.orderNumber, summary.riyaTracking.token)).not.toBeNull();

    // New orders continue today's sequence without colliding.
    const before = await total(counters);
    const sim = await simulateIncomingOrder();
    expect(sim.status).toBe("PLACED");
    expect(await total(counters)).toBe(before);
  });
});
