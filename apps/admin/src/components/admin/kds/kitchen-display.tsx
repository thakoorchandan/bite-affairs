"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlarmClock, CalendarClock, Check, ChefHat, Flame, Loader2, Maximize, Minimize, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminLive } from "../admin-live-provider";
import { useMergedOrders } from "../orders/orders-board";
import { formatElapsed, minutesSince, useNow, useOrderStatus } from "../orders/use-order-status";
import { optionSummary, type OrderView } from "../orders/types";
import { formatInZone } from "@/lib/utilities/time";
import type { OrderStatus } from "@/constants/domain";
import { cn } from "@/lib/utils";

const COLUMNS: { status: OrderStatus; title: string; action?: { to: OrderStatus; label: string }; tone: string }[] = [
  { status: "PLACED", title: "New", action: { to: "CONFIRMED", label: "Accept" }, tone: "border-gold/60" },
  { status: "CONFIRMED", title: "To cook", action: { to: "PREPARING", label: "Start preparing" }, tone: "border-sky-400/50" },
  { status: "PREPARING", title: "Cooking", action: { to: "READY", label: "Mark ready" }, tone: "border-orange-400/60" },
  { status: "READY", title: "Ready", tone: "border-emerald-400/50" },
];

export function KitchenDisplay({ initial, delayMinutes }: { initial: OrderView[]; delayMinutes: number }) {
  const orders = useMergedOrders(initial);
  const now = useNow(10000);
  const { soundEnabled, setSoundEnabled, connected } = useAdminLive();
  const { run, pendingId } = useOrderStatus();
  const rootRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch {
      /* not supported (e.g. iOS Safari) */
    }
  };

  const columns = useMemo(() => {
    const sortKey = (o: OrderView) => new Date(o.isPreorder && o.scheduledFor ? o.scheduledFor : o.createdAt).getTime();
    return COLUMNS.map((c) => ({ ...c, orders: orders.filter((o) => o.status === c.status).sort((a, b) => sortKey(a) - sortKey(b)) }));
  }, [orders]);
  const delayedCount = orders.filter((o) => ["PLACED", "CONFIRMED", "PREPARING"].includes(o.status) && !o.isPreorder && minutesSince(o.createdAt, now) >= delayMinutes).length;
  const nextUp = columns[1].orders[0] ?? columns[0].orders[0];

  return (
    <div ref={rootRef} className={cn("flex flex-col gap-4 bg-background", fullscreen && "h-dvh overflow-auto p-4")}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ChefHat className="size-6 text-gold" /> Kitchen
        </h1>
        <span className="font-mono text-xl tabular-nums text-muted-foreground">{formatInZone(new Date(now), undefined, { hour: "numeric", minute: "2-digit" })}</span>
        {delayedCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1 text-sm font-bold text-red-300">
            <AlarmClock className="size-4" /> {delayedCount} delayed
          </span>
        )}
        {nextUp && (
          <span className="hidden text-sm text-muted-foreground md:inline">
            Next up: <b className="font-mono text-gold">{nextUp.orderNumber}</b>
          </span>
        )}
        <span className={cn("text-xs", connected ? "text-emerald-400" : "text-red-400")}>{connected ? "● Live" : "● Reconnecting"}</span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="lg" onClick={() => setSoundEnabled(!soundEnabled)} aria-pressed={soundEnabled}>
            {soundEnabled ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />} <span className="hidden sm:inline">{soundEnabled ? "Sound on" : "Muted"}</span>
          </Button>
          <Button variant="outline" size="lg" onClick={toggleFullscreen}>
            {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />} <span className="hidden sm:inline">{fullscreen ? "Exit" : "Fullscreen"}</span>
          </Button>
        </div>
      </div>

      <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((col) => (
          <section key={col.status} aria-label={col.title} className="flex min-h-[40vh] flex-col rounded-2xl border border-border bg-muted/20">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-lg font-bold tracking-wide uppercase">{col.title}</h2>
              <span className="rounded-full bg-background px-3 py-0.5 text-lg font-bold tabular-nums">{col.orders.length}</span>
            </header>
            <div className="flex flex-col gap-3 p-3">
              {col.orders.length === 0 && <p className="py-10 text-center text-muted-foreground">—</p>}
              {col.orders.map((o) => {
                const elapsed = minutesSince(o.createdAt, now);
                const delayed = col.status !== "READY" && !o.isPreorder && elapsed >= delayMinutes;
                const warn = col.status !== "READY" && !o.isPreorder && elapsed >= delayMinutes * 0.7;
                const busy = pendingId === o.id;
                return (
                  <article key={o.id} className={cn("rounded-xl border-2 bg-card p-4", col.tone, delayed && "animate-pulse border-red-500 motion-reduce:animate-none", col.status === "READY" && "opacity-70")}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-2xl font-black text-gold">{o.orderNumber.split("-").pop()}</p>
                        <p className="font-mono text-xs text-muted-foreground">{o.orderNumber}</p>
                      </div>
                      <div className="text-right">
                        <p className={cn("text-2xl font-bold tabular-nums", delayed ? "text-red-400" : warn ? "text-orange-300" : "text-foreground")}>{formatElapsed(elapsed)}</p>
                        <p className="text-xs text-muted-foreground">{formatInZone(o.createdAt, undefined, { hour: "numeric", minute: "2-digit" })}</p>
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs font-semibold">
                      <span className={cn("rounded px-1.5 py-0.5", o.fulfilment === "PICKUP" ? "bg-sky-500/15 text-sky-300" : "bg-violet-500/15 text-violet-300")}>{o.fulfilment === "PICKUP" ? "PICKUP" : "DELIVERY"}</span>
                      {o.isPreorder && o.scheduledFor && (
                        <span className="inline-flex items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-300">
                          <CalendarClock className="size-3" /> {formatInZone(o.scheduledFor, undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
                        </span>
                      )}
                      {delayed && (
                        <span className="inline-flex items-center gap-1 rounded bg-red-500/20 px-1.5 py-0.5 text-red-300">
                          <Flame className="size-3" /> DELAYED
                        </span>
                      )}
                    </div>
                    <ul className="mt-3 space-y-2">
                      {o.items.map((i, idx) => (
                        <li key={idx} className="text-lg leading-tight">
                          <span className="mr-2 inline-block min-w-8 rounded bg-gold px-1.5 text-center font-black text-primary-foreground">{i.quantity}</span>
                          <span className="font-semibold">{i.name}</span>
                          {optionSummary(i) && <p className="ml-10 text-sm text-gold">+ {optionSummary(i)}</p>}
                          {i.notes && <p className="ml-10 text-sm font-semibold text-orange-300">⚠ {i.notes}</p>}
                        </li>
                      ))}
                    </ul>
                    {o.customerNotes && <p className="mt-3 rounded-lg bg-orange-500/10 px-3 py-2 text-sm font-medium text-orange-200">Note: {o.customerNotes}</p>}
                    {col.action && (
                      <Button size="lg" className="mt-4 h-12 w-full text-base font-bold" disabled={busy} onClick={() => run(o, col.action!.to)}>
                        {busy ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />} {col.action.label}
                      </Button>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
