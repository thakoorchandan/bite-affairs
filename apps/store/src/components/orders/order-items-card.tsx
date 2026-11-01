import type { TrackingView } from "@/services/order-query.service";
import { VegIndicator } from "@/components/shared/veg-indicator";
import { formatINR } from "@/lib/utilities/money";

export function OrderItemsCard({ order }: { order: Pick<TrackingView, "items" | "pricing" | "payment" | "fulfilment"> }) {
  const p = order.pricing as unknown as Record<string, number | string | boolean | undefined>;
  const n = (k: string) => Number(p[k] ?? 0);
  return (
    <div className="rounded-[2rem] border border-border bg-card p-6">
      <h2 className="mb-4 text-lg font-bold">Items</h2>
      <ul className="space-y-3">
        {order.items.map((i, idx) => (
          <li key={idx} className="flex gap-3 text-sm">
            <VegIndicator isVeg={!!i.isVeg} className="mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">
                {i.quantity} × {i.name}
              </p>
              {i.selections.length > 0 && <p className="text-xs text-muted-foreground">{i.selections.flatMap((s) => s.options).join(", ")}</p>}
              {i.notes && <p className="text-xs text-muted-foreground italic">“{i.notes}”</p>}
            </div>
            <span className="tabular-nums">{formatINR(i.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-5 grid gap-1.5 border-t border-dashed border-border pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="tabular-nums">{formatINR(n("subtotal"))}</dd>
        </div>
        {n("couponDiscount") > 0 && (
          <div className="flex justify-between text-emerald-400">
            <dt>Coupon {p.couponCode ? `(${p.couponCode})` : ""}</dt>
            <dd className="tabular-nums">−{formatINR(n("couponDiscount"))}</dd>
          </div>
        )}
        {order.fulfilment === "DELIVERY" && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Delivery</dt>
            <dd className="tabular-nums">{n("deliveryFee") ? formatINR(n("deliveryFee")) : "FREE"}</dd>
          </div>
        )}
        {n("tax") > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{p.taxInclusive ? "Includes taxes" : "Taxes"}</dt>
            <dd className="tabular-nums">{formatINR(n("tax"))}</dd>
          </div>
        )}
        <div className="mt-1 flex justify-between text-base font-extrabold">
          <dt>Total</dt>
          <dd className="text-gold tabular-nums">{formatINR(n("total"))}</dd>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <dt>Payment</dt>
          <dd>
            {order.payment.method === "COD" ? (order.fulfilment === "PICKUP" ? "Pay at pickup" : "Cash on Delivery") : "Online (Razorpay)"} · {order.payment.status === "PAID" ? "Paid" : order.payment.status === "PENDING" ? "Pending" : order.payment.status.replaceAll("_", " ").toLowerCase()}
          </dd>
        </div>
      </dl>
    </div>
  );
}
