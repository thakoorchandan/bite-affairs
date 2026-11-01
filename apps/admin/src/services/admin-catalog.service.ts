/**
 * Admin-side catalog operations: categories, products, customisation groups, product costs,
 * coupons and review moderation. Pure database logic (no Next.js APIs) so it can be tested
 * directly; Server Actions in src/features/admin/* add auth, auditing and cache invalidation.
 */
import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { countAll, getDb, isUniqueViolation, isUuid, likeEscape, schema, sumInt, withTransaction, type DbOrTx, type ImageRef } from "@/db";
import { AppError, notFound } from "@/lib/utilities/errors";
import { slugify } from "@/lib/utilities/slug";
import { serialize } from "@/lib/utilities/serialize";
import { editHomeContentData } from "./home-content-edit";
import {
  categoryInputSchema,
  couponInputSchema,
  customisationGroupInputSchema,
  productCostInputSchema,
  productInputSchema,
  productQuickPatchSchema,
  reviewModerationSchema,
  type CategoryFormInput,
  type CouponFormInput,
  type CustomisationGroupFormInput,
  type ProductCostFormInput,
  type ProductFormInput,
} from "@/lib/validations/admin";

const { categories, products, customisationGroups, customisationOptions, productCustomisationGroups, productCosts, carts, coupons, couponRedemptions, reviews } = schema;

function id(value: string, what = "Item"): string {
  if (!isUuid(value)) throw notFound(what);
  return value;
}

function cleanImage(img: { url: string; publicId?: string | null; width?: number | null; height?: number | null; alt?: string | null } | null | undefined): ImageRef | null {
  if (!img) return null;
  const out: ImageRef = { url: img.url };
  if (img.publicId) out.publicId = img.publicId;
  if (img.width != null) out.width = img.width;
  if (img.height != null) out.height = img.height;
  if (img.alt) out.alt = img.alt;
  return out;
}

/** Finds a free slug: "paneer-pizza", "paneer-pizza-2", … */
export async function uniqueSlug(model: "product" | "category", base: string, excludeId?: string, tx?: DbOrTx): Promise<string> {
  const db = tx ?? (await getDb());
  const root = slugify(base) || (model === "product" ? "item" : "category");
  const table = model === "product" ? products : categories;
  for (let i = 1; i < 200; i++) {
    const candidate = i === 1 ? root : `${root.slice(0, 76)}-${i}`;
    const [clash] = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.slug, candidate), excludeId ? ne(table.id, excludeId) : undefined))
      .limit(1);
    if (!clash) return candidate;
  }
  throw new AppError("Could not generate a unique URL slug.");
}

// ─── Categories ────────────────────────────────────────────────────────────

export async function listCategoriesAdmin() {
  const db = await getDb();
  const [rows, counts] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.displayOrder), asc(categories.name)),
    db.select({ categoryId: products.categoryId, n: countAll() }).from(products).groupBy(products.categoryId),
  ]);
  const countBy = new Map(counts.map((c) => [c.categoryId, c.n]));
  return serialize(rows).map((c) => ({ ...c, productCount: countBy.get(c.id) ?? 0 }));
}
export type AdminCategory = Awaited<ReturnType<typeof listCategoriesAdmin>>[number];

export async function saveCategory(categoryId: string | null, input: CategoryFormInput) {
  const data = categoryInputSchema.parse(input);
  const existingId = categoryId ? id(categoryId, "Category") : undefined;
  const db = await getDb();
  const slug = data.slug ? data.slug : await uniqueSlug("category", data.name, existingId);
  if (data.slug) {
    const [clash] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.slug, slug), existingId ? ne(categories.id, existingId) : undefined)).limit(1);
    if (clash) throw new AppError("Another category already uses this URL slug.", "SLUG_TAKEN", 409, { slug: ["Already in use"] });
  }
  const fields = {
    name: data.name,
    slug,
    description: data.description || null,
    image: cleanImage(data.image),
    isActive: data.isActive,
    seo: { title: data.seoTitle || null, description: data.seoDescription || null },
  };
  try {
    if (existingId) {
      const [res] = await db.update(categories).set(fields).where(eq(categories.id, existingId)).returning();
      if (!res) throw notFound("Category");
      return { id: res.id, slug, name: res.name };
    }
    const [last] = await db.select({ displayOrder: categories.displayOrder }).from(categories).orderBy(desc(categories.displayOrder)).limit(1);
    const [created] = await db.insert(categories).values({ ...fields, displayOrder: (last?.displayOrder ?? -1) + 1 }).returning();
    return { id: created.id, slug, name: created.name };
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("Another category already uses this URL slug.", "SLUG_TAKEN", 409, { slug: ["Already in use"] });
    throw error;
  }
}

