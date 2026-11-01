import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, dbErrorMessage, getDb, isUniqueViolation, withTransaction, schema, dbKind } from "@/db";

const { users, coupons, counters, orderStatusHistory, orders, categories, products, addresses } = schema;

beforeAll(async () => {
  await getDb();
});
afterAll(() => closeDb());

async function user(over: Partial<typeof users.$inferInsert> = {}) {
  const db = await getDb();
  const [u] = await db.insert(users).values({ name: "T", passwordHash: "x", ...over }).returning();
  return u;
}

describe("database foundation (PGlite ≙ Supabase Postgres)", () => {
  it("runs on the embedded engine when DATABASE_URL is unset and migrations created every table", async () => {
    expect(dbKind()).toBe("pglite");
    const db = await getDb();
    const rows = await db.execute<{ n: number }>(sql`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`);
    const n = (rows as unknown as { rows: { n: number }[] }).rows[0].n;
    expect(n).toBeGreaterThanOrEqual(30);
  });

  it("enforces unique email/phone (partial) and a single bootstrap admin", async () => {
    await user({ email: "a@x.com", phone: "9800000001" });
    await expect(user({ email: "a@x.com" })).rejects.toSatisfy((e) => isUniqueViolation(e));
    await expect(user({ phone: "9800000001" })).rejects.toSatisfy((e) => isUniqueViolation(e));
    await user({ email: null, phone: null }); // nulls never clash
    await user({ email: null, phone: null });
    await user({ email: "boot@x.com", isBootstrapAdmin: true, role: "ADMIN" });
    await expect(user({ email: "boot2@x.com", isBootstrapAdmin: true, role: "ADMIN" })).rejects.toSatisfy((e) => isUniqueViolation(e));
  });

  it("rejects bad roles, mixed-case emails and negative money via CHECK constraints", async () => {
    await expect(user({ email: "b@x.com", role: "OWNER" as never })).rejects.toThrow();
    await expect(user({ email: "Upper@X.com" })).rejects.toThrow();
    const db = await getDb();
    const [c] = await db.insert(categories).values({ name: "C", slug: "c" }).returning();
    await expect(db.insert(products).values({ name: "P", slug: "p", categoryId: c.id, price: -1, isVeg: true })).rejects.toThrow();
  });

  it("allows only one default address per user", async () => {
    const u = await user({ email: "addr@x.com" });
    const db = await getDb();
    const base = { userId: u.id, recipientName: "R", phone: "9800000002", houseNumber: "1", street: "S", city: "K", pincode: "700001" };
    await db.insert(addresses).values({ ...base, isDefault: true });
    await db.insert(addresses).values({ ...base, isDefault: false });
    await expect(db.insert(addresses).values({ ...base, isDefault: true })).rejects.toSatisfy((e) => isUniqueViolation(e));
  });

  it("maintains updated_at automatically", async () => {
    const u = await user({ email: "touch@x.com" });
    const db = await getDb();
    await new Promise((r) => setTimeout(r, 15));
    await db.update(users).set({ name: "Changed" }).where(sql`${users.id} = ${u.id}`);
    const [after] = await db.select().from(users).where(sql`${users.id} = ${u.id}`);
    expect(after.updatedAt.getTime()).toBeGreaterThan(u.updatedAt.getTime());
  });

  it("allocates unique sequential numbers atomically with an upsert counter", async () => {
    const db = await getDb();
    const next = () => db.insert(counters).values({ key: "order:test", seq: 1 }).onConflictDoUpdate({ target: counters.key, set: { seq: sql`${counters.seq} + 1` } }).returning({ seq: counters.seq });
    const results = await Promise.all(Array.from({ length: 12 }, next));
    const seqs = results.map((r) => r[0].seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it("never over-redeems a limited coupon under concurrent transactions", async () => {
    const db = await getDb();
    const [coupon] = await db.insert(coupons).values({ code: "LIMIT2", type: "FLAT", value: 5000, usageLimit: 2 }).returning();
    const consume = () =>
      withTransaction(async (tx) => {
        const res = await tx
          .update(coupons)
          .set({ usedCount: sql`${coupons.usedCount} + 1` })
          .where(sql`${coupons.id} = ${coupon.id} and (${coupons.usageLimit} is null or ${coupons.usageLimit} = 0 or ${coupons.usedCount} < ${coupons.usageLimit})`)
          .returning({ id: coupons.id });
        return res.length === 1;
      });
    const outcomes = await Promise.all(Array.from({ length: 8 }, consume));
    expect(outcomes.filter(Boolean)).toHaveLength(2);
    const [after] = await db.select().from(coupons).where(sql`${coupons.id} = ${coupon.id}`);
    expect(after.usedCount).toBe(2);
  });

  it("rolls back a failed transaction completely", async () => {
    const db = await getDb();
    await expect(
      withTransaction(async (tx) => {
        await tx.insert(counters).values({ key: "rollback-me", seq: 5 });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const rows = await db.select().from(counters).where(sql`${counters.key} = 'rollback-me'`);
    expect(rows).toHaveLength(0);
  });

  it("blocks updates and deletes on the append-only order status history", async () => {
    const db = await getDb();
    const [o] = await db
      .insert(orders)
      .values({ orderNumber: "BA000000-001", idempotencyKey: "k-history", isGuest: true, customerName: "N", customerPhone: "9800000003", itemsSubtotal: 100, subtotal: 100, total: 100, paymentMethod: "COD", status: "PLACED", trackingTokenHash: "h" })
      .returning();
    const [h] = await db.insert(orderStatusHistory).values({ orderId: o.id, orderNumber: o.orderNumber, to: "PLACED", actorType: "SYSTEM" }).returning();
    const failure = async (p: Promise<unknown>) => p.then(() => "no error", dbErrorMessage);
    expect(await failure(db.update(orderStatusHistory).set({ note: "tamper" }).where(sql`${orderStatusHistory.id} = ${h.id}`) as unknown as Promise<unknown>)).toMatch(/append-only/);
    expect(await failure(db.delete(orderStatusHistory).where(sql`${orderStatusHistory.id} = ${h.id}`) as unknown as Promise<unknown>)).toMatch(/append-only/);
    // Inserting more history is fine.
    await db.insert(orderStatusHistory).values({ orderId: o.id, orderNumber: o.orderNumber, from: "PLACED", to: "CONFIRMED", actorType: "ADMIN" });
  });

  it("has Row Level Security enabled on every application table (no policies)", async () => {
    const db = await getDb();
    const res = (await db.execute(sql`select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename not like '\_\_drizzle%' escape '\'`)) as unknown as { rows: { tablename: string; rowsecurity: boolean }[] };
    expect(res.rows.length).toBeGreaterThanOrEqual(30);
    expect(res.rows.filter((r) => !r.rowsecurity)).toEqual([]);
    const pol = (await db.execute(sql`select count(*)::int as n from pg_policies where schemaname = 'public'`)) as unknown as { rows: { n: number }[] };
    expect(pol.rows[0].n).toBe(0);
  });
});
