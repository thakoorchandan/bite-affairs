import { NextResponse } from "next/server";
import { getRazorpayConfig, verifyWebhookSignature } from "@/lib/payments/razorpay";
import { markRazorpayOrderPaid, markRazorpayPaymentFailed } from "@/services/payment.service";

/**
 * Razorpay webhook (payment.captured / payment.failed). The raw body's HMAC signature is
 * verified with RAZORPAY_WEBHOOK_SECRET; unsigned or forged requests are rejected.
 * Processing is idempotent, so Razorpay's retries are safe.
 */
export async function POST(request: Request) {
  const cfg = getRazorpayConfig();
  if (!cfg?.webhookSecret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  const signature = request.headers.get("x-razorpay-signature");
  const raw = await request.text();
  if (!signature || !verifyWebhookSignature(cfg.webhookSecret, raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  let event: { event?: string; payload?: { payment?: { entity?: { id: string; order_id: string; amount: number; error_description?: string } } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const payment = event.payload?.payment?.entity;
  try {
    if (event.event === "payment.captured" && payment) {
      await markRazorpayOrderPaid({ razorpayOrderId: payment.order_id, razorpayPaymentId: payment.id, amount: payment.amount, source: "webhook" });
    } else if (event.event === "payment.failed" && payment) {
      await markRazorpayPaymentFailed(payment.order_id, payment.error_description ?? "Payment failed");
    }
  } catch (error) {
    console.error("[razorpay webhook]", error);
    // Unknown orders are acknowledged so Razorpay doesn't retry forever; other errors get retried.
    if ((error as { code?: string }).code === "NOT_FOUND") return NextResponse.json({ ok: true });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
