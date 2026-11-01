/**
 * Media library backed by Cloudinary. Browsers upload directly to Cloudinary with a signed
 * request; this service verifies the upload response signature, records metadata in
 * `product_media`, de-duplicates identical files by Cloudinary's etag, and keeps product,
 * category and website-content references consistent on replace/delete.
 */
import { z } from "zod";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { countAll, getDb, isUniqueViolation, isUuid, likeEscape, schema, sumInt, withTransaction, type DbOrTx, type ImageRef, type VideoRef } from "@/db";
import { destroyAsset, getCloudinaryConfig, verifyUploadResponse, type CloudinaryConfig } from "@/lib/cloudinary";
import { AppError, notFound } from "@/lib/utilities/errors";
import { serialize } from "@/lib/utilities/serialize";
import { editHomeContentData } from "./home-content-edit";

const { productMedia, products, categories } = schema;

export const uploadResultSchema = z.object({
  public_id: z.string().min(1).max(300),
  version: z.union([z.number(), z.string()]),
  signature: z.string().min(20).max(80),
  secure_url: z.string().url().startsWith("https://res.cloudinary.com/"),
  resource_type: z.enum(["image", "video"]),
  format: z.string().max(20).optional(),
  bytes: z.number().int().nonnegative().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  duration: z.number().optional(),
  etag: z.string().max(100).optional(),
  original_filename: z.string().max(200).optional(),
  alt: z.string().max(160).optional(),
});
export type UploadResultInput = z.input<typeof uploadResultSchema>;

export const MEDIA_LIMITS = {
  image: { maxBytes: 5 * 1024 * 1024, formats: ["jpg", "jpeg", "png", "webp", "avif"] },
  video: { maxBytes: 40 * 1024 * 1024, formats: ["mp4", "webm", "mov"] },
} as const;

function requireConfig(cfg?: CloudinaryConfig | null): CloudinaryConfig {
  const c = cfg ?? getCloudinaryConfig();
  if (!c) throw new AppError("Cloudinary is not configured.", "NOT_CONFIGURED", 503);
  return c;
}

/** Records an upload after verifying it was signed by Cloudinary for our account. */
export async function registerUpload(input: UploadResultInput, uploadedBy?: string, cfgOverride?: CloudinaryConfig) {
  const data = uploadResultSchema.parse(input);
  const cfg = requireConfig(cfgOverride);
  if (!verifyUploadResponse(cfg, data.public_id, data.version, data.signature)) {
    throw new AppError("Upload could not be verified.", "INVALID_SIGNATURE", 400);
  }
  if (!data.public_id.startsWith(`${cfg.folder}/`)) throw new AppError("Upload is outside the media folder.", "INVALID_UPLOAD", 400);
  const limits = MEDIA_LIMITS[data.resource_type];
  if (data.bytes && data.bytes > limits.maxBytes) {
    await destroyAsset(cfg, data.public_id, data.resource_type).catch(() => undefined);
    throw new AppError(`File is too large (max ${limits.maxBytes / 1024 / 1024} MB).`, "TOO_LARGE", 400);
  }
  const db = await getDb();

  // Same public id already registered (retry): return it.
  const [already] = await db.select().from(productMedia).where(eq(productMedia.publicId, data.public_id)).limit(1);
  if (already) return { media: serialize(already), duplicate: true };

  if (data.etag) {
    const [dup] = await db.select().from(productMedia).where(and(eq(productMedia.etag, data.etag), eq(productMedia.kind, data.resource_type))).limit(1);
    if (dup) {
      // Identical file already in the library: discard the new copy to save free-tier storage.
      await destroyAsset(cfg, data.public_id, data.resource_type).catch((e) => console.error("[media] duplicate cleanup failed", e));
      return { media: serialize(dup), duplicate: true };
    }
  }

  try {
    const [created] = await db
      .insert(productMedia)
      .values({
        kind: data.resource_type,
        publicId: data.public_id,
        url: data.secure_url,
        format: data.format,
        bytes: data.bytes,
        width: data.width,
        height: data.height,
        durationSeconds: data.duration,
        originalFilename: data.original_filename,
        alt: data.alt,
        etag: data.etag,
        uploadedBy: uploadedBy && isUuid(uploadedBy) ? uploadedBy : null,
      })
      .returning();
    return { media: serialize(created), duplicate: false };
  } catch (error) {
    // Two registrations of the same public id raced: return the winner.
    if (isUniqueViolation(error)) {
      const [winner] = await db.select().from(productMedia).where(eq(productMedia.publicId, data.public_id)).limit(1);
      if (winner) return { media: serialize(winner), duplicate: true };
    }
    throw error;
  }
}

