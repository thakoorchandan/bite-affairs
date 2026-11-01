import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Search, Users } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { Pagination, nativeSelectClass } from "@/components/admin/dashboard/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listGuestCustomers, listRegisteredCustomers } from "@/services/customer-admin.service";
import { formatINR } from "@/lib/utilities/money";
import { formatInZone } from "@/lib/utilities/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage({ searchParams }: PageProps<"/customers">) {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <CustomersContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CustomersContent({ searchParams }: { searchParams: PageProps<"/customers">["searchParams"] }) {
  await requireAdminPage();
  const raw = await searchParams;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Record<string, string | undefined>;
  const type = sp.type === "guest" ? "guest" : "registered";
  const page = Number(sp.page) || 1;
  const result = type === "guest" ? await listGuestCustomers({ q: sp.q, page, sort: sp.sort }) : await listRegisteredCustomers({ q: sp.q, page, sort: sp.sort, hasOrders: sp.hasOrders });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Customers"
        description="Registered accounts and guest customers (grouped by mobile number)."
        actions={
          <nav className="flex gap-1 rounded-xl border border-border bg-card p-1" aria-label="Customer type">
            {(["registered", "guest"] as const).map((t) => (
              <Link key={t} href={`/customers?type=${t}`} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", type === t ? "bg-gold text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                {t === "registered" ? "Registered" : "Guests"}
              </Link>
            ))}
          </nav>
        }
      />
      <form key={`${type}|${sp.q ?? ""}|${sp.sort ?? ""}|${sp.hasOrders ?? ""}`} className="flex flex-wrap items-center gap-2" role="search">
        <input type="hidden" name="type" value={type} />
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={sp.q} placeholder="Name, phone or email" className="w-64 pl-8" aria-label="Search customers" />
        </div>
        <select name="sort" defaultValue={sp.sort ?? ""} className={nativeSelectClass} aria-label="Sort">
          <option value="">{type === "guest" ? "Most recent order" : "Newest accounts"}</option>
          <option value="spend">Highest spend</option>
          <option value="orders">Most orders</option>
          {type === "registered" && <option value="recent">Most recent order</option>}
        </select>
        {type === "registered" && (
          <select name="hasOrders" defaultValue={sp.hasOrders ?? ""} className={nativeSelectClass} aria-label="Has ordered">
            <option value="">Everyone</option>
            <option value="yes">Has ordered</option>
            <option value="no">Never ordered</option>
          </select>
        )}
        <Button type="submit" size="sm">Apply</Button>
      </form>

      {result.items.length === 0 ? (
        <EmptyState icon={Users} title="No customers found" description={sp.q ? "Try another search." : type === "guest" ? "Guest customers appear after their first order." : "Customers appear here when they register."} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 text-right font-medium">Orders</th>
                  <th className="px-4 py-3 text-right font-medium">Total spend</th>
                  <th className="px-4 py-3 font-medium">Last order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.items.map((c) => (
                  <tr key={c.key} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link href={`/customers/${c.key}`} className="font-semibold hover:text-gold">
                        {c.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {c.type === "GUEST" ? "Guest" : c.isActive === false ? "Disabled account" : `Joined ${c.joinedAt ? formatInZone(c.joinedAt, undefined, { dateStyle: "medium" }) : ""}`}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p>{c.phone ?? "—"}</p>
                      <p className="text-muted-foreground">{c.email ?? ""}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.orders}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatINR(c.spend)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.lastOrderAt ? formatInZone(c.lastOrderAt, undefined, { dateStyle: "medium" }) : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.page} pages={result.pages} total={result.total} basePath="/customers" params={{ type, q: sp.q, sort: sp.sort, hasOrders: sp.hasOrders }} />
        </>
      )}
    </div>
  );
}
