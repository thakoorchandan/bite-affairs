/**
 * Admin form schemas. Client-safe (no server-only imports) so the same schema validates the
 * react-hook-form input in the browser and is re-parsed authoritatively in Server Actions.
 * Money is entered in rupees ("155" / "155.50") and transformed to integer paise.
 */
import { z } from "zod";
import {
  COUPON_TYPES,
  EXPENSE_CATEGORIES,
  KITCHEN_MODES,
  REVIEW_STATUSES,
} from "@/constants/domain";
import { DEFAULT_TIMEZONE, zonedTimeToUtc } from "@/lib/utilities/time";

export const adminObjectId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid id");

function toPaise(value: string, ctx: z.RefinementCtx): number {
  const s = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    ctx.addIssue({ code: "custom", message: "Enter a valid amount in rupees" });
    return z.NEVER;
  }
  const [whole, frac = ""] = s.split(".");
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) {
    ctx.addIssue({ code: "custom", message: "Amount is too large" });
    return z.NEVER;
  }
  return paise;
}

/** Required rupee amount → paise. */
export const rupees = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => toPaise(String(v), ctx));
/** Optional rupee amount: empty → undefined. */
export const optionalRupees = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v, ctx) =>
    v === null || v === undefined || String(v).trim() === ""
      ? undefined
      : toPaise(String(v), ctx),
  );

const intField = (min: number, max: number) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const n = Number(String(v).trim() === "" ? NaN : v);
    if (!Number.isInteger(n) || n < min || n > max) {
      ctx.addIssue({
        code: "custom",
        message: `Enter a whole number between ${min} and ${max}`,
      });
      return z.NEVER;
    }
    return n;
  });
const optionalInt = (min: number, max: number) =>
  z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v, ctx) => {
      if (v === null || v === undefined || String(v).trim() === "")
        return undefined;
      const n = Number(v);
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({
          code: "custom",
          message: `Enter a whole number between ${min} and ${max}`,
        });
        return z.NEVER;
      }
      return n;
    });

const text = (max: number) => z.string().trim().max(max).optional().default("");

/** "2026-11-01T18:30" interpreted in the business timezone → Date. */
export function parseLocalDateTime(
  value: string,
  timeZone = DEFAULT_TIMEZONE,
): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  return zonedTimeToUtc(
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    timeZone,
  );
}

const optionalLocalDateTime = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (!v || !v.trim()) return undefined;
    const d = parseLocalDateTime(v.trim());
    if (!d) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date and time" });
      return z.NEVER;
    }
    return d;
  });

export const imageRefInput = z.object({
  url: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .refine(
      (u) => u.startsWith("/") || /^https:\/\//.test(u),
      "Use an https:// URL or a /images path",
    ),
  publicId: z.string().max(300).optional().nullable(),
  width: z.number().int().positive().optional().nullable(),
  height: z.number().int().positive().optional().nullable(),
  alt: z.string().max(160).optional().nullable(),
});
export type ImageRefInput = z.infer<typeof imageRefInput>;

export const videoRefInput = z.object({
  url: z.string().trim().url().max(1000),
  publicId: z.string().max(300).optional().nullable(),
  posterUrl: z.string().max(1000).optional().nullable(),
  durationSeconds: z.number().nonnegative().optional().nullable(),
});

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .max(80)
  .optional()
  .default("")
  .refine(
    (s) => s === "" || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s),
    "Use lowercase letters, numbers and hyphens",
  );

// ─── Catalog ───────────────────────────────────────────────────────────────

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(60),
  slug: slugField,
  description: text(500),
  image: imageRefInput.nullable().optional(),
  isActive: z.boolean().default(true),
  seoTitle: text(70),
  seoDescription: text(160),
});
export type CategoryFormInput = z.input<typeof categoryInputSchema>;

export const productInputSchema = z
  .object({
    name: z.string().trim().min(2, "Name is required").max(100),
    slug: slugField,
    shortDescription: text(200),
    description: text(3000),
    categoryId: adminObjectId,
    price: rupees.refine((p) => p > 0, "Price must be more than ₹0"),
    discountedPrice: optionalRupees,
    isVeg: z.boolean(),
    isBestseller: z.boolean().default(false),
    isFeatured: z.boolean().default(false),
    isNewArrival: z.boolean().default(false),
    isActive: z.boolean().default(true),
    isAvailable: z.boolean().default(true),
    preparationMinutes: intField(0, 240),
    spiceLevel: intField(0, 3),
    servingInfo: text(60),
    tags: z
      .string()
      .optional()
      .default("")
      .transform((s) =>
        [
          ...new Set(
            s
              .split(",")
              .map((t) => t.trim().toLowerCase())
              .filter(Boolean),
          ),
        ].slice(0, 20),
      ),
    displayOrder: optionalInt(0, 100000),
    seoTitle: text(70),
    seoDescription: text(160),
    image: imageRefInput.nullable().optional(),
    gallery: z.array(imageRefInput).max(12).default([]),
    videos: z.array(videoRefInput).max(4).default([]),
    customisationGroupIds: z.array(adminObjectId).max(10).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.discountedPrice !== undefined && v.discountedPrice >= v.price) {
      ctx.addIssue({
        code: "custom",
        path: ["discountedPrice"],
        message: "Discounted price must be lower than the price",
      });
    }
  });
