import { asc, eq, inArray } from "drizzle-orm";
import { getDb, isUuid, schema, type BusinessSettingsDoc, type DbOrTx } from "@/db";
import type { CartItemInput } from "@/lib/validations/cart";
import type { FulfilmentType } from "@/constants/domain";
import { computeCouponDiscount, computeDeliveryFee, computeTotals, priceLines, type LineIssue, type PricedLine, type PricingGroup, type PricingProduct, type Totals } from "./pricing";
import { findEligibleCoupon, toCouponRules, type CouponRow } from "./coupon.service";
import { checkServiceability, type Serviceability } from "./delivery.service";
import { getBusinessSettings } from "./settings.service";

const { products, categories, customisationGroups, customisationOptions, productCustomisationGroups } = schema;

export interface QuoteRequest {
  items: CartItemInput[];
  fulfilment: FulfilmentType;
  pincode?: string;
  couponCode?: string;
  userId?: string | null;
  phone?: string | null;
}

export interface Quote {
  lines: PricedLine[];
  issues: LineIssue[];
  totals: Totals;
  coupon: { code: string; applied: boolean; message?: string; couponId?: string } | null;
  delivery: (Serviceability & { checked: boolean }) | null;
  minOrderAmount: number;
  meetsMinimum: boolean;
  estimatedPrepMinutes: number;
  estimatedDeliveryMinutes: number;
  blockingReasons: string[];
}

export async function loadPricingCatalog(productIds: string[], tx?: DbOrTx) {
  const q = tx ?? (await getDb());
  const ids = [...new Set(productIds)].filter(isUuid);
  const rows = ids.length
    ? await q
        .select({
          id: products.id,
          name: products.name,
          slug: products.slug,
          categoryId: products.categoryId,
          price: products.price,
          discountedPrice: products.discountedPrice,
          isActive: products.isActive,
          isAvailable: products.isAvailable,
          isVeg: products.isVeg,
          image: products.image,
          preparationMinutes: products.preparationMinutes,
          categoryName: categories.name,
          categoryActive: categories.isActive,
        })
        .from(products)
        .leftJoin(categories, eq(categories.id, products.categoryId))
        .where(inArray(products.id, ids))
    : [];
  const links = rows.length ? await q.select().from(productCustomisationGroups).where(inArray(productCustomisationGroups.productId, rows.map((r) => r.id))).orderBy(asc(productCustomisationGroups.position)) : [];
  const groupIds = [...new Set(links.map((l) => l.groupId))];
  const groups = groupIds.length ? await q.select().from(customisationGroups).where(inArray(customisationGroups.id, groupIds)) : [];
  const options = groupIds.length ? await q.select().from(customisationOptions).where(inArray(customisationOptions.groupId, groupIds)).orderBy(asc(customisationOptions.position)) : [];

  const productMap = new Map<string, PricingProduct>(
    rows.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        slug: p.slug,
        categoryId: p.categoryId,
        categoryName: p.categoryName ?? undefined,
        categoryActive: p.categoryActive === true,
        price: p.price,
        discountedPrice: p.discountedPrice,
        isActive: p.isActive !== false,
        isAvailable: p.isAvailable !== false,
        isVeg: p.isVeg,
        imageUrl: p.image?.url,
        preparationMinutes: p.preparationMinutes ?? 15,
        customisationGroupIds: links.filter((l) => l.productId === p.id).map((l) => l.groupId),
      },
    ]),
  );
  const groupMap = new Map<string, PricingGroup>(
    groups.map((g) => [
      g.id,
      {
        id: g.id,
        name: g.name,
        selectionType: g.selectionType,
        isRequired: !!g.isRequired,
        minSelect: g.minSelect ?? 0,
        maxSelect: g.maxSelect ?? 0,
        isActive: g.isActive !== false,
        options: options.filter((o) => o.groupId === g.id).map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDelta ?? 0, isAvailable: o.isAvailable !== false })),
      },
    ]),
  );
  return { productMap, groupMap };
}

