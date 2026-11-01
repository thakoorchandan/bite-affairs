import { and, count, eq, gt, inArray, notInArray, or, sql } from "drizzle-orm";
import { getDb, schema, withTransaction, type DbOrTx } from "@/db";
import type { CouponRules } from "./pricing";

const { coupons, couponRedemptions, orders } = schema;

export type CouponRow = typeof coupons.$inferSelect;

export interface CouponCustomer {
  userId?: string | null;
  phone?: string | null;
}

export function toCouponRules(c: CouponRow): CouponRules {
  return {
    id: c.id,
    code: c.code,
    type: c.type,
    value: c.value,
    maxDiscount: c.maxDiscount,
    minOrderAmount: c.minOrderAmount,
    applicableProductIds: c.applicableProductIds ?? [],
    applicableCategoryIds: c.applicableCategoryIds ?? [],
  };
}

/**
 * Checks everything about a coupon except the amount: existence, active flag, validity
 * window, global usage limit, per-customer limit and first-order restriction.
 */
export async function findEligibleCoupon(code: string, customer: CouponCustomer, now = new Date(), tx?: DbOrTx): Promise<{ coupon?: CouponRow; error?: string }> {
  const normalised = code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,24}$/.test(normalised)) return { error: "That coupon code isn't valid." };
  const q = tx ?? (await getDb());
  const [coupon] = await q.select().from(coupons).where(eq(coupons.code, normalised)).limit(1);
  if (!coupon || !coupon.isActive) return { error: "That coupon code isn't valid." };
  if (coupon.startsAt && now < coupon.startsAt) return { error: "This coupon isn't active yet." };
  if (coupon.endsAt && now > coupon.endsAt) return { error: "This coupon has expired." };
  if (coupon.usageLimit != null && coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) return { error: "This coupon has been fully redeemed." };

  if (coupon.perCustomerLimit && coupon.perCustomerLimit > 0) {
    const identity = [customer.userId ? eq(couponRedemptions.userId, customer.userId) : undefined, customer.phone ? eq(couponRedemptions.customerKey, `phone:${customer.phone}`) : undefined].filter((x) => !!x);
    if (identity.length === 0) return { coupon }; // checked again at checkout once the phone is known
    const [{ n }] = await q
      .select({ n: count() })
      .from(couponRedemptions)
      .where(and(eq(couponRedemptions.couponId, coupon.id), eq(couponRedemptions.released, false), or(...identity)));
    if (Number(n) >= coupon.perCustomerLimit) return { error: "You've already used this coupon." };
  }

  if (coupon.firstOrderOnly) {
    const identity = [customer.userId ? eq(orders.userId, customer.userId) : undefined, customer.phone ? eq(orders.customerPhone, customer.phone) : undefined].filter((x) => !!x);
    if (identity.length) {
      const [previous] = await q
        .select({ id: orders.id })
        .from(orders)
        .where(and(or(...identity), notInArray(orders.status, ["CANCELLED", "REJECTED", "AWAITING_PAYMENT"])))
        .limit(1);
      if (previous) return { error: "This coupon is only valid on your first order." };
    }
  }
  return { coupon };
}

/**
 * Atomically consumes one use of a coupon inside the checkout transaction. The conditional
 * update guarantees `usedCount` never exceeds `usageLimit` even under concurrent checkouts.
 */
export async function consumeCoupon(couponId: string, tx: DbOrTx): Promise<boolean> {
  const res = await tx
    .update(coupons)
    .set({ usedCount: sql`${coupons.usedCount} + 1` })
    .where(and(eq(coupons.id, couponId), eq(coupons.isActive, true), or(sql`${coupons.usageLimit} is null`, eq(coupons.usageLimit, 0), sql`${coupons.usedCount} < ${coupons.usageLimit}`)))
    .returning({ id: coupons.id });
  return res.length === 1;
}

/** Return a coupon use when an order is rejected or cancelled. Idempotent per order. */
export async function releaseCouponForOrder(orderId: string, tx?: DbOrTx) {
  const run = async (q: DbOrTx) => {
    const released = await q.update(couponRedemptions).set({ released: true }).where(and(eq(couponRedemptions.orderId, orderId), eq(couponRedemptions.released, false))).returning({ couponId: couponRedemptions.couponId });
    if (released.length) {
      await q.update(coupons).set({ usedCount: sql`${coupons.usedCount} - 1` }).where(and(inArray(coupons.id, released.map((r) => r.couponId)), gt(coupons.usedCount, 0)));
    }
  };
  if (tx) await run(tx);
  else await withTransaction(run);
}
