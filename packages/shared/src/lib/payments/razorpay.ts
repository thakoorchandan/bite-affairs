import { hmacSha256Hex, safeEqual } from "@/lib/security/tokens";

/**
 * Minimal Razorpay REST client (no SDK, works on any runtime with fetch + node:crypto).
 * Docs: https://razorpay.com/docs/api/orders/ and payment signature verification.
 */
export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
}

export function getRazorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || undefined };
}

export async function createRazorpayOrder(cfg: RazorpayConfig, input: { amount: number; receipt: string; notes?: Record<string, string> }) {
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: input.amount, currency: "INR", receipt: input.receipt, notes: input.notes }),
  });
  if (!res.ok) throw new Error(`Razorpay order creation failed (${res.status})`);
  return (await res.json()) as { id: string; amount: number; currency: string; status: string };
}

export async function fetchRazorpayPayment(cfg: RazorpayConfig, paymentId: string) {
  const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}` },
  });
  if (!res.ok) throw new Error(`Razorpay payment lookup failed (${res.status})`);
  return (await res.json()) as { id: string; order_id: string; amount: number; status: string; method?: string };
}

/** Checkout callback signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyCheckoutSignature(cfg: RazorpayConfig, razorpayOrderId: string, razorpayPaymentId: string, signature: string): boolean {
  const expected = hmacSha256Hex(cfg.keySecret, `${razorpayOrderId}|${razorpayPaymentId}`);
  return safeEqual(expected, signature);
}

/** Webhook signature: HMAC_SHA256(raw request body, webhook secret). */
export function verifyWebhookSignature(webhookSecret: string, rawBody: string, signature: string): boolean {
  const expected = hmacSha256Hex(webhookSecret, rawBody);
  return safeEqual(expected, signature);
}