export async function setCategoryActive(categoryId: string, isActive: boolean) {
  const db = await getDb();
  const res = await db.update(categories).set({ isActive }).where(eq(categories.id, id(categoryId, "Category"))).returning({ id: categories.id });
  if (!res.length) throw notFound("Category");
}

/** Deletes a category. Refuses if it still has products, unless they are moved to another category. */
export async function deleteCategory(categoryId: string, moveProductsTo?: string | null) {
  const catId = id(categoryId, "Category");
  return withTransaction(async (tx) => {
    const [{ n: count }] = await tx.select({ n: countAll() }).from(products).where(eq(products.categoryId, catId));
    if (count > 0) {
      if (!moveProductsTo) throw new AppError(`This category still has ${count} product(s). Move or delete them first.`, "CATEGORY_NOT_EMPTY", 409);
      const target = id(moveProductsTo, "Target category");
      if (target === catId) throw new AppError("Choose a different category to move products to.");
      const [exists] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.id, target)).limit(1);
      if (!exists) throw notFound("Target category");
      await tx.update(products).set({ categoryId: target }).where(eq(products.categoryId, catId));
    }
    const [deleted] = await tx.delete(categories).where(eq(categories.id, catId)).returning({ name: categories.name });
    if (!deleted) throw notFound("Category");
    await editHomeContentData(tx, (data) => {
      let changed = false;
      if (Array.isArray(data.featuredCategoryIds) && data.featuredCategoryIds.includes(catId)) {
        data.featuredCategoryIds = data.featuredCategoryIds.filter((x) => x !== catId);
        changed = true;
      }
      const combos = data.combos as { categoryId?: string | null } | undefined;
      if (combos?.categoryId === catId) {
        combos.categoryId = null;
        changed = true;
      }
      return changed;
    });
    return { name: deleted.name, moved: count };
  });
}

export async function reorderCategories(ids: string[]) {
  const ordered = ids.map((i) => id(i, "Category"));
  await withTransaction(async (tx) => {
    for (const [index, catId] of ordered.entries()) await tx.update(categories).set({ displayOrder: index }).where(eq(categories.id, catId));
  });
}

// ─── Products ──────────────────────────────────────────────────────────────

async function groupIdsByProduct(db: DbOrTx, productIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!productIds.length) return map;
  const rows = await db
    .select({ productId: productCustomisationGroups.productId, groupId: productCustomisationGroups.groupId })
    .from(productCustomisationGroups)
    .where(inArray(productCustomisationGroups.productId, productIds))
    .orderBy(asc(productCustomisationGroups.position));
  for (const r of rows) map.set(r.productId, [...(map.get(r.productId) ?? []), r.groupId]);
  return map;
}

