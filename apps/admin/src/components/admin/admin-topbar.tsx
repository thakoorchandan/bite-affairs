"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { signOut } from "next-auth/react";
import { Bell, LogOut, Menu, Volume2, VolumeX, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AdminNavLinks } from "./admin-sidebar";
import { useAdminLive } from "./admin-live-provider";
import { Logo } from "@/components/shared/logo";

const noopSubscribe = () => () => {};

export function AdminTopbar() {
  const [open, setOpen] = useState(false);
  const live = useAdminLive();
  const { connected, soundEnabled, setSoundEnabled } = live;
  // Polled values only exist in the browser; keep the first client render identical to the server's.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const unreadNotifications = hydrated ? live.unreadNotifications : 0;

  return (
    <header className="sticky top-0 z-40 flex h-16 print:hidden items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-xl sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setOpen(true)}>
        <Menu className="size-5" />
      </Button>
      <div className="lg:hidden">
        <Logo href="/dashboard" className="text-base" />
      </div>
      <div className="flex-1" />
      <Tooltip>
        <TooltipTrigger render={<span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex" />}>
          {connected ? <Wifi className="size-3.5 text-emerald-400" /> : <WifiOff className="size-3.5 text-red-400" />}
          {connected ? "Live" : "Reconnecting…"}
        </TooltipTrigger>
        <TooltipContent>{connected ? "Orders update automatically" : "Connection lost — retrying"}</TooltipContent>
      </Tooltip>
      <Button variant="ghost" size="icon" aria-label={soundEnabled ? "Mute new-order sound" : "Enable new-order sound"} onClick={() => setSoundEnabled(!soundEnabled)}>
        {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4 text-muted-foreground" />}
      </Button>
      <Button variant="ghost" size="icon" aria-label={`Notifications (${unreadNotifications} unread)`} render={<Link href="/notifications" />} className="relative">
        <Bell className="size-4" />
        {unreadNotifications > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-gold px-1 text-[10px] font-bold text-primary-foreground">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>
        )}
      </Button>
      <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
        <LogOut className="size-3.5" /> <span className="hidden sm:inline">Sign out</span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetTitle className="flex h-16 items-center border-b border-sidebar-border px-5">
            <Logo href={null} className="text-lg" />
          </SheetTitle>
          <div className="overflow-y-auto px-3 py-5">
            <AdminNavLinks onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
