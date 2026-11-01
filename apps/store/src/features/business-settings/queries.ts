import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { CACHE_TAGS } from "@/constants/cache-tags";
import { getBusinessHours, getBusinessSettings, toHoursConfig, toKitchenConfig } from "@/services/settings.service";
import { computeKitchenStatus, type KitchenStatus } from "@/services/kitchen-status";
import { serialize } from "@/lib/utilities/serialize";

/** Public (non-secret) business settings, cached. */
export async function getPublicSettings() {
  "use cache";
  cacheTag(CACHE_TAGS.settings);
  cacheLife("hours");
  const s = await getBusinessSettings();
  return {
    businessName: s.businessName ?? "Bite Affairs",
    contactPhone: s.contactPhone ?? null,
    contactWhatsapp: s.contactWhatsapp ?? null,
    contactEmail: s.contactEmail ?? null,
    addressLine: s.addressLine ?? null,
    city: s.city ?? "Kolkata",
    fssaiNumber: s.fssaiNumber ?? null,
    gstin: s.gstin ?? null,
    social: serialize(s.social ?? {}),
    delivery: {
      enabled: s.delivery?.enabled !== false,
      suspended: !!s.delivery?.suspended,
      pickupEnabled: s.delivery?.pickupEnabled !== false,
      defaultFee: s.delivery?.defaultFee ?? 0,
      minOrderAmount: s.delivery?.minOrderAmount ?? 0,
      freeDeliveryThreshold: s.delivery?.freeDeliveryThreshold ?? 0,
      estimatedDeliveryMinutes: s.delivery?.estimatedDeliveryMinutes ?? 30,
    },
    tax: { rateBps: s.tax?.rateBps ?? 0, inclusive: s.tax?.inclusive !== false, label: s.tax?.label ?? "GST" },
    payments: {
      codEnabled: s.payments?.codEnabled !== false,
      razorpayEnabled: !!s.payments?.razorpayEnabled && !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET,
    },
    preordersEnabled: !!s.kitchen?.preordersEnabled,
  };
}
export type PublicSettings = Awaited<ReturnType<typeof getPublicSettings>>;

async function getCachedStatusInputs() {
  "use cache";
  cacheTag(CACHE_TAGS.settings, CACHE_TAGS.hours);
  cacheLife("minutes");
  const [settings, hours] = await Promise.all([getBusinessSettings(), getBusinessHours()]);
  return { kitchen: serialize(toKitchenConfig(settings)), hours: toHoursConfig(hours) };
}

/** Live kitchen status — computed per request from cached settings. Call inside <Suspense>. */
export async function getLiveKitchenStatus(): Promise<KitchenStatus> {
  await connection();
  const { kitchen, hours } = await getCachedStatusInputs();
  return computeKitchenStatus(kitchen as Parameters<typeof computeKitchenStatus>[0], hours, new Date());
}

export async function getPublicHours() {
  "use cache";
  cacheTag(CACHE_TAGS.hours);
  cacheLife("hours");
  return toHoursConfig(await getBusinessHours());
}
