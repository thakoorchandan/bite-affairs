"use server";

import { refreshStorefront } from "@/lib/revalidate";
import { CACHE_TAGS } from "@/constants/cache-tags";
import { adminAction } from "./guard";
import { deleteReview, moderateReview } from "@/services/admin-catalog.service";

export async function moderateReviewAction(id: string, input: { status: "PENDING" | "APPROVED" | "HIDDEN"; adminReply?: string }) {
  return adminAction({ action: "review.moderate", entityType: "review" }, async () => {
    const res = await moderateReview(id, input);
    await refreshStorefront(CACHE_TAGS.reviews);
    await refreshStorefront(CACHE_TAGS.catalog);
    return { entityId: id, summary: `Review on ${res.productName ?? "product"} set to ${res.status}` };
  });
}

export async function deleteReviewAction(id: string) {
  return adminAction({ action: "review.delete", entityType: "review" }, async () => {
    const res = await deleteReview(id);
    await refreshStorefront(CACHE_TAGS.reviews);
    await refreshStorefront(CACHE_TAGS.catalog);
    return { entityId: id, summary: `Deleted review on ${res.productName ?? "product"}` };
  });
}
