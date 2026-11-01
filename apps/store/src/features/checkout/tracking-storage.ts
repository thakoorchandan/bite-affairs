"use client";

/**
 * Remembers tracking tokens for orders placed in this browser, so guests can reopen
 * tracking pages and later link those orders to an account (token = proof of ownership).
 */
const KEY = "bite-affairs:orders:v1";

export interface StoredOrderRef {
  orderNumber: string;
  token: string;
  placedAt: string;
}

export function rememberOrder(ref: StoredOrderRef) {
  try {
    const list = getRememberedOrders().filter((o) => o.orderNumber !== ref.orderNumber);
    list.unshift(ref);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
  } catch {}
}

export function getRememberedOrders(): StoredOrderRef[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredOrderRef[]) : [];
  } catch {
    return [];
  }
}

export function trackingUrl(orderNumber: string, token: string) {
  return `/track-order/${encodeURIComponent(orderNumber)}?t=${encodeURIComponent(token)}`;
}
