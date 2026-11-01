/**
 * Pure, side-effect-free pricing logic. All amounts are integer paise.
 * The browser never supplies prices: callers pass product/group data loaded from MongoDB.
 */
import type { CouponType } from "@/constants/domain";
import type { CartItemInput } from "@/lib/validations/cart";
import { lineKey } from "./pricing-key";

export { lineKey };

export interface PricingProduct {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  categoryName?: string;
  categoryActive: boolean;
  price: number;
  discountedPrice?: number | null;
  isActive: boolean;
  isAvailable: boolean;
  isVeg: boolean;
  imageUrl?: string | null;
  preparationMinutes: number;
  customisationGroupIds: string[];
}

export interface PricingGroup {
  id: string;
  name: string;
  selectionType: "SINGLE" | "MULTIPLE";
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  isActive: boolean;
  options: { id: string; name: string; priceDelta: number; isAvailable: boolean }[];
}

export interface PricedLine {
  key: string;
  productId: string;
  categoryId: string;
  categoryName?: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  isVeg: boolean;
  listPrice: number;
  basePrice: number;
  customisationPerUnit: number;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  preparationMinutes: number;
  selections: { groupId: string; groupName: string; options: { optionId: string; name: string; priceDelta: number }[] }[];
  notes?: string;
}

export interface LineIssue {
  index: number;
  productId: string;
  message: string;
}

export function effectiveBasePrice(p: Pick<PricingProduct, "price" | "discountedPrice">): number {
  return p.discountedPrice != null && p.discountedPrice > 0 && p.discountedPrice < p.price ? p.discountedPrice : p.price;
}

/** Validate selections against the product's groups and compute line prices. */
export function priceLines(
  items: CartItemInput[],
  products: Map<string, PricingProduct>,
  groups: Map<string, PricingGroup>,
): { lines: PricedLine[]; issues: LineIssue[] } {
  const lines: PricedLine[] = [];
  const issues: LineIssue[] = [];

  items.forEach((item, index) => {
    const product = products.get(item.productId);
    if (!product || !product.isActive || !product.categoryActive) {
      issues.push({ index, productId: item.productId, message: "This item is no longer on the menu." });
      return;
    }
    if (!product.isAvailable) {
      issues.push({ index, productId: item.productId, message: `${product.name} is sold out right now.` });
      return;
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50) {
      issues.push({ index, productId: item.productId, message: "Invalid quantity." });
      return;
    }

    const allowedGroupIds = new Set(product.customisationGroupIds);
    const selectionByGroup = new Map<string, string[]>();
    for (const s of item.selections ?? []) {
      if (!allowedGroupIds.has(s.groupId)) {
        issues.push({ index, productId: item.productId, message: `Invalid customisation for ${product.name}.` });
        return;
      }
      if (selectionByGroup.has(s.groupId)) {
        issues.push({ index, productId: item.productId, message: `Duplicate customisation for ${product.name}.` });
        return;
      }
      selectionByGroup.set(s.groupId, [...new Set(s.optionIds)]);
    }

    const selections: PricedLine["selections"] = [];
    let customisationPerUnit = 0;
    for (const groupId of product.customisationGroupIds) {
      const group = groups.get(groupId);
      if (!group || !group.isActive) continue;
      const chosen = selectionByGroup.get(groupId) ?? [];
      const min = group.isRequired ? Math.max(1, group.minSelect) : group.minSelect;
      const max = group.selectionType === "SINGLE" ? 1 : group.maxSelect > 0 ? group.maxSelect : Infinity;
      if (chosen.length < min) {
        issues.push({ index, productId: item.productId, message: `Please choose ${group.name.toLowerCase()} for ${product.name}.` });
        return;
      }
      if (chosen.length > max) {
        issues.push({ index, productId: item.productId, message: `Too many options selected for ${group.name.toLowerCase()}.` });
        return;
      }
      const options: PricedLine["selections"][number]["options"] = [];
      for (const optionId of chosen) {
        const option = group.options.find((o) => o.id === optionId);
        if (!option) {
          issues.push({ index, productId: item.productId, message: `An option for ${product.name} is no longer offered.` });
          return;
        }
        if (!option.isAvailable) {
          issues.push({ index, productId: item.productId, message: `${option.name} is unavailable right now.` });
          return;
        }
        customisationPerUnit += option.priceDelta;
        options.push({ optionId: option.id, name: option.name, priceDelta: option.priceDelta });
      }
      if (options.length) selections.push({ groupId, groupName: group.name, options });
    }
    // Selections for groups that are inactive are silently dropped above; selections for groups
    // that exist but are inactive are not charged.

    const basePrice = effectiveBasePrice(product);
    const unitPrice = basePrice + customisationPerUnit;
    lines.push({
      key: lineKey(item),
      productId: product.id,
      categoryId: product.categoryId,
      categoryName: product.categoryName,
      name: product.name,
      slug: product.slug,
      imageUrl: product.imageUrl,
      isVeg: product.isVeg,
      listPrice: product.price,
      basePrice,
      customisationPerUnit,
      unitPrice,
      quantity: item.quantity,
      lineTotal: unitPrice * item.quantity,
      preparationMinutes: product.preparationMinutes,
      selections,
      notes: item.notes?.trim() || undefined,
    });
  });

  return { lines, issues };
}

