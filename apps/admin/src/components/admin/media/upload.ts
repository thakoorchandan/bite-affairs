"use client";

import { registerUploadAction } from "@/features/admin/media-actions";
import type { MediaItem } from "@/services/media.service";

export const MEDIA_RULES = {
  image: { maxBytes: 5 * 1024 * 1024, types: ["image/jpeg", "image/png", "image/webp", "image/avif"], label: "JPG, PNG, WebP or AVIF up to 5 MB" },
  video: { maxBytes: 40 * 1024 * 1024, types: ["video/mp4", "video/webm", "video/quicktime"], label: "MP4, WebM or MOV up to 40 MB" },
} as const;

export const BUNDLED_IMAGES = [
  "sandwiches",
  "pizza",
  "burgers",
  "maggi",
  "pasta",
  "momos",
  "dry-bites",
  "mexican-chicken-wrap",
  "fries",
  "combo-fried-rice",
  "combo-noodles",
].map((n) => ({ url: `/images/menu/${n}.webp`, alt: n.replaceAll("-", " ") }));

export function validateMediaFile(file: File): { kind: "image" | "video" } | { error: string } {
  const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
  if (!kind) return { error: `${file.name}: unsupported file type` };
  const rule = MEDIA_RULES[kind];
  if (!(rule.types as readonly string[]).includes(file.type)) return { error: `${file.name}: use ${rule.label}` };
  if (file.size > rule.maxBytes) return { error: `${file.name}: too large (${rule.label})` };
  return { kind };
}

/**
 * Uploads directly from the browser to Cloudinary with a server-issued signature, reporting
 * progress, then registers (and server-verifies) the result in the media library.
 */
export async function uploadToCloudinary(file: File, opts: { subfolder?: "products" | "categories" | "content" | "videos"; onProgress?: (pct: number) => void } = {}): Promise<{ media: MediaItem; duplicate: boolean }> {
  const check = validateMediaFile(file);
  if ("error" in check) throw new Error(check.error);
  const signRes = await fetch("/api/admin/media/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: check.kind, subfolder: check.kind === "video" ? "videos" : opts.subfolder ?? "products" }),
  });
  const sign = await signRes.json();
  if (!signRes.ok) throw new Error(sign.error ?? "Could not start upload");

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", sign.apiKey);
  form.append("timestamp", String(sign.timestamp));
  form.append("signature", sign.signature);
  form.append("folder", sign.folder);

  const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", sign.uploadUrl);
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(body?.error?.message ?? `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error("Unexpected response from Cloudinary"));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });

  const registered = await registerUploadAction({
    public_id: String(result.public_id),
    version: result.version as number,
    signature: String(result.signature),
    secure_url: String(result.secure_url),
    resource_type: result.resource_type as "image" | "video",
    format: result.format as string | undefined,
    bytes: result.bytes as number | undefined,
    width: result.width as number | undefined,
    height: result.height as number | undefined,
    duration: result.duration as number | undefined,
    etag: result.etag as string | undefined,
    original_filename: (result.original_filename as string | undefined)?.slice(0, 200),
  });
  if (!registered.ok) throw new Error(registered.error);
  return registered.data;
}

export function formatBytes(bytes?: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
