"use server";

import { eq } from "drizzle-orm";
import { quoteSchema, type QuoteInput } from "@/lib/validations/checkout";
import { buildQuote } from "@/services/quote.service";
import { getCurrentUser } from "@/lib/auth/session";
import { toActionError, type ActionResult } from "@/lib/utilities/errors";
import { cartInputSchema } from "@/lib/validations/cart";
import { getDb, schema } from "@/db";
import { lineKey } from "@/services/pricing-key";
import { normaliseIndianMobile } from "@/lib/utilities/phone";

export type CartQuote = Awaited<ReturnType<typeof quoteForClient>>;

async function quoteForClient(input: QuoteInput) {
  const parsed = quoteSchema.parse(input);
  const user = await getCurrentUser();
  const q = await buildQuote({
    items: parsed.items,
    fulfilment: parsed.fulfilment,
    pincode: parsed.pincode,
    couponCode: parsed.couponCode || undefined,
    userId: user?.id,
    phone: (parsed.phone && normaliseIndianMobile(parsed.phone)) || user?.phone || null,
  });
  // Strip the raw coupon document before sending to the browser.
  const { couponDoc: _omit, ...rest } = q;
  void _omit;
  return rest;
}

/** Authoritative cart pricing from the database. The browser never supplies prices. */
export async function quoteCart(input: QuoteInput): Promise<ActionResult<CartQuote>> {
  try {
    return { ok: true, data: await quoteForClient(input) };
  } catch (error) {
    return toActionError(error);
  }
}

/** Save the signed-in customer's cart server-side (no prices stored). */
export async function syncServerCart(items: unknown): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: true };
    const parsed = Array.isArray(items) && items.length === 0 ? [] : cartInputSchema.parse(items);
    const db = await getDb();
    const rows = parsed.map((i) => ({ key: lineKey(i), productId: i.productId, quantity: i.quantity, selections: i.selections, notes: i.notes }));
    await db.insert(schema.carts).values({ userId: user.id, items: rows }).onConflictDoUpdate({ target: schema.carts.userId, set: { items: rows } });
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

/** Returns the signed-in customer's saved cart (to merge with the local guest cart after login). */
export async function getServerCart(): Promise<ActionResult<{ productId: string; quantity: number; selections: { groupId: string; optionIds: string[] }[]; notes?: string }[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: true, data: [] };
    const db = await getDb();
    const [doc] = await db.select({ items: schema.carts.items }).from(schema.carts).where(eq(schema.carts.userId, user.id)).limit(1);
    return {
      ok: true,
      data: (doc?.items ?? []).map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        selections: (i.selections ?? []).map((s) => ({ groupId: s.groupId ?? "", optionIds: s.optionIds ?? [] })),
        notes: i.notes ?? undefined,
      })),
    };
  } catch (error) {
    return toActionError(error);
  }
}
