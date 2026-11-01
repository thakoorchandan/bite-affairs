import type { KitchenMode } from "@/constants/domain";

/**
 * Typed view of the singleton settings row (`business_settings`) with defaults applied. The row stores each section
 * as JSON, so new settings never need a migration: add the key + default here.
 */
export interface BusinessSettingsDoc {
  key: string;
  businessName: string;
  contactPhone: string | null;
  contactWhatsapp: string | null;
  contactEmail: string | null;
  addressLine: string | null;
  city: string;
  gstin: string | null;
  fssaiNumber: string | null;
  kitchen: {
    mode: KitchenMode;
    preordersEnabled: boolean;
    preorderMaxDaysAhead: number;
    closedMessage: string;
    pausedMessage: string;
    pausedUntil: Date | null;
    temporaryClosure: { active: boolean; from: Date | null; until: Date | null; message: string | null };
    delayAlertMinutes: number;
  };
  delivery: {
    enabled: boolean;
    suspended: boolean;
    suspendedMessage: string;
    pickupEnabled: boolean;
    defaultFee: number;
    minOrderAmount: number;
    freeDeliveryThreshold: number;
    estimatedDeliveryMinutes: number;
    maxDistanceKm: number;
  };
  tax: { rateBps: number; inclusive: boolean; label: string };
  payments: { codEnabled: boolean; codMaxOrderAmount: number; razorpayEnabled: boolean };
  notifications: { adminEmail: string | null; emailEnabled: boolean; whatsappEnabled: boolean; soundAlerts: boolean };
  social: { instagram: string | null; facebook: string | null; youtube: string | null; whatsapp: string | null; googleMaps: string | null };
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_SETTINGS_SECTIONS = {
  kitchen: {
    mode: "AUTO",
    preordersEnabled: false,
    preorderMaxDaysAhead: 2,
    closedMessage: "We're closed right now. See you soon!",
    pausedMessage: "We're taking a short break and will be back shortly.",
    pausedUntil: null,
    temporaryClosure: { active: false, from: null, until: null, message: null },
    delayAlertMinutes: 45,
  },
  delivery: {
    enabled: true,
    suspended: false,
    suspendedMessage: "Deliveries are temporarily paused.",
    pickupEnabled: true,
    defaultFee: 0,
    minOrderAmount: 0,
    freeDeliveryThreshold: 0,
    estimatedDeliveryMinutes: 30,
    maxDistanceKm: 0,
  },
  tax: { rateBps: 0, inclusive: true, label: "GST" },
  payments: { codEnabled: true, codMaxOrderAmount: 0, razorpayEnabled: false },
  notifications: { adminEmail: null, emailEnabled: false, whatsappEnabled: false, soundAlerts: true },
  social: { instagram: null, facebook: null, youtube: null, whatsapp: null, googleMaps: null },
} as const;

export interface BusinessHoursDoc {
  key: string;
  timezone: string;
  weekly: { day: number; isOpen: boolean; slots: { open: string; close: string }[] }[];
  specialDates: { date: string; isClosed: boolean; slots: { open: string; close: string }[]; note?: string | null }[];
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_WEEKLY_HOURS = Array.from({ length: 7 }, (_, day) => ({ day, isOpen: true, slots: [{ open: "11:00", close: "23:00" }] }));

/** Defaults for the storefront content singleton (`website_content.data`). Stored values override these key by key. */
export const DEFAULT_HOME_CONTENT = {
  hero: {
    eyebrow: "Cloud kitchen · Kolkata",
    heading: "Real Chinese. Real Flavours. Everyday.",
    subheading: "Good Food. Good Mood. Freshly made in our kitchen and delivered by us, hot to your door.",
    primaryCtaLabel: "Order Now",
    secondaryCtaLabel: "Browse Menu",
    images: [] as { url: string; publicId?: string | null; width?: number | null; height?: number | null; alt?: string | null }[],
  },
  banners: [] as { title?: string; subtitle?: string; href?: string; image?: { url: string; alt?: string | null }; isActive?: boolean }[],
  featuredCategoryIds: [] as string[],
  featuredProductIds: [] as string[],
  combos: { heading: "Bite Affairs Special Combos", subheading: "Big flavours, bigger value.", categoryId: null as string | null },
  whyChooseUs: {
    heading: "Why Bite Affairs?",
    items: [
      { title: "Fresh Ingredients", body: "Vegetables, meat and sauces prepped fresh every single day.", icon: "leaf" },
      { title: "Homemade Taste", body: "Cooked in small batches the way we cook for our own family.", icon: "chef-hat" },
      { title: "Affordable Prices", body: "Generous portions and honest prices, every day.", icon: "heart" },
    ],
  },
  about: {
    heading: "About Bite Affairs",
    body: "Bite Affairs is an independent cloud kitchen in Kolkata serving Indo-Chinese favourites, pizzas, burgers and comfort food. We cook every order fresh and deliver it ourselves.",
    image: null as { url: string; alt?: string | null } | null,
  },
  gallery: [] as { url: string; publicId?: string | null; width?: number | null; height?: number | null; alt?: string | null }[],
  footer: { blurb: "Real Chinese. Real Flavours. Everyday.", copyright: "Bite Affairs" },
  announcement: { text: null as string | null, isActive: false },
};
export type HomeContentData = typeof DEFAULT_HOME_CONTENT;

/** Shallow-per-section merge: stored value wins; objects merge one level deep; arrays replace. */
export function mergeDefaults<T extends Record<string, unknown>>(defaults: T, stored: Record<string, unknown> | null | undefined): T {
  const out: Record<string, unknown> = { ...defaults };
  for (const [k, v] of Object.entries(stored ?? {})) {
    if (v === undefined) continue;
    const d = (defaults as Record<string, unknown>)[k];
    out[k] = d && typeof d === "object" && !Array.isArray(d) && v && typeof v === "object" && !Array.isArray(v) ? mergeDefaults(d as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  return out as T;
}
