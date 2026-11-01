/**
 * Admin configuration: delivery zones/settings, business profile, tax, payments,
 * notifications, kitchen control, business hours, website content and testimonials.
 * Pure database logic; Server Actions add auth, auditing and cache invalidation.
 *
 * Settings/hours/content rows are read and written through settings.service (defaults + JSON sections).
 */
import { and, arrayOverlaps, asc, desc, eq, ne } from "drizzle-orm";
import { getDb, isUuid, schema, type ImageRef } from "@/db";
import { AppError, notFound } from "@/lib/utilities/errors";
import { serialize } from "@/lib/utilities/serialize";
import { getBusinessHours, getBusinessSettings, getHomeContentData, updateBusinessHours as saveBusinessHoursRow, updateBusinessSettings, updateHomeContentData } from "@/services/settings.service";
import {
  businessHoursInputSchema,
  businessProfileInputSchema,
  deliverySettingsInputSchema,
  deliveryZoneInputSchema,
  homeContentInputSchema,
  kitchenControlInputSchema,
  notificationSettingsInputSchema,
  paymentSettingsInputSchema,
  socialLinksInputSchema,
  taxInputSchema,
  testimonialInputSchema,
  type DeliveryZoneFormInput,
  type TestimonialFormInput,
} from "@/lib/validations/admin";

const { deliveryZones, testimonials } = schema;

function id(value: string, what = "Item"): string {
  if (!isUuid(value)) throw notFound(what);
  return value;
}

// ─── Delivery zones ────────────────────────────────────────────────────────

export async function listDeliveryZonesAdmin() {
  const db = await getDb();
  const zones = serialize(await db.select().from(deliveryZones).orderBy(asc(deliveryZones.displayOrder), asc(deliveryZones.name)));
  // PIN codes present in more than one active zone: the first zone (by display order) wins at checkout.
  const owners = new Map<string, string[]>();
  for (const z of zones) if (z.isActive) for (const pin of z.pincodes ?? []) owners.set(pin, [...(owners.get(pin) ?? []), z.name]);
  const overlaps = [...owners.entries()].filter(([, names]) => names.length > 1).map(([pincode, zoneNames]) => ({ pincode, zoneNames }));
  return { zones, overlaps };
}
export type AdminDeliveryZone = Awaited<ReturnType<typeof listDeliveryZonesAdmin>>["zones"][number];

export async function saveDeliveryZone(zoneId: string | null, input: DeliveryZoneFormInput) {
  const data = deliveryZoneInputSchema.parse(input);
  const db = await getDb();
  const existingId = zoneId ? id(zoneId, "Zone") : undefined;
  const fields = {
    name: data.name,
    pincodes: data.pincodes,
    areas: data.areas,
    deliveryFee: data.deliveryFee,
    minOrderAmount: data.minOrderAmount ?? null,
    estimatedMinutes: data.estimatedMinutes ?? null,
    isActive: data.isActive,
    displayOrder: data.displayOrder ?? 0,
  };
  // Report (not block) PIN codes that already belong to another active zone.
  const clash = await db
    .select({ name: deliveryZones.name, pincodes: deliveryZones.pincodes })
    .from(deliveryZones)
    .where(and(arrayOverlaps(deliveryZones.pincodes, data.pincodes), eq(deliveryZones.isActive, true), existingId ? ne(deliveryZones.id, existingId) : undefined));
  const overlapping = clash.flatMap((z) => z.pincodes.filter((p) => data.pincodes.includes(p)).map((p) => `${p} (${z.name})`));
  if (existingId) {
    const [res] = await db.update(deliveryZones).set(fields).where(eq(deliveryZones.id, existingId)).returning({ id: deliveryZones.id, name: deliveryZones.name });
    if (!res) throw notFound("Delivery zone");
    return { id: res.id, name: res.name, overlapping };
  }
  const [created] = await db.insert(deliveryZones).values(fields).returning({ id: deliveryZones.id, name: deliveryZones.name });
  return { id: created.id, name: created.name, overlapping };
}

export async function deleteDeliveryZone(zoneId: string) {
  const db = await getDb();
  const [deleted] = await db.delete(deliveryZones).where(eq(deliveryZones.id, id(zoneId, "Zone"))).returning({ name: deliveryZones.name });
  if (!deleted) throw notFound("Delivery zone");
  return { name: deleted.name };
}

