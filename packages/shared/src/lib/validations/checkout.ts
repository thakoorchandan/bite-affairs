import { z } from "zod";
import { cartInputSchema } from "./cart";
import { deliveryAddressSchema } from "./address";
import { indianMobile, objectId, optionalEmail, personName } from "./common";
import { FULFILMENT_TYPES, PAYMENT_METHODS } from "@/constants/domain";

export const checkoutSchema = z
  .object({
    idempotencyKey: z.string().min(16).max(80).regex(/^[A-Za-z0-9_-]+$/),
    items: cartInputSchema,
    customer: z.object({ name: personName, phone: indianMobile, email: optionalEmail }),
    fulfilment: z.enum(FULFILMENT_TYPES).default("DELIVERY"),
    address: deliveryAddressSchema.optional(),
    savedAddressId: objectId.optional(),
    saveAddress: z.boolean().optional(),
    couponCode: z.string().trim().toUpperCase().max(24).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS),
    customerNotes: z.string().trim().max(500).optional(),
    scheduledFor: z.iso.datetime().optional(),
  })
  .refine((v) => v.fulfilment === "PICKUP" || v.address || v.savedAddressId, {
    message: "Delivery address is required",
    path: ["address"],
  });
export type CheckoutInput = z.input<typeof checkoutSchema>;
export type CheckoutParsed = z.output<typeof checkoutSchema>;

export const quoteSchema = z.object({
  items: cartInputSchema,
  fulfilment: z.enum(FULFILMENT_TYPES).default("DELIVERY"),
  pincode: z.string().trim().regex(/^\d{6}$/).optional(),
  couponCode: z.string().trim().toUpperCase().max(24).optional(),
  phone: z.string().optional(),
});
export type QuoteInput = z.input<typeof quoteSchema>;
