import { and, asc, desc, eq, getDb, gte, ilike, inArray, isNull, lt, ne, or, schema, sql, countAll, isUuid, likeEscape, toOrderDocs, getOrderDocById } from "@/db";
import type { SQL } from "drizzle-orm";
import { serialize } from "@/lib/utilities/serialize";
import { ACTIVE_KITCHEN_STATUSES, ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, type FulfilmentType, type OrderStatus, type PaymentStatus } from "@/constants/domain";
import { allowedTransitions } from "@/services/order-state";
import type { DateRange } from "./analytics.service";

const { orders, orderStatusHistory, payments, users, notifications } = schema;

/** Build a search condition for order number / customer name / phone. */
export function orderSearchFilter(q?: string | null): SQL | undefined {
  const term = q?.trim();
  if (!term) return undefined;
  const digits = term.replace(/\D/g, "");
  const conditions: SQL[] = [ilike(orders.orderNumber, `${likeEscape(term)}%`), ilike(orders.customerName, `%${likeEscape(term)}%`)];
  if (digits.length >= 4) conditions.push(ilike(orders.customerPhone, `%${likeEscape(digits.slice(-10))}%`));
  return or(...conditions);
}

export const HISTORY_TABS = { active: ACTIVE_KITCHEN_STATUSES, delivered: ["DELIVERED"], cancelled: ["CANCELLED", "REJECTED"], refunds: ["REFUND_INITIATED", "REFUNDED"], all: null } as const;
export type HistoryTab = keyof typeof HISTORY_TABS;

export async function getActiveBoardOrders() {
  const db = await getDb();
  const rows = await db.select().from(orders).where(inArray(orders.status, ACTIVE_KITCHEN_STATUSES)).orderBy(asc(orders.createdAt)).limit(200);
  return serialize(await toOrderDocs(db, rows));
}
export type AdminOrderSummary = Awaited<ReturnType<typeof getActiveBoardOrders>>[number];

export async function listAdminOrders(opts: { tab?: string; q?: string; status?: string; payment?: string; range?: DateRange | null; page?: number; pageSize?: number }) {
  const db = await getDb();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, opts.pageSize ?? 25);
  const tab = (opts.tab && opts.tab in HISTORY_TABS ? opts.tab : "all") as HistoryTab;
  const tabStatuses = HISTORY_TABS[tab];
  const conditions: (SQL | undefined)[] = [orderSearchFilter(opts.q)];
  if (opts.status && (ORDER_STATUSES as readonly string[]).includes(opts.status)) conditions.push(eq(orders.status, opts.status as OrderStatus));
  else if (tabStatuses) conditions.push(inArray(orders.status, [...tabStatuses] as OrderStatus[]));
  else conditions.push(ne(orders.status, "AWAITING_PAYMENT"));
  if (opts.payment && (PAYMENT_METHODS as readonly string[]).includes(opts.payment)) conditions.push(eq(orders.paymentMethod, opts.payment as (typeof PAYMENT_METHODS)[number]));
  else if (opts.payment && (PAYMENT_STATUSES as readonly string[]).includes(opts.payment)) conditions.push(eq(orders.paymentStatus, opts.payment as PaymentStatus));
  if (opts.range) conditions.push(and(gte(orders.createdAt, opts.range.start), lt(orders.createdAt, opts.range.end)));
  const where = and(...conditions);

  const [rows, [{ n: total }]] = await Promise.all([
    db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ n: countAll() }).from(orders).where(where),
  ]);
  return { items: serialize(await toOrderDocs(db, rows)), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getAdminOrderDetail(orderId: string) {
  if (!isUuid(orderId)) return null;
  const db = await getDb();
  const order = await getOrderDocById(db, orderId);
  if (!order) return null;

  const [history, [payment]] = await Promise.all([
    db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id)).orderBy(asc(orderStatusHistory.createdAt)),
    db.select().from(payments).where(eq(payments.orderId, order.id)).limit(1),
  ]);
  const userIds = new Set<string>();
  for (const h of history) if (h.actorId) userIds.add(h.actorId);
  for (const n of order.internalNotes) if (n.by) userIds.add(n.by);
  if (order.delivery.assignedTo) userIds.add(order.delivery.assignedTo);
  if (order.payment.cod.collectedBy) userIds.add(order.payment.cod.collectedBy);
  const people = userIds.size ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...userIds])) : [];
  const names = Object.fromEntries(people.map((u) => [u.id, u.name]));

  const [{ n: previousOrders }] = await db
    .select({ n: countAll() })
    .from(orders)
    .where(and(ne(orders.id, order.id), order.userId ? eq(orders.userId, order.userId) : eq(orders.customerPhone, order.customer.phone), ne(orders.status, "AWAITING_PAYMENT")));

  const ctx = { fulfilment: order.fulfilment as FulfilmentType, paymentStatus: order.payment.status as PaymentStatus };
  return {
    order: serialize(order),
    history: serialize(history),
    payment: payment ? serialize(payment) : null,
    names,
    previousOrders,
    allowed: allowedTransitions(order.status as OrderStatus, ctx),
  };
}
export type AdminOrderDetail = NonNullable<Awaited<ReturnType<typeof getAdminOrderDetail>>>;

