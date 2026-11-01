"use client";

import { useMemo } from "react";
import { Inbox } from "lucide-react";
import { useAdminLive } from "../admin-live-provider";
import type { OrderView } from "./types";
import { OrderCard } from "./order-card";
import { useNow } from "./use-order-status";
import { cn } from "@/lib/utils";

export const BOARD_COLUMNS = [
  { status: "PLACED", title: "New", accent: "bg-gold" },
  { status: "CONFIRMED", title: "Confirmed", accent: "bg-sky-400" },
  { status: "PREPARING", title: "Preparing", accent: "bg-orange-400" },
  { status: "READY", title: "Ready", accent: "bg-emerald-400" },
  { status: "OUT_FOR_DELIVERY", title: "Out for Delivery", accent: "bg-violet-400" },
] as const;

/** Merge server-rendered orders with the newest versions from live polling. */
export function useMergedOrders(initial: OrderView[]) {
  const { orders: live } = useAdminLive();
  return useMemo(() => {
    const map = new Map<string, OrderView>();
    for (const o of initial) map.set(o.id, o);
    for (const o of Object.values(live) as unknown as OrderView[]) {
      const prev = map.get(o.id);
      if (!prev || new Date(o.updatedAt).getTime() >= new Date(prev.updatedAt).getTime()) map.set(o.id, o);
    }
    return [...map.values()];
  }, [initial, live]);
}

export function OrdersBoard({ initial, delayMinutes }: { initial: OrderView[]; delayMinutes: number }) {
  const orders = useMergedOrders(initial);
  const now = useNow(15000);
  const grouped = useMemo(() => {
    const g: Record<string, OrderView[]> = {};
    for (const o of orders) (g[o.status] ??= []).push(o);
    for (const list of Object.values(g)) list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return g;
  }, [orders]);

  const activeTotal = BOARD_COLUMNS.reduce((s, c) => s + (grouped[c.status]?.length ?? 0), 0);

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="grid min-w-[1100px] grid-cols-5 gap-3 xl:min-w-0">
        {BOARD_COLUMNS.map((col) => {
          const list = grouped[col.status] ?? [];
          return (
            <section key={col.status} aria-label={col.title} className="flex min-h-[200px] flex-col rounded-2xl border border-border bg-muted/30">
              <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className={cn("size-2 rounded-full", col.accent)} /> {col.title}
                </span>
                <span className="rounded-full bg-background px-2 text-xs font-bold tabular-nums">{list.length}</span>
              </header>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {list.length === 0 ? (
                  <p className="m-auto py-8 text-center text-xs text-muted-foreground">Nothing here</p>
                ) : (
                  list.map((o) => <OrderCard key={o.id} order={o} now={now} delayMinutes={delayMinutes} highlight={col.status === "PLACED"} />)
                )}
              </div>
            </section>
          );
        })}
      </div>
      {activeTotal === 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          <Inbox className="size-5 text-gold" /> No active orders right now. New orders will appear here automatically.
        </div>
      )}
    </div>
  );
}