export async function listProductsAdmin(filter: { q?: string; categoryId?: string; availability?: "all" | "available" | "soldout" | "hidden" } = {}) {
  const db = await getDb();
  const conds = [];
  if (filter.categoryId && isUuid(filter.categoryId)) conds.push(eq(products.categoryId, filter.categoryId));
  if (filter.availability === "available") conds.push(and(eq(products.isActive, true), eq(products.isAvailable, true)));
  if (filter.availability === "soldout") conds.push(eq(products.isAvailable, false));
  if (filter.availability === "hidden") conds.push(eq(products.isActive, false));
  if (filter.q?.trim()) {
    const like = `%${likeEscape(filter.q.trim().slice(0, 60))}%`;
    conds.push(or(ilike(products.name, like), sql`exists (select 1 from unnest(${products.tags}) t where t ilike ${like})`));
  }
  const [rows, cats] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        categoryId: products.categoryId,
        price: products.price,
        discountedPrice: products.discountedPrice,
        image: products.image,
        isVeg: products.isVeg,
        isActive: products.isActive,
        isAvailable: products.isAvailable,
        isBestseller: products.isBestseller,
        isFeatured: products.isFeatured,
        isNewArrival: products.isNewArrival,
        displayOrder: products.displayOrder,
        preparationMinutes: products.preparationMinutes,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(products.displayOrder), asc(products.name)),
    db.select({ id: categories.id, name: categories.name, slug: categories.slug, displayOrder: categories.displayOrder, isActive: categories.isActive }).from(categories).orderBy(asc(categories.displayOrder)),
  ]);
  const groups = await groupIdsByProduct(db, rows.map((r) => r.id));
  const catOrder = new Map(cats.map((c, i) => [c.id, i]));
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const list = serialize(rows).map((p) => ({ ...p, customisationGroupIds: groups.get(p.id) ?? [], categoryName: catName.get(p.categoryId) ?? "—" }));
  list.sort((a, b) => (catOrder.get(a.categoryId) ?? 99) - (catOrder.get(b.categoryId) ?? 99) || (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  return { products: list, categories: serialize(cats) };
}
export type AdminProductRow = Awaited<ReturnType<typeof listProductsAdmin>>["products"][number];

export async function getProductAdmin(productId: string) {
  if (!isUuid(productId)) return null;
  const db = await getDb();
  const [p] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!p) return null;
  const [[cost], groups] = await Promise.all([db.select().from(productCosts).where(eq(productCosts.productId, p.id)).limit(1), groupIdsByProduct(db, [p.id])]);
  return { product: { ...serialize(p), customisationGroupIds: groups.get(p.id) ?? [] }, cost: cost ? serialize(cost) : null };
}
export type AdminProductDetail = NonNullable<Awaited<ReturnType<typeof getProductAdmin>>>;

function productFields(data: ReturnType<typeof productInputSchema.parse>) {
  return {
    name: data.name,
    shortDescription: data.shortDescription || null,
    description: data.description || null,
    categoryId: data.categoryId,
    price: data.price,
    discountedPrice: data.discountedPrice ?? null,
    isVeg: data.isVeg,
    isBestseller: data.isBestseller,
    isFeatured: data.isFeatured,
    isNewArrival: data.isNewArrival,
    isActive: data.isActive,
    isAvailable: data.isAvailable,
    preparationMinutes: data.preparationMinutes,
    spiceLevel: data.spiceLevel,
    servingInfo: data.servingInfo || null,
    tags: data.tags,
    seo: { title: data.seoTitle || null, description: data.seoDescription || null },
    image: cleanImage(data.image),
    gallery: data.gallery.map(cleanImage).filter((x): x is ImageRef => !!x),
    videos: data.videos.map((v) => ({ url: v.url, publicId: v.publicId ?? undefined, posterUrl: v.posterUrl ?? undefined, durationSeconds: v.durationSeconds ?? undefined })),
  };
}

async function setProductGroups(tx: DbOrTx, productId: string, groupIds: string[]) {
  const unique = [...new Set(groupIds)];
  await tx.delete(productCustomisationGroups).where(eq(productCustomisationGroups.productId, productId));
  if (unique.length) await tx.insert(productCustomisationGroups).values(unique.map((groupId, position) => ({ productId, groupId, position })));
}

