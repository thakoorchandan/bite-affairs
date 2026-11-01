"use server";

import { cartInputSchema } from "@/lib/validations/cart";
import { hydrateCartItems, type HydratedCartLine } from "@/services/cart-lines.service";
import { toActionError, type ActionResult } from "@/lib/utilities/errors";

export async function hydrateCartAction(items: unknown): Promise<ActionResult<{ lines: HydratedCartLine[]; issues: string[] }>> {
  try {
    if (Array.isArray(items) && items.length === 0) return { ok: true, data: { lines: [], issues: [] } };
    return { ok: true, data: await hydrateCartItems(cartInputSchema.parse(items)) };
  } catch (error) {
    return toActionError(error);
  }
}
