"use server";

import { z } from "zod";
import { refreshStorefront } from "@/lib/revalidate";
import { adminAction } from "./guard";
import { ORDER_STATUSES } from "@/constants/domain";
import { CACHE_TAGS } from "@/constants/cache-tags";
import { uuid } from "@/lib/validations/common";
import { addInternalNote, recordCodCollection, transitionOrderStatus, updateDeliveryDetails } from "@/services/order.service";

const statusSchema = z.object({
  orderId: uuid,
  to: z.enum(ORDER_STATUSES),
  expectedFrom: z.enum(ORDER_STATUSES).optional(),
  reason: z.string().trim().max(300).optional(),
  note: z.string().trim().max(300).optional(),
  override: z.boolean().optional(),
});

/** Change an order's status. Validation of the transition lives in order.service (state machine). */
export async function updateOrderStatusAction(input: z.input<typeof statusSchema>) {
  return adminAction<{ status: string; orderNumber: string }>({ action: "order.status", entityType: "order" }, async (admin) => {
    const data = statusSchema.parse(input);
    const result = await transitionOrderStatus(data, { type: "ADMIN", id: admin.id, name: admin.name });
    if (data.to === "DELIVERED" || data.to === "CANCELLED" || data.to === "REJECTED") await refreshStorefront(CACHE_TAGS.bestsellers);
    return {
      data: { status: result.status, orderNumber: result.orderNumber },
      entityId: data.orderId,
      summary: `${result.orderNumber} → ${data.to}${data.override ? " (override)" : ""}`,
      metadata: { from: data.expectedFrom, to: data.to, override: !!data.override, reason: data.reason },
    };
  });
}

const noteSchema = z.object({ orderId: uuid, text: z.string().trim().min(1, "Write a note first").max(500) });

export async function addOrderNoteAction(input: z.input<typeof noteSchema>) {
  return adminAction({ action: "order.note", entityType: "order" }, async (admin) => {
    const data = noteSchema.parse(input);
    await addInternalNote(data.orderId, data.text, { type: "ADMIN", id: admin.id });
    return { entityId: data.orderId, summary: "Added internal note" };
  });
}

const codSchema = z.object({ orderId: uuid, amountCollected: z.number().int().min(0).max(10_000_000), note: z.string().trim().max(300).optional() });

/** Cash collection is always a separate, explicit step — never automatic on delivery. */
export async function recordCodCollectionAction(input: z.input<typeof codSchema>) {
  return adminAction<{ fullyPaid: boolean; shortBy: number }>({ action: "payment.cod_collected", entityType: "order" }, async (admin) => {
    const data = codSchema.parse(input);
    const result = await recordCodCollection(data, { type: "ADMIN", id: admin.id });
    return { data: result, entityId: data.orderId, summary: `Recorded COD collection ₹${data.amountCollected / 100}`, metadata: result };
  });
}

const deliverySchema = z.object({
  orderId: uuid,
  assignToSelf: z.boolean().optional(),
  notes: z.string().trim().max(500).optional(),
  proofImageUrl: z.url().startsWith("https://res.cloudinary.com/", "Proof photos must be uploaded to Cloudinary").optional(),
});

export async function updateDeliveryAction(input: z.input<typeof deliverySchema>) {
  return adminAction({ action: "delivery.update", entityType: "order" }, async (admin) => {
    const data = deliverySchema.parse(input);
    await updateDeliveryDetails(data.orderId, data, { type: "ADMIN", id: admin.id });
    return { entityId: data.orderId, summary: data.assignToSelf ? "Assigned delivery to self" : data.proofImageUrl ? "Added delivery proof" : "Updated delivery notes" };
  });
}
