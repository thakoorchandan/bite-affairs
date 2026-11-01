import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { ImageRef, PublicCategory, PublicCustomisationGroup, PublicProduct, PublicProductDetail } from "@/types/catalog";

const { categories, products, customisationGroups, customisationOptions, productCustomisationGroups } = schema;
type CategoryRow = typeof categories.$inferSelect;
type ProductRow = typeof products.$inferSelect;

function img(ref: { url: string; publicId?: string | null; width?: number | null; height?: number | null; alt?: string | null } | null | undefined): ImageRef | null {
  return ref?.url ? { url: ref.url, publicId: ref.publicId ?? null, width: ref.width ?? null, height: ref.height ?? null, alt: ref.alt ?? null } : null;
}

function toPublicProduct(p: ProductRow, cat: Pick<CategoryRow, "name" | "slug"> | undefined, hasCustomisations: boolean): PublicProduct {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    shortDescription: p.shortDescription ?? null,
    description: p.description ?? null,
    categoryId: p.categoryId,
    categoryName: cat?.name ?? "",
    categorySlug: cat?.slug ?? "",
    price: p.price,
    discountedPrice: p.discountedPrice != null && p.discountedPrice < p.price ? p.discountedPrice : null,
    image: img(p.image),
    gallery: (p.gallery ?? []).map(img).filter((x): x is ImageRef => !!x),
    videos: (p.videos ?? []).map((v) => ({ url: v.url, publicId: v.publicId ?? null, posterUrl: v.posterUrl ?? null, durationSeconds: v.durationSeconds ?? null })),
    isVeg: p.isVeg,
    isBestseller: !!p.isBestseller,
    isFeatured: !!p.isFeatured,
    isNewArrival: !!p.isNewArrival,
    isAvailable: p.isAvailable !== false,
    preparationMinutes: p.preparationMinutes ?? 15,
    spiceLevel: p.spiceLevel ?? 0,
    servingInfo: p.servingInfo ?? null,
    tags: p.tags ?? [],
    ratingAverage: p.ratingAverage ?? 0,
    ratingCount: p.ratingCount ?? 0,
    hasCustomisations,
    seo: p.seo ? { title: p.seo.title ?? null, description: p.seo.description ?? null } : null,
    createdAt: (p.createdAt ?? new Date(0)).toISOString(),
  };
}

/** Entire public menu in a few queries — small enough for a cloud kitchen and easy to cache. */
export async function fetchPublicMenu(): Promise<{ categories: PublicCategory[]; products: PublicProduct[] }> {
  const db = await getDb();
  const cats = await db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.displayOrder), asc(categories.name));
  if (!cats.length) return { categories: [], products: [] };
  const catById = new Map(cats.map((c) => [c.id, c]));
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), inArray(products.categoryId, cats.map((c) => c.id))))
    .orderBy(asc(products.displayOrder), asc(products.name));
  const withGroups = rows.length ? await db.selectDistinct({ productId: productCustomisationGroups.productId }).from(productCustomisationGroups).where(inArray(productCustomisationGroups.productId, rows.map((r) => r.id))) : [];
  const hasGroups = new Set(withGroups.map((r) => r.productId));
  const publicProducts = rows.map((p) => toPublicProduct(p, catById.get(p.categoryId), hasGroups.has(p.id)));
  // Order products by their category's position first (stable sort keeps displayOrder inside a category).
  const catOrder = new Map(cats.map((c, i) => [c.id, i]));
  publicProducts.sort((a, b) => catOrder.get(a.categoryId)! - catOrder.get(b.categoryId)!);
  const counts = new Map<string, number>();
  for (const p of publicProducts) counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
  return {
    categories: cats.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description ?? null,
      image: img(c.image),
      displayOrder: c.displayOrder ?? 0,
      productCount: counts.get(c.id) ?? 0,
    })),
    products: publicProducts,
  };
}

export async function fetchPublicProductBySlug(slug: string): Promise<PublicProductDetail | null> {
  const db = await getDb();
  const [p] = await db.select().from(products).where(and(eq(products.slug, slug.toLowerCase()), eq(products.isActive, true))).limit(1);
  if (!p) return null;
  const [cat] = await db.select().from(categories).where(and(eq(categories.id, p.categoryId), eq(categories.isActive, true))).limit(1);
  if (!cat) return null;
  const links = await db.select().from(productCustomisationGroups).where(eq(productCustomisationGroups.productId, p.id)).orderBy(asc(productCustomisationGroups.position));
  const groupIds = links.map((l) => l.groupId);
  const groups = groupIds.length ? await db.select().from(customisationGroups).where(and(inArray(customisationGroups.id, groupIds), eq(customisationGroups.isActive, true))) : [];
  const options = groupIds.length ? await db.select().from(customisationOptions).where(inArray(customisationOptions.groupId, groupIds)).orderBy(asc(customisationOptions.position)) : [];
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const customisationGroupsOut: PublicCustomisationGroup[] = groupIds
    .map((id) => groupById.get(id))
    .filter((g): g is NonNullable<typeof g> => !!g)
    .map((g) => ({
      id: g.id,
      name: g.name,
      selectionType: g.selectionType,
      isRequired: !!g.isRequired,
      minSelect: g.minSelect ?? 0,
      maxSelect: g.maxSelect ?? 0,
      options: options.filter((o) => o.groupId === g.id).map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDelta ?? 0, isAvailable: o.isAvailable !== false, isDefault: !!o.isDefault, isVeg: o.isVeg !== false })),
    }));
  return { ...toPublicProduct(p, cat, groupIds.length > 0), customisationGroups: customisationGroupsOut };
}

export async function fetchActiveProductSlugs(): Promise<{ slug: string; updatedAt: string }[]> {
  const db = await getDb();
  const rows = await db.select({ slug: products.slug, updatedAt: products.updatedAt }).from(products).where(eq(products.isActive, true));
  return rows.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString() }));
}
