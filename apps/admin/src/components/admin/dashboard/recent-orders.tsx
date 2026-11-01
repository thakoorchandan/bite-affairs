"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { useMergedOrders } from "../orders/orders-board";
import type { OrderView } from "../orders/types";
import { OrderStatusBadge } from "@/components/shared/order-status-badge";
import { formatINR } from "@/lib/utilities/money";
import { formatElapsed, minutesSince, useNow } from "../orders/use-order-status";

/** Latest orders, kept live by the admin poller. */
export function RecentOrders({ initial }: { initial: OrderView[] }) {
  const merged = useMergedOrders(initial);
  const now = useNow(30000);
  const rows = useMemo(() => [...merged].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8), [merged]);
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">No orders yet. They&apos;ll appear here the moment a customer checks out.</p>;
  return (
    <div>
      <ul className="divide-y divide-border">
        {rows.map((o) => (
          <li key={o.id}>
            <Link href={`/orders/${o.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm">
                  <span className="font-mono font-bold text-gold">{o.orderNumber}</span>
                  <span className="truncate text-muted-foreground">{o.customer.name}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {o.items.reduce((s, i) => s + i.quantity, 0)} items · {formatElapsed(minutesSince(o.createdAt, now))} ago
                </p>
              </div>
              <OrderStatusBadge status={o.status} className="hidden sm:inline-flex" />
              <span className="w-20 text-right text-sm font-semibold tabular-nums">{formatINR(o.pricing.total)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/orders" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-gold hover:underline">
        Open order board <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}