export async function listMedia(opts: { kind?: "image" | "video"; page?: number; pageSize?: number; q?: string } = {}) {
  const db = await getDb();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, opts.pageSize ?? 48);
  const conds = [];
  if (opts.kind) conds.push(eq(productMedia.kind, opts.kind));
  if (opts.q?.trim()) conds.push(ilike(productMedia.originalFilename, `%${likeEscape(opts.q.trim().slice(0, 50))}%`));
  const where = conds.length ? and(...conds) : undefined;
  const [items, [{ n: total }], usage] = await Promise.all([
    db.select().from(productMedia).where(where).orderBy(desc(productMedia.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ n: countAll() }).from(productMedia).where(where),
    db.select({ kind: productMedia.kind, bytes: sumInt(productMedia.bytes), n: countAll() }).from(productMedia).groupBy(productMedia.kind),
  ]);
  return {
    items: serialize(items),
    total,
    page,
    pageSize,
    usage: Object.fromEntries(usage.map((u) => [u.kind, { bytes: u.bytes, count: u.n }])) as Record<string, { bytes: number; count: number }>,
  };
}
export type MediaItem = Awaited<ReturnType<typeof listMedia>>["items"][number];

const containsUrl = (column: unknown, url: string) => sql`${column} @> ${JSON.stringify([{ url }])}::jsonb`;

/** Where a media URL is used (for confirmation dialogs). */
export async function findMediaReferences(url: string) {
  const db = await getDb();
  const [prods, cats, content] = await Promise.all([
    db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(or(sql`${products.image}->>'url' = ${url}`, containsUrl(products.gallery, url), containsUrl(products.videos, url))),
    db.select({ id: categories.id, name: categories.name }).from(categories).where(sql`${categories.image}->>'url' = ${url}`),
    db
      .select({ n: countAll() })
      .from(schema.websiteContent)
      .where(
        or(
          sql`${schema.websiteContent.data}->'hero'->'images' @> ${JSON.stringify([{ url }])}::jsonb`,
          sql`${schema.websiteContent.data}->'gallery' @> ${JSON.stringify([{ url }])}::jsonb`,
          sql`${schema.websiteContent.data}->'about'->'image'->>'url' = ${url}`,
          sql`${schema.websiteContent.data}->'banners' @> ${JSON.stringify([{ image: { url } }])}::jsonb`,
        ),
      ),
  ]);
  return { products: prods, categories: cats, websiteContent: content[0].n > 0 };
}

type Replacement = { url: string; publicId?: string; width?: number; height?: number } | null;

function swapImage(image: ImageRef | null | undefined, oldUrl: string, replacement: Replacement): { value: ImageRef | null | undefined; changed: boolean } {
  if (!image || image.url !== oldUrl) return { value: image, changed: false };
  if (!replacement) return { value: null, changed: true };
  return { value: { ...image, url: replacement.url, publicId: replacement.publicId, width: replacement.width, height: replacement.height }, changed: true };
}

function swapList(list: ImageRef[] | undefined, oldUrl: string, replacement: Replacement): { value: ImageRef[]; changed: boolean } {
  let changed = false;
  const out: ImageRef[] = [];
  for (const item of list ?? []) {
    const r = swapImage(item, oldUrl, replacement);
    if (r.changed) changed = true;
    if (r.value) out.push(r.value);
  }
  return { value: out, changed };
}

/** Rewrites (or removes, when `replacement` is null) every reference to `oldUrl` in products, categories and website content. */
async function replaceReferences(tx: DbOrTx, oldUrl: string, replacement: Replacement, kind: "image" | "video") {
  if (kind === "video") {
    const rows = await tx.select({ id: products.id, videos: products.videos }).from(products).where(containsUrl(products.videos, oldUrl));
    for (const row of rows) {
      const videos: VideoRef[] = [];
      for (const v of row.videos) {
        if (v.url !== oldUrl) videos.push(v);
        else if (replacement) videos.push({ ...v, url: replacement.url, publicId: replacement.publicId });
      }
      await tx.update(products).set({ videos }).where(eq(products.id, row.id));
    }
    return;
  }

  const prodRows = await tx
    .select({ id: products.id, image: products.image, gallery: products.gallery })
    .from(products)
    .where(or(sql`${products.image}->>'url' = ${oldUrl}`, containsUrl(products.gallery, oldUrl)));
  for (const row of prodRows) {
    const image = swapImage(row.image, oldUrl, replacement);
    const gallery = swapList(row.gallery, oldUrl, replacement);
    await tx.update(products).set({ image: image.value ?? null, gallery: gallery.value }).where(eq(products.id, row.id));
  }
  const catRows = await tx.select({ id: categories.id, image: categories.image }).from(categories).where(sql`${categories.image}->>'url' = ${oldUrl}`);
  for (const row of catRows) await tx.update(categories).set({ image: swapImage(row.image, oldUrl, replacement).value ?? null }).where(eq(categories.id, row.id));

  await editHomeContentData(tx, (data) => {
    let changed = false;
    const hero = data.hero as { images?: ImageRef[] } | undefined;
    if (hero?.images) {
      const r = swapList(hero.images, oldUrl, replacement);
      if (r.changed) {
        hero.images = r.value;
        changed = true;
      }
    }
    if (Array.isArray(data.gallery)) {
      const r = swapList(data.gallery as ImageRef[], oldUrl, replacement);
      if (r.changed) {
        data.gallery = r.value;
        changed = true;
      }
    }
    if (Array.isArray(data.banners)) {
      for (const b of data.banners as { image?: ImageRef | null }[]) {
        const r = swapImage(b.image, oldUrl, replacement);
        if (r.changed) {
          if (r.value) b.image = r.value;
          else delete b.image;
          changed = true;
        }
      }
    }
    const about = data.about as { image?: ImageRef | null } | undefined;
    if (about?.image) {
      const r = swapImage(about.image, oldUrl, replacement);
      if (r.changed) {
        about.image = r.value ?? null;
        changed = true;
      }
    }
    return changed;
  });
}

