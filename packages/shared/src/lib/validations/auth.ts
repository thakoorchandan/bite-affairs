import { z } from "zod";
import { indianMobile, optionalEmail, personName } from "./common";

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128)
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/\d/, "Include at least one number");

export const registerSchema = z.object({
  name: personName,
  phone: indianMobile,
  email: optionalEmail,
  password: passwordSchema,
});
export type RegisterInput = z.input<typeof registerSchema>;

export const profileSchema = z.object({ name: personName, phone: indianMobile, email: optionalEmail });

/** `currentPassword` may be empty only for accounts that have no password yet (created with Google). */
export const changePasswordSchema = z.object({ currentPassword: z.string().max(200), newPassword: passwordSchema });

export const forgotPasswordSchema = z.object({ email: z.email("Enter a valid email").trim().toLowerCase() });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });
