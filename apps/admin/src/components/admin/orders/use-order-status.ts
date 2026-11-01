"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateOrderStatusAction } from "@/features/admin/orders-actions";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/constants/domain";
import { useAdminLive } from "../admin-live-provider";

/**
 * Runs a status transition with `expectedFrom` (so double-clicks or two devices can't
 * apply the same change twice), shows feedback and refreshes live data.
 */
export function useOrderStatus() {
  const router = useRouter();
  const { refresh } = useAdminLive();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const run = useCallback(
    async (order: { id: string; status: string; orderNumber: string }, to: OrderStatus, extra: { reason?: string; note?: string; override?: boolean } = {}) => {
      if (pendingId) return false;
      setPendingId(order.id);
      try {
        const res = await updateOrderStatusAction({ orderId: order.id, to, expectedFrom: order.status as OrderStatus, ...extra });
        if (!res.ok) {
          toast.error(res.error);
          if (res.code === "STALE_STATUS") refresh();
          return false;
        }
        toast.success(`${order.orderNumber} · ${ORDER_STATUS_LABELS[to]}`);
        refresh();
        router.refresh();
        return true;
      } finally {
        setPendingId(null);
      }
    },
    [pendingId, refresh, router],
  );

  return { run, pendingId };
}

/** Current timestamp that re-renders every `intervalMs` so elapsed timers stay current. */
export function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function minutesSince(iso: string | Date, now: number) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

export function formatElapsed(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  return `${h}h ${minutes % 60}m`;
}
