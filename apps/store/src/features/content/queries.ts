import { cacheLife, cacheTag } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { CACHE_TAGS } from "@/constants/cache-tags";
import { getDb, isUuid, schema } from "@/db";
import { serialize } from "@/lib/utilities/serialize";
import { getHomeContentData } from "@/services/settings.service";

const { testimonials, reviews } = schema;

/** Admin-editable storefront content (defaults applied). Keeps the `id`/`key` fields of the old singleton document. */
export async function getHomeContent() {
  "use cache";
  cacheTag(CACHE_TAGS.content);
  cacheLife("hours");
  const data = await getHomeContentData();
  return serialize({ id: "home", key: "home", ...data });
}
export type HomeContent = Awaited<ReturnType<typeof getHomeContent>>;

export async function getActiveTestimonials() {
  "use cache";
  cacheTag(CACHE_TAGS.content);
  cacheLife("hours");
  const db = await getDb();
  return serialize(await db.select().from(testimonials).where(eq(testimonials.isActive, true)).orderBy(testimonials.displayOrder, desc(testimonials.createdAt)).limit(12));
}

/** Approved customer reviews (moderated). */
export async function getApprovedReviews(opts: { productId?: string; limit?: number } = {}) {
  "use cache";
  cacheTag(CACHE_TAGS.reviews);
  cacheLife("hours");
  if (opts.productId && !isUuid(opts.productId)) return [];
  const db = await getDb();
  const rows = await db
    .select({ id: reviews.id, productId: reviews.productId, productName: reviews.productName, customerName: reviews.customerName, rating: reviews.rating, comment: reviews.comment, adminReply: reviews.adminReply, createdAt: reviews.createdAt })
    .from(reviews)
    .where(and(eq(reviews.status, "APPROVED"), opts.productId ? eq(reviews.productId, opts.productId) : undefined))
    .orderBy(desc(reviews.createdAt))
    .limit(opts.limit ?? 12);
  return serialize(rows).map((r) => ({ ...r, customerName: (r.customerName ?? "Customer").split(" ")[0] }));
}
