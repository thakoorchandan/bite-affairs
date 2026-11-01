import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb, isUniqueViolation, isUuid, schema, withTransaction } from "@/db";
import { AppError, notFound } from "@/lib/utilities/errors";
import { serialize } from "@/lib/utilities/serialize";
import { savedAddressSchema, type SavedAddressInput } from "@/lib/validations/address";
import { fetchPublicMenu } from "./catalog.service";

const { addresses, favourites, products, orders, orderItems, reviews, users } = schema;
const MAX_ADDRESSES = 10;

function uid(id: string, what = "Resource") {
  if (!isUuid(id)) throw notFound(what);
  return id;
}

/* ───────────── Addresses (always scoped by userId) ───────────── */

export async function listAddresses(userId: string) {
  const db = await getDb();
  const rows = await db.select().from(addresses).where(eq(addresses.userId, userId)).orderBy(desc(addresses.isDefault), desc(addresses.updatedAt));
  return serialize(rows);
}
export type SavedAddress = Awaited<ReturnType<typeof listAddresses>>[number];

export async function createAddress(userId: string, raw: unknown) {
  const data: SavedAddressInput = savedAddressSchema.parse(raw);
  return withTransaction(async (tx) => {
    const existing = await tx.select({ id: addresses.id }).from(addresses).where(eq(addresses.userId, userId));
    if (existing.length >= MAX_ADDRESSES) throw new AppError(`You can save up to ${MAX_ADDRESSES} addresses.`, "LIMIT");
    const makeDefault = data.isDefault || existing.length === 0;
    // Unset first: a partial unique index allows only one default per user.
    if (makeDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
    const [row] = await tx.insert(addresses).values({ ...data, userId, isDefault: makeDefault }).returning({ id: addresses.id });
    return row.id;
  });
}

export async function updateAddress(userId: string, addressId: string, raw: unknown) {
  const data = savedAddressSchema.parse(raw);
  const id = uid(addressId, "Address");
  await withTransaction(async (tx) => {
    const [existing] = await tx.select({ isDefault: addresses.isDefault }).from(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, userId))).limit(1);
    if (!existing) throw notFound("Address");
    if (data.isDefault) await tx.update(addresses).set({ isDefault: false }).where(and(eq(addresses.userId, userId), ne(addresses.id, id)));
    await tx.update(addresses).set({ ...data, isDefault: data.isDefault || !!existing.isDefault }).where(and(eq(addresses.id, id), eq(addresses.userId, userId)));
  });
}

export async function deleteAddress(userId: string, addressId: string) {
  const id = uid(addressId, "Address");
  await withTransaction(async (tx) => {
    const [removed] = await tx.delete(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, userId))).returning({ isDefault: addresses.isDefault });
    if (!removed) throw notFound("Address");
    if (removed.isDefault) {
      const [next] = await tx.select({ id: addresses.id }).from(addresses).where(eq(addresses.userId, userId)).orderBy(desc(addresses.updatedAt)).limit(1);
      if (next) await tx.update(addresses).set({ isDefault: true }).where(eq(addresses.id, next.id));
    }
  });
}

export async function setDefaultAddress(userId: string, addressId: string) {
  const id = uid(addressId, "Address");
  await withTransaction(async (tx) => {
    const [exists] = await tx.select({ id: addresses.id }).from(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, userId))).limit(1);
    if (!exists) throw notFound("Address");
    await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
    await tx.update(addresses).set({ isDefault: true }).where(and(eq(addresses.id, id), eq(addresses.userId, userId)));
  });
}

/* ───────────── Favourites ───────────── */

export async function listFavouriteProductIds(userId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select({ productId: favourites.productId }).from(favourites).where(eq(favourites.userId, userId)).orderBy(desc(favourites.createdAt));
  return rows.map((r) => r.productId);
}

export async function toggleFavourite(userId: string, productId: string): Promise<boolean> {
  const pid = uid(productId, "Product");
  const db = await getDb();
  const removed = await db.delete(favourites).where(and(eq(favourites.userId, userId), eq(favourites.productId, pid))).returning({ id: favourites.id });
  if (removed.length) return false;
  const [product] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, pid), eq(products.isActive, true))).limit(1);
  if (!product) throw notFound("Product");
  // Concurrent double-tap: the unique index makes the second insert a no-op ("already a favourite").
  await db.insert(favourites).values({ userId, productId: pid }).onConflictDoNothing();
  return true;
}

/** Adds favourites saved on a device before signing in. Unknown/inactive products are skipped. Returns the full list. */
export async function addFavourites(userId: string, productIds: string[]): Promise<string[]> {
  const ids = [...new Set(productIds.filter((id) => isUuid(id)))].slice(0, 100);
  if (ids.length) {
    const db = await getDb();
    const valid = await db.select({ id: products.id }).from(products).where(and(inArray(products.id, ids), eq(products.isActive, true)));
    if (valid.length) await db.insert(favourites).values(valid.map((p) => ({ userId, productId: p.id }))).onConflictDoNothing();
  }
  return listFavouriteProductIds(userId);
}

export async function listFavouriteProducts(userId: string) {
  const ids = await listFavouriteProductIds(userId);
  if (!ids.length) return [];
  const { products: menu } = await fetchPublicMenu();
  const byId = new Map(menu.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
}

/* ───────────── Reviews ───────────── */

async function ownOrderWithItems(userId: string, orderId: string) {
  const db = await getDb();
  const [order] = await db.select({ id: orders.id, status: orders.status, customerName: orders.customerName }).from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId))).limit(1);
  if (!order) throw notFound("Order");
  const items = await db.select({ id: orderItems.id, productId: orderItems.productId, name: orderItems.name }).from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.position));
  return { order, items };
}

export async function getReviewState(userId: string, orderId: string) {
  const id = uid(orderId, "Order");
  const { order, items } = await ownOrderWithItems(userId, id);
  const db = await getDb();
  const rows = await db.select({ orderItemId: reviews.orderItemId, rating: reviews.rating, comment: reviews.comment, status: reviews.status }).from(reviews).where(and(eq(reviews.orderId, id), eq(reviews.userId, userId)));
  const byItem = new Map(rows.map((r) => [r.orderItemId, r]));
  return {
    canReview: order.status === "DELIVERED",
    items: items.map((i) => {
      const r = byItem.get(i.id);
      return { orderItemId: i.id, productId: i.productId, name: i.name, review: r ? { rating: r.rating, comment: r.comment ?? "", status: r.status as string } : null };
    }),
  };
}

/**
 * Only the customer who received a DELIVERED order can review its items, once per item
 * (enforced by a unique index). Reviews stay PENDING until an admin approves them.
 */
export async function createReview(userId: string, input: { orderId: string; orderItemId: string; rating: number; comment?: string }) {
  const orderId = uid(input.orderId, "Order");
  const { order, items } = await ownOrderWithItems(userId, orderId);
  if (order.status !== "DELIVERED") throw new AppError("You can review items once your order has been delivered.", "NOT_ELIGIBLE");
  const item = items.find((i) => i.id === input.orderItemId);
  if (!item) throw notFound("Order item");
  const db = await getDb();
  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  try {
    await db.insert(reviews).values({
      orderId,
      orderItemId: item.id,
      productId: item.productId,
      productName: item.name,
      userId,
      customerName: user?.name ?? order.customerName ?? "Customer",
      rating: input.rating,
      comment: input.comment?.trim() || null,
      status: "PENDING",
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("You've already reviewed this item.", "DUPLICATE_REVIEW", 409);
    throw e;
  }
}