export async function saveProduct(productId: string | null, input: ProductFormInput) {
  const data = productInputSchema.parse(input);
  const existingId = productId ? id(productId, "Product") : undefined;
  const slugTaken = new AppError("Another product already uses this URL slug.", "SLUG_TAKEN", 409, { slug: ["Already in use"] });
  try {
    return await withTransaction(async (tx) => {
      const [cat] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.id, data.categoryId)).limit(1);
      if (!cat) throw new AppError("Choose a valid category.", "VALIDATION", 400, { categoryId: ["Category not found"] });
      const groupIds = [...new Set(data.customisationGroupIds)];
      if (groupIds.length) {
        const [{ n }] = await tx.select({ n: countAll() }).from(customisationGroups).where(inArray(customisationGroups.id, groupIds));
        if (n !== groupIds.length) throw new AppError("One of the selected customisation groups no longer exists.");
      }
      let slug: string;
      if (data.slug) {
        const [clash] = await tx.select({ id: products.id }).from(products).where(and(eq(products.slug, data.slug), existingId ? ne(products.id, existingId) : undefined)).limit(1);
        if (clash) throw slugTaken;
        slug = data.slug;
      } else if (existingId) {
        const [current] = await tx.select({ slug: products.slug }).from(products).where(eq(products.id, existingId)).limit(1);
        if (!current) throw notFound("Product");
        slug = current.slug;
      } else {
        slug = await uniqueSlug("product", data.name, undefined, tx);
      }
      const fields = { ...productFields(data), slug };

      if (existingId) {
        const [res] = await tx
          .update(products)
          .set(data.displayOrder !== undefined ? { ...fields, displayOrder: data.displayOrder } : fields)
          .where(eq(products.id, existingId))
          .returning({ id: products.id, slug: products.slug, name: products.name });
        if (!res) throw notFound("Product");
        await setProductGroups(tx, res.id, groupIds);
        return res;
      }
      let displayOrder = data.displayOrder;
      if (displayOrder === undefined) {
        const [last] = await tx.select({ displayOrder: products.displayOrder }).from(products).where(eq(products.categoryId, fields.categoryId)).orderBy(desc(products.displayOrder)).limit(1);
        displayOrder = (last?.displayOrder ?? -1) + 1;
      }
      const [created] = await tx.insert(products).values({ ...fields, displayOrder }).returning({ id: products.id, slug: products.slug, name: products.name });
      await setProductGroups(tx, created.id, groupIds);
      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw slugTaken;
    throw error;
  }
}

export async function patchProduct(productId: string, input: unknown) {
  const data = productQuickPatchSchema.parse(input);
  const pid = id(productId, "Product");
  return withTransaction(async (tx) => {
    const [product] = await tx.select({ price: products.price, discountedPrice: products.discountedPrice, name: products.name }).from(products).where(eq(products.id, pid)).for("update").limit(1);
    if (!product) throw notFound("Product");
    const set: Partial<typeof products.$inferInsert> = {};
    for (const key of ["isAvailable", "isActive", "isBestseller", "isFeatured"] as const) if (data[key] !== undefined) set[key] = data[key];
    const price = data.price ?? product.price;
    if (data.price !== undefined) {
      if (data.price <= 0) throw new AppError("Price must be more than ₹0.");
      set.price = data.price;
    }
    if (data.discountedPrice !== undefined) set.discountedPrice = data.discountedPrice;
    const discounted = data.discountedPrice === null ? undefined : (data.discountedPrice ?? product.discountedPrice ?? undefined);
    if (discounted != null && discounted >= price) throw new AppError("Discounted price must be lower than the price.");
    if (Object.keys(set).length) await tx.update(products).set(set).where(eq(products.id, pid));
    return { name: product.name };
  });
}

export async function duplicateProduct(productId: string) {
  const pid = id(productId, "Product");
  return withTransaction(async (tx) => {
    const [source] = await tx.select().from(products).where(eq(products.id, pid)).limit(1);
    if (!source) throw notFound("Product");
    const name = `${source.name} (copy)`.slice(0, 100);
    const { id: _id, slug: _slug, createdAt: _c, updatedAt: _u, ratingAverage: _ra, ratingCount: _rc, ...rest } = source;
    void _id;
    void _slug;
    void _c;
    void _u;
    void _ra;
    void _rc;
    const [created] = await tx
      .insert(products)
      .values({ ...rest, name, slug: await uniqueSlug("product", name, undefined, tx), isActive: false, displayOrder: (source.displayOrder ?? 0) + 1 })
      .returning({ id: products.id });
    const groups = await groupIdsByProduct(tx, [source.id]);
    await setProductGroups(tx, created.id, groups.get(source.id) ?? []);
    const [cost] = await tx.select().from(productCosts).where(eq(productCosts.productId, source.id)).limit(1);
    if (cost) {
      await tx.insert(productCosts).values({ productId: created.id, ingredientCost: cost.ingredientCost, packagingCost: cost.packagingCost, preparationCost: cost.preparationCost, otherCost: cost.otherCost, notes: cost.notes });
    }
    return { id: created.id, name };
  });
}

/**
 * Hard-deletes a product. Past orders keep their own item snapshots, so history is safe;
 * favourites, costs and group links cascade, and saved carts, coupons and content references are cleaned up here.
 */
