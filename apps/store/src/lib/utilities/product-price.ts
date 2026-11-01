import type { PublicProduct } from "@/types/catalog";

/** Selling price shown to customers (discounted price only when lower than list price). Server + client safe. */
export function effectivePrice(p: Pick<PublicProduct, "price" | "discountedPrice">) {
  return p.discountedPrice != null && p.discountedPrice < p.price ? p.discountedPrice : p.price;
}
