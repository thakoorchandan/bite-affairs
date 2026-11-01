import { z } from "zod";
import { indianMobile, personName, pincode } from "./common";

export const deliveryAddressSchema = z.object({
  houseNumber: z.string().trim().min(1, "House / flat number is required").max(120),
  street: z.string().trim().min(3, "Street / locality is required").max(200),
  landmark: z.string().trim().max(120).optional().default(""),
  city: z.string().trim().min(2, "City is required").max(60),
  pincode,
  instructions: z.string().trim().max(300).optional().default(""),
});
export type DeliveryAddressInput = z.infer<typeof deliveryAddressSchema>;

export const savedAddressSchema = deliveryAddressSchema.extend({
  label: z.string().trim().max(30).default("Home"),
  recipientName: personName,
  phone: indianMobile,
  isDefault: z.boolean().default(false),
});
export type SavedAddressInput = z.infer<typeof savedAddressSchema>;
