import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { AppError } from "@/lib/utilities/errors";
import { buildFinanceCsv, defaultRange } from "@/services/finance.service";

/** CSV export of the profit report and expenses for a date range (admin only). */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: e instanceof AppError ? e.status : 401 });
  }
  const def = defaultRange();
  const isKey = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const from = isKey(request.nextUrl.searchParams.get("from")) ? request.nextUrl.searchParams.get("from")! : def.from;
  const to = isKey(request.nextUrl.searchParams.get("to")) ? request.nextUrl.searchParams.get("to")! : def.to;
  try {
    const csv = await buildFinanceCsv(from <= to ? from : to, from <= to ? to : from);
    return new NextResponse(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bite-affairs-profit-${from}-to-${to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof AppError ? error.message : "Could not build the report";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
