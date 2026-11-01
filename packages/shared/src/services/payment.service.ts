import { and, eq, lt, ne, sql } from "drizzle-orm";
import { getDb, isUuid, schema, withTransaction } from "@/db";
import { AppError, notFound } from "@/lib/utilities/errors";
import { fetchRazorpayPayment, getRazorpayConfig, verifyCheckoutSignature } from "@/lib/payments/razorpay";
import { notifyAdmins, notifyCustomerOrderStatus } from "./notification.service";
import { cancelUnpaidOrder } from "./order.service";
import { getBusinessSettings } from "./settings.service";

const { orders, payments, orderStatusHistory } = schema;

const appendEvent = (type: string, data?: unknown) => sql`${payments.events} || ${JSON.stringify([{ type, at: new Date().toISOString(), ...(data !== undefined ? { data } : {}) }])}::jsonb`;

/**
 * Marks an online-payment order as paid. Idempotent: repeated calls (browser callback +
 * webhook, retries) only apply once thanks to the conditional update on payment_status.
 */
export async function markRazorpayOrderPaid(params: { razorpayOrderId: string; razorpayPaymentId: string; amount: number; source: "checkout" | "webhook" }) {
  const result = await withTransaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.razorpayOrderId, params.razorpayOrderId)).limit(1);
    if (!order) throw notFound("Order");
    if (order.paymentStatus === "PAID") return { order, changed: false, revive: false };
    if (params.amount !== order.total) {
      await tx.update(payments).set({ events: appendEvent("amount_mismatch", params) }).where(eq(payments.orderId, order.id));
      throw new AppError("Payment amount mismatch.", "PAYMENT_MISMATCH", 400);
    }
    const now = new Date();
    // A late payment for an order that already expired is recorded, but the order is not revived automatically.
    const revive = order.status === "AWAITING_PAYMENT";
    const updated = await tx
      .update(orders)
      .set({
        paymentStatus: "PAID",
        razorpayPaymentId: params.razorpayPaymentId,
        paidAt: now,
        ...(revive ? { status: "PLACED" as const, timeline: sql`${orders.timeline} || ${JSON.stringify([{ status: "PLACED", at: now.toISOString() }])}::jsonb` } : {}),
      })
      .where(and(eq(orders.id, order.id), ne(orders.paymentStatus, "PAID")))
      .returning({ id: orders.id });
    // Another request (webhook vs browser callback) marked it paid first.
    if (!updated.length) return { order, changed: false, revive: false };
    await tx.update(payments).set({ status: "PAID", razorpayPaymentId: params.razorpayPaymentId, events: appendEvent(`paid_via_${params.source}`, { paymentId: params.razorpayPaymentId }) }).where(eq(payments.orderId, order.id));
    if (revive) {
      await tx.insert(orderStatusHistory).values({ orderId: order.id, orderNumber: order.orderNumber, from: "AWAITING_PAYMENT", to: "PLACED", actorType: "SYSTEM", note: `Payment verified (${params.source})` });
    }
    return { order: { ...order, status: revive ? ("PLACED" as const) : order.status }, changed: true, revive };
  });

  if (result.changed) {
    const o = result.order;
    await notifyAdmins({ type: "PAYMENT_RECEIVED", title: `Payment received · ${o.orderNumber}`, body: `₹${o.total / 100} via Razorpay`, orderId: o.id, orderNumber: o.orderNumber, href: `/orders/${o.id}` }).catch(() => undefined);
    if (result.revive) {
      await notifyAdmins({ type: "NEW_ORDER", title: `New order ${o.orderNumber}`, body: `${o.customerName} · ₹${o.total / 100} · Paid online`, orderId: o.id, orderNumber: o.orderNumber, href: `/orders/${o.id}` }).catch(() => undefined);
      const settings = await getBusinessSettings();
      await notifyCustomerOrderStatus(
        { id: o.id, orderNumber: o.orderNumber, userId: o.userId, customer: { name: o.customerName, phone: o.customerPhone, email: o.customerEmail }, status: "PLACED" },
        { emailEnabled: settings.notifications?.emailEnabled ?? false, whatsappEnabled: settings.notifications?.whatsappEnabled ?? false },
      );
    }
  }
  return result.order;
}

/** Browser callback after Razorpay Checkout. The signature AND the payment status are verified server-side. */
export async function verifyRazorpayCheckout(input: { razorpayOrderId: string; razorpayPaymentId: string; signature: string }) {
  const cfg = getRazorpayConfig();
  if (!cfg) throw new AppError("Online payments are not configured.", "NOT_CONFIGURED", 400);
  if (!verifyCheckoutSignature(cfg, input.razorpayOrderId, input.razorpayPaymentId, input.signature)) {
    throw new AppError("Payment verification failed.", "INVALID_SIGNATURE", 400);
  }
  const payment = await fetchRazorpayPayment(cfg, input.razorpayPaymentId);
  if (payment.order_id !== input.razorpayOrderId || !["captured", "authorized"].includes(payment.status)) {
    throw new AppError("Payment has not been completed.", "PAYMENT_INCOMPLETE", 400);
  }
  return markRazorpayOrderPaid({ razorpayOrderId: input.razorpayOrderId, razorpayPaymentId: input.razorpayPaymentId, amount: payment.amount, source: "checkout" });
}

export async function markRazorpayPaymentFailed(razorpayOrderId: string, reason: string) {
  const db = await getDb();
  const [order] = await db.select({ id: orders.id, orderNumber: orders.orderNumber, paymentStatus: orders.paymentStatus }).from(orders).where(eq(orders.razorpayOrderId, razorpayOrderId)).limit(1);
  if (!order || order.paymentStatus === "PAID") return;
  await db.update(payments).set({ failureReason: reason, events: appendEvent("payment_failed", { reason }) }).where(eq(payments.orderId, order.id));
  await notifyAdmins({ type: "PAYMENT_FAILED", title: `Payment failed · ${order.orderNumber}`, body: reason, orderId: order.id, orderNumber: order.orderNumber, href: `/orders/${order.id}` }).catch(() => undefined);
}

/** Orders left unpaid are cancelled lazily (no background workers needed on serverless). */
export async function expireStaleUnpaidOrders(maxAgeMinutes = 30) {
  const db = await getDb();
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000);
  const stale = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.status, "AWAITING_PAYMENT"), lt(orders.createdAt, cutoff))).limit(20);
  for (const o of stale) if (isUuid(o.id)) await cancelUnpaidOrder(o.id, "Payment not completed in time").catch((e) => console.error(e));
  return stale.length;
}
