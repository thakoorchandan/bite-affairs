import { eq } from "drizzle-orm";
import {
  DEFAULT_HOME_CONTENT,
  DEFAULT_SETTINGS_SECTIONS,
  DEFAULT_WEEKLY_HOURS,
  getDb,
  mergeDefaults,
  schema,
  type BusinessHoursDoc,
  type BusinessSettingsDoc,
  type DbOrTx,
  type HomeContentData,
} from "@/db";
import { computeKitchenStatus, type HoursConfig, type KitchenConfig, type KitchenStatus } from "./kitchen-status";

export { DEFAULT_WEEKLY_HOURS };

const { businessSettings, businessHours, websiteContent } = schema;
type SettingsRow = typeof businessSettings.$inferSelect;
type HoursRow = typeof businessHours.$inferSelect;

type DeepPartial<T> = T extends Date ? T : T extends Array<infer U> ? U[] : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
export type BusinessSettingsPatch = DeepPartial<Omit<BusinessSettingsDoc, "key" | "createdAt" | "updatedAt">>;
export type BusinessHoursPatch = Partial<Pick<BusinessHoursDoc, "timezone" | "weekly" | "specialDates">>;
export type HomeContentPatch = DeepPartial<HomeContentData>;

type Json = Record<string, unknown>;
const SECTIONS = ["kitchen", "delivery", "tax", "payments", "notifications", "social"] as const;
const FLAT_FIELDS = ["businessName", "contactPhone", "contactWhatsapp", "contactEmail", "addressLine", "city", "gstin", "fssaiNumber"] as const;

/** Dates → ISO strings (recursively) so a value can live inside a jsonb column. */
function jsonify<T>(value: T): T {
  if (value instanceof Date) return value.toISOString() as unknown as T;
  if (Array.isArray(value)) return value.map(jsonify) as unknown as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Json).map(([k, v]) => [k, jsonify(v)])) as T;
  return value;
}
const toDate = (v: unknown): Date | null => (v ? new Date(v as string) : null);

