import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { History, Search } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { Pagination, nativeSelectClass } from "@/components/admin/dashboard/pagination";
import { DateRangeFilter } from "@/components/admin/dashboard/date-range-filter";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { and, count, eq, desc, getDb, gte, ilike, lt, or, schema } from "@/db";
import { resolveDateRange } from "@/services/analytics.service";
import { formatInZone } from "@/lib/utilities/time";

export const metadata: Metadata = { title: "Activity Logs" };

const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

export default function ActivityLogsPage({ searchParams }: PageProps<"/activity-logs">) {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <LogsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LogsContent({ searchParams }: { searchParams: PageProps<"/activity-logs">["searchParams"] }) {
  await requireAdminPage();
  const raw = await searchParams;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Record<string, string | undefined>;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 40;
  const range = sp.range ? resolveDateRange({ preset: sp.range, from: sp.from, to: sp.to }) : null;
  const db = await getDb();
  const t = schema.adminActivityLogs;
  const term = sp.q?.trim() ? `%${escapeLike(sp.q.trim())}%` : null;
  const where = and(
    sp.entity ? eq(t.entityType, sp.entity) : undefined,
    term ? or(ilike(t.action, term), ilike(t.summary, term), ilike(t.actorName, term)) : undefined,
    range ? and(gte(t.createdAt, range.start), lt(t.createdAt, range.end)) : undefined,
  );
  const [items, [{ n: total }], entityRows] = await Promise.all([
    db.select().from(t).where(where).orderBy(desc(t.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ n: count() }).from(t).where(where),
    db.selectDistinct({ entityType: t.entityType }).from(t),
  ]);
  const entityTypes = entityRows.map((r) => r.entityType);

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Activity Logs" description="Every admin change is recorded here for accountability." />
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        {/* Keyed by the applied filters so the uncontrolled inputs reset after "Clear" or a new search. */}
        <form key={`${sp.q ?? ""}|${sp.entity ?? ""}`} className="flex flex-wrap items-center gap-2" role="search">
          {sp.range && <input type="hidden" name="range" value={sp.range} />}
          {sp.from && <input type="hidden" name="from" value={sp.from} />}
          {sp.to && <input type="hidden" name="to" value={sp.to} />}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={sp.q} placeholder="Action, summary or admin" className="w-64 pl-8" aria-label="Search activity" />
          </div>
          <select name="entity" defaultValue={sp.entity ?? ""} className={nativeSelectClass} aria-label="Area">
            <option value="">All areas</option>
            {entityTypes.sort().map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm">Apply</Button>
          {(sp.q || sp.entity || sp.range) && (
            <Button variant="ghost" size="sm" render={<Link href="/activity-logs" />}>
              Clear
            </Button>
          )}
        </form>
        <DateRangeFilter preset={range?.preset ?? ""} from={range?.fromKey ?? ""} to={range?.toKey ?? ""} />
      </div>
      {items.length === 0 ? (
        <EmptyState icon={History} title="No activity found" description="Admin actions such as order updates and menu edits appear here." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Admin</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((l) => (
                  <tr key={l.id} className="align-top">
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap text-muted-foreground">{formatInZone((l as { createdAt: Date }).createdAt, undefined, { dateStyle: "medium", timeStyle: "medium" })}</td>
                    <td className="px-4 py-2.5">{l.actorName ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{l.action}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {l.summary ?? "—"}
                      {l.entityType === "order" && l.entityId && (
                        <Link href={`/orders/${l.entityId}`} className="ml-2 text-xs text-gold hover:underline">
                          View
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{l.ip ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pages={Math.max(1, Math.ceil(total / pageSize))} total={total} basePath="/activity-logs" params={{ q: sp.q, entity: sp.entity, range: sp.range, from: sp.from, to: sp.to }} />
        </>
      )}
    </div>
  );
}
