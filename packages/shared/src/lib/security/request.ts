import { headers } from "next/headers";

/** Best-effort client IP for rate limiting and audit logs. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/** Rejects cross-site state-changing requests to Route Handlers (Server Actions do this automatically). */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return; // non-browser clients (webhooks) are verified separately
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host || new URL(origin).host !== host) {
    throw Object.assign(new Error("Cross-origin request rejected"), { status: 403 });
  }
}