function rowToSettings(row: SettingsRow): BusinessSettingsDoc {
  const kitchen = mergeDefaults(DEFAULT_SETTINGS_SECTIONS.kitchen as unknown as Json, row.kitchen) as Json & { temporaryClosure: Json };
  return {
    key: row.key,
    businessName: row.businessName,
    contactPhone: row.contactPhone,
    contactWhatsapp: row.contactWhatsapp,
    contactEmail: row.contactEmail,
    addressLine: row.addressLine,
    city: row.city,
    gstin: row.gstin,
    fssaiNumber: row.fssaiNumber,
    kitchen: {
      ...(kitchen as unknown as BusinessSettingsDoc["kitchen"]),
      pausedUntil: toDate(kitchen.pausedUntil),
      temporaryClosure: {
        ...(kitchen.temporaryClosure as unknown as BusinessSettingsDoc["kitchen"]["temporaryClosure"]),
        from: toDate(kitchen.temporaryClosure?.from),
        until: toDate(kitchen.temporaryClosure?.until),
      },
    },
    delivery: mergeDefaults(DEFAULT_SETTINGS_SECTIONS.delivery as unknown as Json, row.delivery) as unknown as BusinessSettingsDoc["delivery"],
    tax: mergeDefaults(DEFAULT_SETTINGS_SECTIONS.tax as unknown as Json, row.tax) as unknown as BusinessSettingsDoc["tax"],
    payments: mergeDefaults(DEFAULT_SETTINGS_SECTIONS.payments as unknown as Json, row.payments) as unknown as BusinessSettingsDoc["payments"],
    notifications: mergeDefaults(DEFAULT_SETTINGS_SECTIONS.notifications as unknown as Json, row.notifications) as unknown as BusinessSettingsDoc["notifications"],
    social: mergeDefaults(DEFAULT_SETTINGS_SECTIONS.social as unknown as Json, row.social) as unknown as BusinessSettingsDoc["social"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function ensureSettingsRow(q: DbOrTx): Promise<SettingsRow> {
  const [row] = await q.select().from(businessSettings).where(eq(businessSettings.key, "default")).limit(1);
  if (row) return row;
  await q.insert(businessSettings).values({ key: "default" }).onConflictDoNothing();
  const [created] = await q.select().from(businessSettings).where(eq(businessSettings.key, "default")).limit(1);
  return created;
}

/** Loads the singleton settings document, creating it with defaults on first use. */
export async function getBusinessSettings(tx?: DbOrTx): Promise<BusinessSettingsDoc> {
  return rowToSettings(await ensureSettingsRow(tx ?? (await getDb())));
}

/** Merge a (deep-partial) patch into the singleton settings row. Sections merge one level deep; Dates are stored as ISO. */
export async function updateBusinessSettings(patch: BusinessSettingsPatch, tx?: DbOrTx): Promise<BusinessSettingsDoc> {
  const q = tx ?? (await getDb());
  const current = rowToSettings(await ensureSettingsRow(q));
  const set: Partial<SettingsRow> = {};
  for (const f of FLAT_FIELDS) if (f in patch && (patch as Json)[f] !== undefined) (set as Json)[f] = (patch as Json)[f];
  for (const s of SECTIONS) {
    const p = (patch as Json)[s];
    if (p && typeof p === "object") (set as Json)[s] = mergeDefaults(jsonify(current[s]) as unknown as Json, jsonify(p) as Json);
  }
  if (Object.keys(set).length === 0) return current;
  const [row] = await q.update(businessSettings).set(set).where(eq(businessSettings.key, "default")).returning();
  return rowToSettings(row);
}

function rowToHours(row: HoursRow): BusinessHoursDoc {
  return { key: row.key, timezone: row.timezone, weekly: row.weekly ?? [], specialDates: row.specialDates ?? [], createdAt: row.createdAt, updatedAt: row.updatedAt };
}

async function ensureHoursRow(q: DbOrTx): Promise<HoursRow> {
  const [row] = await q.select().from(businessHours).where(eq(businessHours.key, "default")).limit(1);
  if (row) return row;
  await q.insert(businessHours).values({ key: "default", weekly: DEFAULT_WEEKLY_HOURS, specialDates: [] }).onConflictDoNothing();
  const [created] = await q.select().from(businessHours).where(eq(businessHours.key, "default")).limit(1);
  return created;
}

export async function getBusinessHours(tx?: DbOrTx): Promise<BusinessHoursDoc> {
  return rowToHours(await ensureHoursRow(tx ?? (await getDb())));
}

export async function updateBusinessHours(patch: BusinessHoursPatch, tx?: DbOrTx): Promise<BusinessHoursDoc> {
  const q = tx ?? (await getDb());
  const current = rowToHours(await ensureHoursRow(q));
  const set: Partial<HoursRow> = {};
  if (patch.timezone !== undefined) set.timezone = patch.timezone;
  if (patch.weekly !== undefined) set.weekly = patch.weekly;
  if (patch.specialDates !== undefined) set.specialDates = patch.specialDates;
  if (Object.keys(set).length === 0) return current;
  const [row] = await q.update(businessHours).set(set).where(eq(businessHours.key, "default")).returning();
  return rowToHours(row);
}

/** Storefront content with defaults applied (stored values win key by key; arrays replace). */
export async function getHomeContentData(tx?: DbOrTx): Promise<HomeContentData> {
  const q = tx ?? (await getDb());
  const [row] = await q.select().from(websiteContent).where(eq(websiteContent.key, "home")).limit(1);
  return mergeDefaults(DEFAULT_HOME_CONTENT as unknown as Json, row?.data) as unknown as HomeContentData;
}

export async function updateHomeContentData(patch: HomeContentPatch, tx?: DbOrTx): Promise<HomeContentData> {
  const q = tx ?? (await getDb());
  const current = await getHomeContentData(q);
  const next = mergeDefaults(jsonify(current) as unknown as Json, jsonify(patch) as Json);
  await q.insert(websiteContent).values({ key: "home", data: next }).onConflictDoUpdate({ target: websiteContent.key, set: { data: next } });
  return next as unknown as HomeContentData;
}

export function toHoursConfig(hours: BusinessHoursDoc): HoursConfig {
  return {
    timezone: hours.timezone || "Asia/Kolkata",
    weekly: (hours.weekly ?? []).map((w) => ({ day: w.day, isOpen: w.isOpen ?? true, slots: (w.slots ?? []).map((s) => ({ open: s.open, close: s.close })) })),
    specialDates: (hours.specialDates ?? []).map((s) => ({ date: s.date, isClosed: s.isClosed ?? true, slots: (s.slots ?? []).map((x) => ({ open: x.open, close: x.close })), note: s.note })),
  };
}

export function toKitchenConfig(settings: BusinessSettingsDoc): KitchenConfig {
  const k = settings.kitchen;
  return {
    mode: k.mode ?? "AUTO",
    preordersEnabled: !!k.preordersEnabled,
    preorderMaxDaysAhead: k.preorderMaxDaysAhead ?? 2,
    closedMessage: k.closedMessage,
    pausedMessage: k.pausedMessage,
    pausedUntil: k.pausedUntil,
    temporaryClosure: k.temporaryClosure,
  };
}

export async function getKitchenStatus(now = new Date()): Promise<KitchenStatus> {
  const [settings, hours] = await Promise.all([getBusinessSettings(), getBusinessHours()]);
  return computeKitchenStatus(toKitchenConfig(settings), toHoursConfig(hours), now);
}
