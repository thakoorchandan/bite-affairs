import Link from "next/link";
import { Bike, ShoppingBag } from "lucide-react";
import type { OrderView } from "./types";
import { OrderStatusBadge } from "@/components/shared/order-status-badge";
import { formatINR } from "@/lib/utilities/money";
import { formatInZone } from "@/lib/utilities/time";
import { cn } from "@/lib/utils";

export function OrdersHistoryTable({ orders }: { orders: OrderView[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      {/* Desktop table */}
      <table className="hidden w-full text-sm md:table">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground uppercase">
          <tr>
            <th className="px-4 py-3 font-medium">Order</th>
            <th className="px-4 py-3 font-medium">Customer</th>
            <th className="px-4 py-3 font-medium">Items</th>
            <th className="px-4 py-3 font-medium">Payment</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-muted/30">
              <td className="px-4 py-3">
                <Link href={`/orders/${o.id}`} className="font-mono font-bold text-gold hover:underline">
                  {o.orderNumber}
                </Link>
                <p className="text-xs text-muted-foreground">{formatInZone(o.createdAt)}</p>
              </td>
              <td className="px-4 py-3">
                <p className="font-medium">{o.customer.name}</p>
                <p className="text-xs text-muted-foreground">{o.customer.phone}</p>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  {o.fulfilment === "PICKUP" ? <ShoppingBag className="size-3.5" /> : <Bike className="size-3.5" />}
                  {o.items.reduce((s, i) => s + i.quantity, 0)} items
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-xs">{o.payment.method === "COD" ? "Cash on delivery" : "Razorpay"}</span>
                <p className={cn("text-xs font-semibold", o.payment.status === "PAID" ? "text-emerald-300" : o.payment.status === "FAILED" ? "text-red-300" : "text-orange-300")}>{o.payment.status.replaceAll("_", " ").toLowerCase()}</p>
              </td>
              <td className="px-4 py-3">
                <OrderStatusBadge status={o.status} />
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatINR(o.pricing.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Mobile cards */}
      <ul className="divide-y divide-border md:hidden">
        {orders.map((o) => (
          <li key={o.id}>
            <Link href={`/orders/${o.id}`} className="flex items-start justify-between gap-3 p-4 hover:bg-muted/30">
              <div className="min-w-0">
                <p className="font-mono text-sm font-bold text-gold">{o.orderNumber}</p>
                <p className="truncate text-sm">{o.customer.name}</p>
                <p className="text-xs text-muted-foreground">{formatInZone(o.createdAt)}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className="font-semibold tabular-nums">{formatINR(o.pricing.total)}</span>
                <OrderStatusBadge status={o.status} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
