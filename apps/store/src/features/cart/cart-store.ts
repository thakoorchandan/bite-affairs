"use client";

import { useSyncExternalStore } from "react";
import { lineKey } from "@/services/pricing-key";

/**
 * Client-side cart persisted in localStorage. It stores product references, quantities
 * and selections plus a display snapshot. Prices shown from the snapshot are only hints:
 * the server re-prices everything (quoteCart / placeOrder) from MongoDB.
 */
export interface CartSelection {
  groupId: string;
  optionIds: string[];
}

export interface CartLine {
  key: string;
  productId: string;
  quantity: number;
  selections: CartSelection[];
  notes?: string;
  snapshot: {
    name: string;
    slug: string;
    imageUrl?: string | null;
    isVeg: boolean;
    unitPrice: number;
    selectionLabels: string[];
  };
}

interface CartState {
  lines: CartLine[];
  couponCode?: string;
  updatedAt: number;
}

const STORAGE_KEY = "bite-affairs:cart:v1";
const EMPTY: CartState = { lines: [], updatedAt: 0 };
let state: CartState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CartState;
      if (Array.isArray(parsed.lines)) state = { lines: parsed.lines.filter((l) => l && l.productId && l.quantity > 0).slice(0, 40), couponCode: parsed.couponCode, updatedAt: parsed.updatedAt ?? 0 };
    }
  } catch {
    state = EMPTY;
  }
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    loaded = false;
    load();
    emit();
  });
}

function emit() {
  for (const l of listeners) l();
}

function commit(next: CartState) {
  state = { ...next, updatedAt: Date.now() };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: keep in memory */
  }
  emit();
  cartEvents.dispatchEvent(new Event("change"));
}

/** Fires on every local change; used to sync signed-in carts to the server. */
export const cartEvents = typeof window !== "undefined" ? new EventTarget() : ({ dispatchEvent() {}, addEventListener() {}, removeEventListener() {} } as unknown as EventTarget);

export const cart = {
  get(): CartState {
    load();
    return state;
  },
  add(line: Omit<CartLine, "key">) {
    load();
    const key = lineKey(line);
    const existing = state.lines.find((l) => l.key === key);
    const lines = existing
      ? state.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + line.quantity), snapshot: line.snapshot } : l))
      : [...state.lines, { ...line, key }];
    commit({ ...state, lines });
  },
  setQuantity(key: string, quantity: number) {
    load();
    const lines = quantity <= 0 ? state.lines.filter((l) => l.key !== key) : state.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, quantity) } : l));
    commit({ ...state, lines });
  },
  replaceLine(oldKey: string, line: Omit<CartLine, "key">) {
    load();
    const key = lineKey(line);
    const without = state.lines.filter((l) => l.key !== oldKey && l.key !== key);
    const index = state.lines.findIndex((l) => l.key === oldKey);
    without.splice(Math.max(0, index), 0, { ...line, key });
    commit({ ...state, lines: without });
  },
  remove(key: string) {
    this.setQuantity(key, 0);
  },
  setCoupon(code?: string) {
    load();
    commit({ ...state, couponCode: code?.trim().toUpperCase() || undefined });
  },
  replaceAll(lines: CartLine[]) {
    load();
    commit({ ...state, lines: lines.map((l) => ({ ...l, key: lineKey(l) })) });
  },
  clear() {
    load();
    commit({ lines: [], updatedAt: Date.now() });
  },
  /** Payload for server actions: no prices, ever. */
  toServerItems(lines: CartLine[] = state.lines) {
    return lines.map((l) => ({ productId: l.productId, quantity: l.quantity, selections: l.selections, notes: l.notes }));
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCart() {
  return useSyncExternalStore(subscribe, cart.get, () => EMPTY);
}

export function useCartCount() {
  const s = useCart();
  return s.lines.reduce((sum, l) => sum + l.quantity, 0);
}
