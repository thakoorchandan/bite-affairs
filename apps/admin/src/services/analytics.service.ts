import { and, desc, getDb, gte, inArray, isNull, lt, not, notInArray, or, schema, sql, countAll, sumInt, isUuid } from "@/db";
import { addDaysToDateKey, DEFAULT_TIMEZONE, getZonedParts, toDateKey, zonedDayRange } from "@/lib/utilities/time";
import type { OrderStatus } from "@/constants/domain";
import { getBusinessHours, getBusinessSettings } from "@/services/settings.service";

const { orders, orderItems, deliveryZones } = schema;

/** Orders that count as sales (excludes cancelled, rejected and never-paid online orders). */
export const NON_SALE_STATUSES: OrderStatus[] = ["CANCELLED", "REJECTED", "AWAITING_PAYMENT"];

export const DATE_PRESETS = ["today", "yesterday", "7d", "30d", "month", "custom"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];
export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
  custom: "Custom range",
};

export interface DateRange {
  preset: DatePreset;
  start: Date;
  end: Date;
  fromKey: string;
  toKey: string; // inclusive
  label: string;
  timezone: string;
}

const isDateKey = (v?: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Resolve a preset or custom range to UTC boundaries in the business timezone. */
export function resolveDateRange(input: { preset?: string | null; from?: string | null; to?: string | null }, now = new Date(), timezone = DEFAULT_TIMEZONE): DateRange {
  const preset = (DATE_PRESETS as readonly string[]).includes(input.preset ?? "") ? (input.preset as DatePreset) : "today";
  const todayKey = toDateKey(getZonedParts(now, timezone));
  const keyOffset = (n: number) => toDateKey(addDaysToDateKey(todayKey, n));
  let fromKey = todayKey;
  let toKey = todayKey;
  switch (preset) {
    case "yesterday":
      fromKey = toKey = keyOffset(-1);
      break;
    case "7d":
      fromKey = keyOffset(-6);
      break;
    case "30d":
      fromKey = keyOffset(-29);
      break;
    case "month":
      fromKey = `${todayKey.slice(0, 8)}01`;
      break;
    case "custom":
      if (isDateKey(input.from) && isDateKey(input.to)) {
        fromKey = input.from! <= input.to! ? input.from! : input.to!;
        toKey = input.from! <= input.to! ? input.to! : input.from!;
      } else if (isDateKey(input.from)) fromKey = toKey = input.from!;
      break;
  }
  // Cap custom ranges to one year to keep aggregations cheap on the free tier.
  if (preset === "custom") {
    const maxFrom = toDateKey(addDaysToDateKey(toKey, -366));
    if (fromKey < maxFrom) fromKey = maxFrom;
  }
  const start = zonedDayRange(fromKey, timezone).start;
  const end = zonedDayRange(toKey, timezone).end;
  const label = preset === "custom" ? (fromKey === toKey ? fromKey : `${fromKey} → ${toKey}`) : DATE_PRESET_LABELS[preset];
  return { preset, start, end, fromKey, toKey, label, timezone };
}

/** Every calendar day key in the range (for zero-filled charts). */
export function dayKeysInRange(range: DateRange): string[] {
  const keys: string[] = [];
  let k = range.fromKey;
  for (let i = 0; i < 400 && k <= range.toKey; i++) {
    keys.push(k);
    k = toDateKey(addDaysToDateKey(k, 1));
  }
  return keys;
}

interface Totals {
  orders: number;
  revenue: number;
  collected: number;
  discounts: number;
  deliveryFees: number;
}

/** A timezone name as a SQL literal. Inlined (not a bind parameter) so `GROUP BY` can match the selected expression. */
export function tzLiteral(tz: string) {
  if (!/^[A-Za-z0-9_+\-/]+$/.test(tz)) throw new Error(`Invalid timezone: ${tz}`);
  return sql.raw(`'${tz}'`);
}

const saleOnly = () => notInArray(orders.status, NON_SALE_STATUSES);
const within = (range: DateRange) => and(gte(orders.createdAt, range.start), lt(orders.createdAt, range.end));

export async function getDashboardMetrics(range: DateRange) {
  const db = await getDb();
  const tz = tzLiteral(range.timezone);
  const inRange = within(range);
  const sale = saleOnly();
  const day = sql<string>`to_char(${orders.createdAt} at time zone ${tz}, 'YYYY-MM-DD')`;
  const customerKey = sql<string>`coalesce(${orders.userId}::text, ${orders.customerPhone})`;

  const [byStatus, [totalsRow], byDay, products, categories, customers] = await Promise.all([
    db.select({ status: orders.status, n: countAll() }).from(orders).where(inRange).groupBy(orders.status),
    db
      .select({
        orders: countAll(),
        revenue: sumInt(orders.total),
        collected: sumInt(sql`case when ${orders.paymentStatus} = 'PAID' then coalesce(${orders.codAmountCollected}, ${orders.total}) else 0 end`),
        discounts: sumInt(sql`${orders.couponDiscount} + ${orders.productDiscount}`),
        deliveryFees: sumInt(orders.deliveryFee),
      })
      .from(orders)
      .where(and(inRange, sale)),
    db.select({ day, revenue: sumInt(orders.total), orders: countAll() }).from(orders).where(and(inRange, sale)).groupBy(day),
    db
      .select({ productId: orderItems.productId, name: orderItems.name, qty: sumInt(orderItems.quantity), revenue: sumInt(orderItems.lineTotal) })
      .from(orderItems)
      .innerJoin(orders, sql`${orders.id} = ${orderItems.orderId}`)
      .where(and(inRange, sale))
      .groupBy(orderItems.productId, orderItems.name)
      .orderBy(desc(sql`sum(${orderItems.quantity})`), desc(sql`sum(${orderItems.lineTotal})`))
      .limit(6),
    db
      .select({ name: orderItems.categoryName, qty: sumInt(orderItems.quantity), revenue: sumInt(orderItems.lineTotal) })
      .from(orderItems)
      .innerJoin(orders, sql`${orders.id} = ${orderItems.orderId}`)
      .where(and(inRange, sale))
      .groupBy(orderItems.categoryName)
      .orderBy(desc(sql`sum(${orderItems.lineTotal})`))
      .limit(6),
    db
      .select({ key: customerKey, registered: sql<boolean>`bool_or(${orders.userId} is not null)` })
      .from(orders)
      .where(and(inRange, sale))
      .groupBy(customerKey),
  ]);

  const status = Object.fromEntries(byStatus.map((s) => [s.status, s.n])) as Record<string, number>;
  const totals: Totals = totalsRow ?? { orders: 0, revenue: 0, collected: 0, discounts: 0, deliveryFees: 0 };

  // New vs returning: a customer is "returning" if they had a sale order before the range.
  const keys = customers.map((c) => c.key);
  let returning = 0;
  if (keys.length) {
    const userIds = keys.filter(isUuid);
    const phones = keys.filter((k) => !isUuid(k));
    const conditions = [
      ...(userIds.length ? [inArray(orders.userId, userIds)] : []),
      ...(phones.length ? [and(inArray(orders.customerPhone, phones), isNull(orders.userId))] : []),
    ];
    const prior = await db
      .selectDistinct({ key: customerKey })
      .from(orders)
      .where(and(lt(orders.createdAt, range.start), sale, or(...conditions)));
    returning = prior.length;
  }

  const dayMap = new Map(byDay.map((d) => [d.day, d]));
  const trend = dayKeysInRange(range).map((k) => ({ day: k, revenue: dayMap.get(k)?.revenue ?? 0, orders: dayMap.get(k)?.orders ?? 0 }));

  return {
    range: { label: range.label, fromKey: range.fromKey, toKey: range.toKey, preset: range.preset },
    kpis: {
      orders: totals.orders,
      revenue: totals.revenue,
      collected: totals.collected,
      discounts: totals.discounts,
      deliveryFees: totals.deliveryFees,
      aov: totals.orders ? Math.round(totals.revenue / totals.orders) : 0,
      completed: status.DELIVERED ?? 0,
      pending: status.PLACED ?? 0,
      confirmed: status.CONFIRMED ?? 0,
      preparing: status.PREPARING ?? 0,
      ready: status.READY ?? 0,
      outForDelivery: status.OUT_FOR_DELIVERY ?? 0,
      cancelled: (status.CANCELLED ?? 0) + (status.REJECTED ?? 0),
    },
    trend,
    popularProducts: products.map((p) => ({ productId: p.productId, name: p.name, qty: p.qty, revenue: p.revenue })),
    topCategories: categories.map((c) => ({ name: c.name ?? "Uncategorised", qty: c.qty, revenue: c.revenue })),
    customers: {
      unique: keys.length,
      returning,
      new: keys.length - returning,
      registered: customers.filter((c) => c.registered).length,
      guest: customers.filter((c) => !c.registered).length,
    },
  };
}
export type DashboardMetrics = Awaited<ReturnType<typeof getDashboardMetrics>>;

export async function getDeepAnalytics(range: DateRange) {
  const db = await getDb();
  const tz = tzLiteral(range.timezone);
  const inRange = within(range);
  const sale = saleOnly();
  const day = sql<string>`to_char(${orders.createdAt} at time zone ${tz}, 'YYYY-MM-DD')`;
  const dow = sql<number>`extract(dow from ${orders.createdAt} at time zone ${tz})`.mapWith(Number);
  const hour = sql<number>`extract(hour from ${orders.createdAt} at time zone ${tz})`.mapWith(Number);

  const [byStatus, byDay, products, categories, heat, payment, fulfilment, coupons] = await Promise.all([
    db.select({ status: orders.status, n: countAll(), value: sumInt(orders.total) }).from(orders).where(inRange).groupBy(orders.status),
    db.select({ day, revenue: sumInt(orders.total), orders: countAll() }).from(orders).where(and(inRange, sale)).groupBy(day),
    db
      .select({
        productId: orderItems.productId,
        name: orderItems.name,
        category: sql<string | null>`max(${orderItems.categoryName})`,
        qty: sumInt(orderItems.quantity),
        revenue: sumInt(orderItems.lineTotal),
        orders: countAll(),
      })
      .from(orderItems)
      .innerJoin(orders, sql`${orders.id} = ${orderItems.orderId}`)
      .where(and(inRange, sale))
      .groupBy(orderItems.productId, orderItems.name)
      .orderBy(desc(sql`sum(${orderItems.lineTotal})`))
      .limit(25),
    db
      .select({
        name: orderItems.categoryName,
        qty: sumInt(orderItems.quantity),
        revenue: sumInt(orderItems.lineTotal),
        orders: sql<number>`count(distinct ${orderItems.orderId})`.mapWith(Number),
      })
      .from(orderItems)
      .innerJoin(orders, sql`${orders.id} = ${orderItems.orderId}`)
      .where(and(inRange, sale))
      .groupBy(orderItems.categoryName)
      .orderBy(desc(sql`sum(${orderItems.lineTotal})`)),
    db.select({ dow, hour, n: countAll() }).from(orders).where(and(inRange, sale)).groupBy(dow, hour),
    db.select({ key: orders.paymentMethod, n: countAll(), revenue: sumInt(orders.total) }).from(orders).where(and(inRange, sale)).groupBy(orders.paymentMethod),
    db.select({ key: orders.fulfilment, n: countAll(), revenue: sumInt(orders.total) }).from(orders).where(and(inRange, sale)).groupBy(orders.fulfilment),
    db
      .select({ code: orders.couponCode, n: countAll(), discount: sumInt(orders.couponDiscount), revenue: sumInt(orders.total) })
      .from(orders)
      .where(and(inRange, sale, not(isNull(orders.couponCode))))
      .groupBy(orders.couponCode)
      .orderBy(desc(countAll())),
  ]);

  const dayMap = new Map(byDay.map((d) => [d.day, d]));
  // Postgres extract(dow): 0 = Sunday … 6 = Saturday.
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const h of heat) heatmap[h.dow][h.hour] = h.n;

  return {
    range: { label: range.label, fromKey: range.fromKey, toKey: range.toKey, preset: range.preset },
    trend: dayKeysInRange(range).map((k) => ({ day: k, revenue: dayMap.get(k)?.revenue ?? 0, orders: dayMap.get(k)?.orders ?? 0 })),
    byStatus: byStatus.map((s) => ({ status: s.status as string, count: s.n, value: s.value })).sort((a, b) => b.count - a.count),
    products: products.map((p) => ({ productId: p.productId, name: p.name, category: p.category ?? "", qty: p.qty, revenue: p.revenue, orders: p.orders })),
    categories: categories.map((c) => ({ name: c.name ?? "Uncategorised", qty: c.qty, revenue: c.revenue, orders: c.orders })),
    heatmap,
    payment: payment.map((p) => ({ key: p.key as string, count: p.n, revenue: p.revenue })),
    fulfilment: fulfilment.map((p) => ({ key: p.key as string, count: p.n, revenue: p.revenue })),
    coupons: coupons.map((c) => ({ code: c.code as string, count: c.n, discount: c.discount, revenue: c.revenue })),
  };
}
export type DeepAnalytics = Awaited<ReturnType<typeof getDeepAnalytics>>;

/** Items the owner still needs to configure before taking real orders. */
export async function getSetupChecklist() {
  const db = await getDb();
  const [settings, hours, [zones]] = await Promise.all([
    getBusinessSettings(),
    getBusinessHours(),
    db.select({ n: countAll() }).from(deliveryZones).where(sql`${deliveryZones.isActive}`),
  ]);
  const hoursEdited = new Date(hours.updatedAt).getTime() - new Date(hours.createdAt).getTime() > 1000;
  return [
    { key: "zones", label: "Add serviceable delivery PIN codes", done: (zones?.n ?? 0) > 0 || settings.delivery.enabled === false, href: "/delivery-settings" },
    { key: "phone", label: "Add the kitchen contact phone number", done: !!settings.contactPhone, href: "/settings" },
    { key: "cloudinary", label: "Connect Cloudinary for food photos & videos", done: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET), href: "/media" },
    { key: "hours", label: "Confirm your business hours", done: hoursEdited, href: "/business-hours" },
  ];
}
