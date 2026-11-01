import { getDb, schema } from "@/db";
import type { NotificationType, OrderStatus } from "@/constants/domain";
import { ORDER_STATUS_LABELS } from "@/constants/domain";

type Sender = (message: import("@/lib/notifications/providers").OutboundMessage, channels: { email: boolean; whatsapp: boolean }) => Promise<void>;

let externalSender: Sender | null = null;
/** Registered lazily so this module stays importable from tests and scripts. */
async function getExternalSender(): Promise<Sender> {
  if (externalSender) return externalSender;
  try {
    const { emailProvider, whatsappProvider } = await import("@/lib/notifications/providers");
    externalSender = async (message, channels) => {
      const jobs: Promise<void>[] = [];
      if (channels.email && emailProvider.isConfigured()) jobs.push(emailProvider.send(message));
      if (channels.whatsapp && whatsappProvider.isConfigured()) jobs.push(whatsappProvider.send(message));
      const results = await Promise.allSettled(jobs);
      for (const r of results) if (r.status === "rejected") console.error("[notifications] delivery failed:", r.reason);
    };
  } catch {
    externalSender = async () => {};
  }
  return externalSender;
}

/** Minimal order shape needed to notify a customer (an OrderDoc or a flat row folded by the caller fits). */
export interface NotifiableOrder {
  id: string;
  orderNumber: string;
  userId?: string | null;
  customer: { name: string; phone: string; email?: string | null };
  status: OrderStatus;
}

export async function notifyAdmins(input: { type: NotificationType; title: string; body?: string; orderId?: string; orderNumber?: string; href?: string }) {
  const db = await getDb();
  await db.insert(schema.notifications).values({ audience: "ADMIN", ...input });
}

export async function notifyCustomerOrderStatus(order: NotifiableOrder, opts: { emailEnabled?: boolean; whatsappEnabled?: boolean; trackingUrl?: string } = {}) {
  const label = ORDER_STATUS_LABELS[order.status];
  const title = `Order ${order.orderNumber}: ${label}`;
  const body = customerStatusMessage(order.status, order.orderNumber);
  try {
    if (order.userId) {
      const db = await getDb();
      await db.insert(schema.notifications).values({
        audience: "CUSTOMER",
        userId: order.userId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        type: "ORDER_STATUS",
        title,
        body,
        href: `/account/orders/${order.id}`,
      });
    }
    if (opts.emailEnabled || opts.whatsappEnabled) {
      const send = await getExternalSender();
      await send(
        {
          to: { email: order.customer.email, phone: order.customer.phone },
          subject: `Bite Affairs · ${title}`,
          text: `Hi ${order.customer.name},\n\n${body}${opts.trackingUrl ? `\n\nTrack your order: ${opts.trackingUrl}` : ""}\n\n— Bite Affairs`,
          whatsappTemplate: { name: "order_status_update", params: [order.customer.name, order.orderNumber, label] },
        },
        { email: !!opts.emailEnabled, whatsapp: !!opts.whatsappEnabled },
      );
    }
  } catch (error) {
    console.error("[notifications] customer notification failed", error);
  }
}

export function customerStatusMessage(status: OrderStatus, orderNumber: string): string {
  switch (status) {
    case "PLACED":
      return `We've received your order ${orderNumber}. We'll confirm it shortly.`;
    case "CONFIRMED":
      return "Your order is confirmed and will be in the kitchen soon.";
    case "PREPARING":
      return "Our chefs are cooking your food right now.";
    case "READY":
      return "Your food is ready and packed.";
    case "OUT_FOR_DELIVERY":
      return "Your order is on its way to you.";
    case "DELIVERED":
      return "Your order has been delivered. Enjoy your meal!";
    case "CANCELLED":
      return "Your order has been cancelled. Please contact us if you have questions.";
    case "REJECTED":
      return "Sorry, we couldn't accept your order this time.";
    case "REFUND_INITIATED":
      return "We've started your refund.";
    case "REFUNDED":
      return "Your refund has been completed.";
    default:
      return `Your order status is now ${ORDER_STATUS_LABELS[status]}.`;
  }
}
