import { z } from "zod";
import { normaliseIndianMobile } from "@/lib/utilities/phone";

// Ids are UUIDs (Postgres). Regex only, so these schemas stay safe to import in client forms.
export const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid id");
/** @deprecated legacy name from the MongoDB era; same as `uuid`. */
export const objectId = uuid;

export const indianMobile = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normaliseIndianMobile(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit Indian mobile number" });
      return z.NEVER;
    }
    return n;
  });

export const pincode = z.string().trim().regex(/^\d{6}$/, "Enter a valid 6-digit PIN code");
export const personName = z.string().trim().min(2, "Name is too short").max(80);
export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.email("Enter a valid email").optional());

/** Accepts rupees from forms ("155" or "155.50") and converts to integer paise. */
export const rupeesInput = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const s = String(v).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    ctx.addIssue({ code: "custom", message: "Enter a valid amount" });
    return z.NEVER;
  }
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
});

export const paginationInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
