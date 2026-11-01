import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { OrderStatus } from "@/constants/domain";
import { OrderStatusBadge } from "@/components/shared/order-status-badge";
import { formatINR } from "@/lib/utilities/money";
import { formatInZone } from "@/lib/utilities/time";

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  pricing?: { total?: number } | null;
  items?: { name: string; quantity: number }[];
}

export function OrderList({ orders }: { orders: OrderListItem[] }) {
  return (
    <ul className="space-y-3">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/account/orders/${o.id}`} className="group flex items-center gap-4 rounded-[1.5rem] border border-border bg-card p-5 transition hover:border-gold/40">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{o.orderNumber}</span>
                <OrderStatusBadge status={o.status as OrderStatus} />
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">{(o.items ?? []).map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatInZone(o.createdAt)}</p>
            </div>
            <span className="font-bold tabular-nums">{formatINR(o.pricing?.total ?? 0)}</span>
            <ChevronRight className="size-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-gold" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