export type ProductFormInput = z.input<typeof productInputSchema>;
export type ProductParsed = z.output<typeof productInputSchema>;

export const productQuickPatchSchema = z
  .object({
    isAvailable: z.boolean().optional(),
    isActive: z.boolean().optional(),
    isBestseller: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    price: rupees.optional(),
    // null clears the discount; null must be matched before the rupee parser.
    discountedPrice: z.union([z.null(), rupees]).optional(),
  })
  .refine(
    (v) => Object.values(v).some((x) => x !== undefined),
    "Nothing to update",
  );

export const productCostInputSchema = z.object({
  ingredientCost: optionalRupees,
  packagingCost: optionalRupees,
  preparationCost: optionalRupees,
  otherCost: optionalRupees,
  notes: text(300),
});
export type ProductCostFormInput = z.input<typeof productCostInputSchema>;

export const customisationGroupInputSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    internalName: text(80),
    selectionType: z.enum(["SINGLE", "MULTIPLE"]),
    isRequired: z.boolean().default(false),
    minSelect: intField(0, 20),
    maxSelect: intField(0, 20),
    isActive: z.boolean().default(true),
    options: z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string().trim().min(1, "Option name is required").max(60),
          priceDelta: rupees,
          isAvailable: z.boolean().default(true),
          isDefault: z.boolean().default(false),
          isVeg: z.boolean().default(true),
        }),
      )
      .min(1, "Add at least one option")
      .max(30),
  })
  .superRefine((v, ctx) => {
    if (
      v.selectionType === "SINGLE" &&
      v.options.filter((o) => o.isDefault).length > 1
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Only one default option is allowed for single choice",
      });
    }
    if (
      v.selectionType === "MULTIPLE" &&
      v.maxSelect > 0 &&
      v.minSelect > v.maxSelect
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["minSelect"],
        message: "Minimum cannot exceed maximum",
      });
    }
    if (v.minSelect > v.options.length)
      ctx.addIssue({
        code: "custom",
        path: ["minSelect"],
        message: "Minimum is more than the number of options",
      });
  });
export type CustomisationGroupFormInput = z.input<
  typeof customisationGroupInputSchema
>;

// ─── Coupons ───────────────────────────────────────────────────────────────

export const couponInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,24}$/, "3–24 characters: letters, numbers, - or _"),
    description: text(200),
    type: z.enum(COUPON_TYPES),
    /** Percent (e.g. "10" or "12.5") for PERCENT, rupees for FLAT. */
    value: z.union([z.string(), z.number()]),
    maxDiscount: optionalRupees,
    minOrderAmount: optionalRupees,
    startsAt: optionalLocalDateTime,
    endsAt: optionalLocalDateTime,
    usageLimit: optionalInt(1, 1_000_000),
    perCustomerLimit: optionalInt(0, 1000),
    firstOrderOnly: z.boolean().default(false),
    applicableProductIds: z.array(adminObjectId).default([]),
    applicableCategoryIds: z.array(adminObjectId).default([]),
    isActive: z.boolean().default(true),
    isPublic: z.boolean().default(false),
  })
  .transform((v, ctx) => {
    const raw = String(v.value).trim();
    let value: number;
    if (v.type === "PERCENT") {
      if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: "Enter a percentage like 10 or 12.5",
        });
        return z.NEVER;
      }
      value = Math.round(Number(raw) * 100);
      if (value < 1 || value > 10000) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: "Percentage must be between 0.01 and 100",
        });
        return z.NEVER;
      }
    } else {
      value = toPaise(raw, ctx);
      if (value < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: "Discount must be more than ₹0",
        });
        return z.NEVER;
      }
    }
    if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "End must be after start",
      });
      return z.NEVER;
    }
    return { ...v, value, perCustomerLimit: v.perCustomerLimit ?? 0 };
  });
export type CouponFormInput = z.input<typeof couponInputSchema>;

// ─── Delivery ──────────────────────────────────────────────────────────────

export function parsePincodeList(raw: string): {
  valid: string[];
  invalid: string[];
} {
  const tokens = raw
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const valid = [...new Set(tokens.filter((t) => /^\d{6}$/.test(t)))];
  const invalid = [...new Set(tokens.filter((t) => !/^\d{6}$/.test(t)))];
  return { valid, invalid };
}

