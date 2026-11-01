import { and, asc, desc, eq, getDb, ilike, isNull, ne, or, schema, sql, countAll, isUuid, likeEscape, toOrderDocs, sumInt } from "@/db";
import { AppError, notFound } from "@/lib/utilities/errors";
import { generateToken, sha256 } from "@/lib/security/tokens";
import type { SQL } from "drizzle-orm";
import { serialize } from "@/lib/utilities/serialize";
import { NON_SALE_STATUSES } from "./analytics.service";

const { users, orders, orderItems, addresses, customerNotes, passwordResetTokens } = schema;

/** `'CANCELLED','REJECTED',…` as a SQL literal list (constants, never user input). */
const NON_SALE_LIST = sql.raw(NON_SALE_STATUSES.map((s) => `'${s}'`).join(","));
const notSale = sql`${orders.status} not in (${NON_SALE_LIST})`;

export interface CustomerListRow {
  key: string; // user id, or "guest-<phone>"
  type: "REGISTERED" | "GUEST";
  name: string;
  phone?: string | null;
  email?: string | null;
  orders: number;
  spend: number;
  lastOrderAt?: string | null;
  joinedAt?: string | null;
  isActive?: boolean;
}

export async function listRegisteredCustomers(opts: { q?: string; page?: number; sort?: string; hasOrders?: string }) {
  const db = await getDb();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = 20;

  const stats = db.$with("stats").as(
    db
      .select({
        userId: orders.userId,
        orders: countAll().as("orders"),
        spend: sumInt(orders.total).as("spend"),
        lastOrderAt: sql<Date>`max(${orders.createdAt})`.as("last_order_at"),
      })
      .from(orders)
      .where(and(sql`${orders.userId} is not null`, notSale))
      .groupBy(orders.userId),
  );
  const orderCount = sql<number>`coalesce(${stats.orders}, 0)`.mapWith(Number);
  const spend = sql<number>`coalesce(${stats.spend}, 0)`.mapWith(Number);

  const q = opts.q?.trim();
  const conditions: (SQL | undefined)[] = [eq(users.role, "CUSTOMER")];
  if (q) {
    const digits = q.replace(/\D/g, "");
    conditions.push(or(ilike(users.name, `%${likeEscape(q)}%`), ilike(users.email, `%${likeEscape(q.toLowerCase())}%`), ilike(users.phone, `%${likeEscape(digits || q)}%`)));
  }
  if (opts.hasOrders === "yes") conditions.push(sql`${orderCount} > 0`);
  else if (opts.hasOrders === "no") conditions.push(sql`${orderCount} = 0`);
  const where = and(...conditions);

  const orderBy =
    opts.sort === "spend" ? [desc(spend)] : opts.sort === "orders" ? [desc(orderCount)] : opts.sort === "recent" ? [sql`${stats.lastOrderAt} desc nulls last`] : [desc(users.createdAt)];

  const [rows, [{ n: total }]] = await Promise.all([
    db
      .with(stats)
      .select({ id: users.id, name: users.name, phone: users.phone, email: users.email, isActive: users.isActive, createdAt: users.createdAt, orders: orderCount, spend, lastOrderAt: stats.lastOrderAt })
      .from(users)
      .leftJoin(stats, eq(stats.userId, users.id))
      .where(where)
      .orderBy(...orderBy, asc(users.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.with(stats).select({ n: countAll() }).from(users).leftJoin(stats, eq(stats.userId, users.id)).where(where),
  ]);

  const items: CustomerListRow[] = rows.map((u) => ({
    key: u.id,
    type: "REGISTERED",
    name: u.name,
    phone: u.phone ?? null,
    email: u.email ?? null,
    orders: u.orders,
    spend: u.spend,
    lastOrderAt: u.lastOrderAt ? new Date(u.lastOrderAt).toISOString() : null,
    joinedAt: u.createdAt.toISOString(),
    isActive: u.isActive !== false,
  }));
  return { items, total, page, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Guests are not stored as users; they are aggregated from their orders by phone number. */
export async function listGuestCustomers(opts: { q?: string; page?: number; sort?: string }) {
  const db = await getDb();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = 20;
  const q = opts.q?.trim();
  const conditions: (SQL | undefined)[] = [isNull(orders.userId), ne(orders.status, "AWAITING_PAYMENT")];
  if (q) conditions.push(or(ilike(orders.customerName, `%${likeEscape(q)}%`), ilike(orders.customerPhone, `%${likeEscape(q.replace(/\D/g, "") || q)}%`)));

  const grouped = db.$with("guests").as(
    db
      .select({
        phone: orders.customerPhone,
        name: sql<string>`(array_agg(${orders.customerName} order by ${orders.createdAt} desc))[1]`.as("name"),
        email: sql<string | null>`(array_agg(${orders.customerEmail} order by ${orders.createdAt} desc))[1]`.as("email"),
        orders: sql<number>`count(*) filter (where ${notSale})`.mapWith(Number).as("orders"),
        spend: sql<number>`coalesce(sum(${orders.total}) filter (where ${notSale}), 0)`.mapWith(Number).as("spend"),
        lastOrderAt: sql<Date>`max(${orders.createdAt})`.as("last_order_at"),
        firstOrderAt: sql<Date>`min(${orders.createdAt})`.as("first_order_at"),
      })
      .from(orders)
      .where(and(...conditions))
      .groupBy(orders.customerPhone),
  );
  const orderBy = opts.sort === "spend" ? desc(grouped.spend) : opts.sort === "orders" ? desc(grouped.orders) : desc(grouped.lastOrderAt);

  const [rows, [{ n: total }]] = await Promise.all([
    db.with(grouped).select().from(grouped).orderBy(orderBy, asc(grouped.phone)).limit(pageSize).offset((page - 1) * pageSize),
    db.with(grouped).select({ n: countAll() }).from(grouped),
  ]);
  const items: CustomerListRow[] = rows.map((g) => ({
    key: `guest-${g.phone}`,
    type: "GUEST",
    name: g.name,
    phone: g.phone,
    email: g.email ?? null,
    orders: g.orders,
    spend: g.spend,
    lastOrderAt: new Date(g.lastOrderAt).toISOString(),
    joinedAt: new Date(g.firstOrderAt).toISOString(),
  }));
  return { items, total, page, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getCustomerDetail(key: string) {
  const db = await getDb();
  const isGuest = key.startsWith("guest-");
  let profile: { type: "REGISTERED" | "GUEST"; id?: string; name: string; phone?: string | null; email?: string | null; joinedAt?: string | null; lastLoginAt?: string | null; isActive?: boolean; notes?: string | null };
  let orderFilter: SQL;
  let addressRows: (typeof addresses.$inferSelect)[] = [];

  if (isGuest) {
    const phone = key.slice(6);
    if (!/^[6-9]\d{9}$/.test(phone)) return null;
    orderFilter = and(eq(orders.customerPhone, phone), isNull(orders.userId))!;
    const [latest] = await db.select({ name: orders.customerName, email: orders.customerEmail }).from(orders).where(orderFilter).orderBy(desc(orders.createdAt)).limit(1);
    if (!latest) return null;
    const [note] = await db.select().from(customerNotes).where(eq(customerNotes.phone, phone)).limit(1);
    profile = { type: "GUEST", name: latest.name, phone, email: latest.email ?? null, notes: note?.text ?? null };
  } else {
    if (!isUuid(key)) return null;
    const [user] = await db.select().from(users).where(and(eq(users.id, key), eq(users.role, "CUSTOMER"))).limit(1);
    if (!user) return null;
    orderFilter = eq(orders.userId, user.id);
    addressRows = await db.select().from(addresses).where(eq(addresses.userId, user.id)).orderBy(desc(addresses.isDefault), desc(addresses.updatedAt));
    profile = {
      type: "REGISTERED",
      id: user.id,
      name: user.name,
      phone: user.phone ?? null,
      email: user.email ?? null,
      joinedAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      isActive: user.isActive !== false,
      notes: user.adminNotes ?? null,
    };
  }

  const saleFilter = and(orderFilter, notSale);
  const [orderRows, [stats], favourites] = await Promise.all([
    db.select().from(orders).where(and(orderFilter, ne(orders.status, "AWAITING_PAYMENT"))).orderBy(desc(orders.createdAt)).limit(50),
    db
      .select({ orders: countAll(), spend: sumInt(orders.total), last: sql<Date | null>`max(${orders.createdAt})`, first: sql<Date | null>`min(${orders.createdAt})` })
      .from(orders)
      .where(saleFilter),
    db
      .select({ name: orderItems.name, qty: sumInt(orderItems.quantity), orders: countAll() })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(saleFilter)
      .groupBy(orderItems.name)
      .orderBy(desc(sql`sum(${orderItems.quantity})`))
      .limit(5),
  ]);

  return {
    profile,
    addresses: addressRows.map((a) => ({ id: a.id, label: a.label, recipientName: a.recipientName, phone: a.phone, houseNumber: a.houseNumber, street: a.street, landmark: a.landmark ?? undefined, city: a.city, pincode: a.pincode, isDefault: a.isDefault })),
    orders: serialize(await toOrderDocs(db, orderRows)),
    stats: {
      orders: stats?.orders ?? 0,
      spend: stats?.spend ?? 0,
      lastOrderAt: stats?.last ? new Date(stats.last).toISOString() : null,
      firstOrderAt: stats?.first ? new Date(stats.first).toISOString() : null,
      aov: stats?.orders ? Math.round(stats.spend / stats.orders) : 0,
    },
    favourites: favourites.map((f) => ({ name: f.name, qty: f.qty, orders: f.orders })),
  };
}
export type CustomerDetail = NonNullable<Awaited<ReturnType<typeof getCustomerDetail>>>;

// ─── Mutations ─────────────────────────────────────────────────────────────

/** Save the admin's notes about a customer: `guest-<phone>` keys use customer_notes, registered ids use users.admin_notes. */
export async function saveCustomerNotes(key: string, text: string, adminId?: string | null) {
  const db = await getDb();
  const clean = text.trim();
  if (key.startsWith("guest-")) {
    const phone = key.slice(6);
    if (!/^[6-9]\d{9}$/.test(phone)) throw new AppError("Invalid customer");
    const updatedBy = adminId && isUuid(adminId) ? adminId : null;
    await db.insert(customerNotes).values({ phone, text: clean, updatedBy }).onConflictDoUpdate({ target: customerNotes.phone, set: { text: clean, updatedBy } });
    return;
  }
  if (!isUuid(key)) throw notFound("Customer");
  const res = await db.update(users).set({ adminNotes: clean }).where(and(eq(users.id, key), eq(users.role, "CUSTOMER"))).returning({ id: users.id });
  if (!res.length) throw notFound("Customer");
}

/** One-hour, single-use password reset token for a customer (the caller builds the link). */
export async function createPasswordResetToken(userId: string) {
  if (!isUuid(userId)) throw notFound("Customer");
  const db = await getDb();
  const [user] = await db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.id, userId), eq(users.role, "CUSTOMER"), eq(users.isActive, true))).limit(1);
  if (!user) throw notFound("Customer");
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash: sha256(token), expiresAt });
  return { token, expiresAt, name: user.name };
}

/** Enable/disable a customer account. Disabling also signs them out everywhere (session version bump). */
export async function setCustomerActive(userId: string, isActive: boolean) {
  if (!isUuid(userId)) throw notFound("Customer");
  const db = await getDb();
  const res = await db
    .update(users)
    .set(isActive ? { isActive: true } : { isActive: false, sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(and(eq(users.id, userId), eq(users.role, "CUSTOMER")))
    .returning({ id: users.id });
  if (!res.length) throw notFound("Customer");
}
