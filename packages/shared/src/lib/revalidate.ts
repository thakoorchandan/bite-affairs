import { updateTag } from "next/cache";

/**
 * Refresh cached storefront data after an admin change.
 *
 *  1. Local: `updateTag` (works only inside a Server Action; harmless no-op elsewhere). This covers the
 *     single-process setup where admin and store share one server.
 *  2. Remote: when the admin app runs as a separate deployment, set STORE_URL + REVALIDATE_SECRET and this
 *     POSTs the tags to the store's `/api/revalidate` endpoint. Never throws: a failed refresh only means the
 *     storefront shows the change after its cache TTL.
 */
export async function refreshStorefront(...tags: string[]): Promise<void> {
  const unique = [...new Set(tags)].filter(Boolean);
  if (!unique.length) return;

  for (const tag of unique) {
    try {
      updateTag(tag);
    } catch {
      /* not in a Server Action context */
    }
  }

  const base = process.env.STORE_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.REVALIDATE_SECRET?.trim();
  if (!base || !secret) return;
  try {
    const res = await fetch(`${base}/api/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": secret },
      body: JSON.stringify({ tags: unique }),
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) console.error(`[revalidate] store responded ${res.status} for tags ${unique.join(",")}`);
  } catch (error) {
    console.error("[revalidate] could not reach the store", error);
  }
}
