import { createHash } from "node:crypto";

/**
 * Cloudinary helpers implemented with plain HTTP + SHA-1 signatures so they run on any
 * runtime (no Node-only SDK). Uploads go directly from the admin's browser to Cloudinary
 * using a short-lived signature generated here, after the server has verified the admin.
 */
export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
}

export function getCloudinaryConfig(): CloudinaryConfig | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret, folder: process.env.CLOUDINARY_FOLDER?.trim() || "bite-affairs" };
}

export function signParams(params: Record<string, string | number | undefined>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(toSign + apiSecret).digest("hex");
}

export function createUploadSignature(cfg: CloudinaryConfig, opts: { kind: "image" | "video"; subfolder?: string }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `${cfg.folder}/${opts.subfolder ?? (opts.kind === "video" ? "videos" : "images")}`.replace(/[^a-zA-Z0-9/_-]/g, "");
  const params = { folder, timestamp };
  return {
    cloudName: cfg.cloudName,
    apiKey: cfg.apiKey,
    timestamp,
    folder,
    signature: signParams(params, cfg.apiSecret),
    uploadUrl: `https://api.cloudinary.com/v1_1/${cfg.cloudName}/${opts.kind}/upload`,
  };
}

export async function destroyAsset(cfg: CloudinaryConfig, publicId: string, kind: "image" | "video") {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signParams({ public_id: publicId, timestamp, invalidate: "true" }, cfg.apiSecret);
  const body = new URLSearchParams({ public_id: publicId, timestamp: String(timestamp), invalidate: "true", api_key: cfg.apiKey, signature });
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/${kind}/destroy`, { method: "POST", body });
  if (!res.ok) throw new Error(`Cloudinary destroy failed (${res.status})`);
  return (await res.json()) as { result: string };
}

/** Verify an upload response really came from Cloudinary for our account. */
export function verifyUploadResponse(cfg: CloudinaryConfig, publicId: string, version: number | string, signature: string): boolean {
  const expected = createHash("sha1").update(`public_id=${publicId}&version=${version}${cfg.apiSecret}`).digest("hex");
  return expected === signature;
}
