import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { fetchActiveProductSlugs } from "@/services/catalog.service";
import { getPublicMenu } from "@/features/catalog/queries";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const staticRoutes = ["", "/menu", "/about", "/contact", "/track-order", "/privacy-policy", "/terms-and-conditions"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: p === "/menu" || p === "" ? ("daily" as const) : ("monthly" as const),
    priority: p === "" ? 1 : p === "/menu" ? 0.9 : 0.4,
  }));
  try {
    await connection();
    const [products, menu] = await Promise.all([fetchActiveProductSlugs(), getPublicMenu()]);
    return [
      ...staticRoutes,
      ...menu.categories.map((c) => ({ url: `${base}/menu/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.7 })),
      ...products.map((p) => ({ url: `${base}/food/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
    ];
  } catch {
    return staticRoutes;
  }
}
