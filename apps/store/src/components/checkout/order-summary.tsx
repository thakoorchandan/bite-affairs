"use client";

import { Loader2 } from "lucide-react";
import type { CartQuote } from "@/features/cart/actions";
import { formatINR } from "@/lib/utilities/money";
import { cn } from "@/lib/utils";

function Row({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4 text-sm", muted && "text-muted-foreground")}>
      <dt>{label}</dt>
      <dd className={cn("tabular-nums", accent && "font-semibold text-emerald-400")}>{value}</dd>
    </div>
  );
}

export function OrderTotals({ quote, loading, fulfilment, pincodeChecked }: { quote: CartQuote | null; loading?: boolean; fulfilment: "DELIVERY" | "PICKUP"; pincodeChecked?: boolean }) {
  if (!quote) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Calculating…
      </div>
    );
  }
  const t = quote.totals;
  return (
    <dl className={cn("grid gap-2 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
      <Row label="Item total" value={formatINR(t.itemsSubtotal)} />
      {t.customisationTotal > 0 && <Row label="Customisations" value={`+${formatINR(t.customisationTotal)}`} />}
      {t.productDiscount > 0 && <Row label="Menu discounts" value={`−${formatINR(t.productDiscount)}`} accent />}
      {t.couponDiscount > 0 && <Row label={`Coupon${quote.coupon?.code ? ` (${quote.coupon.code})` : ""}`} value={`−${formatINR(t.couponDiscount)}`} accent />}
      {fulfilment === "DELIVERY" ? (
        <Row label="Delivery fee" value={!pincodeChecked && t.deliveryFee === 0 ? "Enter PIN" : t.deliveryFee === 0 ? "FREE" : formatINR(t.deliveryFee)} accent={!!pincodeChecked && t.deliveryFee === 0} muted={!pincodeChecked} />
      ) : (
        <Row label="Pickup" value="FREE" accent />
      )}
      {t.taxRateBps > 0 && <Row label={t.taxInclusive ? `Includes taxes (${t.taxRateBps / 100}%)` : `Taxes (${t.taxRateBps / 100}%)`} value={formatINR(t.tax)} muted={t.taxInclusive} />}
      <div className="my-1 border-t border-dashed border-border" />
      <div className="flex items-baseline justify-between">
        <dt className="font-bold">To pay</dt>
        <dd className="text-2xl font-extrabold text-gold tabular-nums">{formatINR(t.total)}</dd>
      </div>
    </dl>
  );
}
