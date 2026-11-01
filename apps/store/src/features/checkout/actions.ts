"use server";

import { z } from "zod";
import { createOrder, type CreateOrderResult } from "@/services/order.service";
import { verifyRazorpayCheckout, markRazorpayPaymentFailed } from "@/services/payment.service";
import { lookupOrderToken } from "@/services/order-query.service";
import { getCurrentUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";
import { AppError, toActionError, type ActionResult } from "@/lib/utilities/errors";
import type { CheckoutInput } from "@/lib/validations/checkout";
import { indianMobile } from "@/lib/validations/common";
import { deriveTrackingToken } from "@/services/order.service";

export async function placeOrder(input: CheckoutInput): Promise<ActionResult<CreateOrderResult>> {
  try {
    const ip = await getClientIp();
    await enforceRateLimit(`checkout:${ip}`, 15, 10 * 60, "Too many order attempts. Please wait a few minutes.");
    const user = await getCurrentUser();
    const result = await createOrder(input, { userId: user?.id });
    return { ok: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

const verifySchema = z.object({
  razorpayOrderId: z.string().min(5).max(64),
  razorpayPaymentId: z.string().min(5).max(64),
  signature: z.string().min(20).max(200),
});

export async function confirmOnlinePayment(input: z.input<typeof verifySchema>): Promise<ActionResult<{ orderNumber: string; trackingToken: string }>> {
  try {
    const parsed = verifySchema.parse(input);
    const order = await verifyRazorpayCheckout(parsed);
    return { ok: true, data: { orderNumber: order.orderNumber, trackingToken: deriveTrackingToken(order.orderNumber) } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function reportPaymentFailure(input: { razorpayOrderId: string; reason?: string }): Promise<ActionResult> {
  try {
    const id = z.string().min(5).max(64).parse(input.razorpayOrderId);
    await markRazorpayPaymentFailed(id, (input.reason ?? "Payment failed or was cancelled").slice(0, 200));
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

const lookupSchema = z.object({ orderNumber: z.string().trim().toUpperCase().regex(/^BA\d{6}-\d{3,}$/, "Enter the order number from your confirmation, e.g. BA261031-004"), phone: indianMobile });

/** Find an order by number + mobile. Rate limited to stop enumeration. */
export async function findMyOrder(input: z.input<typeof lookupSchema>): Promise<ActionResult<{ orderNumber: string; token: string }>> {
  try {
    const ip = await getClientIp();
    await enforceRateLimit(`track-lookup:${ip}`, 10, 15 * 60);
    const parsed = lookupSchema.parse(input);
    const token = await lookupOrderToken(parsed.orderNumber, parsed.phone);
    if (!token) throw new AppError("We couldn't find an order with those details.", "NOT_FOUND", 404);
    return { ok: true, data: { orderNumber: parsed.orderNumber, token } };
  } catch (error) {
    return toActionError(error);
  }
}
