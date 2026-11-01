import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/security/tokens";
import { expireStaleUnpaidOrders } from "@/services/payment.service";
import { raiseDelayedOrderAlerts } from "@/services/maintenance.service";

/** Optional external cron trigger (e.g. cron-job.org every 5 min) with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [expired, delayed] = await Promise.all([expireStaleUnpaidOrders(), raiseDelayedOrderAlerts()]);
  return NextResponse.json({ expired, delayed });
}
