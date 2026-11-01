"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, MapPin, Phone, RefreshCw } from "lucide-react";
import type { TrackingView } from "@/services/order-query.service";
import { TERMINAL_STATUSES, ORDER_STATUS_LABELS } from "@/constants/domain";
import { OrderTimeline } from "./order-timeline";
import { OrderItemsCard } from "./order-items-card";
import { OrderStatusBadge } from "@/components/shared/order-status-badge";
import { formatInZone } from "@/lib/utilities/time";

const POLL_MS = 8000;

/** Live tracking: polls the lightweight tracking endpoint while the tab is visible. */
export function LiveTracking({ initial, token, contactPhone }: { initial: TrackingView; token?: string | null; contactPhone?: string | null }) {
  const [order, setOrder] = useState(initial);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [flash, setFlash] = useState(false);
  const orderRef = useRef(order);
  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      const current = orderRef.current;
      if (TERMINAL_STATUSES.includes(current.status)) return;
      if (document.visibilityState === "visible") {
        try {
          const qs = new URLSearchParams({ since: current.updatedAt });
          if (token) qs.set("t", token);
          const res = await fetch(`/api/orders/track/${encodeURIComponent(current.orderNumber)}?${qs}`, { cache: "no-store" });
          if (res.ok) {
            const data = (await res.json()) as { unchanged?: boolean; order?: TrackingView };
            if (data.order) {
              if (data.order.status !== current.status) {
                setFlash(true);
                setTimeout(() => setFlash(false), 1500);
              }
              setOrder(data.order);
            }
            setLastChecked(new Date());
          }
        } catch {
          /* offline: retry next tick */
        }
      }
      timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token]);

  const eta = order.fulfilment === "DELIVERY" ? order.estimatedDeliveryAt : order.estimatedReadyAt;
  const terminal = TERMINAL_STATUSES.includes(order.status);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <div className={`rounded-[2rem] border bg-card p-6 transition-colors duration-700 sm:p-8 ${flash ? "border-gold" : "border-border"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase">Order {order.orderNumber}</p>
              <h2 className="display-heading mt-1 text-4xl text-gold sm:text-5xl" aria-live="polite">
                {order.status === "DELIVERED" && order.fulfilment === "PICKUP" ? "Picked up" : ORDER_STATUS_LABELS[order.status]}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Placed {formatInZone(order.createdAt)}</p>
            </div>
            <OrderStatusBadge status={order.status} />
          </div>
          {order.isPreorder && order.scheduledFor && (
            <p className="mt-4 rounded-xl bg-gold/10 p-3 text-sm">
              <Clock className="mr-1 inline size-4 text-gold" /> Pre-order scheduled for <strong>{formatInZone(order.scheduledFor)}</strong>
            </p>
          )}
          {!terminal && eta && (
            <p className="mt-4 flex items-center gap-2 text-sm">
              <Clock className="size-4 text-gold" /> Estimated {order.fulfilment === "DELIVERY" ? "delivery" : "ready"} by <strong>{formatInZone(eta, undefined, { hour: "numeric", minute: "2-digit" })}</strong>
            </p>
          )}
          {order.rejectionReason && <p className="mt-4 text-sm text-destructive">Reason: {order.rejectionReason}</p>}
          {order.cancellationReason && order.status === "CANCELLED" && <p className="mt-4 text-sm text-destructive">Reason: {order.cancellationReason}</p>}
          <div className="mt-8">
            <OrderTimeline status={order.status} timeline={order.timeline} fulfilment={order.fulfilment ?? "DELIVERY"} />
          </div>
          {!terminal && (
            <p className="mt-6 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <RefreshCw className="size-3 animate-spin [animation-duration:3s] motion-reduce:animate-none" /> Updates automatically
              {lastChecked && ` · checked ${formatInZone(lastChecked, undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })}`}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-6">
        <OrderItemsCard order={order} />
        <div className="rounded-[2rem] border border-border bg-card p-6 text-sm">
          {order.address ? (
            <>
              <h2 className="mb-2 flex items-center gap-2 font-bold">
                <MapPin className="size-4 text-gold" /> Delivering to
              </h2>
              <p className="text-muted-foreground">
                {order.customerName} · {order.phoneMasked}
                <br />
                {order.address.houseNumber}, {order.address.street}
                {order.address.landmark ? `, ${order.address.landmark}` : ""}, {order.address.city} – {order.address.pincode}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Pickup order for {order.customerName}</p>
          )}
          {contactPhone && (
            <a href={`tel:+91${contactPhone}`} className="mt-4 flex items-center gap-2 font-bold text-gold hover:underline">
              <Phone className="size-4" /> Call Bite Affairs
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
