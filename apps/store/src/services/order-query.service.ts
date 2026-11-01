import { and, count, desc, eq, ne } from "drizzle-orm";
import { getDb, getOrderDocByNumber, isUuid, schema, toOrderDocs, getOrderDocById, type OrderDoc } from "@/db";
import { serialize } from "@/lib/utilities/serialize";
import { maskPhone } from "@/lib/utilities/phone";
import { verifyTrackingToken, deriveTrackingToken } from "@/services/order.service";
import type { OrderStatus } from "@/constants/domain";

const { orders } = schema;

/** Data safe to show on the public tracking page (no full phone number / internal notes). */
export function toTrackingView(order: OrderDoc) {
  return {
    orderNumber: order.orderNumber,
    status: order.status as OrderStatus,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    fulfilment: order.fulfilment,
    isPreorder: !!order.isPreorder,
    scheduledFor: order.scheduledFor?.toISOString() ?? null,
    estimatedReadyAt: order.estimatedReadyAt?.toISOString() ?? null,
    estimatedDeliveryAt: order.estimatedDeliveryAt?.toISOString() ?? null,
    customerName: order.customer.name.split(" ")[0],
    phoneMasked: maskPhone(order.customer.phone),
    address: order.address
      ? { houseNumber: order.address.houseNumber, street: order.address.street, landmark: order.address.landmark, city: order.address.city, pincode: order.address.pincode }
      : null,
    items: order.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
      isVeg: i.isVeg,
      imageUrl: i.imageUrl,
      selections: (i.selections ?? []).map((s) => ({ groupName: s.groupName, options: (s.options ?? []).map((o) => o.name) })),
      notes: i.notes,
    })),
    pricing: serialize(order.pricing),
    payment: { method: order.payment.method, status: order.payment.status },
    timeline: (order.timeline ?? []).map((t) => ({ status: t.status as OrderStatus, at: new Date(t.at).toISOString() })),
    rejectionReason: order.rejectionReason ?? null,
    cancellationReason: order.cancellationReason ?? null,
  };
}
export type TrackingView = ReturnType<typeof toTrackingView>;

export async function getTrackingView(orderNumber: string, token: string | null | undefined, userId?: string | null): Promise<TrackingView | null> {
  if (!/^BA\d{6}-\d{3,}$/.test(orderNumber)) return null;
  const db = await getDb();
  const order = await getOrderDocByNumber(db, orderNumber);
  if (!order) return null;
  const ownsOrder = !!userId && !!order.userId && order.userId === userId;
  if (!ownsOrder && !verifyTrackingToken(orderNumber, token)) return null;
  return toTrackingView(order);
}

/** Lookup by order number + phone (rate-limited by caller). Returns the tracking token on match. */
export async function lookupOrderToken(orderNumber: string, phone: string): Promise<string | null> {
  const db = await getDb();
  const [order] = await db
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(and(eq(orders.orderNumber, orderNumber.trim().toUpperCase()), eq(orders.customerPhone, phone)))
    .limit(1);
  return order ? deriveTrackingToken(order.orderNumber) : null;
}

export async function listCustomerOrders(userId: string, page = 1, pageSize = 10) {
  if (!isUuid(userId)) return { items: [], total: 0, page, pageSize };
  const db = await getDb();
  const filter = and(eq(orders.userId, userId), ne(orders.status, "AWAITING_PAYMENT"));
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(orders).where(filter).orderBy(desc(orders.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ n: count() }).from(orders).where(filter),
  ]);
  const docs = await toOrderDocs(db, rows);
  const items = docs.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    createdAt: o.createdAt,
    pricing: { total: o.pricing.total },
    items: o.items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, imageUrl: i.imageUrl })),
    payment: { method: o.payment.method, status: o.payment.status },
    fulfilment: o.fulfilment,
  }));
  return { items: serialize(items), total: Number(n), page, pageSize };
}

export async function getCustomerOrder(userId: string, orderId: string) {
  if (!isUuid(orderId) || !isUuid(userId)) return null;
  const db = await getDb();
  const order = await getOrderDocById(db, orderId);
  if (!order || order.userId !== userId) return null;
  return { id: order.id, ...toTrackingView(order), itemsDetailed: serialize(order.items) };
}
