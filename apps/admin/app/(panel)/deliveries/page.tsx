import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Banknote, History } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/dashboard/stat-card";
import { DeliveryBoard } from "@/components/admin/deliveries/delivery-board";
import { RecordCodButton } from "@/components/admin/payments/record-cod-dialog";
import { asOrderViews } from "@/components/admin/orders/types";
import { OrderStatusBadge } from "@/components/shared/order-status-badge";
import { getDeliveryBoard } from "@/services/admin-orders.service";
import { formatINR } from "@/lib/utilities/money";
import { formatInZone } from "@/lib/utilities/time";

export const metadata: Metadata = { title: "Deliveries" };

export default function DeliveriesPage() {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <DeliveriesContent />
    </Suspense>
  );
}

async function DeliveriesContent() {
  const admin = await requireAdminPage();
  const board = await getDeliveryBoard();
  const outstanding = asOrderViews(board.codOutstanding);
  const outstandingTotal = outstanding.reduce((s, o) => s + o.pricing.total, 0);
  const history = asOrderViews(board.history);

  return (
    <div className="space-y-8">
      <AdminPageHeader title="Deliveries" description="Your personal delivery queue. Updates automatically." />
      <DeliveryBoard initial={asOrderViews(board.queue)} adminId={admin.id} />

      <SectionCard title="Cash to collect" description={outstanding.length ? `${outstanding.length} COD order(s) · ${formatINR(outstandingTotal)} not yet recorded` : "All cash collections are recorded"} action={<Banknote className="size-4 text-orange-300" />}>
        {outstanding.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing outstanding. 🎉</p>
        ) : (
          <ul className="divide-y divide-border">
            {outstanding.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/orders/${o.id}`} className="font-mono text-sm font-bold text-gold hover:underline">
                    {o.orderNumber}
                  </Link>
                  <p className="text-sm">
                    {o.customer.name} · <span className="text-muted-foreground">{o.customer.phone}</span>
                  </p>
                </div>
                <OrderStatusBadge status={o.status} />
                <span className="w-20 text-right font-semibold tabular-nums">{formatINR(o.pricing.total)}</span>
                <RecordCodButton orderId={o.id} orderNumber={o.orderNumber} total={o.pricing.total} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Delivery history" description="Delivered in the last 7 days" action={<History className="size-4 text-muted-foreground" />}>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No deliveries in the last 7 days.</p>
        ) : (
          <ul className="divide-y divide-border">
            {history.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                <Link href={`/orders/${o.id}`} className="font-mono font-bold text-gold hover:underline">
                  {o.orderNumber}
                </Link>
                <span className="min-w-0 flex-1 truncate">
                  {o.customer.name} · {o.address?.pincode}
                </span>
                <span className="text-xs text-muted-foreground">{o.delivery?.deliveredAt ? formatInZone(o.delivery.deliveredAt, undefined, { dateStyle: "short", timeStyle: "short" }) : ""}</span>
                <span className={o.payment.method === "COD" && !o.payment.cod?.collected ? "text-xs font-semibold text-orange-300" : "text-xs text-emerald-300"}>
                  {o.payment.method === "COD" ? (o.payment.cod?.collected ? "Cash recorded" : "Cash pending") : "Online"}
                </span>
                <span className="w-20 text-right font-semibold tabular-nums">{formatINR(o.pricing.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
