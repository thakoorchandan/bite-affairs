import type { FulfilmentType, OrderStatus, PaymentStatus } from "@/constants/domain";

/** Normal (non-override) transitions an admin may perform. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  AWAITING_PAYMENT: ["CANCELLED"],
  PLACED: ["CONFIRMED", "REJECTED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["REFUND_INITIATED"],
  CANCELLED: ["REFUND_INITIATED"],
  REJECTED: ["REFUND_INITIATED"],
  REFUND_INITIATED: ["REFUNDED"],
  REFUNDED: [],
};

export interface TransitionContext {
  fulfilment: FulfilmentType;
  paymentStatus: PaymentStatus;
}

export function allowedTransitions(from: OrderStatus, ctx: TransitionContext): OrderStatus[] {
  return TRANSITIONS[from].filter((to) => {
    // Delivery orders must go out for delivery before being delivered; pickup orders skip it.
    if (from === "READY" && to === "DELIVERED") return ctx.fulfilment === "PICKUP";
    if (from === "READY" && to === "OUT_FOR_DELIVERY") return ctx.fulfilment === "DELIVERY";
    // Refunds only make sense when money was actually received online.
    if (to === "REFUND_INITIATED") return ctx.paymentStatus === "PAID";
    return true;
  });
}

export function validateTransition(from: OrderStatus, to: OrderStatus, ctx: TransitionContext, override: { enabled: boolean; reason?: string } = { enabled: false }): string | null {
  if (from === to) return "The order is already in that status.";
  if (allowedTransitions(from, ctx).includes(to)) return null;
  if (override.enabled) {
    if (!override.reason || override.reason.trim().length < 5) return "An override requires a reason (at least 5 characters).";
    if (to === "AWAITING_PAYMENT") return "Orders cannot be moved back to awaiting payment.";
    return null;
  }
  return `Cannot change an order from ${from.replaceAll("_", " ").toLowerCase()} to ${to.replaceAll("_", " ").toLowerCase()}.`;
}

/** Primary "next step" action for admin UIs. */
export function nextPrimaryStatus(from: OrderStatus, fulfilment: FulfilmentType): OrderStatus | null {
  switch (from) {
    case "PLACED":
      return "CONFIRMED";
    case "CONFIRMED":
      return "PREPARING";
    case "PREPARING":
      return "READY";
    case "READY":
      return fulfilment === "PICKUP" ? "DELIVERED" : "OUT_FOR_DELIVERY";
    case "OUT_FOR_DELIVERY":
      return "DELIVERED";
    default:
      return null;
  }
}
