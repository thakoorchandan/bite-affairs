"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminLive } from "../admin-live-provider";

/** Re-renders a server page when the live feed reports a newer version of this order. */
export function LiveOrderRefresh({ orderId, updatedAt }: { orderId: string; updatedAt: string }) {
  const router = useRouter();
  const { orders } = useAdminLive();
  const live = orders[orderId];
  useEffect(() => {
    if (live && new Date(live.updatedAt).getTime() > new Date(updatedAt).getTime()) router.refresh();
  }, [live, updatedAt, router]);
  return null;
}
