"use server";

import { refreshStorefront } from "@/lib/revalidate";
import { z } from "zod";
import { CACHE_TAGS } from "@/constants/cache-tags";
import { adminAction } from "./guard";
import { assignMediaToProduct, deleteMedia, findMediaReferences, listMedia, registerUpload, replaceMedia, updateMediaAlt, type MediaItem, type UploadResultInput } from "@/services/media.service";
import { requireAdmin } from "@/lib/auth/session";
import { toActionError, type ActionResult } from "@/lib/utilities/errors";

async function refreshAll() {
  await refreshStorefront(CACHE_TAGS.catalog);
  await refreshStorefront(CACHE_TAGS.content);
}

export async function registerUploadAction(result: UploadResultInput) {
  return adminAction<{ media: MediaItem; duplicate: boolean }>({ action: "media.upload", entityType: "media" }, async (admin) => {
    const res = await registerUpload(result, admin.id);
    return { data: res as { media: MediaItem; duplicate: boolean }, entityId: res.media.id, summary: res.duplicate ? "Upload matched existing media (duplicate removed)" : `Uploaded ${res.media.kind} ${res.media.originalFilename ?? ""}` };
  });
}

export async function listMediaAction(opts: { kind?: "image" | "video"; page?: number; q?: string }): Promise<ActionResult<Awaited<ReturnType<typeof listMedia>>>> {
  try {
    await requireAdmin();
    const parsed = z.object({ kind: z.enum(["image", "video"]).optional(), page: z.number().int().min(1).max(1000).optional(), q: z.string().max(50).optional() }).parse(opts);
    return { ok: true, data: await listMedia(parsed) };
  } catch (error) {
    return toActionError(error);
  }
}

export async function mediaReferencesAction(url: string): Promise<ActionResult<Awaited<ReturnType<typeof findMediaReferences>>>> {
  try {
    await requireAdmin();
    return { ok: true, data: await findMediaReferences(z.string().max(1000).parse(url)) };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteMediaAction(id: string) {
  return adminAction({ action: "media.delete", entityType: "media" }, async () => {
    const res = await deleteMedia(id);
    await refreshAll();
    return { entityId: id, summary: `Deleted media ${res.publicId}` };
  });
}

export async function replaceMediaAction(oldId: string, newId: string) {
  return adminAction({ action: "media.replace", entityType: "media" }, async () => {
    await replaceMedia(oldId, newId);
    await refreshAll();
    return { entityId: oldId, summary: "Replaced media everywhere it was used" };
  });
}

export async function updateMediaAltAction(id: string, alt: string) {
  return adminAction({ action: "media.alt", entityType: "media", audit: false }, async () => {
    await updateMediaAlt(id, alt);
  });
}

export async function assignMediaToProductAction(mediaId: string, productId: string, slot: "primary" | "gallery" | "video") {
  return adminAction({ action: "media.assign", entityType: "product" }, async () => {
    const res = await assignMediaToProduct(mediaId, productId, z.enum(["primary", "gallery", "video"]).parse(slot));
    await refreshStorefront(CACHE_TAGS.catalog);
    return { entityId: productId, summary: `Assigned media to ${res.name} (${slot})` };
  });
}
