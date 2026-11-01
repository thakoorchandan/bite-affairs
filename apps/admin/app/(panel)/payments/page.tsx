import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Banknote, CircleAlert, CreditCard, Search, Undo2, Wallet } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/dashboard/stat-card";
import { DateRangeFilter } from "@/components/admin/dashboard/date-range-filter";
import { Pagination, nativeSelectClass } from "@/components/admin/dashboard/pagination";
import { RecordCodButton } from "@/components/admin/payments/record-cod-dialog";
import { OrderStatusBadge } from "@/components/shared/order-status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listPayments } from "@/services/admin-orders.service";
import { resolveDateRange } from "@/services/analytics.service";
import { PAYMENT_STATUSES } from "@/constants/domain";
import { formatINR } from "@/lib/utilities/money";
import { formatInZone } from "@/lib/utilities/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Payments" };

const STATUS_TONE: Record<string, string> = {
  PAID: "text-emerald-300 bg-emerald-500/10 border-emerald-500/25",
  PENDING: "text-orange-300 bg-orange-500/10 border-orange-500/25",
  FAILED: "text-red-300 bg-red-500/10 border-red-500/25",
  REFUND_INITIATED: "text-amber-300 bg-amber-500/10 border-amber-500/25",
  REFUNDED: "text-zinc-300 bg-zinc-500/10 border-zinc-500/25",
};

export default function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <PaymentsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function PaymentsContent({ searchParams }: { searchParams: PageProps<"/payments">["searchParams"] }) {
  await requireAdminPage();
  const raw = await searchParams;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Record<string, string | undefined>;
  const range = resolveDateRange({ preset: sp.range ?? "30d", from: sp.from, to: sp.to });
  const result = await listPayments({ method: sp.method, status: sp.status, range, q: sp.q, page: Number(sp.page) || 1 });

  const sum = (pred: (s: (typeof result.summary)[number]) => boolean, key: "amount" | "count" | "collected" = "amount") => result.summary.filter(pred).reduce((t, s) => t + s[key], 0);
  const onlinePaid = sum((s) => s.method === "RAZORPAY" && s.status === "PAID");
  const codCollected = sum((s) => s.method === "COD" && s.status === "PAID", "collected");
  const pending = sum((s) => s.status === "PENDING");
  const failed = sum((s) => s.status === "FAILED", "count");
  const refunds = sum((s) => s.status === "REFUND_INITIATED" || s.status === "REFUNDED");

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Payments" description={`Cash on delivery and online payments · ${range.label}`} actions={<DateRangeFilter preset={range.preset} from={range.fromKey} to={range.toKey} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Online received" value={formatINR(onlinePaid)} icon={CreditCard} tone="success" />
        <StatCard label="Cash collected" value={formatINR(codCollected)} icon={Banknote} tone="gold" />
        <StatCard label="Pending" value={formatINR(pending)} hint="COD not yet collected / unpaid" icon={Wallet} tone={pending ? "warning" : "default"} href="/deliveries" />
        <StatCard label="Failed" value={failed} icon={CircleAlert} tone={failed ? "danger" : "default"} />
        <StatCard label="Refunds" value={formatINR(refunds)} icon={Undo2} />
      </div>

      <form key={`${sp.q ?? ""}|${sp.method ?? ""}|${sp.status ?? ""}`} className="flex flex-wrap items-center gap-2" role="search">
        {sp.range && <input type="hidden" name="range" value={sp.range} />}
        {sp.from && <input type="hidden" name="from" value={sp.from} />}
        {sp.to && <input type="hidden" name="to" value={sp.to} />}
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={sp.q} placeholder="Order number" className="w-48 pl-8" aria-label="Search by order number" />
        </div>
        <select name="method" defaultValue={sp.method ?? ""} className={nativeSelectClass} aria-label="Method">
          <option value="">All methods</option>
          <option value="COD">Cash on delivery</option>
          <option value="RAZORPAY">Razorpay</option>
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className={nativeSelectClass} aria-label="Status">
          <option value="">All statuses</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replaceAll("_", " ").toLowerCase()}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm">Apply</Button>
        {(sp.q || sp.method || sp.status) && (
          <Button variant="ghost" size="sm" render={<Link href="/payments" />}>
            Clear
          </Button>
        )}
      </form>

      {result.items.length === 0 ? (
        <EmptyState icon={Wallet} title="No payments found" description="Payments are created automatically with every order." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium">Order status</th>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.items.map((p) => {
                  const canCollect = p.method === "COD" && !p.order?.payment?.cod?.collected && ["OUT_FOR_DELIVERY", "DELIVERED"].includes(p.order?.status ?? "");
                  return (
                    <tr key={p.id} className="align-top hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link href={`/orders/${p.orderId}`} className="font-mono font-bold text-gold hover:underline">
                          {p.orderNumber}
                        </Link>
                        <p className="text-xs text-muted-foreground">{formatInZone(p.createdAt, undefined, { dateStyle: "medium", timeStyle: "short" })}</p>
                        {p.order && <p className="text-xs">{p.order.customer.name}</p>}
                      </td>
                      <td className="px-4 py-3">{p.method === "COD" ? "Cash" : "Razorpay"}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize", STATUS_TONE[p.status])}>{p.status.replaceAll("_", " ").toLowerCase()}</span>
                        {p.amountCollected != null && <p className="mt-1 text-xs text-muted-foreground">Collected {formatINR(p.amountCollected)}</p>}
                        {p.failureReason && <p className="mt-1 max-w-48 text-xs text-red-300">{p.failureReason}</p>}
                      </td>
                      <td className="px-4 py-3">{p.order && <OrderStatusBadge status={p.order.status} />}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                        {p.razorpayPaymentId ?? p.razorpayOrderId ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatINR(p.amount)}</td>
                      <td className="px-4 py-3 text-right">{canCollect && <RecordCodButton orderId={p.orderId} orderNumber={p.orderNumber} total={p.amount} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={result.page} pages={result.pages} total={result.total} basePath="/payments" params={{ q: sp.q, method: sp.method, status: sp.status, range: sp.range, from: sp.from, to: sp.to }} />
          <p className="text-xs text-muted-foreground">Refunds for online payments are issued from your Razorpay dashboard; record them from the order page (Initiate refund → Mark refunded).</p>
        </>
      )}
    </div>
  );
}
