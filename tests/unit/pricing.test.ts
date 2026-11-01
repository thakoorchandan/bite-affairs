import { describe, expect, it } from "vitest";
import { computeCouponDiscount, computeDeliveryFee, computeTotals, priceLines, type PricingGroup, type PricingProduct } from "@/services/pricing";

const P = (over: Partial<PricingProduct> = {}): PricingProduct => ({
  id: "p1",
  name: "Margaretta Pizza",
  slug: "margaretta-pizza",
  categoryId: "c1",
  categoryActive: true,
  price: 19100,
  discountedPrice: null,
  isActive: true,
  isAvailable: true,
  isVeg: true,
  preparationMinutes: 15,
  customisationGroupIds: ["g1", "g2"],
  ...over,
});
const groups = new Map<string, PricingGroup>([
  ["g1", { id: "g1", name: "Size", selectionType: "SINGLE", isRequired: true, minSelect: 1, maxSelect: 1, isActive: true, options: [
    { id: "o-reg", name: "Regular", priceDelta: 0, isAvailable: true },
    { id: "o-lg", name: "Large", priceDelta: 8000, isAvailable: true },
  ] }],
  ["g2", { id: "g2", name: "Extra toppings", selectionType: "MULTIPLE", isRequired: false, minSelect: 0, maxSelect: 2, isActive: true, options: [
    { id: "o-cheese", name: "Extra cheese", priceDelta: 3000, isAvailable: true },
    { id: "o-corn", name: "Corn", priceDelta: 2000, isAvailable: true },
    { id: "o-olive", name: "Olives", priceDelta: 2500, isAvailable: false },
  ] }],
]);

describe("priceLines", () => {
  it("prices base + customisations using database prices", () => {
    const { lines, issues } = priceLines(
      [{ productId: "p1", quantity: 2, selections: [{ groupId: "g1", optionIds: ["o-lg"] }, { groupId: "g2", optionIds: ["o-cheese", "o-corn"] }] }],
      new Map([["p1", P()]]),
      groups,
    );
    expect(issues).toEqual([]);
    expect(lines[0].unitPrice).toBe(19100 + 8000 + 3000 + 2000);
    expect(lines[0].lineTotal).toBe(2 * 32100);
  });

  it("uses the discounted price only when lower than list price", () => {
    const ok = priceLines([{ productId: "p1", quantity: 1, selections: [{ groupId: "g1", optionIds: ["o-reg"] }] }], new Map([["p1", P({ discountedPrice: 17000 })]]), groups);
    expect(ok.lines[0].unitPrice).toBe(17000);
    const bogus = priceLines([{ productId: "p1", quantity: 1, selections: [{ groupId: "g1", optionIds: ["o-reg"] }] }], new Map([["p1", P({ discountedPrice: 25000 })]]), groups);
    expect(bogus.lines[0].unitPrice).toBe(19100);
  });

  it("rejects missing required group, too many options, unavailable options and foreign groups", () => {
    const products = new Map([["p1", P()]]);
    expect(priceLines([{ productId: "p1", quantity: 1, selections: [] }], products, groups).issues[0].message).toMatch(/choose size/i);
    expect(priceLines([{ productId: "p1", quantity: 1, selections: [{ groupId: "g1", optionIds: ["o-reg", "o-lg"] }] }], products, groups).issues).toHaveLength(1);
    expect(priceLines([{ productId: "p1", quantity: 1, selections: [{ groupId: "g1", optionIds: ["o-reg"] }, { groupId: "g2", optionIds: ["o-olive"] }] }], products, groups).issues[0].message).toMatch(/unavailable/);
    expect(priceLines([{ productId: "p1", quantity: 1, selections: [{ groupId: "g1", optionIds: ["o-reg"] }, { groupId: "gX", optionIds: ["o-reg"] }] }], products, groups).issues).toHaveLength(1);
  });

  it("rejects sold-out, inactive and unknown products", () => {
    expect(priceLines([{ productId: "p1", quantity: 1, selections: [] }], new Map([["p1", P({ isAvailable: false })]]), groups).issues[0].message).toMatch(/sold out/);
    expect(priceLines([{ productId: "p1", quantity: 1, selections: [] }], new Map([["p1", P({ isActive: false })]]), groups).issues).toHaveLength(1);
    expect(priceLines([{ productId: "p1", quantity: 1, selections: [] }], new Map([["p1", P({ categoryActive: false })]]), groups).issues).toHaveLength(1);
    expect(priceLines([{ productId: "nope", quantity: 1, selections: [] }], new Map(), groups).issues).toHaveLength(1);
  });
});

describe("coupons and totals", () => {
  const line = priceLines([{ productId: "p1", quantity: 2, selections: [{ groupId: "g1", optionIds: ["o-reg"] }] }], new Map([["p1", P()]]), groups).lines;
  const base = { id: "c", code: "SAVE", applicableProductIds: [], applicableCategoryIds: [] };

  it("applies percentage with cap and flat discounts", () => {
    expect(computeCouponDiscount({ ...base, type: "PERCENT", value: 1000 }, line).discount).toBe(3820);
    expect(computeCouponDiscount({ ...base, type: "PERCENT", value: 5000, maxDiscount: 5000 }, line).discount).toBe(5000);
    expect(computeCouponDiscount({ ...base, type: "FLAT", value: 999999 }, line).discount).toBe(38200);
  });
  it("enforces minimum order and restrictions", () => {
    expect(computeCouponDiscount({ ...base, type: "FLAT", value: 5000, minOrderAmount: 50000 }, line).error).toMatch(/more/);
    expect(computeCouponDiscount({ ...base, type: "FLAT", value: 5000, applicableCategoryIds: ["other"] }, line).error).toMatch(/doesn't apply/);
    expect(computeCouponDiscount({ ...base, type: "FLAT", value: 5000, applicableCategoryIds: ["c1"] }, line).discount).toBe(5000);
  });
  it("computes totals with exclusive and inclusive tax in integer paise", () => {
    const excl = computeTotals({ lines: line, couponDiscount: 3820, deliveryFee: 3000, taxRateBps: 500, taxInclusive: false });
    expect(excl.tax).toBe(Math.round((38200 - 3820) * 0.05));
    expect(excl.total).toBe(38200 - 3820 + 3000 + excl.tax);
    const incl = computeTotals({ lines: line, couponDiscount: 0, deliveryFee: 0, taxRateBps: 500, taxInclusive: true });
    expect(incl.total).toBe(38200);
    expect(Number.isInteger(incl.tax)).toBe(true);
  });
  it("delivery fee respects pickup and free threshold", () => {
    expect(computeDeliveryFee({ fulfilment: "PICKUP", zoneFee: 3000, amountAfterDiscount: 100, freeDeliveryThreshold: 0 })).toBe(0);
    expect(computeDeliveryFee({ fulfilment: "DELIVERY", zoneFee: 3000, amountAfterDiscount: 50000, freeDeliveryThreshold: 40000 })).toBe(0);
    expect(computeDeliveryFee({ fulfilment: "DELIVERY", zoneFee: 3000, amountAfterDiscount: 30000, freeDeliveryThreshold: 40000 })).toBe(3000);
  });
});