export async function deleteProduct(productId: string) {
  const pid = id(productId, "Product");
  return withTransaction(async (tx) => {
    const [deleted] = await tx.delete(products).where(eq(products.id, pid)).returning({ name: products.name });
    if (!deleted) throw notFound("Product");
    // Favourites, product_costs, product_customisation_groups and reviews are removed by ON DELETE CASCADE.
    await tx.execute(sql`
      update ${carts}
      set items = coalesce((select jsonb_agg(e) from jsonb_array_elements(${carts.items}) e where e->>'productId' <> ${pid}), '[]'::jsonb)
      where ${carts.items} @> ${JSON.stringify([{ productId: pid }])}::jsonb`);
    await tx
      .update(coupons)
      .set({ applicableProductIds: sql`array_remove(${coupons.applicableProductIds}, ${pid}::uuid)` })
      .where(sql`${pid}::uuid = any(${coupons.applicableProductIds})`);
    await editHomeContentData(tx, (data) => {
      if (Array.isArray(data.featuredProductIds) && data.featuredProductIds.includes(pid)) {
        data.featuredProductIds = data.featuredProductIds.filter((x) => x !== pid);
        return true;
      }
      return false;
    });
    return { name: deleted.name };
  });
}

export async function reorderProducts(ids: string[]) {
  const ordered = ids.map((i) => id(i, "Product"));
  await withTransaction(async (tx) => {
    for (const [index, pid] of ordered.entries()) await tx.update(products).set({ displayOrder: index }).where(eq(products.id, pid));
  });
}

export async function saveProductCost(productId: string, input: ProductCostFormInput, updatedBy?: string) {
  const data = productCostInputSchema.parse(input);
  const pid = id(productId, "Product");
  const db = await getDb();
  const [exists] = await db.select({ id: products.id }).from(products).where(eq(products.id, pid)).limit(1);
  if (!exists) throw notFound("Product");
  const values = {
    ingredientCost: data.ingredientCost ?? 0,
    packagingCost: data.packagingCost ?? 0,
    preparationCost: data.preparationCost ?? 0,
    otherCost: data.otherCost ?? 0,
    notes: data.notes || null,
    updatedBy: updatedBy && isUuid(updatedBy) ? updatedBy : null,
  };
  await db.insert(productCosts).values({ productId: pid, ...values }).onConflictDoUpdate({ target: productCosts.productId, set: values });
}

// ─── Customisation groups ──────────────────────────────────────────────────

export interface AdminCustomisationGroup {
  id: string;
  name: string;
  internalName: string | null;
  selectionType: "SINGLE" | "MULTIPLE";
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  isActive: boolean;
  options: { id: string; name: string; priceDelta: number; isAvailable: boolean; isDefault: boolean; isVeg: boolean }[];
  usedBy: { id: string; name: string }[];
}

export async function listCustomisationGroupsAdmin(): Promise<AdminCustomisationGroup[]> {
  const db = await getDb();
  const [groups, options, usage] = await Promise.all([
    db.select().from(customisationGroups).orderBy(asc(customisationGroups.name)),
    db.select().from(customisationOptions).orderBy(asc(customisationOptions.position)),
    db
      .select({ groupId: productCustomisationGroups.groupId, productId: products.id, name: products.name })
      .from(productCustomisationGroups)
      .innerJoin(products, eq(products.id, productCustomisationGroups.productId))
      .orderBy(asc(products.name)),
  ]);
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    internalName: g.internalName ?? null,
    selectionType: g.selectionType,
    isRequired: !!g.isRequired,
    minSelect: g.minSelect ?? 0,
    maxSelect: g.maxSelect ?? 0,
    isActive: g.isActive !== false,
    options: options.filter((o) => o.groupId === g.id).map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDelta ?? 0, isAvailable: o.isAvailable !== false, isDefault: !!o.isDefault, isVeg: o.isVeg !== false })),
    usedBy: usage.filter((u) => u.groupId === g.id).map((u) => ({ id: u.productId, name: u.name })),
  }));
}

