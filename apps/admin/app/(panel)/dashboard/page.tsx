import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Ban, Bike, CheckCircle2, ChefHat, CircleCheck, Circle, IndianRupee, PackageCheck, Receipt, ShoppingBag, TrendingUp, Users, Wallet } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { DateRangeFilter } from "@/components/admin/dashboard/date-range-filter";
import { SectionCard, StatCard } from "@/components/admin/dashboard/stat-card";
import { RecentOrders } from "@/components/admin/dashboard/recent-orders";
import { HorizontalBars, RevenueTrendChart, SplitBar } from "@/components/admin/charts/charts";
import { asOrderViews } from "@/components/admin/orders/types";
import { getDashboardMetrics, getSetupChecklist, resolveDateRange } from "@/services/analytics.service";
import { listAdminOrders } from "@/services/admin-orders.service";
import { formatINR } from "@/lib/utilities/money";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<AdminPageSkeleton rows={8} />}>
      <DashboardContent searchParams={searchParams} />
    </Suspense>
  );
}

async function DashboardContent({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const admin = await requireAdminPage();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const range = resolveDateRange({ preset: one(sp.range), from: one(sp.from), to: one(sp.to) });
  const [m, checklist, recent] = await Promise.all([getDashboardMetrics(range), getSetupChecklist(), listAdminOrders({ tab: "all", pageSize: 8 })]);
  const pendingSetup = checklist.filter((c) => !c.done);
  const k = m.kpis;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={`Hello, ${admin.name.split(" ")[0]}`}
        description={`Showing ${m.range.label.toLowerCase()} · all figures from live order data`}
        actions={<DateRangeFilter preset={range.preset} from={range.fromKey} to={range.toKey} />}
      />

      {pendingSetup.length > 0 && (
        <section className="rounded-2xl border border-gold/30 bg-gold/5 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-gold">Finish setting up your kitchen</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {checklist.map((c) => (
              <li key={c.key}>
                <Link href={c.href} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-gold/10">
                  {c.done ? <CircleCheck className="size-4 text-emerald-400" /> : <Circle className="size-4 text-gold" />}
                  <span className={c.done ? "text-muted-foreground line-through" : ""}>{c.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue" value={formatINR(k.revenue)} hint={`${formatINR(k.collected)} collected`} icon={IndianRupee} tone="gold" />
        <StatCard label="Orders" value={k.orders} hint="Excludes cancelled & rejected" icon={Receipt} href="/orders" />
        <StatCard label="Avg order value" value={formatINR(k.aov)} icon={TrendingUp} />
        <StatCard label="Completed" value={k.completed} icon={CheckCircle2} tone="success" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="New / pending" value={k.pending} icon={ShoppingBag} tone={k.pending ? "warning" : "default"} href="/orders" />
        <StatCard label="Confirmed" value={k.confirmed} icon={PackageCheck} />
        <StatCard label="Preparing" value={k.preparing} icon={ChefHat} href="/kitchen-display" />
        <StatCard label="Ready" value={k.ready} icon={PackageCheck} tone={k.ready ? "success" : "default"} href="/deliveries" />
        <StatCard label="Out for delivery" value={k.outForDelivery} icon={Bike} href="/deliveries" />
        <StatCard label="Cancelled" value={k.cancelled} icon={Ban} tone={k.cancelled ? "danger" : "default"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Revenue trend" description="Daily revenue (bars) and trend line" className="xl:col-span-2">
          <RevenueTrendChart data={m.trend} />
        </SectionCard>
        <SectionCard title="Recent orders" description="Updates live">
          <RecentOrders initial={asOrderViews(recent.items)} />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Popular products" description="By quantity sold">
          <HorizontalBars rows={m.popularProducts.map((p) => ({ label: p.name, value: p.qty, sub: formatINR(p.revenue) }))} format="number" emptyText="No sales in this period." />
        </SectionCard>
        <SectionCard title="Bestselling categories" description="By revenue">
          <HorizontalBars rows={m.topCategories.map((c) => ({ label: c.name, value: c.revenue, sub: `${c.qty} sold` }))} emptyText="No sales in this period." />
        </SectionCard>
        <SectionCard title="Customers" description={`${m.customers.unique} ordered in this period`} action={<Users className="size-4 text-muted-foreground" />}>
          <div className="space-y-5">
            <SplitBar parts={[{ label: "New customers", value: m.customers.new }, { label: "Returning", value: m.customers.returning }]} />
            <SplitBar parts={[{ label: "Registered", value: m.customers.registered, className: "bg-emerald-400" }, { label: "Guest checkout", value: m.customers.guest, className: "bg-violet-400" }]} />
            <Link href="/customers" className="inline-flex items-center gap-1 text-xs font-semibold text-gold hover:underline">
              <Wallet className="size-3" /> View customers
            </Link>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
