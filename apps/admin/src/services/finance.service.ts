/**
 * Expenses and profit reporting. Revenue comes from delivered orders; product costs are
 * ESTIMATES (admin-entered per-product costs captured on each order item at order time,
 * falling back to the current cost sheet); expenses are ACTUAL recorded amounts.
 * These figures are management estimates, not audited accounts.
 */
import { and, desc, eq, getDb, gte, isUuid, lt, schema, sql, countAll, sumInt } from "@/db";
import type { SQL } from "drizzle-orm";
import { tzLiteral } from "./analytics.service";
import { AppError, notFound } from "@/lib/utilities/errors";
import { serialize } from "@/lib/utilities/serialize";
import { DEFAULT_TIMEZONE, addDaysToDateKey, getZonedParts, toDateKey, zonedDayRange, zonedTimeToUtc } from "@/lib/utilities/time";
import { dateRangeSchema, expenseInputSchema, type ExpenseFormInput } from "@/lib/validations/admin";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/constants/domain";

const TZ = DEFAULT_TIMEZONE;
const { expenses, orders, orderItems, productCosts } = schema;

export function rangeToUtc(from: string, to: string) {
  dateRangeSchema.parse({ from, to });
  return { start: zonedDayRange(from, TZ).start, end: zonedDayRange(to, TZ).end };
}

export function defaultRange(now = new Date()) {
  const today = getZonedParts(now, TZ);
  const to = toDateKey(today);
  const from = toDateKey({ year: today.year, month: today.month, day: 1 });
  return { from, to };
}

// ─── Expenses ──────────────────────────────────────────────────────────────

function incurredOnDate(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  // Store at noon business time so the calendar day is unambiguous in any timezone view.
  return zonedTimeToUtc(y, m, d, 12, 0, TZ);
}

export async function listExpenses(opts: { from: string; to: string; category?: string }) {
  const { start, end } = rangeToUtc(opts.from, opts.to);
  const db = await getDb();
  const conditions: (SQL | undefined)[] = [gte(expenses.incurredOn, start), lt(expenses.incurredOn, end)];
  if (opts.category && (EXPENSE_CATEGORIES as readonly string[]).includes(opts.category)) conditions.push(eq(expenses.category, opts.category as ExpenseCategory));
  const rows = await db.select().from(expenses).where(and(...conditions)).orderBy(desc(expenses.incurredOn), desc(expenses.createdAt)).limit(1000);
  return serialize(rows).map((r) => ({ ...r, incurredOnKey: toDateKey(getZonedParts(new Date(r.incurredOn), TZ)) }));
}
export type ExpenseRow = Awaited<ReturnType<typeof listExpenses>>[number];

export async function saveExpense(id: string | null, input: ExpenseFormInput, recordedBy?: string) {
  const d = expenseInputSchema.parse(input);
  const db = await getDb();
  const fields = {
    category: d.category,
    amount: d.amount,
    incurredOn: incurredOnDate(d.incurredOn),
    vendor: d.vendor || null,
    paymentMode: d.paymentMode,
    description: d.description || null,
  };
  if (id) {
    if (!isUuid(id)) throw notFound("Expense");
    const [res] = await db.update(expenses).set(fields).where(eq(expenses.id, id)).returning({ id: expenses.id, amount: expenses.amount });
    if (!res) throw notFound("Expense");
    return res;
  }
  const [created] = await db
    .insert(expenses)
    .values({ ...fields, recordedBy: recordedBy && isUuid(recordedBy) ? recordedBy : null })
    .returning({ id: expenses.id, amount: expenses.amount });
  return created;
}

export async function deleteExpense(id: string) {
  if (!isUuid(id)) throw notFound("Expense");
  const db = await getDb();
  const [res] = await db.delete(expenses).where(eq(expenses.id, id)).returning({ amount: expenses.amount, category: expenses.category });
  if (!res) throw notFound("Expense");
  return res;
}

// ─── Profit report ─────────────────────────────────────────────────────────

