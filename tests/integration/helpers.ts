/** Shared helpers for integration tests. They run on an in-process PGlite Postgres (see tests/setup/env.ts). */
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { hashPassword } from "@/lib/security/password";
import { seed } from "../../scripts/seed";

const { users, products, categories, coupons, deliveryZones, businessSettings, customisationGroups, customisationOptions, productCustomisationGroups } = schema;

const TABLES_TO_KEEP = new Set(["__drizzle_migrations"]);

/** Empty every application table, then re-seed the real menu with an OPEN kitchen and one delivery zone (700001, ₹30). */
export async function resetDatabase() {
  const db = await getDb();
  const res = (await db.execute(sql`select tablename from pg_tables where schemaname = 'public'`)) as unknown as { rows: { tablename: string }[] };
  const names = res.rows.map((r) => r.tablename).filter((n) => !TABLES_TO_KEEP.has(n) && !n.startsWith("__drizzle"));
  if (names.length) await db.execute(sql.raw(`truncate table ${names.map((n) => `"${n}"`).join(", ")} restart identity cascade`));
  await seed({ quiet: true });
  await db.update(businessSettings).set({ kitchen: { mode: "OPEN" } }).where(eq(businessSettings.key, "default"));
  await db.insert(deliveryZones).values({ name: "Test zone", pincodes: ["700001"], deliveryFee: 3000, estimatedMinutes: 25 });
}

export async function product(slug: string) {
  const db = await getDb();
  const [p] = await db.select().from(products).where(eq(products.slug, slug)).limit(1);
  if (!p) throw new Error(`missing product ${slug}`);
  return p;
}

export async function createCoupon(over: Partial<typeof coupons.$inferInsert> = {}) {
  const db = await getDb();
  const [c] = await db.insert(coupons).values({ code: "WELCOME10", type: "PERCENT", value: 1000, perCustomerLimit: 1, ...over }).returning();
  return c;
}

export async function createCustomer(phone = "9876500001") {
  const db = await getDb();
  const [u] = await db.insert(users).values({ name: "Test Customer", phone, email: `${phone}@example.com`, passwordHash: await hashPassword("password123"), role: "CUSTOMER" }).returning();
  return u;
}

export const guest = { name: "Riya Sen", phone: "9830012345" };
export const address = { houseNumber: "12B", street: "Park Street", landmark: "Near the metro", city: "Kolkata", pincode: "700001", instructions: "" };
export const key = () => `test-${Math.random().toString(36).slice(2)}-${Date.now()}`;

/** French fries and its single "Extra Peri Peri" add-on option. */
export async function friesWithPeriPeri() {
  const fries = await product("french-fries");
  const db = await getDb();
  const [link] = await db.select({ groupId: productCustomisationGroups.groupId }).from(productCustomisationGroups).where(eq(productCustomisationGroups.productId, fries.id)).limit(1);
  const [option] = await db.select().from(customisationOptions).where(eq(customisationOptions.groupId, link.groupId)).limit(1);
  return { fries, groupId: link.groupId, optionId: option.id };
}

export { and, eq, sql, categories, customisationGroups };
