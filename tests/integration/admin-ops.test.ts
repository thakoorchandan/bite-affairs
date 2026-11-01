import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { count, eq, and } from "drizzle-orm";
import { closeDb, getDb, schema } from "@/db";

// Session is controlled per test; Next request APIs are stubbed outside a request scope.
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; name: string; role: string; sv: number } } }));
vi.mock("next-auth", async (orig) => ({ ...(await orig<typeof import("next-auth")>()), getServerSession: vi.fn(async () => session.current) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "127.0.0.1" }), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/cache", () => ({ updateTag: vi.fn(), revalidateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));

import { createOrder, transitionOrderStatus, recordCodCollection } from "@/services/order.service";
import { getDashboardMetrics, getDeepAnalytics, resolveDateRange } from "@/services/analytics.service";
import { listGuestCustomers, listRegisteredCustomers, getCustomerDetail } from "@/services/customer-admin.service";
import { getDeliveryBoard, listAdminOrders, listPayments, getAdminOrderDetail } from "@/services/admin-orders.service";
import { updateOrderStatusAction } from "@/features/admin/orders-actions";
import { generatePasswordResetLinkAction } from "@/features/admin/customers-actions";
import { address, createCustomer, key, product, resetDatabase } from "./helpers";

beforeEach(resetDatabase);
afterAll(() => closeDb());

const { users, orders, adminActivityLogs } = schema;

const admin = { type: "ADMIN" as const };

async function seedOrders() {
  const pizza = await product("margaretta-pizza"); // ₹191
  const wrap = await product("mexican-chicken-wrap"); // ₹174
  const user = await createCustomer("9876500011");
  const a = await createOrder({ idempotencyKey: key(), items: [{ productId: pizza.id, quantity: 2, selections: [] }], customer: { name: "Guest One", phone: "9830000001" }, fulfilment: "PICKUP", paymentMethod: "COD" });
  const b = await createOrder({ idempotencyKey: key(), items: [{ productId: wrap.id, quantity: 1, selections: [] }], customer: { name: "Reg User", phone: "9876500011" }, fulfilment: "DELIVERY", address, paymentMethod: "COD" }, { userId: user.id });
  const c = await createOrder({ idempotencyKey: key(), items: [{ productId: wrap.id, quantity: 3, selections: [] }], customer: { name: "Guest Two", phone: "9830000002" }, fulfilment: "PICKUP", paymentMethod: "COD" });
  await transitionOrderStatus({ orderId: c.orderId, to: "REJECTED", reason: "Out of stock" }, admin);
  return { a, b, c, user, pizza, wrap };
}

describe("analytics", () => {
  it("dashboard metrics match the seeded orders and exclude rejected orders from revenue", async () => {
    const { a, b } = await seedOrders();
    const m = await getDashboardMetrics(resolveDateRange({ preset: "today" }));
    expect(m.kpis.orders).toBe(2);
    expect(m.kpis.revenue).toBe(a.total + b.total);
    expect(a.total).toBe(2 * 19100);
    expect(b.total).toBe(17400 + 3000);
    expect(m.kpis.cancelled).toBe(1);
    expect(m.kpis.pending).toBe(2);
    expect(m.kpis.aov).toBe(Math.round((a.total + b.total) / 2));
    expect(m.kpis.collected).toBe(0);
    expect(m.popularProducts[0]).toMatchObject({ name: "Margaretta Pizza", qty: 2 });
    expect(m.customers).toMatchObject({ unique: 2, new: 2, returning: 0, registered: 1, guest: 1 });
    expect(m.trend.at(-1)!.revenue).toBe(a.total + b.total);
  });

  it("counts collected cash and deep analytics splits", async () => {
    const { b } = await seedOrders();
    for (const to of ["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"] as const) await transitionOrderStatus({ orderId: b.orderId, to }, admin);
    await recordCodCollection({ orderId: b.orderId, amountCollected: b.total }, admin);
    const range = resolveDateRange({ preset: "7d" });
    const m = await getDashboardMetrics(range);
    expect(m.kpis.collected).toBe(b.total);
    expect(m.kpis.completed).toBe(1);
    const deep = await getDeepAnalytics(range);
    expect(deep.payment).toEqual([{ key: "COD", count: 2, revenue: m.kpis.revenue }]);
    expect(deep.fulfilment.reduce((s, f) => s + f.count, 0)).toBe(2);
    expect(deep.heatmap.flat().reduce((s, n) => s + n, 0)).toBe(2);
    expect(deep.byStatus.find((s) => s.status === "REJECTED")?.count).toBe(1);
  });

  it("resolves date presets in the business timezone", () => {
    const now = new Date("2026-10-31T20:00:00Z"); // 01:30 IST on 1 Nov
    const today = resolveDateRange({ preset: "today" }, now);
    expect(today.fromKey).toBe("2026-11-01");
    expect(today.start.toISOString()).toBe("2026-10-31T18:30:00.000Z");
    const custom = resolveDateRange({ preset: "custom", from: "2026-10-10", to: "2026-10-01" }, now);
    expect([custom.fromKey, custom.toKey]).toEqual(["2026-10-01", "2026-10-10"]);
    expect(resolveDateRange({ preset: "bogus" }, now).preset).toBe("today");
  });
});

describe("customers and order lists", () => {
  it("aggregates guests by phone and registered users with order stats", async () => {
    const { user } = await seedOrders();
    const guests = await listGuestCustomers({});
    expect(guests.total).toBe(2);
    const g1 = guests.items.find((g) => g.phone === "9830000001")!;
    expect(g1).toMatchObject({ type: "GUEST", orders: 1, spend: 2 * 19100 });
    expect(guests.items.find((g) => g.phone === "9830000002")!.orders).toBe(0); // rejected order doesn't count
    const registered = await listRegisteredCustomers({ hasOrders: "yes" });
    expect(registered.items).toHaveLength(1);
    expect(registered.items[0]).toMatchObject({ key: user.id, orders: 1, spend: 20400 });
    const detail = await getCustomerDetail(user.id);
    expect(detail!.stats.orders).toBe(1);
    expect(detail!.favourites[0].name).toBe("Mexican Chicken Wrap");
    const guestDetail = await getCustomerDetail("guest-9830000001");
    expect(guestDetail!.profile.type).toBe("GUEST");
    expect(await getCustomerDetail("guest-123")).toBeNull();
  });

  it("searches orders, lists payments and builds the delivery board", async () => {
    const { b } = await seedOrders();
    expect((await listAdminOrders({ q: "9830000001" })).total).toBe(1);
    expect((await listAdminOrders({ q: b.orderNumber })).items[0].orderNumber).toBe(b.orderNumber);
    expect((await listAdminOrders({ tab: "cancelled" })).total).toBe(1);
    const payments = await listPayments({});
    expect(payments.total).toBe(3);
    for (const to of ["CONFIRMED", "PREPARING", "READY"] as const) await transitionOrderStatus({ orderId: b.orderId, to }, admin);
    let board = await getDeliveryBoard();
    expect(board.queue.map((o) => o.orderNumber)).toContain(b.orderNumber);
    await transitionOrderStatus({ orderId: b.orderId, to: "OUT_FOR_DELIVERY" }, admin);
    await transitionOrderStatus({ orderId: b.orderId, to: "DELIVERED" }, admin);
    board = await getDeliveryBoard();
    expect(board.codOutstanding.map((o) => o.orderNumber)).toEqual([b.orderNumber]);
    expect(board.history).toHaveLength(1);
    const detail = await getAdminOrderDetail(b.orderId);
    expect(detail!.history).toHaveLength(6);
    expect(detail!.allowed).toEqual([]); // COD unpaid: no refund step
  });
});

describe("admin action authorisation", () => {
  it("rejects anonymous and customer sessions, accepts admins and writes an audit log", async () => {
    const { a } = await seedOrders();
    const db = await getDb();
    const [customer] = await db.select().from(users).where(eq(users.phone, "9876500011")).limit(1);
    const [adminUser] = await db.insert(users).values({ name: "Owner", email: "owner@example.com", passwordHash: "x", role: "ADMIN" }).returning();

    session.current = null;
    let res = await updateOrderStatusAction({ orderId: a.orderId, to: "CONFIRMED", expectedFrom: "PLACED" });
    expect(res).toMatchObject({ ok: false, code: "UNAUTHORIZED" });

    session.current = { user: { id: customer.id, name: "Reg User", role: "ADMIN", sv: 0 } }; // forged role in token
    res = await updateOrderStatusAction({ orderId: a.orderId, to: "CONFIRMED", expectedFrom: "PLACED" });
    expect(res).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect((await generatePasswordResetLinkAction({ userId: customer.id })).ok).toBe(false);
    expect((await db.select().from(orders).where(eq(orders.id, a.orderId)))[0].status).toBe("PLACED");

    session.current = { user: { id: adminUser.id, name: "Owner", role: "ADMIN", sv: 0 } };
    res = await updateOrderStatusAction({ orderId: a.orderId, to: "CONFIRMED", expectedFrom: "PLACED" });
    expect(res.ok).toBe(true);
    // A duplicate click with the stale expected status is refused.
    res = await updateOrderStatusAction({ orderId: a.orderId, to: "CONFIRMED", expectedFrom: "PLACED" });
    expect(res).toMatchObject({ ok: false, code: "STALE_STATUS" });
    const [logs] = await db.select({ n: count() }).from(adminActivityLogs).where(and(eq(adminActivityLogs.action, "order.status"), eq(adminActivityLogs.entityId, a.orderId)));
    expect(logs.n).toBe(1);

    const link = await generatePasswordResetLinkAction({ userId: customer.id });
    expect(link.ok && link.data.url).toMatch(/\/reset-password\?token=/);
    session.current = null;
  });
});
