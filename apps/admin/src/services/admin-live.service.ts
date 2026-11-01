import { and, count, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { getDb, rowsOf, schema, toOrderDocs } from "@/db";
import { sql } from "drizzle-orm";
import { ACTIVE_KITCHEN_STATUSES } from "@/constants/domain";
import { serialize } from "@/lib/utilities/serialize";
import { getBusinessSettings } from "@/services/settings.service";

const { orders, notifications } = schema;

/** One cheap round-trip for the admin UI: changed orders, status counts and unread notifications. */
export async function getAdminLiveSnapshot(since: Date | null) {
  const db = await getDb();
  // The database clock (not the app server's) is the reference: `updated_at` is set by a DB trigger.
  const [{ now }] = rowsOf<{ now: Date | string }>(await db.execute(sql`select clock_timestamp() as now`));
  const serverTime = new Date(now);
  // Small overlap protects against short transactions committing slightly after a poll.
  const changedFilter = since ? gt(orders.updatedAt, new Date(since.getTime() - 2000)) : inArray(orders.status, ACTIVE_KITCHEN_STATUSES);
  const [changedRows, counts, [{ unread }], latestNotifications, settings] = await Promise.all([
    db.select().from(orders).where(changedFilter).orderBy(desc(orders.updatedAt)).limit(100),
    db.select({ status: orders.status, n: count() }).from(orders).where(inArray(orders.status, ACTIVE_KITCHEN_STATUSES)).groupBy(orders.status),
    db.select({ unread: count() }).from(notifications).where(and(eq(notifications.audience, "ADMIN"), isNull(notifications.readAt))),
    since ? db.select().from(notifications).where(and(eq(notifications.audience, "ADMIN"), gt(notifications.createdAt, since))).orderBy(desc(notifications.createdAt)).limit(10) : Promise.resolve([]),
    // The shop-wide sound default (Settings → notifications) is only needed on the first poll.
    since ? Promise.resolve(null) : getBusinessSettings().catch(() => null),
  ]);
  const docs = await toOrderDocs(db, changedRows);
  return {
    serverTime: serverTime.toISOString(),
    orders: serialize(docs),
    counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) as Record<string, number>,
    unreadNotifications: Number(unread),
    newNotifications: serialize(latestNotifications),
    soundAlertsDefault: settings ? settings.notifications?.soundAlerts !== false : undefined,
  };
}
export type AdminLiveSnapshot = Awaited<ReturnType<typeof getAdminLiveSnapshot>>;

/** Kept for callers that import the field list (no longer needed with the SQL layer). */
export const ADMIN_ORDER_SUMMARY_FIELDS = "";
