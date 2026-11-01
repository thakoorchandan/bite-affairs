import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

/** Primary key: server-generated UUID (works on Supabase Postgres and PGlite). */
export const pk = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);

export const createdAt = () => timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();
/** `updatedAt` is maintained by the app on every write (use `touch()` / set explicitly). */
export const updatedAt = () => timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();
export const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export type ImageRef = { url: string; publicId?: string | null; width?: number | null; height?: number | null; alt?: string | null };
export type VideoRef = { url: string; publicId?: string | null; posterUrl?: string | null; durationSeconds?: number | null };
