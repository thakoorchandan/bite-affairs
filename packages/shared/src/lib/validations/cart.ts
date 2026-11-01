import { z } from "zod";
import { objectId } from "./common";

export const cartSelectionSchema = z.object({
  groupId: objectId,
  optionIds: z.array(objectId).max(20),
});

export const cartItemInputSchema = z.object({
  productId: objectId,
  quantity: z.number().int().min(1).max(50),
  selections: z.array(cartSelectionSchema).max(20).default([]),
  notes: z.string().trim().max(200).optional(),
});
export type CartItemInput = z.infer<typeof cartItemInputSchema>;

export const cartInputSchema = z.array(cartItemInputSchema).min(1, "Your cart is empty").max(40);