export interface ProfitReport {
  range: { from: string; to: string };
  orders: number;
  /** Food sales at list price incl. customisations, before any discount. */
  grossRevenue: number;
  productDiscounts: number;
  couponDiscounts: number;
  deliveryRevenue: number;
  taxCollected: number;
  /** Excludes tax collected on top of prices (exclusive tax). */
  netSales: number;
  totalCollected: number;
  estimatedProductCost: number;
  /** Units sold without any cost data — the estimate understates cost by these. */
  unitsWithoutCost: number;
  unitsSold: number;
  recordedExpenses: number;
  expensesByCategory: Record<ExpenseCategory, number>;
  /** netSales − estimatedProductCost. */
  estimatedGrossProfit: number;
  /** netSales − recorded expenses (actual cash view). */
  netOperatingResult: number;
  /** estimatedGrossProfit − recorded overheads that product costs don't already cover. */
  estimatedNetAfterOverheads: number;
  daily: { date: string; orders: number; netSales: number; expenses: number }[];
}

/** Categories assumed to be covered by per-product cost estimates (avoids double counting). */
const PRODUCT_COST_CATEGORIES: ExpenseCategory[] = ["RAW_MATERIALS", "PACKAGING"];

export async function getProfitReport(from: string, to: string): Promise<ProfitReport> {
  const { start, end } = rangeToUtc(from, to);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (days > 400) throw new AppError("Choose a range of 400 days or less.");
  const db = await getDb();
  const tz = tzLiteral(TZ);
  const delivered = and(eq(orders.status, "DELIVERED"), gte(orders.createdAt, start), lt(orders.createdAt, end));
  const day = sql<string>`to_char(${orders.createdAt} at time zone ${tz}, 'YYYY-MM-DD')`;
  const expenseDay = sql<string>`to_char(${expenses.incurredOn} at time zone ${tz}, 'YYYY-MM-DD')`;
  const taxExclusive = sumInt(sql`case when ${orders.taxInclusive} = false then ${orders.tax} else 0 end`);
  const inExpenseRange = and(gte(expenses.incurredOn, start), lt(expenses.incurredOn, end));

  const [[totalsRow], itemsAgg, dailyAgg, expenseAgg, dailyExpenseAgg, costs] = await Promise.all([
    db
      .select({
        orders: countAll(),
        items: sumInt(orders.itemsSubtotal),
        custom: sumInt(orders.customisationTotal),
        productDiscount: sumInt(orders.productDiscount),
        coupon: sumInt(orders.couponDiscount),
        delivery: sumInt(orders.deliveryFee),
        tax: sumInt(orders.tax),
        taxExclusive,
        total: sumInt(orders.total),
      })
      .from(orders)
      .where(delivered),
    db
      .select({
        productId: orderItems.productId,
        hasCost: sql<boolean>`${orderItems.estimatedUnitCost} is not null`,
        qty: sumInt(orderItems.quantity),
        cost: sumInt(sql`${orderItems.quantity} * coalesce(${orderItems.estimatedUnitCost}, 0)`),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(delivered)
      .groupBy(orderItems.productId, sql`${orderItems.estimatedUnitCost} is not null`),
    db.select({ day, orders: countAll(), total: sumInt(orders.total), taxExclusive }).from(orders).where(delivered).groupBy(day),
    db.select({ category: expenses.category, amount: sumInt(expenses.amount) }).from(expenses).where(inExpenseRange).groupBy(expenses.category),
    db.select({ day: expenseDay, amount: sumInt(expenses.amount) }).from(expenses).where(inExpenseRange).groupBy(expenseDay),
    db.select().from(productCosts),
  ]);

  const t = totalsRow ?? { orders: 0, items: 0, custom: 0, productDiscount: 0, coupon: 0, delivery: 0, tax: 0, taxExclusive: 0, total: 0 };
  const currentCost = new Map(costs.map((c) => [c.productId, c.ingredientCost + c.packagingCost + c.preparationCost + c.otherCost]));
  let estimatedProductCost = 0;
  let unitsWithoutCost = 0;
  let unitsSold = 0;
  for (const row of itemsAgg) {
    unitsSold += row.qty;
    if (row.hasCost) estimatedProductCost += row.cost;
    else {
      const fallback = currentCost.get(row.productId ?? "");
      if (fallback && fallback > 0) estimatedProductCost += fallback * row.qty;
      else unitsWithoutCost += row.qty;
    }
  }

  const expensesByCategory = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, 0])) as Record<ExpenseCategory, number>;
  for (const e of expenseAgg) expensesByCategory[e.category] = e.amount;
  const recordedExpenses = Object.values(expensesByCategory).reduce((a, b) => a + b, 0);
  const overheads = recordedExpenses - PRODUCT_COST_CATEGORIES.reduce((s, c) => s + expensesByCategory[c], 0);

  const grossRevenue = t.items + t.custom;
  const netSales = t.total - t.taxExclusive;
  const estimatedGrossProfit = netSales - estimatedProductCost;

  const dailyMap = new Map(dailyAgg.map((d) => [d.day, d]));
  const expMap = new Map(dailyExpenseAgg.map((d) => [d.day, d.amount]));
  const daily: ProfitReport["daily"] = [];
  for (let i = 0; i < Math.min(days, 400); i++) {
    const k = toDateKey(addDaysToDateKey(from, i));
    if (k > to) break;
    const d = dailyMap.get(k);
    daily.push({ date: k, orders: d?.orders ?? 0, netSales: d ? d.total - d.taxExclusive : 0, expenses: expMap.get(k) ?? 0 });
  }

  return {
    range: { from, to },
    orders: t.orders,
    grossRevenue,
    productDiscounts: t.productDiscount,
    couponDiscounts: t.coupon,
    deliveryRevenue: t.delivery,
    taxCollected: t.tax,
    netSales,
    totalCollected: t.total,
    estimatedProductCost,
    unitsWithoutCost,
    unitsSold,
    recordedExpenses,
    expensesByCategory,
    estimatedGrossProfit,
    netOperatingResult: netSales - recordedExpenses,
    estimatedNetAfterOverheads: estimatedGrossProfit - overheads,
    daily,
  };
}

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
const rs = (paise: number) => (paise / 100).toFixed(2);

