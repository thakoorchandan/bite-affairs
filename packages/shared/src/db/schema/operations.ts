import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { ExpenseCategory, NotificationType } from "@/constants/domain";
import { createdAt, pk, ts, updatedAt } from "./_columns";
import { users } from "./identity";

/** Singleton rows (key = 'default'). Defaults are applied by services/settings.service.ts. */
export const businessSettings = pgTable("business_settings", {
  key: text("key").primaryKey().default("default"),
  businessName: text("business_name").notNull().default("Bite Affairs"),
  contactPhone: text("contact_phone"),
  contactWhatsapp: text("contact_whatsapp"),
  contactEmail: text("contact_email"),
  addressLine: text("address_line"),
  city: text("city").notNull().default("Kolkata"),
  gstin: text("gstin"),
  fssaiNumber: text("fssai_number"),
  /** Sections: stored as JSON; missing keys fall back to defaults in the service layer. */
  kitchen: jsonb("kitchen").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  delivery: jsonb("delivery").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  tax: jsonb("tax").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  payments: jsonb("payments").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  notifications: jsonb("notifications").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  social: jsonb("social").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type HoursSlotRow = { open: string; close: string };
export const businessHours = pgTable("business_hours", {
  key: text("key").primaryKey().default("default"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  weekly: jsonb("weekly").$type<{ day: number; isOpen: boolean; slots: HoursSlotRow[] }[]>().notNull().default(sql`'[]'::jsonb`),
  specialDates: jsonb("special_dates").$type<{ date: string; isClosed: boolean; slots: HoursSlotRow[]; note?: string | null }[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Singleton (key = 'home'): all admin-editable storefront copy and imagery. */
export const websiteContent = pgTable("website_content", {
  key: text("key").primaryKey().default("home"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: pk(),
    audience: text("audience").$type<"ADMIN" | "CUSTOMER">().notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id"),
    orderNumber: text("order_number"),
    type: text("type").$type<NotificationType>().notNull(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_owner_idx").on(t.audience, t.userId, t.createdAt), index("notifications_unread_idx").on(t.audience, t.readAt, t.createdAt), index("notifications_created_idx").on(t.createdAt)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: pk(),
    category: text("category").$type<ExpenseCategory>().notNull(),
    amount: integer("amount").notNull(),
    description: text("description"),
    vendor: text("vendor"),
    incurredOn: ts("incurred_on").notNull(),
    paymentMode: text("payment_mode").$type<"CASH" | "UPI" | "CARD" | "BANK" | "OTHER">().notNull().default("CASH"),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("expenses_incurred_idx").on(t.incurredOn), index("expenses_category_idx").on(t.category, t.incurredOn)],
);

export const adminActivityLogs = pgTable(
  "admin_activity_logs",
  {
    id: pk(),
    actorId: uuid("actor_id"),
    actorName: text("actor_name"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("admin_logs_created_idx").on(t.createdAt), index("admin_logs_entity_idx").on(t.entityType, t.entityId, t.createdAt)],
);

/** Atomic counters (e.g. daily order sequence). */
export const counters = pgTable("counters", {
  key: text("key").primaryKey(),
  seq: integer("seq").notNull().default(0),
});

/** Fixed-window rate-limit buckets shared across serverless instances. Expired rows are pruned lazily. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("rate_limits_expires_idx").on(t.expiresAt)],
);