/**
 * Builds an authoritative price quote from database data. Used for cart previews and,
 * inside the checkout transaction, for the final order amounts.
 */
export async function buildQuote(req: QuoteRequest, opts: { tx?: DbOrTx; settings?: BusinessSettingsDoc; now?: Date } = {}): Promise<Quote & { couponDoc?: CouponRow }> {
  const settings = opts.settings ?? (await getBusinessSettings(opts.tx));
  const { productMap, groupMap } = await loadPricingCatalog(req.items.map((i) => i.productId), opts.tx);
  const { lines, issues } = priceLines(req.items, productMap, groupMap);
  const blockingReasons: string[] = issues.map((i) => i.message);

  // Coupon
  let couponDiscount = 0;
  let coupon: Quote["coupon"] = null;
  let couponDoc: CouponRow | undefined;
  if (req.couponCode) {
    const eligible = await findEligibleCoupon(req.couponCode, { userId: req.userId, phone: req.phone }, opts.now, opts.tx);
    if (eligible.error || !eligible.coupon) {
      coupon = { code: req.couponCode.toUpperCase(), applied: false, message: eligible.error };
    } else {
      const result = computeCouponDiscount(toCouponRules(eligible.coupon), lines);
      if (result.error || result.discount <= 0) coupon = { code: eligible.coupon.code, applied: false, message: result.error ?? "Coupon not applicable." };
      else {
        couponDiscount = result.discount;
        couponDoc = eligible.coupon;
        coupon = { code: eligible.coupon.code, applied: true, couponId: eligible.coupon.id, message: eligible.coupon.description ?? undefined };
      }
    }
  }

  // Delivery
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  let delivery: Quote["delivery"] = null;
  let zoneFee = 0;
  let minOrderAmount = settings.delivery?.minOrderAmount ?? 0;
  let estimatedDeliveryMinutes = settings.delivery?.estimatedDeliveryMinutes ?? 30;
  if (req.fulfilment === "PICKUP") {
    if (!settings.delivery?.pickupEnabled) blockingReasons.push("Pickup isn't available right now.");
    minOrderAmount = 0;
    estimatedDeliveryMinutes = 0;
  } else if (req.pincode) {
    const s = await checkServiceability(req.pincode, settings, opts.tx);
    delivery = { ...s, checked: true };
    if (!s.serviceable) blockingReasons.push(s.reason ?? "We can't deliver to this address.");
    zoneFee = s.deliveryFee;
    minOrderAmount = s.minOrderAmount;
    estimatedDeliveryMinutes = s.estimatedMinutes;
  } else {
    zoneFee = settings.delivery?.defaultFee ?? 0;
  }

  const deliveryFee = computeDeliveryFee({
    fulfilment: req.fulfilment,
    zoneFee,
    amountAfterDiscount: subtotal - couponDiscount,
    freeDeliveryThreshold: settings.delivery?.freeDeliveryThreshold ?? 0,
  });
  const totals = computeTotals({
    lines,
    couponDiscount,
    deliveryFee,
    taxRateBps: settings.tax?.rateBps ?? 0,
    taxInclusive: settings.tax?.inclusive ?? true,
  });

  const meetsMinimum = subtotal >= minOrderAmount;
  if (!meetsMinimum && lines.length) blockingReasons.push(`Minimum order for delivery is ₹${Math.ceil(minOrderAmount / 100)}.`);
  if (!lines.length && !issues.length) blockingReasons.push("Your cart is empty.");

  const estimatedPrepMinutes = lines.length ? Math.max(...lines.map((l) => l.preparationMinutes)) + Math.min(15, Math.max(0, lines.length - 1) * 3) : 0;

  return { lines, issues, totals, coupon, couponDoc, delivery, minOrderAmount, meetsMinimum, estimatedPrepMinutes, estimatedDeliveryMinutes, blockingReasons };
}