export async function setDeliveryZoneActive(zoneId: string, isActive: boolean) {
  const db = await getDb();
  const res = await db.update(deliveryZones).set({ isActive }).where(eq(deliveryZones.id, id(zoneId, "Zone"))).returning({ id: deliveryZones.id });
  if (!res.length) throw notFound("Delivery zone");
}

// ─── Settings sections ─────────────────────────────────────────────────────

export async function getAdminSettings() {
  return serialize(await getBusinessSettings());
}
export type AdminSettings = Awaited<ReturnType<typeof getAdminSettings>>;

export async function updateDeliverySettings(input: unknown) {
  const d = deliverySettingsInputSchema.parse(input);
  await updateBusinessSettings({ delivery: d });
  return d;
}

export async function updateBusinessProfile(input: unknown) {
  const d = businessProfileInputSchema.parse(input);
  await updateBusinessSettings(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v === "" ? null : v])));
  return d;
}

export async function updateTaxSettings(input: unknown) {
  const d = taxInputSchema.parse(input);
  await updateBusinessSettings({ tax: { rateBps: d.ratePercent, inclusive: d.inclusive, label: d.label } });
  return d;
}

export function razorpayEnvConfigured() {
  return !!process.env.RAZORPAY_KEY_ID?.trim() && !!process.env.RAZORPAY_KEY_SECRET?.trim();
}
export function emailEnvConfigured() {
  return !!process.env.RESEND_API_KEY?.trim() && !!process.env.EMAIL_FROM?.trim();
}
export function whatsappEnvConfigured() {
  return !!process.env.WHATSAPP_ACCESS_TOKEN?.trim() && !!process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
}

export async function updatePaymentSettings(input: unknown) {
  const d = paymentSettingsInputSchema.parse(input);
  if (d.razorpayEnabled && !razorpayEnvConfigured()) {
    throw new AppError("Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the environment before enabling online payments.", "NOT_CONFIGURED");
  }
  if (!d.codEnabled && !d.razorpayEnabled) throw new AppError("Keep at least one payment method enabled.");
  await updateBusinessSettings({ payments: { codEnabled: d.codEnabled, codMaxOrderAmount: d.codMaxOrderAmount, razorpayEnabled: d.razorpayEnabled } });
  return d;
}

export async function updateNotificationSettings(input: unknown) {
  const d = notificationSettingsInputSchema.parse(input);
  if (d.emailEnabled && !emailEnvConfigured()) throw new AppError("Configure RESEND_API_KEY and EMAIL_FROM before enabling email notifications.", "NOT_CONFIGURED");
  if (d.whatsappEnabled && !whatsappEnvConfigured()) throw new AppError("Configure the WhatsApp Cloud API variables before enabling WhatsApp notifications.", "NOT_CONFIGURED");
  await updateBusinessSettings({
    notifications: { adminEmail: d.adminEmail || null, emailEnabled: d.emailEnabled, whatsappEnabled: d.whatsappEnabled, soundAlerts: d.soundAlerts },
  });
  return d;
}

export async function updateSocialLinks(input: unknown) {
  const d = socialLinksInputSchema.parse(input);
  await updateBusinessSettings({ social: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v || null])) });
  return d;
}

// ─── Kitchen & hours ───────────────────────────────────────────────────────

export async function updateKitchenControl(input: unknown) {
  const d = kitchenControlInputSchema.parse(input);
  if (d.temporaryClosureActive && d.temporaryClosureFrom && d.temporaryClosureUntil && d.temporaryClosureUntil <= d.temporaryClosureFrom) {
    throw new AppError("Temporary closure must end after it starts.", "VALIDATION", 400, { temporaryClosureUntil: ["Must be after the start"] });
  }
  // Mode and pause timing are owned by setKitchenMode (one-tap controls); this form only
  // saves messages, pre-order and closure settings so it can't undo a quick pause.
  await updateBusinessSettings({
    kitchen: {
      preordersEnabled: d.preordersEnabled,
      preorderMaxDaysAhead: d.preorderMaxDaysAhead,
      closedMessage: d.closedMessage,
      pausedMessage: d.pausedMessage,
      delayAlertMinutes: d.delayAlertMinutes,
      temporaryClosure: {
        active: d.temporaryClosureActive,
        message: d.temporaryClosureMessage ?? null,
        from: d.temporaryClosureFrom ?? null,
        until: d.temporaryClosureUntil ?? null,
      },
    },
  });
  return d;
}

