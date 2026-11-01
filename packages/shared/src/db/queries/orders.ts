import { asc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "../client";
import { groupItemsByOrder, toOrderDoc, type OrderDoc, type OrderRow } from "../mappers/order";
import { orderItems, orders } from "../schema";

/** Attach `order_items` to flat order rows and fold them into nested OrderDocs (keeps the input order). */
export async function toOrderDocs(db: DbOrTx, rows: OrderRow[]): Promise<OrderDoc[]> {
  if (!rows.length) return [];
  const items = await db.select().from(orderItems).where(inArray(orderItems.orderId, rows.map((r) => r.id))).orderBy(asc(orderItems.position));
  const byOrder = groupItemsByOrder(items);
  return rows.map((r) => toOrderDoc(r, byOrder.get(r.id) ?? []));
}

export async function getOrderDocById(db: DbOrTx, id: string): Promise<OrderDoc | null> {
  const [row] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return row ? (await toOrderDocs(db, [row]))[0] : null;
}

export async function getOrderDocByNumber(db: DbOrTx, orderNumber: string): Promise<OrderDoc | null> {
  const [row] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  return row ? (await toOrderDocs(db, [row]))[0] : null;
}