export async function saveCustomisationGroup(groupId: string | null, input: CustomisationGroupFormInput) {
  const data = customisationGroupInputSchema.parse(input);
  const fields = {
    name: data.name,
    internalName: data.internalName || null,
    selectionType: data.selectionType,
    isRequired: data.isRequired,
    minSelect: data.selectionType === "SINGLE" ? (data.isRequired ? 1 : 0) : data.minSelect,
    maxSelect: data.selectionType === "SINGLE" ? 1 : data.maxSelect,
    isActive: data.isActive,
  };
  return withTransaction(async (tx) => {
    let gid: string;
    let name: string;
    if (groupId) {
      gid = id(groupId, "Customisation group");
      const [res] = await tx.update(customisationGroups).set(fields).where(eq(customisationGroups.id, gid)).returning({ name: customisationGroups.name });
      if (!res) throw notFound("Customisation group");
      name = res.name;
    } else {
      const [created] = await tx.insert(customisationGroups).values(fields).returning({ id: customisationGroups.id, name: customisationGroups.name });
      gid = created.id;
      name = created.name;
    }
    // Keep existing option ids so carts referencing them stay valid: update by id, insert the rest, delete removed ones.
    const existing = await tx.select({ id: customisationOptions.id, groupId: customisationOptions.groupId }).from(customisationOptions).where(eq(customisationOptions.groupId, gid));
    const ownIds = new Set(existing.map((o) => o.id));
    const keep = new Set<string>();
    for (const [position, o] of data.options.entries()) {
      const values = { name: o.name, priceDelta: o.priceDelta, isAvailable: o.isAvailable, isDefault: o.isDefault, isVeg: o.isVeg, position };
      if (o.id && ownIds.has(o.id) && !keep.has(o.id)) {
        await tx.update(customisationOptions).set(values).where(eq(customisationOptions.id, o.id));
        keep.add(o.id);
      } else {
        const [row] = await tx.insert(customisationOptions).values({ groupId: gid, ...values }).returning({ id: customisationOptions.id });
        keep.add(row.id);
      }
    }
    const remove = existing.filter((o) => !keep.has(o.id)).map((o) => o.id);
    if (remove.length) await tx.delete(customisationOptions).where(inArray(customisationOptions.id, remove));
    return { id: gid, name };
  });
}

export async function deleteCustomisationGroup(groupId: string) {
  const gid = id(groupId, "Customisation group");
  return withTransaction(async (tx) => {
    const [{ n }] = await tx.select({ n: countAll() }).from(productCustomisationGroups).where(eq(productCustomisationGroups.groupId, gid));
    // Options and product links are removed by ON DELETE CASCADE.
    const [deleted] = await tx.delete(customisationGroups).where(eq(customisationGroups.id, gid)).returning({ name: customisationGroups.name });
    if (!deleted) throw notFound("Customisation group");
    return { name: deleted.name, detachedFrom: n };
  });
}

// ─── Coupons ───────────────────────────────────────────────────────────────

export async function listCouponsAdmin() {
  const db = await getDb();
  const [rows, stats] = await Promise.all([
    db.select().from(coupons).orderBy(desc(coupons.createdAt)),
    db
      .select({ couponId: couponRedemptions.couponId, uses: countAll(), discount: sumInt(couponRedemptions.discount) })
      .from(couponRedemptions)
      .where(eq(couponRedemptions.released, false))
      .groupBy(couponRedemptions.couponId),
  ]);
  const byId = new Map(stats.map((s) => [s.couponId, s]));
  return serialize(rows).map((c) => ({ ...c, redemptions: byId.get(c.id)?.uses ?? 0, totalDiscount: byId.get(c.id)?.discount ?? 0 }));
}
export type AdminCoupon = Awaited<ReturnType<typeof listCouponsAdmin>>[number];