export interface CouponRules {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  maxDiscount?: number | null;
  minOrderAmount?: number | null;
  applicableProductIds: string[];
  applicableCategoryIds: string[];
}

/** Discount for a coupon over priced lines. Assumes eligibility checks (dates, limits) already passed. */
export function computeCouponDiscount(coupon: CouponRules, lines: PricedLine[]): { discount: number; error?: string } {
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  if (coupon.minOrderAmount && subtotal < coupon.minOrderAmount) {
    return { discount: 0, error: `Add items worth ₹${Math.ceil((coupon.minOrderAmount - subtotal) / 100)} more to use ${coupon.code}.` };
  }
  const restricted = coupon.applicableProductIds.length > 0 || coupon.applicableCategoryIds.length > 0;
  const eligible = restricted
    ? lines
        .filter((l) => coupon.applicableProductIds.includes(l.productId) || coupon.applicableCategoryIds.includes(l.categoryId))
        .reduce((sum, l) => sum + l.lineTotal, 0)
    : subtotal;
  if (eligible <= 0) return { discount: 0, error: `${coupon.code} doesn't apply to the items in your cart.` };

  let discount = coupon.type === "PERCENT" ? Math.floor((eligible * coupon.value) / 10000) : coupon.value;
  if (coupon.maxDiscount != null && coupon.maxDiscount > 0) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(discount, eligible);
  return { discount: Math.max(0, discount) };
}

export interface TotalsInput {
  lines: PricedLine[];
  couponDiscount: number;
  deliveryFee: number;
  taxRateBps: number;
  taxInclusive: boolean;
}

export interface Totals {
  itemsSubtotal: number;
  productDiscount: number;
  customisationTotal: number;
  subtotal: number;
  couponDiscount: number;
  deliveryFee: number;
  taxRateBps: number;
  taxInclusive: boolean;
  tax: number;
  total: number;
}

export function computeTotals({ lines, couponDiscount, deliveryFee, taxRateBps, taxInclusive }: TotalsInput): Totals {
  const itemsSubtotal = lines.reduce((s, l) => s + l.listPrice * l.quantity, 0);
  const productDiscount = lines.reduce((s, l) => s + (l.listPrice - l.basePrice) * l.quantity, 0);
  const customisationTotal = lines.reduce((s, l) => s + l.customisationPerUnit * l.quantity, 0);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const discount = Math.min(Math.max(0, couponDiscount), subtotal);
  const taxable = subtotal - discount;
  const tax = taxRateBps > 0 ? (taxInclusive ? Math.round((taxable * taxRateBps) / (10000 + taxRateBps)) : Math.round((taxable * taxRateBps) / 10000)) : 0;
  const total = taxable + deliveryFee + (taxInclusive ? 0 : tax);
  return { itemsSubtotal, productDiscount, customisationTotal, subtotal, couponDiscount: discount, deliveryFee, taxRateBps, taxInclusive, tax, total };
}

export function computeDeliveryFee(opts: { fulfilment: "DELIVERY" | "PICKUP"; zoneFee: number; amountAfterDiscount: number; freeDeliveryThreshold: number }): number {
  if (opts.fulfilment === "PICKUP") return 0;
  if (opts.freeDeliveryThreshold > 0 && opts.amountAfterDiscount >= opts.freeDeliveryThreshold) return 0;
  return opts.zoneFee;
}
