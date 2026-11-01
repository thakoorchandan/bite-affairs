import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { DateRangeFilter } from "@/components/admin/dashboard/date-range-filter";
import { SectionCard, StatCard } from "@/components/admin/dashboard/stat-card";
import { HorizontalBars, HourHeatmap, RevenueTrendChart, SplitBar } from "@/components/admin/charts/charts";
import { getDeepAnalytics, NON_SALE_STATUSES, resolveDateRange } from "@/services/analytics.service";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/constants/domain";
import { formatINR } from "@/lib/utilities/money";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  return (
    <Suspense fallback={<AdminPageSkeleton rows={8} />}>
      <AnalyticsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AnalyticsContent({ searchParams }: { searchParams: PageProps<"/analytics">["searchParams"] }) {
  await requireAdminPage();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const range = resolveDateRange({ preset: one(sp.range) ?? "30d", from: one(sp.from), to: one(sp.to) });
  const a = await getDeepAnalytics(range);
  const revenue = a.trend.reduce((s, d) => s + d.revenue, 0);
  const orders = a.trend.reduce((s, d) => s + d.orders, 0);
  const allOrders = a.byStatus.reduce((s, x) => s + x.count, 0);
  const lost = a.byStatus.filter((s) => (NON_SALE_STATUSES as readonly string[]).includes(s.status) && s.status !== "AWAITING_PAYMENT").reduce((s, x) => s + x.count, 0);
  const couponDiscount = a.coupons.reduce((s, c) => s + c.discount, 0);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Analytics" description={`${range.label} · from real order data. For profit see Expenses & Profit.`} actions={<DateRangeFilter preset={range.preset} from={range.fromKey} to={range.toKey} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue" value={formatINR(revenue)} tone="gold" />
        <StatCard label="Orders" value={orders} hint={`${allOrders} placed in total`} />
        <StatCard label="Avg order value" value={formatINR(orders ? Math.round(revenue / orders) : 0)} />
        <StatCard label="Cancelled / rejected" value={lost} hint={allOrders ? `${Math.round((lost / allOrders) * 100)}% of orders` : undefined} tone={lost ? "danger" : "default"} />
      </div>

      <SectionCard title="Revenue by day">
        <RevenueTrendChart data={a.trend} height={260} />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Orders by status">
          <HorizontalBars rows={a.byStatus.map((s) => ({ label: ORDER_STATUS_LABELS[s.status as OrderStatus] ?? s.status, value: s.count, sub: formatINR(s.value) }))} format="number" />
        </SectionCard>
        <SectionCard title="Category performance" description="Revenue by category">
          <HorizontalBars rows={a.categories.map((c) => ({ label: c.name, value: c.revenue, sub: `${c.qty} sold · ${c.orders} orders` }))} />
        </SectionCard>
      </div>

      <SectionCard title="Busiest hours" description="Plan prep and staffing around your peaks">
        <HourHeatmap matrix={a.heatmap} />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Payment methods">
          <SplitBar parts={a.payment.map((p) => ({ label: p.key === "COD" ? "Cash on delivery" : "Online (Razorpay)", value: p.revenue }))} format="money" />
        </SectionCard>
        <SectionCard title="Delivery vs pickup">
          <SplitBar parts={a.fulfilment.map((p) => ({ label: p.key === "PICKUP" ? "Pickup" : "Delivery", value: p.count }))} />
        </SectionCard>
        <SectionCard title="Coupon usage" description={couponDiscount ? `${formatINR(couponDiscount)} discounted` : undefined}>
          {a.coupons.length === 0 ? (
            <p className="text-sm text-muted-foreground">No coupons used in this period.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {a.coupons.map((c) => (
                <li key={c.code} className="flex items-baseline justify-between gap-2">
                  <span className="font-mono font-semibold text-gold">{c.code}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {c.count} uses · −{formatINR(c.discount)} · {formatINR(c.revenue)} sales
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Product performance" description="Top 25 by revenue">
        {a.products.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sales in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Orders</th>
                  <th className="pb-2 text-right font-medium">Revenue</th>
                  <th className="pb-2 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {a.products.map((p, i) => (
                  <tr key={p.productId + p.name}>
                    <td className="py-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="py-2 text-muted-foreground">{p.category}</td>
                    <td className="py-2 text-right tabular-nums">{p.qty}</td>
                    <td className="py-2 text-right tabular-nums">{p.orders}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{formatINR(p.revenue)}</td>
                    <td className="py-2 text-right text-muted-foreground tabular-nums">{revenue ? `${((p.revenue / revenue) * 100).toFixed(1)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">Item revenue is before coupons and delivery fees, so shares may not sum to 100%.</p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
