import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Bike, CalendarClock, Clock, ExternalLink, MapPin, MessageCircle, Phone, ShieldAlert, ShoppingBag, StickyNote, UserRound } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageSkeleton } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/dashboard/stat-card";
import { OrderDetailPanel, InternalNoteForm } from "@/components/admin/orders/order-detail-panel";
import { LiveOrderRefresh } from "@/components/admin/orders/live-refresh";
import { PrintableReceipt } from "@/components/admin/orders/receipt";
import { mapsUrl, selectionsOf, telUrl, whatsappUrl } from "@/components/admin/orders/types";
import { OrderStatusBadge } from "@/components/shared/order-status-badge";
import { VegIndicator } from "@/components/shared/veg-indicator";
import { Button } from "@/components/ui/button";
import { getAdminOrderDetail } from "@/services/admin-orders.service";
import { getBusinessSettings } from "@/services/settings.service";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/constants/domain";
import { formatINR } from "@/lib/utilities/money";
import { formatInZone } from "@/lib/utilities/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Order details" };

export default function OrderDetailPage({ params }: PageProps<"/orders/[orderId]">) {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <OrderDetailContent params={params} />
    </Suspense>
  );
}

async function OrderDetailContent({ params }: { params: PageProps<"/orders/[orderId]">["params"] }) {
  await requireAdminPage();
  const { orderId } = await params;
  const [detail, settings] = await Promise.all([getAdminOrderDetail(orderId), getBusinessSettings()]);
  if (!detail) notFound();
  const { order, history, payment, names, previousOrders, allowed } = detail;
  const status = order.status as OrderStatus;
  const p = order.pricing;
  const maps = mapsUrl(order.address);
  const cod = order.payment.cod;

  return (
    <div className="space-y-6">
      <LiveOrderRefresh orderId={order.id} updatedAt={order.updatedAt} />
      <div className="print:hidden">
        <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> All orders
        </Link>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-2xl font-bold text-gold sm:text-3xl">{order.orderNumber}</h1>
              <OrderStatusBadge status={status} />
              {order.isPreorder && <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs font-semibold text-sky-300">Pre-order</span>}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" /> Placed {formatInZone(order.createdAt)}
              </span>
              <span className="inline-flex items-center gap-1">
                {order.fulfilment === "PICKUP" ? <ShoppingBag className="size-3.5" /> : <Bike className="size-3.5" />} {order.fulfilment === "PICKUP" ? "Pickup" : "Delivery"}
              </span>
              {order.scheduledFor && (
                <span className="inline-flex items-center gap-1 text-sky-300">
                  <CalendarClock className="size-3.5" /> For {formatInZone(order.scheduledFor)}
                </span>
              )}
            </p>
          </div>
          <OrderDetailPanel
            order={{ id: order.id, orderNumber: order.orderNumber, status, fulfilment: order.fulfilment ?? "DELIVERY", total: p.total, paymentMethod: order.payment.method, codCollected: !!cod?.collected }}
            allowed={allowed}
          />
        </div>
        {(order.rejectionReason || order.cancellationReason) && (
          <p className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {status === "REJECTED" ? "Rejected" : "Cancelled"}: {order.rejectionReason ?? order.cancellationReason}
          </p>
        )}
      </div>

      <div className="grid gap-4 print:hidden lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title={`Items (${order.items.reduce((s, i) => s + i.quantity, 0)})`}>
            <ul className="divide-y divide-border">
              {order.items.map((item, idx) => (
                <li key={idx} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-gold/10 text-sm font-bold text-gold">{item.quantity}×</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      {item.isVeg != null && <VegIndicator isVeg={!!item.isVeg} />} {item.name}
                    </p>
                    {selectionsOf(item).map((s, si) => (
                      <p key={si} className="text-xs text-muted-foreground">
                        {s.groupName}: {(s.options ?? []).map((o) => `${o.name}${o.priceDelta ? ` (+${formatINR(o.priceDelta)})` : ""}`).join(", ")}
                      </p>
                    ))}
                    {item.notes && <p className="mt-1 rounded-md bg-gold/10 px-2 py-1 text-xs text-gold">“{item.notes}”</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{formatINR(item.lineTotal)}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{formatINR(item.unitPrice)} each</p>
                  </div>
                </li>
              ))}
            </ul>
            {order.customerNotes && (
              <div className="mt-4 rounded-xl border border-gold/30 bg-gold/5 p-3 text-sm">
                <p className="text-xs font-semibold tracking-wide text-gold uppercase">Special instructions</p>
                <p className="mt-1">{order.customerNotes}</p>
              </div>
            )}
            <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
              <Line label="Items" value={formatINR(p.itemsSubtotal)} />
              {p.customisationTotal > 0 && <Line label="Customisations" value={`+${formatINR(p.customisationTotal)}`} />}
              {p.productDiscount > 0 && <Line label="Menu discounts" value={`-${formatINR(p.productDiscount)}`} />}
              {p.couponDiscount > 0 && <Line label={`Coupon ${p.couponCode ?? ""}`} value={`-${formatINR(p.couponDiscount)}`} />}
              {order.fulfilment === "DELIVERY" && <Line label="Delivery fee" value={p.deliveryFee ? formatINR(p.deliveryFee) : "Free"} />}
              {p.tax > 0 && <Line label={`Tax ${(p.taxRateBps ?? 0) / 100}%${p.taxInclusive ? " (included)" : ""}`} value={formatINR(p.tax)} />}
              <Line label="Total" value={formatINR(p.total)} strong />
            </dl>
          </SectionCard>

          <SectionCard title="Status history" description="Append-only audit trail">
            <ol className="relative space-y-4 border-l border-border pl-5">
              {history.map((h) => (
                <li key={h.id} className="relative">
                  <span className={cn("absolute top-1 -left-[25px] size-2.5 rounded-full ring-4 ring-card", h.isOverride ? "bg-red-400" : "bg-gold")} />
                  <p className="text-sm font-medium">
                    {ORDER_STATUS_LABELS[h.to as OrderStatus]}
                    {h.isOverride && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-300 uppercase">
                        <ShieldAlert className="size-3" /> Override
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatInZone(h.createdAt!)} · {h.actorType === "ADMIN" ? names[h.actorId ?? ""] ?? "Admin" : h.actorType === "CUSTOMER" ? "Customer" : "System"}
                  </p>
                  {h.note && <p className="mt-1 text-xs text-foreground/80">{h.note}</p>}
                </li>
              ))}
            </ol>
          </SectionCard>

          <SectionCard title="Internal notes" description="Never shown to the customer" action={<StickyNote className="size-4 text-muted-foreground" />}>
            {(order.internalNotes ?? []).length > 0 && (
              <ul className="mb-4 space-y-2">
                {(order.internalNotes ?? []).map((n, i) => (
                  <li key={`${n.at}-${i}`} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                    <p>{n.text}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {names[n.by ?? ""] ?? "Admin"} · {n.at ? formatInZone(n.at) : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <InternalNoteForm orderId={order.id} />
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Customer" action={<UserRound className="size-4 text-muted-foreground" />}>
            <p className="font-semibold">{order.customer.name}</p>
            <p className="text-sm text-muted-foreground">{order.customer.phone}</p>
            {order.customer.email && <p className="text-sm text-muted-foreground">{order.customer.email}</p>}
            <p className="mt-2 text-xs text-muted-foreground">
              {order.isGuest ? "Guest checkout" : "Registered customer"} · {previousOrders ? `${previousOrders} previous order${previousOrders === 1 ? "" : "s"}` : "First order"}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" render={<a href={telUrl(order.customer.phone)} />}>
                <Phone className="size-4" /> Call
              </Button>
              <Button size="sm" variant="outline" render={<a href={whatsappUrl(order.customer.phone, `Hi ${order.customer.name}, this is Bite Affairs about your order ${order.orderNumber}.`)} target="_blank" rel="noopener noreferrer" />}>
                <MessageCircle className="size-4" /> WhatsApp
              </Button>
            </div>
            <Link href={order.userId ? `/customers/${order.userId}` : `/customers/guest-${order.customer.phone}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-gold hover:underline">
              Customer history <ExternalLink className="size-3" />
            </Link>
          </SectionCard>

          {order.fulfilment === "DELIVERY" && order.address && (
            <SectionCard title="Delivery" action={<MapPin className="size-4 text-muted-foreground" />}>
              <address className="text-sm not-italic">
                {order.address.houseNumber}, {order.address.street}
                {order.address.landmark && <span className="block text-muted-foreground">Near {order.address.landmark}</span>}
                <span className="block">
                  {order.address.city} – <b>{order.address.pincode}</b>
                </span>
              </address>
              {order.deliveryZoneName && <p className="mt-1 text-xs text-muted-foreground">Zone: {order.deliveryZoneName}</p>}
              {order.address.instructions && <p className="mt-2 rounded-md bg-gold/10 px-2 py-1 text-xs text-gold">{order.address.instructions}</p>}
              {maps && (
                <Button size="sm" variant="outline" className="mt-3 w-full" render={<a href={maps} target="_blank" rel="noopener noreferrer" />}>
                  <MapPin className="size-4" /> Open in Google Maps
                </Button>
              )}
              <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                {order.estimatedDeliveryAt && <Line label="ETA" value={formatInZone(order.estimatedDeliveryAt, undefined, { hour: "numeric", minute: "2-digit" })} />}
                {order.delivery?.assignedTo && <Line label="Assigned to" value={names[order.delivery.assignedTo] ?? "Admin"} />}
                {order.delivery?.outForDeliveryAt && <Line label="Left kitchen" value={formatInZone(order.delivery.outForDeliveryAt, undefined, { hour: "numeric", minute: "2-digit" })} />}
                {order.delivery?.deliveredAt && <Line label="Delivered" value={formatInZone(order.delivery.deliveredAt, undefined, { hour: "numeric", minute: "2-digit" })} />}
              </dl>
              {order.delivery?.notes && <p className="mt-2 text-xs">Delivery note: {order.delivery.notes}</p>}
              {order.delivery?.proofImageUrl && (
                <a href={order.delivery.proofImageUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-gold hover:underline">
                  View delivery proof <ExternalLink className="size-3" />
                </a>
              )}
            </SectionCard>
          )}

          <SectionCard title="Payment">
            <dl className="space-y-1.5 text-sm">
              <Line label="Method" value={order.payment.method === "COD" ? "Cash on delivery" : "Razorpay (online)"} />
              <Line label="Status" value={order.payment.status.replaceAll("_", " ").toLowerCase()} />
              <Line label="Amount due" value={formatINR(p.total)} />
              {order.payment.method === "COD" && (
                <Line label="Cash collected" value={cod?.collected ? `${formatINR(cod.amountCollected ?? 0)} · ${cod.collectedAt ? formatInZone(cod.collectedAt, undefined, { dateStyle: "short", timeStyle: "short" }) : ""}` : "Not yet recorded"} />
              )}
              {order.payment.razorpayOrderId && <Line label="Razorpay order" value={order.payment.razorpayOrderId} mono />}
              {order.payment.razorpayPaymentId && <Line label="Razorpay payment" value={order.payment.razorpayPaymentId} mono />}
              {payment?.failureReason && <Line label="Failure" value={payment.failureReason} />}
            </dl>
            {cod?.note && <p className="mt-2 text-xs text-muted-foreground">Note: {cod.note}</p>}
          </SectionCard>
        </div>
      </div>

      <PrintableReceipt order={order} businessName={settings.businessName ?? "Bite Affairs"} phone={settings.contactPhone} gstin={settings.gstin} fssai={settings.fssaiNumber} />
    </div>
  );
}

function Line({ label, value, strong, mono }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", strong && "border-t border-border pt-2 text-base font-bold")}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className={cn("text-right tabular-nums capitalize", mono && "font-mono text-xs normal-case")}>{value}</dd>
    </div>
  );
}