export const deliveryZoneInputSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    pincodes: z.string().default(""),
    areas: z.string().optional().default(""),
    deliveryFee: rupees,
    minOrderAmount: optionalRupees,
    estimatedMinutes: optionalInt(0, 600),
    isActive: z.boolean().default(true),
    displayOrder: optionalInt(0, 10000),
  })
  .transform((v, ctx) => {
    const { valid, invalid } = parsePincodeList(v.pincodes);
    if (invalid.length) {
      ctx.addIssue({
        code: "custom",
        path: ["pincodes"],
        message: `Invalid PIN code(s): ${invalid.slice(0, 5).join(", ")}`,
      });
      return z.NEVER;
    }
    if (!valid.length) {
      ctx.addIssue({
        code: "custom",
        path: ["pincodes"],
        message: "Add at least one 6-digit PIN code",
      });
      return z.NEVER;
    }
    const areas = [
      ...new Set(
        v.areas
          .split(/[\n,]+/)
          .map((a) => a.trim())
          .filter(Boolean),
      ),
    ].slice(0, 100);
    return { ...v, pincodes: valid, areas };
  });
export type DeliveryZoneFormInput = z.input<typeof deliveryZoneInputSchema>;

export const deliverySettingsInputSchema = z.object({
  enabled: z.boolean(),
  suspended: z.boolean(),
  suspendedMessage: text(200),
  pickupEnabled: z.boolean(),
  defaultFee: rupees,
  minOrderAmount: rupees,
  freeDeliveryThreshold: rupees,
  estimatedDeliveryMinutes: intField(0, 600),
  maxDistanceKm: intField(0, 200),
});
export type DeliverySettingsFormInput = z.input<
  typeof deliverySettingsInputSchema
>;

// ─── Business settings ─────────────────────────────────────────────────────

const optionalPhone = z
  .string()
  .trim()
  .optional()
  .default("")
  .refine(
    (v) => v === "" || /^\+?[\d\s-]{8,15}$/.test(v),
    "Enter a valid phone number",
  );

export const businessProfileInputSchema = z.object({
  businessName: z.string().trim().min(2).max(80),
  contactPhone: optionalPhone,
  contactWhatsapp: optionalPhone,
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .default("")
    .refine(
      (v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Enter a valid email",
    ),
  addressLine: text(200),
  city: z.string().trim().min(2).max(60),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .default("")
    .refine(
      (v) => v === "" || /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v),
      "Enter a valid 15-character GSTIN",
    ),
  fssaiNumber: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine(
      (v) => v === "" || /^\d{14}$/.test(v),
      "FSSAI licence numbers have 14 digits",
    ),
});
export type BusinessProfileFormInput = z.input<
  typeof businessProfileInputSchema
>;

export const taxInputSchema = z.object({
  ratePercent: z.union([z.string(), z.number()]).transform((v, ctx) => {
    const s = String(v).trim() || "0";
    if (!/^\d+(\.\d{1,2})?$/.test(s) || Number(s) > 50) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a rate between 0 and 50",
      });
      return z.NEVER;
    }
    return Math.round(Number(s) * 100);
  }),
  inclusive: z.boolean(),
  label: z.string().trim().min(1).max(20),
});
export type TaxFormInput = z.input<typeof taxInputSchema>;

export const paymentSettingsInputSchema = z.object({
  codEnabled: z.boolean(),
  codMaxOrderAmount: rupees,
  razorpayEnabled: z.boolean(),
});
export type PaymentSettingsFormInput = z.input<
  typeof paymentSettingsInputSchema
>;

