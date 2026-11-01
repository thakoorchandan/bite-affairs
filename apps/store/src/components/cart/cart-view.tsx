"use client";
import { LinkButton } from "@/components/customer/link-button";

import { AnimatePresence } from "framer-motion";
import { ArrowRight, ShoppingBag, AlertTriangle } from "lucide-react";
import { cart, useCart } from "@/features/cart/cart-store";
import { CartLineItem } from "./cart-line-item";
import { useQuote } from "@/components/checkout/use-quote";
import { OrderTotals } from "@/components/checkout/order-summary";
import { CouponField } from "@/components/checkout/coupon-field";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export function CartView() {
  const state = useCart();
  const { lines, couponCode } = state;
  const { quote, loading, error } = useQuote({ lines, fulfilment: "DELIVERY", couponCode });
  const issueByProduct = new Map((quote?.issues ?? []).map((i) => [`${i.index}`, i.message]));
  const hasIssues = (quote?.issues.length ?? 0) > 0;

  if (!lines.length) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Your cart is empty"
        description="Looks like you haven't added anything yet. Our momos are calling."
        action={
          <LinkButton className="rounded-full" href="/menu">
            Browse the menu
          </LinkButton>
        }
      />
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div>
        {hasIssues && (
          <div role="alert" className="mb-4 flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div className="flex-1">
              <p className="font-bold">Some items can&apos;t be ordered right now</p>
              <p className="text-muted-foreground">Remove them to continue.</p>
            </div>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                const bad = new Set(quote!.issues.map((i) => i.index));
                cart.replaceAll(lines.filter((_, idx) => !bad.has(idx)));
              }}
            >
              Remove all
            </Button>
          </div>
        )}
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {lines.map((l, idx) => (
              <CartLineItem key={l.key} line={l} issue={issueByProduct.get(`${idx}`)} />
            ))}
          </AnimatePresence>
        </ul>
        <div className="mt-4 flex justify-between">
          <LinkButton variant="ghost" href="/menu">
            ← Add more items
          </LinkButton>
          <Button variant="ghost" className="text-muted-foreground" onClick={() => cart.clear()}>
            Clear cart
          </Button>
        </div>
      </div>
      <aside className="h-fit space-y-5 rounded-[2rem] border border-border bg-card p-6 lg:sticky lg:top-28">
        <h2 className="display-heading text-2xl">Bill details</h2>
        <CouponField code={couponCode} onApply={(c) => cart.setCoupon(c)} quote={quote} loading={loading} />
        <OrderTotals quote={quote} loading={loading} fulfilment="DELIVERY" />
        {error && <p className="text-sm text-destructive">{error}</p>}
        {hasIssues ? (
          <Button className="h-12 w-full rounded-full text-base font-extrabold" disabled>
            Proceed to checkout <ArrowRight className="size-4" />
          </Button>
        ) : (
          <LinkButton href="/checkout" className="h-12 w-full rounded-full text-base font-extrabold">
            Proceed to checkout <ArrowRight className="size-4" />
          </LinkButton>
        )}
        <p className="text-center text-xs text-muted-foreground">Delivery fee is confirmed once you enter your PIN code.</p>
      </aside>
    </div>
  );
}
