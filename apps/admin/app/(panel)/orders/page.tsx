import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClipboardList, Search } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { OrdersBoard } from "@/components/admin/orders/orders-board";
import { OrdersHistoryTable } from "@/components/admin/orders/orders-history-table";
import { asOrderViews } from "@/components/admin/orders/types";
import { DateRangeFilter } from "@/components/admin/dashboard/date-range-filter";
import { Pagination, nativeSelectClass } from "@/components/admin/dashboard/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getActiveBoardOrders, listAdminOrders } from "@/services/admin-orders.service";
import { resolveDateRange } from "@/services/analytics.service";
import { getBusinessSettings } from "@/services/settings.service";
import { ORDER_STATUS_LABELS, ORDER_STATUSES } from "@/constants/domain";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Orders" };

const TABS = [
  ["board", "Live board"],
  ["all", "All orders"],
  ["delivered", "Delivered"],
  ["cancelled", "Cancelled / Rejected"],
  ["refunds", "Refunds"],
] as const;

export default function OrdersPage({ searchParams }: PageProps<"/orders">) {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <OrdersContent searchParams={searchParams} />
    </Suspense>
  );
}

async function OrdersContent({ searchParams }: { searchParams: PageProps<"/orders">["searchParams"] }) {
  await requireAdminPage();
  const raw = await searchParams;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Record<string, string | undefined>;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "board";

  const tabNav = (
    <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 no-scrollbar" aria-label="Order views">
      {TABS.map(([key, label]) => (
        <Link
          key={key}
          href={key === "board" ? "/orders" : `/orders?tab=${key}`}
          aria-current={tab === key ? "page" : undefined}
          className={cn("rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap", tab === key ? "bg-gold text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
        >
          {label}
        </Link>
      ))}
    </nav>
  );

  if (tab === "board") {
    const [orders, settings] = await Promise.all([getActiveBoardOrders(), getBusinessSettings()]);
    return (
      <div>
        <AdminPageHeader title="Orders" description="New orders appear automatically. Work left to right." actions={tabNav} />
        <OrdersBoard initial={asOrderViews(orders)} delayMinutes={settings.kitchen?.delayAlertMinutes ?? 45} />
      </div>
    );
  }

  const range = sp.range ? resolveDateRange({ preset: sp.range, from: sp.from, to: sp.to }) : null;
  const page = Number(sp.page) || 1;
  const result = await listAdminOrders({ tab, q: sp.q, status: sp.status, payment: sp.payment, range, page });
  const filtersActive = !!(sp.q || sp.status || sp.payment || sp.range);

  return (
    <div>
      <AdminPageHeader title="Orders" description="Search and review every order." actions={tabNav} />
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <form key={`${tab}|${sp.q ?? ""}|${sp.status ?? ""}|${sp.payment ?? ""}`} className="flex flex-wrap items-center gap-2" role="search">
          <input type="hidden" name="tab" value={tab} />
          {sp.range && <input type="hidden" name="range" value={sp.range} />}
          {sp.from && <input type="hidden" name="from" value={sp.from} />}
          {sp.to && <input type="hidden" name="to" value={sp.to} />}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input name="q" defaultValue={sp.q} placeholder="Order no., name or phone" className="w-64 pl-8" aria-label="Search orders" />
          </div>
          <select name="status" defaultValue={sp.status ?? ""} className={nativeSelectClass} aria-label="Status">
            <option value="">Any status</option>
            {ORDER_STATUSES.filter((s) => s !== "AWAITING_PAYMENT").map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select name="payment" defaultValue={sp.payment ?? ""} className={nativeSelectClass} aria-label="Payment">
            <option value="">Any payment</option>
            <option value="COD">Cash on delivery</option>
            <option value="RAZORPAY">Razorpay</option>
            <option value="PAID">Paid</option>
            <option value="PENDING">Unpaid / pending</option>
            <option value="FAILED">Failed</option>
          </select>
          <Button type="submit" size="sm">Apply</Button>
          {filtersActive && (
            <Button variant="ghost" size="sm" render={<Link href={`/orders?tab=${tab}`} />}>
              Clear
            </Button>
          )}
        </form>
        <DateRangeFilter preset={range?.preset ?? ""} from={range?.fromKey ?? ""} to={range?.toKey ?? ""} />
      </div>
      {result.items.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No orders found" description={filtersActive ? "Try a different search or clear the filters." : "Orders will show up here once customers start ordering."} />
      ) : (
        <>
          <OrdersHistoryTable orders={asOrderViews(result.items)} />
          <Pagination page={result.page} pages={result.pages} total={result.total} basePath="/orders" params={{ tab, q: sp.q, status: sp.status, payment: sp.payment, range: sp.range, from: sp.from, to: sp.to }} />
        </>
      )}
    </div>
  );
}