export const notificationSettingsInputSchema = z.object({
  adminEmail: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .default("")
    .refine(
      (v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Enter a valid email",
    ),
  emailEnabled: z.boolean(),
  whatsappEnabled: z.boolean(),
  soundAlerts: z.boolean(),
});
export type NotificationSettingsFormInput = z.input<
  typeof notificationSettingsInputSchema
>;

const urlOrEmpty = z
  .string()
  .trim()
  .optional()
  .default("")
  .refine((v) => v === "" || /^https:\/\//.test(v), "Use a full https:// link");
export const socialLinksInputSchema = z.object({
  instagram: urlOrEmpty,
  facebook: urlOrEmpty,
  youtube: urlOrEmpty,
  whatsapp: urlOrEmpty,
  googleMaps: urlOrEmpty,
});
export type SocialLinksFormInput = z.input<typeof socialLinksInputSchema>;

// ─── Kitchen & hours ───────────────────────────────────────────────────────

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");
const slotSchema = z
  .object({ open: hhmm, close: hhmm })
  .refine(
    (s) => s.open !== s.close,
    "Opening and closing times can't be the same",
  );

export const kitchenControlInputSchema = z.object({
  mode: z.enum(KITCHEN_MODES),
  pauseMinutes: optionalInt(0, 24 * 60),
  preordersEnabled: z.boolean(),
  preorderMaxDaysAhead: intField(0, 14),
  closedMessage: text(200),
  pausedMessage: text(200),
  temporaryClosureActive: z.boolean(),
  temporaryClosureFrom: optionalLocalDateTime,
  temporaryClosureUntil: optionalLocalDateTime,
  temporaryClosureMessage: text(200),
  delayAlertMinutes: intField(0, 600),
});
export type KitchenControlFormInput = z.input<typeof kitchenControlInputSchema>;

export const businessHoursInputSchema = z.object({
  weekly: z
    .array(
      z.object({
        day: z.number().int().min(0).max(6),
        isOpen: z.boolean(),
        slots: z.array(slotSchema).max(4),
      }),
    )
    .length(7),
  specialDates: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
        isClosed: z.boolean(),
        slots: z.array(slotSchema).max(4),
        note: text(120),
      }),
    )
    .max(120)
    .superRefine((list, ctx) => {
      const seen = new Set<string>();
      list.forEach((d, i) => {
        if (seen.has(d.date))
          ctx.addIssue({
            code: "custom",
            path: [i, "date"],
            message: "Duplicate date",
          });
        seen.add(d.date);
        if (!d.isClosed && d.slots.length === 0)
          ctx.addIssue({
            code: "custom",
            path: [i, "slots"],
            message: "Add opening hours or mark as closed",
          });
      });
    }),
});
export type BusinessHoursFormInput = z.input<typeof businessHoursInputSchema>;

// ─── Website content ───────────────────────────────────────────────────────

export const homeContentInputSchema = z.object({
  hero: z.object({
    eyebrow: text(80),
    heading: z.string().trim().min(2).max(120),
    subheading: text(300),
    primaryCtaLabel: z.string().trim().min(1).max(30),
    secondaryCtaLabel: z.string().trim().min(1).max(30),
    images: z.array(imageRefInput).max(6).default([]),
  }),
  banners: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(80),
        subtitle: text(160),
        href: z
          .string()
          .trim()
          .optional()
          .default("")
          .refine(
            (v) => v === "" || v.startsWith("/") || /^https:\/\//.test(v),
            "Use a site path like /menu or an https:// link",
          ),
        image: imageRefInput.nullable().optional(),
        isActive: z.boolean().default(true),
      }),
    )
    .max(6)
    .default([]),
  announcement: z.object({ text: text(160), isActive: z.boolean() }),
  featuredCategoryIds: z.array(adminObjectId).max(12).default([]),
  featuredProductIds: z.array(adminObjectId).max(16).default([]),
  combos: z.object({
    heading: text(80),
    subheading: text(160),
    categoryId: z
      .union([adminObjectId, z.literal("")])
      .optional()
      .default(""),
  }),
  whyChooseUs: z.object({
    heading: text(80),
    items: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(60),
          body: text(240),
          icon: z.enum([
            "leaf",
            "chef-hat",
            "heart",
            "flame",
            "bike",
            "clock",
            "star",
            "sparkles",
          ]),
        }),
      )
      .max(6),
  }),
  about: z.object({
    heading: text(80),
    body: text(2000),
    image: imageRefInput.nullable().optional(),
  }),
  gallery: z.array(imageRefInput).max(24).default([]),
  footer: z.object({ blurb: text(200), copyright: text(80) }),
});
export type HomeContentFormInput = z.input<typeof homeContentInputSchema>;

export const testimonialInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
  location: text(60),
  quote: z.string().trim().min(5).max(400),
  rating: intField(1, 5),
  avatarUrl: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine(
      (v) => v === "" || v.startsWith("/") || /^https:\/\//.test(v),
      "Use an https:// URL",
    ),
  isActive: z.boolean().default(true),
  displayOrder: optionalInt(0, 10000),
});
export type TestimonialFormInput = z.input<typeof testimonialInputSchema>;

export const reviewModerationSchema = z.object({
  status: z.enum(REVIEW_STATUSES),
  adminReply: text(500),
});

// ─── Finance ───────────────────────────────────────────────────────────────

export const expenseInputSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: rupees.refine((v) => v > 0, "Amount must be more than ₹0"),
  incurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  vendor: text(100),
  paymentMode: z.enum(["CASH", "UPI", "CARD", "BANK", "OTHER"]),
  description: text(300),
});
export type ExpenseFormInput = z.input<typeof expenseInputSchema>;

export const dateRangeSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((r) => r.from <= r.to, "Start date must be before end date");
