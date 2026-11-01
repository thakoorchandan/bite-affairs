/**
 * Client-safe Cloudinary URL transformer: inserts delivery transformations (auto format,
 * auto quality, width/crop) into a Cloudinary URL. Non-Cloudinary URLs are returned unchanged.
 */
export function cloudinaryUrl(url: string | null | undefined, opts: { width?: number; height?: number; crop?: "fill" | "limit" | "fit"; quality?: string } = {}): string | undefined {
  if (!url) return undefined;
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;
  const parts = ["f_auto", `q_${opts.quality ?? "auto"}`];
  if (opts.width) parts.push(`w_${opts.width}`);
  if (opts.height) parts.push(`h_${opts.height}`);
  parts.push(`c_${opts.crop ?? (opts.height ? "fill" : "limit")}`);
  return url.replace("/upload/", `/upload/${parts.join(",")}/`);
}

export function cloudinaryVideoPoster(url: string): string {
  return url.replace("/video/upload/", "/video/upload/so_1,f_jpg,q_auto,w_900/").replace(/\.(mp4|mov|webm)$/i, ".jpg");
}
