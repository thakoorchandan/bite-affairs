"use client";

import Link from "next/link";
import { Bike, Clock, MessageSquareText, ShoppingBag, CalendarClock } from "lucide-react";
import { optionSummary, type OrderView } from "./types";
import { formatINR } from "@/lib/utilities/money";
import { formatInZone } from "@/lib/utilities/time";
import { OrderStatusActions } from "./status-actions";
import { formatElapsed, minutesSince } from "./use-order-status";
import { cn } from "@/lib/utils";

export function OrderCard({ order, now, delayMinutes = 45, highlight = false }: { order: OrderView; now: number; delayMinutes?: number; highlight?: boolean }) {
  const elapsed = minutesSince(order.createdAt, now);
  const delayed = !order.isPreorder && ["PLACED", "CONFIRMED", "PREPARING"].includes(order.status) && elapsed >= delayMinutes;
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
  return (
    <article
      className={cn(
        "group rounded-xl border bg-card p-3 shadow-sm transition-colors",
        highlight ? "border-gold/60 ring-2 ring-gold/20" : "border-border",
        delayed && "border-red-500/50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/orders/${order.id}`} className="font-mono text-sm font-bold text-gold hover:underline">
            {order.orderNumber}
          </Link>
          <p className="truncate text-sm font-medium">{order.customer.name}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums">{formatINR(order.pricing.total)}</p>
          <p className={cn("text-[11px] font-semibold", order.payment.method === "COD" ? "text-orange-300" : order.payment.status === "PAID" ? "text-emerald-300" : "text-muted-foreground")}>
            {order.payment.method === "COD" ? "Cash" : "Online"} · {order.payment.status === "PAID" ? "Paid" : "Unpaid"}
          </p>
        </div>
      </div>
      <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        {order.items.slice(0, 4).map((i, idx) => (
          <li key={idx} className="truncate">
            <span className="font-semibold text-foreground">{i.quantity}×</span> {i.name}
            {optionSummary(i) && <span className="text-muted-foreground"> · {optionSummary(i)}</span>}
          </li>
        ))}
        {order.items.length > 4 && <li>+{order.items.length - 4} more</li>}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className={cn("inline-flex items-center gap-1", delayed && "font-semibold text-red-300")}>
          <Clock className="size-3" /> {formatElapsed(elapsed)} ago
        </span>
        <span className="inline-flex items-center gap-1">
          {order.fulfilment === "PICKUP" ? <ShoppingBag className="size-3" /> : <Bike className="size-3" />}
          {order.fulfilment === "PICKUP" ? "Pickup" : order.address?.pincode}
        </span>
        <span>{itemCount} item{itemCount === 1 ? "" : "s"}</span>
        {order.isPreorder && order.scheduledFor && (
          <span className="inline-flex items-center gap-1 font-semibold text-sky-300">
            <CalendarClock className="size-3" /> {formatInZone(order.scheduledFor, undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
          </span>
        )}
        {(order.customerNotes || order.items.some((i) => i.notes)) && (
          <span className="inline-flex items-center gap-1 text-gold">
            <MessageSquareText className="size-3" /> Notes
          </span>
        )}
      </div>
      <OrderStatusActions order={order} className="mt-3" />
    </article>
  );
}
