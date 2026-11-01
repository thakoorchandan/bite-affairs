"use client";

import { useEffect } from "react";
import { rememberOrder } from "@/features/checkout/tracking-storage";

export function RememberOrder({ orderNumber, token }: { orderNumber: string; token: string }) {
  useEffect(() => {
    rememberOrder({ orderNumber, token, placedAt: new Date().toISOString() });
  }, [orderNumber, token]);
  return null;
}
