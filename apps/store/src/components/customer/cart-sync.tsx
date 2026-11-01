"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { cart, cartEvents } from "@/features/cart/cart-store";
import { getServerCart, syncServerCart } from "@/features/cart/actions";
import { hydrateCartAction } from "@/features/cart/hydrate-actions";
import { claimOrdersAction } from "@/features/authentication/actions";
import { getRememberedOrders } from "@/features/checkout/tracking-storage";
import { lineKey } from "@/services/pricing-key";

/**
 * When a customer is signed in: merge their saved server cart into the local cart once,
 * keep the server copy in sync (debounced), and link guest orders placed in this browser.
 */
export function CartSync() {
  const { status, data } = useSession();
  const mergedFor = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !data?.user?.id) return;
    const uid = data.user.id;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const push = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void syncServerCart(cart.toServerItems()), 800);
    };

    (async () => {
      if (mergedFor.current !== uid) {
        mergedFor.current = uid;
        const server = await getServerCart();
        if (server.ok && server.data.length) {
          const local = cart.get().lines;
          const localKeys = new Set(local.map((l) => l.key));
          const missing = server.data.filter((i) => !localKeys.has(lineKey(i)));
          if (missing.length) {
            const hydrated = await hydrateCartAction(missing);
            if (hydrated.ok && hydrated.data.lines.length) {
              cart.replaceAll([...local, ...hydrated.data.lines.map((l) => ({ ...l, key: lineKey(l) }))]);
            }
          }
        }
        await syncServerCart(cart.toServerItems());
        const remembered = getRememberedOrders();
        if (remembered.length) {
          const res = await claimOrdersAction(remembered.map((o) => ({ orderNumber: o.orderNumber, token: o.token })));
          if (res.ok && res.data.claimed > 0) toast.success(`${res.data.claimed} earlier order${res.data.claimed > 1 ? "s" : ""} linked to your account`);
        }
      }
    })();

    cartEvents.addEventListener("change", push);
    return () => {
      cartEvents.removeEventListener("change", push);
      if (timer) clearTimeout(timer);
    };
  }, [status, data?.user?.id]);

  return null;
}
