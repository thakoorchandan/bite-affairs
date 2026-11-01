import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { AppError } from "@/lib/utilities/errors";
import { getAdminLiveSnapshot } from "@/services/admin-live.service";
import { runMaintenanceIfDue } from "@/services/maintenance.service";

/**
 * Admin real-time feed via efficient polling (portable across serverless hosts; MongoDB
 * change streams/long-lived SSE connections are not relied upon). Clients pass `since`
 * (ISO timestamp from the previous response) and receive only orders changed after it.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    const status = e instanceof AppError ? e.status : 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }
  const sinceParam = request.nextUrl.searchParams.get("since");
  const since = sinceParam && !Number.isNaN(Date.parse(sinceParam)) ? new Date(sinceParam) : null;
  void runMaintenanceIfDue().catch(() => undefined);
  const snapshot = await getAdminLiveSnapshot(since);
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