/** One-tap mode change used by the quick controls. */
export async function setKitchenMode(mode: "AUTO" | "OPEN" | "CLOSED" | "PAUSED", pauseMinutes?: number, now = new Date()) {
  if (!["AUTO", "OPEN", "CLOSED", "PAUSED"].includes(mode)) throw new AppError("Invalid mode");
  await updateBusinessSettings({
    kitchen: {
      mode,
      pausedUntil: mode === "PAUSED" && pauseMinutes && pauseMinutes > 0 ? new Date(now.getTime() + Math.min(pauseMinutes, 1440) * 60_000) : null,
    },
  });
}

export async function getAdminHours() {
  return serialize(await getBusinessHours());
}

export async function updateBusinessHours(input: unknown) {
  const d = businessHoursInputSchema.parse(input);
  const weekly = [...d.weekly].sort((a, b) => a.day - b.day);
  if (new Set(weekly.map((w) => w.day)).size !== 7) throw new AppError("Each weekday must appear exactly once.");
  const specialDates = [...d.specialDates].sort((a, b) => a.date.localeCompare(b.date));
  await saveBusinessHoursRow({ weekly, specialDates });
  return { weekly, specialDates };
}

// ─── Website content ───────────────────────────────────────────────────────

export async function getAdminHomeContent() {
  return serialize(await getHomeContentData());
}
export type AdminHomeContent = Awaited<ReturnType<typeof getAdminHomeContent>>;

function img(i: { url: string; publicId?: string | null; alt?: string | null; width?: number | null; height?: number | null } | null | undefined): ImageRef | undefined {
  if (!i) return undefined;
  const out: ImageRef = { url: i.url };
  if (i.publicId) out.publicId = i.publicId;
  if (i.alt) out.alt = i.alt;
  if (i.width != null) out.width = i.width;
  if (i.height != null) out.height = i.height;
  return out;
}
const imgs = (list: Parameters<typeof img>[0][]) => list.map(img).filter((x): x is ImageRef => !!x);

export async function updateHomeContent(input: unknown) {
  const d = homeContentInputSchema.parse(input);
  await updateHomeContentData({
    hero: { ...d.hero, images: imgs(d.hero.images) },
    banners: d.banners.map((b) => ({ ...b, image: img(b.image) })),
    announcement: d.announcement,
    featuredCategoryIds: [...new Set(d.featuredCategoryIds)],
    featuredProductIds: [...new Set(d.featuredProductIds)],
    combos: { heading: d.combos.heading, subheading: d.combos.subheading, categoryId: d.combos.categoryId || null },
    whyChooseUs: d.whyChooseUs,
    about: { heading: d.about.heading, body: d.about.body, image: img(d.about.image) ?? null },
    gallery: imgs(d.gallery),
    footer: d.footer,
  } as Parameters<typeof updateHomeContentData>[0]);
}

export async function listTestimonialsAdmin() {
  const db = await getDb();
  return serialize(await db.select().from(testimonials).orderBy(asc(testimonials.displayOrder), desc(testimonials.createdAt)));
}
export type AdminTestimonial = Awaited<ReturnType<typeof listTestimonialsAdmin>>[number];

export async function saveTestimonial(testimonialId: string | null, input: TestimonialFormInput) {
  const d = testimonialInputSchema.parse(input);
  const db = await getDb();
  const fields = { ...d, location: d.location || null, avatarUrl: d.avatarUrl || null, displayOrder: d.displayOrder ?? 0 };
  if (testimonialId) {
    const [res] = await db.update(testimonials).set(fields).where(eq(testimonials.id, id(testimonialId, "Testimonial"))).returning({ id: testimonials.id, name: testimonials.name });
    if (!res) throw notFound("Testimonial");
    return res;
  }
  const [created] = await db.insert(testimonials).values(fields).returning({ id: testimonials.id, name: testimonials.name });
  return created;
}

export async function deleteTestimonial(testimonialId: string) {
  const db = await getDb();
  const [res] = await db.delete(testimonials).where(eq(testimonials.id, id(testimonialId, "Testimonial"))).returning({ name: testimonials.name });
  if (!res) throw notFound("Testimonial");
  return { name: res.name };
}
