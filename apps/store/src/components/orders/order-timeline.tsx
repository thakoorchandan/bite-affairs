"use client";

import { motion } from "framer-motion";
import { Check, ChefHat, ClipboardCheck, PackageCheck, Bike, Home, XCircle, Receipt } from "lucide-react";
import { ORDER_LIFECYCLE, ORDER_STATUS_LABELS, PICKUP_LIFECYCLE, type OrderStatus } from "@/constants/domain";
import { formatInZone } from "@/lib/utilities/time";
import { cn } from "@/lib/utils";

const ICONS: Partial<Record<OrderStatus, typeof Check>> = {
  PLACED: Receipt,
  CONFIRMED: ClipboardCheck,
  PREPARING: ChefHat,
  READY: PackageCheck,
  OUT_FOR_DELIVERY: Bike,
  DELIVERED: Home,
};

export function OrderTimeline({ status, timeline, fulfilment }: { status: OrderStatus; timeline: { status: OrderStatus; at: string }[]; fulfilment: string }) {
  const steps = fulfilment === "PICKUP" ? PICKUP_LIFECYCLE : ORDER_LIFECYCLE;
  const atFor = (s: OrderStatus) => timeline.find((t) => t.status === s)?.at;
  const terminalBad = ["CANCELLED", "REJECTED", "REFUND_INITIATED", "REFUNDED"].includes(status);
  const currentIndex = steps.indexOf(status);
  const reachedIndex = terminalBad ? Math.max(...steps.map((s, i) => (atFor(s) ? i : -1))) : currentIndex;

  return (
    <ol className="relative grid gap-0" aria-label="Order progress">
      {steps.map((s, i) => {
        const done = i <= reachedIndex;
        const current = !terminalBad && i === currentIndex && status !== "DELIVERED";
        const Icon = ICONS[s] ?? Check;
        const at = atFor(s);
        const label = s === "DELIVERED" && fulfilment === "PICKUP" ? "Picked up" : ORDER_STATUS_LABELS[s];
        return (
          <li key={s} className="relative flex gap-4 pb-7 last:pb-0" aria-current={current ? "step" : undefined}>
            {i < steps.length - 1 && (
              <span aria-hidden className="absolute top-10 left-5 h-[calc(100%-2.5rem)] w-0.5 bg-border">
                <motion.span className="block w-full bg-gold" initial={{ height: 0 }} animate={{ height: i < reachedIndex ? "100%" : "0%" }} transition={{ duration: 0.6, delay: i * 0.1 }} />
              </span>
            )}
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.08 }}
              className={cn("relative grid size-10 shrink-0 place-items-center rounded-full border-2 transition-colors", done ? "border-gold bg-gold text-primary-foreground" : "border-border bg-card text-muted-foreground")}
            >
              {current && <span className="absolute inset-0 animate-ping rounded-full bg-gold/40 motion-reduce:hidden" />}
              <Icon className="relative size-4" />
            </motion.span>
            <div className="pt-1.5">
              <p className={cn("font-bold", done ? "text-foreground" : "text-muted-foreground")}>{label}</p>
              {at && <p className="text-xs text-muted-foreground">{formatInZone(at, undefined, { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })}</p>}
            </div>
          </li>
        );
      })}
      {terminalBad && (
        <li className="mt-6 flex gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-destructive bg-destructive/15 text-destructive">
            <XCircle className="size-4" />
          </span>
          <div className="pt-1.5">
            <p className="font-bold text-destructive">{ORDER_STATUS_LABELS[status]}</p>
            {atFor(status) && <p className="text-xs text-muted-foreground">{formatInZone(atFor(status)!, undefined, { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })}</p>}
          </div>
        </li>
      )}
    </ol>
  );
}