/** Deletes an asset from Cloudinary and removes every reference to it. */
export async function deleteMedia(mediaId: string, cfgOverride?: CloudinaryConfig) {
  if (!isUuid(mediaId)) throw notFound("Media");
  const db = await getDb();
  const [media] = await db.select().from(productMedia).where(eq(productMedia.id, mediaId)).limit(1);
  if (!media) throw notFound("Media");
  const cfg = cfgOverride ?? getCloudinaryConfig();
  if (cfg) {
    const res = await destroyAsset(cfg, media.publicId, media.kind);
    if (res.result !== "ok" && res.result !== "not found") throw new AppError("Cloudinary could not delete the file. Try again.", "CLOUDINARY_ERROR", 502);
  }
  await withTransaction(async (tx) => {
    await replaceReferences(tx, media.url, null, media.kind);
    await tx.delete(productMedia).where(eq(productMedia.id, media.id));
  });
  return { publicId: media.publicId };
}

/** Points every reference of `oldId` at `newId`, then deletes the old asset. */
export async function replaceMedia(oldId: string, newId: string, cfgOverride?: CloudinaryConfig) {
  if (!isUuid(oldId) || !isUuid(newId)) throw notFound("Media");
  if (oldId === newId) throw new AppError("Choose a different file to replace with.");
  const db = await getDb();
  const [[oldMedia], [newMedia]] = await Promise.all([db.select().from(productMedia).where(eq(productMedia.id, oldId)).limit(1), db.select().from(productMedia).where(eq(productMedia.id, newId)).limit(1)]);
  if (!oldMedia || !newMedia) throw notFound("Media");
  if (oldMedia.kind !== newMedia.kind) throw new AppError("Replace an image with an image, or a video with a video.");
  await withTransaction(async (tx) => {
    await replaceReferences(tx, oldMedia.url, { url: newMedia.url, publicId: newMedia.publicId, width: newMedia.width ?? undefined, height: newMedia.height ?? undefined }, oldMedia.kind);
    await tx.delete(productMedia).where(eq(productMedia.id, oldMedia.id));
  });
  const cfg = cfgOverride ?? getCloudinaryConfig();
  if (cfg) await destroyAsset(cfg, oldMedia.publicId, oldMedia.kind).catch((e) => console.error("[media] old asset cleanup failed", e));
  return { url: newMedia.url };
}

export async function updateMediaAlt(mediaId: string, alt: string) {
  if (!isUuid(mediaId)) throw notFound("Media");
  const db = await getDb();
  const res = await db.update(productMedia).set({ alt: alt.trim().slice(0, 160) }).where(eq(productMedia.id, mediaId)).returning({ id: productMedia.id });
  if (!res.length) throw notFound("Media");
}

/** Assigns a library item to a product as primary image, gallery image or video. */
export async function assignMediaToProduct(mediaId: string, productId: string, slot: "primary" | "gallery" | "video") {
  if (!isUuid(mediaId) || !isUuid(productId)) throw notFound("Media");
  return withTransaction(async (tx) => {
    const [media] = await tx.select().from(productMedia).where(eq(productMedia.id, mediaId)).limit(1);
    if (!media) throw notFound("Media");
    const [product] = await tx.select({ id: products.id, name: products.name, gallery: products.gallery, videos: products.videos }).from(products).where(eq(products.id, productId)).for("update").limit(1);
    if (!product) throw notFound("Product");
    const ref: ImageRef = { url: media.url, publicId: media.publicId, width: media.width ?? undefined, height: media.height ?? undefined, alt: media.alt ?? product.name };
    if (slot === "video") {
      if (media.kind !== "video") throw new AppError("That file is not a video.");
      if (product.videos.some((v) => v.url === media.url)) return { name: product.name };
      await tx.update(products).set({ videos: [...product.videos, { url: media.url, publicId: media.publicId, durationSeconds: media.durationSeconds ?? undefined }] }).where(eq(products.id, product.id));
    } else {
      if (media.kind !== "image") throw new AppError("That file is not an image.");
      if (slot === "primary") await tx.update(products).set({ image: ref }).where(eq(products.id, product.id));
      else if (!product.gallery.some((g) => g.url === media.url)) {
        if (product.gallery.length >= 12) throw new AppError("A product can have up to 12 gallery images.");
        await tx.update(products).set({ gallery: [...product.gallery, ref] }).where(eq(products.id, product.id));
      }
    }
    return { name: product.name };
  });
}
