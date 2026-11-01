import { NextResponse, type NextRequest } from "next/server";
import { getTrackingView } from "@/services/order-query.service";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Lightweight polling endpoint for the tracking page. Requires the secret tracking token
 * (or the signed-in owner). Supports `since` to return 304-style "unchanged" responses cheaply.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/orders/track/[orderNumber]">) {
  const { orderNumber } = await ctx.params;
  const token = request.nextUrl.searchParams.get("t");
  const since = request.nextUrl.searchParams.get("since");
  const user = token ? null : await getCurrentUser();
  const view = await getTrackingView(decodeURIComponent(orderNumber), token, user?.id);
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (since && since === view.updatedAt) return NextResponse.json({ unchanged: true }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ order: view }, { headers: { "Cache-Control": "no-store" } });
}