export async function getDeliveryBoard() {
  const db = await getDb();
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [queue, codOutstanding, history] = await Promise.all([
    db.select().from(orders).where(and(eq(orders.fulfilment, "DELIVERY"), inArray(orders.status, ["READY", "OUT_FOR_DELIVERY", "PREPARING", "CONFIRMED"]))).orderBy(asc(orders.createdAt)).limit(100),
    db.select().from(orders).where(and(eq(orders.paymentMethod, "COD"), inArray(orders.status, ["OUT_FOR_DELIVERY", "DELIVERED"]), eq(orders.codCollected, false))).orderBy(desc(orders.createdAt)).limit(100),
    db.select().from(orders).where(and(eq(orders.fulfilment, "DELIVERY"), eq(orders.status, "DELIVERED"), gte(orders.deliveredAt, since))).orderBy(desc(orders.deliveredAt)).limit(50),
  ]);
  const [q, c, h] = await Promise.all([toOrderDocs(db, queue), toOrderDocs(db, codOutstanding), toOrderDocs(db, history)]);
  return { queue: serialize(q), codOutstanding: serialize(c), history: serialize(h) };
}

export async function listPayments(opts: { method?: string; status?: string; range?: DateRange | null; q?: string; page?: number }) {
  const db = await getDb();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = 25;
  const conditions: (SQL | undefined)[] = [];
  if (opts.method && (PAYMENT_METHODS as readonly string[]).includes(opts.method)) conditions.push(eq(payments.method, opts.method as (typeof PAYMENT_METHODS)[number]));
  if (opts.status && (PAYMENT_STATUSES as readonly string[]).includes(opts.status)) conditions.push(eq(payments.status, opts.status as PaymentStatus));
  if (opts.range) conditions.push(and(gte(payments.createdAt, opts.range.start), lt(payments.createdAt, opts.range.end)));
  if (opts.q?.trim()) conditions.push(ilike(payments.orderNumber, `${likeEscape(opts.q.trim())}%`));
  const where = and(...conditions);

  const [rows, [{ n: total }], summary] = await Promise.all([
    db
      .select({
        id: payments.id,
        orderId: payments.orderId,
        orderNumber: payments.orderNumber,
        method: payments.method,
        status: payments.status,
        amount: payments.amount,
        amountCollected: payments.amountCollected,
        collectedAt: payments.collectedAt,
        razorpayOrderId: payments.razorpayOrderId,
        razorpayPaymentId: payments.razorpayPaymentId,
        failureReason: payments.failureReason,
        createdAt: payments.createdAt,
        orderStatus: orders.status,
        orderFulfilment: orders.fulfilment,
        customerName: orders.customerName,
        customerPhone: orders.customerPhone,
        codCollected: orders.codCollected,
      })
      .from(payments)
      .leftJoin(orders, eq(orders.id, payments.orderId))
      .where(where)
      .orderBy(desc(payments.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: countAll() }).from(payments).where(where),
    db
      .select({
        method: payments.method,
        status: payments.status,
        count: countAll(),
        amount: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number),
        collected: sql<number>`coalesce(sum(coalesce(${payments.amountCollected}, 0)), 0)`.mapWith(Number),
      })
      .from(payments)
      .where(where)
      .groupBy(payments.method, payments.status),
  ]);

  const items: PaymentRow[] = rows.map((r) => ({
    id: r.id,
    orderId: r.orderId,
    orderNumber: r.orderNumber,
    method: r.method,
    status: r.status,
    amount: r.amount,
    amountCollected: r.amountCollected,
    collectedAt: r.collectedAt?.toISOString() ?? null,
    razorpayOrderId: r.razorpayOrderId,
    razorpayPaymentId: r.razorpayPaymentId,
    failureReason: r.failureReason,
    createdAt: r.createdAt.toISOString(),
    order: r.orderStatus
      ? { id: r.orderId, status: r.orderStatus, fulfilment: r.orderFulfilment as FulfilmentType, customer: { name: r.customerName ?? "", phone: r.customerPhone ?? "" }, payment: { cod: { collected: r.codCollected ?? false } } }
      : undefined,
  }));
  return { items, total, page, pages: Math.max(1, Math.ceil(total / pageSize)), summary: summary.map((s) => ({ method: s.method as string, status: s.status as string, count: s.count, amount: s.amount, collected: s.collected })) };
}

export interface PaymentRow {
  id: string;
  orderId: string;
  orderNumber: string;
  method: "COD" | "RAZORPAY";
  status: PaymentStatus;
  amount: number;
  amountCollected?: number | null;
  collectedAt?: string | null;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  failureReason?: string | null;
  createdAt: string;
  order?: { id: string; status: OrderStatus; fulfilment: FulfilmentType; customer: { name: string; phone: string }; payment?: { cod?: { collected?: boolean } } };
}


/** Mark admin notifications as read (`"all"` or a list of ids). Returns how many changed. */
export async function markAdminNotificationsRead(target: "all" | string[]) {
  const db = await getDb();
  const unread = and(eq(notifications.audience, "ADMIN"), isNull(notifications.readAt));
  if (target !== "all" && target.length === 0) return 0;
  const res = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(target === "all" ? unread : and(unread, inArray(notifications.id, target)))
    .returning({ id: notifications.id });
  return res.length;
}
