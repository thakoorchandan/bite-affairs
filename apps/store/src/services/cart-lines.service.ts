import type { CartItemInput } from "@/lib/validations/cart";
import { loadPricingCatalog } from "@/services/quote.service";
import { priceLines } from "@/services/pricing";

export interface HydratedCartLine {
  productId: string;
  quantity: number;
  selections: { groupId: string; optionIds: string[] }[];
  notes?: string;
  snapshot: { name: string; slug: string; imageUrl?: string | null; isVeg: boolean; unitPrice: number; selectionLabels: string[] };
}

/** Turns stored cart items into display lines using current menu data; unavailable items are reported, not returned. */
export async function hydrateCartItems(items: CartItemInput[]): Promise<{ lines: HydratedCartLine[]; issues: string[] }> {
  if (!items.length) return { lines: [], issues: [] };
  const { productMap, groupMap } = await loadPricingCatalog(items.map((i) => i.productId));
  const lines: HydratedCartLine[] = [];
  const issues: string[] = [];
  for (const item of items) {
    const { lines: priced, issues: problems } = priceLines([item], productMap, groupMap);
    const l = priced[0];
    if (problems.length || !l) {
      issues.push(problems[0]?.message ?? "An item is no longer available.");
      continue;
    }
    lines.push({
      productId: item.productId,
      quantity: item.quantity,
      selections: item.selections ?? [],
      notes: item.notes,
      snapshot: { name: l.name, slug: l.slug, imageUrl: l.imageUrl, isVeg: l.isVeg, unitPrice: l.unitPrice, selectionLabels: l.selections.flatMap((s) => s.options.map((o) => o.name)) },
    });
  }
  return { lines, issues };
}
