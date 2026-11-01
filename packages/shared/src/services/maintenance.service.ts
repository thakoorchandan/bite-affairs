import { and, eq, inArray, isNull, lt, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { expireStaleUnpaidOrders } from "./payment.service";
import { notifyAdmins } from "./notification.service";
import { getBusinessSettings } from "./settings.service";

const { orders, notifications } = schema;

/** Raise one alert per order that has been active longer than the configured threshold. */
export async function raiseDelayedOrderAlerts() {
  const db = await getDb();
  const settings = await getBusinessSettings();
  const minutes = settings.kitchen?.delayAlertMinutes ?? 45;
  if (!minutes) return 0;
  const cutoff = new Date(Date.now() - minutes * 60_000);
  const delayed = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status })
    .from(orders)
    .where(and(inArray(orders.status, ["PLACED", "CONFIRMED", "PREPARING"]), eq(orders.isPreorder, false), lt(orders.createdAt, cutoff), isNull(orders.delayAlertedAt)))
    .limit(20);
  for (const o of delayed) {
    // Conditional update so two instances can't both alert for the same order.
    const claimed = await db.update(orders).set({ delayAlertedAt: new Date() }).where(and(eq(orders.id, o.id), isNull(orders.delayAlertedAt))).returning({ id: orders.id });
    if (claimed.length) {
      await notifyAdmins({ type: "ORDER_DELAYED", title: `Order ${o.orderNumber} is running late`, body: `Still ${o.status.toLowerCase()} after ${minutes} minutes.`, orderId: o.id, orderNumber: o.orderNumber, href: `/orders/${o.id}` });
    }
  }
  return delayed.length;
}

/** Notifications expire after 60 days (keeps the free-tier database lean). */
export async function pruneOldNotifications() {
  const db = await getDb();
  const cutoff = new Date(Date.now() - 60 * 86_400_000);
  const res = await db.delete(notifications).where(and(lt(notifications.createdAt, cutoff), ne(notifications.type, "SYSTEM"))).returning({ id: notifications.id });
  return res.length;
}

/**
 * Housekeeping without background workers: piggybacks on admin polling (at most once a
 * minute across all instances) and can also be triggered by an external free cron.
 */
export async function runMaintenanceIfDue() {
  const { allowed } = await rateLimit("maintenance-lock", 1, 60);
  if (!allowed) return false;
  await Promise.allSettled([expireStaleUnpaidOrders(), raiseDelayedOrderAlerts(), pruneOldNotifications()]);
  return true;
}