export async function buildFinanceCsv(from: string, to: string): Promise<string> {
  const [report, expenses] = await Promise.all([getProfitReport(from, to), listExpenses({ from, to })]);
  const lines: (string | number)[][] = [
    ["Bite Affairs — profit report (management estimate, not audited accounts)"],
    ["Period", `${from} to ${to}`],
    [],
    ["Metric", "Amount (INR)", "Basis"],
    ["Delivered orders", report.orders, "count"],
    ["Gross revenue (food at list price)", rs(report.grossRevenue), "actual"],
    ["Product discounts", rs(report.productDiscounts), "actual"],
    ["Coupon discounts", rs(report.couponDiscounts), "actual"],
    ["Delivery revenue", rs(report.deliveryRevenue), "actual"],
    ["Tax collected", rs(report.taxCollected), "actual"],
    ["Net sales (ex. exclusive tax)", rs(report.netSales), "actual"],
    ["Estimated product cost", rs(report.estimatedProductCost), "ESTIMATED"],
    ["Units sold without cost data", report.unitsWithoutCost, "count"],
    ["Recorded expenses", rs(report.recordedExpenses), "actual"],
    ["Estimated gross profit", rs(report.estimatedGrossProfit), "ESTIMATED"],
    ["Net operating result (net sales − recorded expenses)", rs(report.netOperatingResult), "actual"],
    [],
    ["Daily", "Orders", "Net sales (INR)", "Expenses (INR)"],
    ...report.daily.map((d) => [d.date, d.orders, rs(d.netSales), rs(d.expenses)]),
    [],
    ["Expenses", "Category", "Amount (INR)", "Vendor", "Payment mode", "Description"],
    ...expenses.map((e) => [e.incurredOnKey, e.category, rs(e.amount), e.vendor ?? "", e.paymentMode ?? "", e.description ?? ""]),
  ];
  return lines.map((row) => row.map(csvCell).join(",")).join("\n");
}
