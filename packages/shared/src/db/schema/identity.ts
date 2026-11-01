import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { Role } from "@/constants/domain";
import { createdAt, pk, ts, updatedAt } from "./_columns";

export const users = pgTable(
  "users",
  {
    id: pk(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    /** Null for accounts created with Google that never set a password. */
    passwordHash: text("password_hash"),
    /** Google account id ("sub") for "Continue with Google"; linked by verified email. */
    googleSub: text("google_sub"),
    role: text("role").$type<Role>().notNull().default("CUSTOMER"),
    isActive: boolean("is_active").notNull().default(true),
    /** Incremented to invalidate every existing session (password reset, forced sign-out). */
    sessionVersion: integer("session_version").notNull().default(0),
    isBootstrapAdmin: boolean("is_bootstrap_admin").notNull().default(false),
    adminNotes: text("admin_notes"),
    lastLoginAt: ts("last_login_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(t.email).where(sql`${t.email} is not null`),
    uniqueIndex("users_phone_uq").on(t.phone).where(sql`${t.phone} is not null`),
    uniqueIndex("users_google_sub_uq").on(t.googleSub).where(sql`${t.googleSub} is not null`),
    uniqueIndex("users_bootstrap_admin_uq").on(t.isBootstrapAdmin).where(sql`${t.isBootstrapAdmin}`),
    index("users_role_created_idx").on(t.role, t.createdAt),
    check("users_role_chk", sql`${t.role} in ('CUSTOMER','ADMIN')`),
    check("users_email_lower_chk", sql`${t.email} is null or ${t.email} = lower(${t.email})`),
  ],
);

export const addresses = pgTable(
  "addresses",
  {
    id: pk(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull().default("Home"),
    recipientName: text("recipient_name").notNull(),
    phone: text("phone").notNull(),
    houseNumber: text("house_number").notNull(),
    street: text("street").notNull(),
    landmark: text("landmark"),
    city: text("city").notNull(),
    pincode: text("pincode").notNull(),
    instructions: text("instructions"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("addresses_user_idx").on(t.userId, t.isDefault, t.updatedAt),
    // At most one default address per user.
    uniqueIndex("addresses_one_default_uq").on(t.userId).where(sql`${t.isDefault}`),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: pk(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("password_reset_token_uq").on(t.tokenHash), index("password_reset_expires_idx").on(t.expiresAt)],
);

/** Admin notes about guest customers (no account), keyed by mobile number. */
export const customerNotes = pgTable(
  "customer_notes",
  {
    id: pk(),
    phone: text("phone").notNull(),
    text: text("text").notNull().default(""),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("customer_notes_phone_uq").on(t.phone)],
);
