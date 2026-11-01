"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlarmClock, Ban, BellRing, CheckCheck, CircleAlert, CreditCard, Loader2, PackageCheck, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markNotificationsReadAction } from "@/features/admin/notifications-actions";
import { useAdminLive } from "../admin-live-provider";
import { formatInZone } from "@/lib/utilities/time";
import { cn } from "@/lib/utils";

const ICONS = { NEW_ORDER: ShoppingBag, ORDER_CANCELLED: Ban, PAYMENT_RECEIVED: CreditCard, PAYMENT_FAILED: CircleAlert, ORDER_READY: PackageCheck, ORDER_DELAYED: AlarmClock } as Record<string, typeof BellRing>;

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export function NotificationList({ items, unread }: { items: NotificationRow[]; unread: number }) {
  const router = useRouter();
  const { refresh } = useAdminLive();
  const [busy, setBusy] = useState(false);
  const mark = async (input: { ids?: string[]; all?: boolean }) => {
    setBusy(true);
    const res = await markNotificationsReadAction(input);
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    refresh();
    router.refresh();
  };
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{unread} unread</p>
        <Button size="sm" variant="outline" disabled={busy || unread === 0} onClick={() => mark({ all: true })}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />} Mark all read
        </Button>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
        {items.map((n) => {
          const Icon = ICONS[n.type] ?? BellRing;
          const content = (
            <>
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", n.readAt ? "bg-muted text-muted-foreground" : "bg-gold/15 text-gold")}>
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm", !n.readAt && "font-semibold")}>{n.title}</p>
                {n.body && <p className="truncate text-xs text-muted-foreground">{n.body}</p>}
                <p className="mt-0.5 text-[11px] text-muted-foreground">{formatInZone(n.createdAt)}</p>
              </div>
              {!n.readAt && <span className="size-2 shrink-0 rounded-full bg-gold" aria-label="Unread" />}
            </>
          );
          return (
            <li key={n.id} className={cn(!n.readAt && "bg-gold/[0.03]")}>
              {n.href ? (
                <Link href={n.href} onClick={() => !n.readAt && markNotificationsReadAction({ ids: [n.id] }).then(() => refresh())} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  {content}
                </Link>
              ) : (
                <button type="button" onClick={() => !n.readAt && mark({ ids: [n.id] })} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40">
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