export async function saveCoupon(couponId: string | null, input: CouponFormInput) {
  const data = couponInputSchema.parse(input);
  const existingId = couponId ? id(couponId, "Coupon") : undefined;
  const db = await getDb();
  const codeTaken = new AppError("A coupon with this code already exists.", "CODE_TAKEN", 409, { code: ["Already in use"] });
  const [clash] = await db.select({ id: coupons.id }).from(coupons).where(and(eq(coupons.code, data.code), existingId ? ne(coupons.id, existingId) : undefined)).limit(1);
  if (clash) throw codeTaken;
  if (data.type === "PERCENT" && data.value === 10000 && !data.maxDiscount) {
    throw new AppError("A 100% coupon needs a maximum discount cap.", "VALIDATION", 400, { maxDiscount: ["Required for 100% off"] });
  }
  const fields = {
    code: data.code,
    description: data.description || null,
    type: data.type,
    value: data.value,
    maxDiscount: data.maxDiscount ?? null,
    minOrderAmount: data.minOrderAmount ?? 0,
    startsAt: data.startsAt ?? null,
    endsAt: data.endsAt ?? null,
    usageLimit: data.usageLimit ?? null,
    perCustomerLimit: data.perCustomerLimit ?? null,
    firstOrderOnly: data.firstOrderOnly,
    applicableProductIds: [...new Set(data.applicableProductIds)],
    applicableCategoryIds: [...new Set(data.applicableCategoryIds)],
    isActive: data.isActive,
    isPublic: data.isPublic,
  };
  try {
    if (existingId) {
      const [res] = await db.update(coupons).set(fields).where(eq(coupons.id, existingId)).returning({ id: coupons.id, code: coupons.code });
      if (!res) throw notFound("Coupon");
      return res;
    }
    const [created] = await db.insert(coupons).values(fields).returning({ id: coupons.id, code: coupons.code });
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) throw codeTaken;
    throw error;
  }
}

export async function setCouponActive(couponId: string, isActive: boolean) {
  const db = await getDb();
  const res = await db.update(coupons).set({ isActive }).where(eq(coupons.id, id(couponId, "Coupon"))).returning({ id: coupons.id });
  if (!res.length) throw notFound("Coupon");
}

/** Coupons that were already redeemed are deactivated instead of deleted, to keep redemption history intact. */
export async function deleteCoupon(couponId: string) {
  const cid = id(couponId, "Coupon");
  return withTransaction(async (tx) => {
    const [coupon] = await tx.select({ code: coupons.code }).from(coupons).where(eq(coupons.id, cid)).limit(1);
    if (!coupon) throw notFound("Coupon");
    const [used] = await tx.select({ id: couponRedemptions.id }).from(couponRedemptions).where(eq(couponRedemptions.couponId, cid)).limit(1);
    if (used) {
      await tx.update(coupons).set({ isActive: false }).where(eq(coupons.id, cid));
      return { code: coupon.code, deactivated: true };
    }
    await tx.delete(coupons).where(eq(coupons.id, cid));
    return { code: coupon.code, deactivated: false };
  });
}

// ─── Reviews ───────────────────────────────────────────────────────────────

export async function listReviewsAdmin(status?: string) {
  const db = await getDb();
  const filter = status && ["PENDING", "APPROVED", "HIDDEN"].includes(status) ? eq(reviews.status, status as "PENDING" | "APPROVED" | "HIDDEN") : undefined;
  const [rows, counts] = await Promise.all([
    db.select().from(reviews).where(filter).orderBy(desc(reviews.createdAt)).limit(200),
    db.select({ status: reviews.status, n: countAll() }).from(reviews).groupBy(reviews.status),
  ]);
  return { reviews: serialize(rows), counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Record<string, number> };
}
export type AdminReview = Awaited<ReturnType<typeof listReviewsAdmin>>["reviews"][number];

export async function recomputeProductRating(productId: string, tx?: DbOrTx) {
  const db = tx ?? (await getDb());
  const [agg] = await db
    .select({ avg: sql<number>`coalesce(avg(${reviews.rating}), 0)`.mapWith(Number), n: countAll() })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.status, "APPROVED")));
  await db.update(products).set({ ratingAverage: agg.n ? Math.round(agg.avg * 10) / 10 : 0, ratingCount: agg.n }).where(eq(products.id, productId));
}

export async function moderateReview(reviewId: string, input: unknown) {
  const data = reviewModerationSchema.parse(input);
  const rid = id(reviewId, "Review");
  return withTransaction(async (tx) => {
    const [review] = await tx.update(reviews).set({ status: data.status, adminReply: data.adminReply || null }).where(eq(reviews.id, rid)).returning();
    if (!review) throw notFound("Review");
    await recomputeProductRating(review.productId, tx);
    return { productName: review.productName, status: review.status };
  });
}

export async function deleteReview(reviewId: string) {
  const rid = id(reviewId, "Review");
  return withTransaction(async (tx) => {
    const [review] = await tx.delete(reviews).where(eq(reviews.id, rid)).returning();
    if (!review) throw notFound("Review");
    await recomputeProductRating(review.productId, tx);
    return { productName: review.productName };
  });
}
