"use client";
import { LinkButton } from "@/components/customer/link-button";

import { AnimatePresence } from "framer-motion";
import { ShoppingBag, ArrowRight } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCart } from "@/features/cart/cart-store";
import { useCartDrawer } from "@/components/layout/cart-drawer-context";
import { formatINR } from "@/lib/utilities/money";
import { CartLineItem } from "./cart-line-item";
import { EmptyState } from "@/components/shared/empty-state";

export function CartDrawer() {
  const { open, setOpen } = useCartDrawer();
  const { lines } = useCart();
  const estimate = lines.reduce((s, l) => s + l.snapshot.unitPrice * l.quantity, 0);
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full gap-0 bg-background p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="display-heading text-2xl">Your Cart</SheetTitle>
          <SheetDescription>{count ? `${count} item${count > 1 ? "s" : ""}` : "Nothing here yet"}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {lines.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="Your cart is hungry"
              description="Add something delicious from the menu."
              action={
                <LinkButton href="/menu" onClick={() => setOpen(false)} className="rounded-full">
                  Browse menu
                </LinkButton>
              }
              className="mt-8 border-none"
            />
          ) : (
            <ul className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {lines.map((l) => (
                  <CartLineItem key={l.key} line={l} onNavigate={() => setOpen(false)} />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
        {lines.length > 0 && (
          <SheetFooter className="border-t border-border bg-card/50 px-5 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Item total</span>
              <span className="text-lg font-bold tabular-nums">{formatINR(estimate)}</span>
            </div>
            <p className="text-xs text-muted-foreground">Delivery, coupons and taxes are calculated at checkout.</p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <LinkButton variant="outline" className="h-11 rounded-full" href="/cart" onClick={() => setOpen(false)}>
                View cart
              </LinkButton>
              <LinkButton className="h-11 rounded-full font-bold" href="/checkout" onClick={() => setOpen(false)}>
                Checkout <ArrowRight className="size-4" />
              </LinkButton>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
