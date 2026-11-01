import { cacheLife, cacheTag } from "next/cache";
import { CACHE_TAGS } from "@/constants/cache-tags";
import { fetchPublicMenu, fetchPublicProductBySlug } from "@/services/catalog.service";
import { and, desc, eq, gte, notInArray, sql } from "drizzle-orm";
import { getDb, schema, sumInt } from "@/db";

/** Full public menu (categories + products). Cached; invalidated by admin menu edits. */
export async function getPublicMenu() {
  "use cache";
  cacheTag(CACHE_TAGS.catalog);
  cacheLife("hours");
  return fetchPublicMenu();
}

export async function getPublicProduct(slug: string) {
  "use cache";
  cacheTag(CACHE_TAGS.catalog, `product:${slug}`);
  cacheLife("hours");
  return fetchPublicProductBySlug(slug);
}

/** Top products by quantity ordered in the last 60 days (real order data), merged with admin "bestseller" flags. */
export async function getBestsellerIds(limit = 8): Promise<string[]> {
  "use cache";
  cacheTag(CACHE_TAGS.bestsellers);
  cacheLife("hours");
  const db = await getDb();
  const since = new Date(Date.now() - 60 * 86_400_000);
  const qty = sumInt(schema.orderItems.quantity);
  const rows = await db
    .select({ productId: schema.orderItems.productId, qty })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
    .where(and(gte(schema.orders.createdAt, since), notInArray(schema.orders.status, ["CANCELLED", "REJECTED", "AWAITING_PAYMENT"])))
    .groupBy(schema.orderItems.productId)
    .orderBy(desc(sql`2`))
    .limit(limit);
  return rows.map((r) => r.productId);
}
