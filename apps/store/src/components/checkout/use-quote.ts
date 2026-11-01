"use client";

import { useEffect, useRef, useState } from "react";
import { quoteCart, type CartQuote } from "@/features/cart/actions";
import type { CartLine } from "@/features/cart/cart-store";
import { cart } from "@/features/cart/cart-store";

/** Debounced server quote: the single source of truth for prices, discounts, delivery and tax. */
export function useQuote(params: { lines: CartLine[]; fulfilment: "DELIVERY" | "PICKUP"; pincode?: string; couponCode?: string; phone?: string }) {
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const items = cart.toServerItems(params.lines);
  const key = JSON.stringify([items, params.fulfilment, params.pincode, params.couponCode, params.phone]);

  useEffect(() => {
    if (!items.length) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await quoteCart({
        items,
        fulfilment: params.fulfilment,
        pincode: params.pincode && /^\d{6}$/.test(params.pincode) ? params.pincode : undefined,
        couponCode: params.couponCode || undefined,
        phone: params.phone || undefined,
      });
      if (id !== seq.current) return;
      setLoading(false);
      if (res.ok) {
        setQuote(res.data);
        setError(null);
      } else setError(res.error);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures every input
  }, [key]);

  return { quote: items.length ? quote : null, loading, error };
}
