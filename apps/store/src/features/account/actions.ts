"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { toActionError, type ActionResult } from "@/lib/utilities/errors";
import { objectId } from "@/lib/validations/common";
import {
  addFavourites,
  createAddress,
  createReview,
  deleteAddress,
  listAddresses,
  listFavouriteProductIds,
  setDefaultAddress,
  toggleFavourite,
  updateAddress,
  type SavedAddress,
} from "@/services/account.service";
import { getCurrentUser } from "@/lib/auth/session";
import { hydrateCartItems, type HydratedCartLine } from "@/services/cart-lines.service";
import { getCustomerOrder } from "@/services/order-query.service";

export async function saveAddressAction(input: { id?: string; data: unknown }): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    if (input.id) {
      await updateAddress(user.id, objectId.parse(input.id), input.data);
      return { ok: true, data: { id: input.id } };
    }
    return { ok: true, data: { id: await createAddress(user.id, input.data) } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteAddressAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await deleteAddress(user.id, objectId.parse(id));
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setDefaultAddressAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await setDefaultAddress(user.id, objectId.parse(id));
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function getMyAddresses(): Promise<ActionResult<SavedAddress[]>> {
  try {
    const user = await getCurrentUser();
    return { ok: true, data: user ? await listAddresses(user.id) : [] };
  } catch (error) {
    return toActionError(error);
  }
}

export async function toggleFavouriteAction(productId: string): Promise<ActionResult<{ favourite: boolean }>> {
  try {
    const user = await requireUser();
    await enforceRateLimit(`fav:${user.id}`, 120, 60);
    return { ok: true, data: { favourite: await toggleFavourite(user.id, objectId.parse(productId)) } };
  } catch (error) {
    return toActionError(error);
  }
}

/** Moves favourites saved on this device (while signed out) into the signed-in account. */
export async function mergeDeviceFavouritesAction(productIds: string[]): Promise<ActionResult<{ ids: string[] }>> {
  try {
    const user = await requireUser();
    await enforceRateLimit(`fav-merge:${user.id}`, 20, 60);
    const ids = z.array(z.string()).max(100).parse(productIds);
    return { ok: true, data: { ids: await addFavourites(user.id, ids) } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function getMyFavouriteIds(): Promise<ActionResult<{ signedIn: boolean; ids: string[] }>> {
  try {
    const user = await getCurrentUser();
    return { ok: true, data: { signedIn: !!user, ids: user ? await listFavouriteProductIds(user.id) : [] } };
  } catch (error) {
    return toActionError(error);
  }
}

const reviewSchema = z.object({
  orderId: objectId,
  orderItemId: objectId,
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

export async function submitReviewAction(input: z.input<typeof reviewSchema>): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await enforceRateLimit(`review:${user.id}`, 20, 60 * 60);
    await createReview(user.id, reviewSchema.parse(input));
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export type ReorderLine = HydratedCartLine;

/** Rebuilds cart lines from a previous order using CURRENT menu prices; unavailable items are reported. */
export async function prepareReorder(orderId: string): Promise<ActionResult<{ lines: ReorderLine[]; issues: string[] }>> {
  try {
    const user = await requireUser();
    const order = await getCustomerOrder(user.id, objectId.parse(orderId));
    if (!order) return { ok: false, error: "Order not found", code: "NOT_FOUND" };
    type Detailed = { productId: string; quantity: number; notes?: string | null; selections?: { groupId?: string | null; options?: { optionId?: string | null }[] }[] };
    const items = (order.itemsDetailed as unknown as Detailed[]).map((i) => ({
      productId: String(i.productId),
      quantity: i.quantity,
      selections: (i.selections ?? [])
        .map((s) => ({ groupId: s.groupId ?? "", optionIds: (s.options ?? []).map((o) => o.optionId ?? "").filter(Boolean) }))
        .filter((s) => s.groupId),
      notes: i.notes ?? undefined,
    }));
    return { ok: true, data: await hydrateCartItems(items) };
  } catch (error) {
    return toActionError(error);
  }
}
