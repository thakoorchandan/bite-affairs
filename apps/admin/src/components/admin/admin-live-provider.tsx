"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";
import type { AdminLiveSnapshot } from "@/services/admin-live.service";

type LiveOrder = AdminLiveSnapshot["orders"][number];

interface AdminLiveState {
  /** Latest version of every order seen via polling, keyed by id. */
  orders: Record<string, LiveOrder>;
  counts: Record<string, number>;
  unreadNotifications: number;
  lastSyncedAt: string | null;
  connected: boolean;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  /** Force an immediate poll (call after a mutation). */
  refresh: () => void;
  /** Increments whenever new data arrives; use as an effect dependency. */
  version: number;
}

const AdminLiveContext = createContext<AdminLiveState | null>(null);

const VISIBLE_INTERVAL = 5000;
const SOUND_KEY = "bite-affairs:admin-sound";
const soundListeners = new Set<() => void>();
/** Shop-wide default from Settings → "Sound alerts for new orders"; a per-device choice (top bar) overrides it. */
let soundDefault = true;
const soundStore = {
  subscribe(l: () => void) {
    soundListeners.add(l);
    return () => soundListeners.delete(l);
  },
  get(): boolean {
    try {
      const stored = localStorage.getItem(SOUND_KEY);
      return stored === null ? soundDefault : stored !== "off";
    } catch {
      return soundDefault;
    }
  },
  setDefault(v: boolean) {
    if (soundDefault === v) return;
    soundDefault = v;
    soundListeners.forEach((l) => l());
  },
  set(v: boolean) {
    try {
      localStorage.setItem(SOUND_KEY, v ? "on" : "off");
    } catch {}
    soundListeners.forEach((l) => l());
  },
};
const HIDDEN_INTERVAL = 30000;

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const notes = [880, 1174.66, 1567.98];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.45);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {
    /* audio blocked until user interaction */
  }
}

/**
 * Polls /api/admin/live and shares the result with every admin page. New orders raise a
 * toast and an optional chime. Polling slows down when the tab is hidden.
 */
export function AdminLiveProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Record<string, LiveOrder>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [unread, setUnread] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [version, setVersion] = useState(0);
  const soundEnabled = useSyncExternalStore(soundStore.subscribe, soundStore.get, () => true);
  const sinceRef = useRef<string | null>(null);
  const seenNotificationIds = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<() => Promise<void>>(async () => {});

  const setSoundEnabled = useCallback((v: boolean) => soundStore.set(v), []);

  const poll = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    try {
      const url = sinceRef.current ? `/api/admin/live?since=${encodeURIComponent(sinceRef.current)}` : "/api/admin/live";
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        setConnected(false);
        return; // signed out: stop polling
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as AdminLiveSnapshot;
      const isFirst = sinceRef.current === null;
      sinceRef.current = data.serverTime;
      setConnected(true);
      setLastSyncedAt(data.serverTime);
      setCounts(data.counts);
      setUnread(data.unreadNotifications);
      if (typeof data.soundAlertsDefault === "boolean") soundStore.setDefault(data.soundAlertsDefault);
      if (data.orders.length) {
        setOrders((prev) => {
          const next = { ...prev };
          for (const o of data.orders) next[o.id] = o;
          return next;
        });
      }
      if (!isFirst) {
        for (const n of data.newNotifications) {
          if (seenNotificationIds.current.has(n.id)) continue;
          seenNotificationIds.current.add(n.id);
          if (n.type === "NEW_ORDER") {
            if (soundStore.get()) playChime();
            toast.success(n.title, { description: n.body ?? undefined, action: n.href ? { label: "Open", onClick: () => (window.location.href = n.href!) } : undefined, duration: 10000 });
          } else if (n.type === "ORDER_DELAYED" || n.type === "PAYMENT_FAILED" || n.type === "ORDER_CANCELLED") {
            toast.warning(n.title, { description: n.body ?? undefined });
          } else if (n.type === "PAYMENT_RECEIVED") {
            toast.info(n.title, { description: n.body ?? undefined });
          }
        }
      }
      setVersion((v) => v + 1);
    } catch {
      setConnected(false);
    }
    timer.current = setTimeout(() => pollRef.current(), document.visibilityState === "visible" ? VISIBLE_INTERVAL : HIDDEN_INTERVAL);
  }, []);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    // First poll is scheduled (not called synchronously) so the effect never sets state inline.
    timer.current = setTimeout(() => pollRef.current(), 0);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pollRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [poll]);

  return (
    <AdminLiveContext.Provider value={{ orders, counts, unreadNotifications: unread, lastSyncedAt, connected, soundEnabled, setSoundEnabled, refresh: poll, version }}>
      {children}
    </AdminLiveContext.Provider>
  );
}

export function useAdminLive(): AdminLiveState {
  const ctx = useContext(AdminLiveContext);
  if (!ctx) throw new Error("useAdminLive must be used inside AdminLiveProvider");
  return ctx;
}

export type { LiveOrder };
