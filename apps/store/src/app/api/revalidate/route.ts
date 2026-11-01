import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { CACHE_TAGS } from "@/constants/cache-tags";
import { safeEqual } from "@/lib/security/tokens";

const ALLOWED = new Set<string>(Object.values(CACHE_TAGS));
const bodySchema = z.object({ tags: z.array(z.string().max(100)).min(1).max(20) });

/**
 * Cache invalidation hook for the separately deployed admin app. Requires the shared REVALIDATE_SECRET in the
 * `x-revalidate-secret` header and only accepts the known storefront cache tags.
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Revalidation is not configured" }, { status: 503 });
  const provided = request.headers.get("x-revalidate-secret") ?? "";
  if (!provided || !safeEqual(provided, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const tags = [...new Set(parsed.data.tags)].filter((t) => ALLOWED.has(t));
  for (const tag of tags) revalidateTag(tag, "max");
  return NextResponse.json({ revalidated: tags });
}
