/** Absolute URL on the storefront app (a separate deployment). Server-side: STORE_URL (or NEXT_PUBLIC_STORE_URL). */
export function storeUrl(path = "/") {
  const base = (process.env.STORE_URL || process.env.NEXT_PUBLIC_STORE_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
