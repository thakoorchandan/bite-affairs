/**
 * Database client.
 *
 *  - DB_MODE=local         → the local dev database (LOCAL_DATABASE_URL, see ./target.ts). One switch, no other edits.
 *  - DATABASE_URL set      → Postgres over postgres.js (Supabase SESSION pooler, port 5432). Not the transaction pooler
 *                            (6543): postgres.js pipelines concurrent queries on a connection, and those hang there.
 *  - DATABASE_URL missing  → in development/test only: an in-process PGlite (real Postgres compiled to WASM),
 *                            created in memory and migrated on first use. Used by `npm run dev` sample-data mode and tests.
 *  - otherwise             → throws a clear error.
 *
 * IMPORTANT: inside `withTransaction(async (tx) => …)` always query through `tx`. PGlite has a single
 * connection, so using the outer `db` inside a transaction callback waits for that same transaction (deadlock).
 */
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { resolveDbTarget } from "./target";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** A database handle or an open transaction: services accept either so they compose inside transactions. */
export type DbOrTx = Db | Tx;

type Holder = { __biteDb?: Promise<Db>; __biteDbKind?: "postgres" | "pglite"; __biteDbClose?: () => Promise<void> };
const g = globalThis as unknown as Holder;

export function getDb(): Promise<Db> {
  g.__biteDb ??= init().catch((error) => {
    g.__biteDb = undefined;
    throw error;
  });
  return g.__biteDb;
}

/** Which engine is active (after the first `getDb()` call). */
export function dbKind() {
  return g.__biteDbKind;
}

async function init(): Promise<Db> {
  const target = resolveDbTarget();
  if (target.url) return initPostgres(target.url, target.mode === "local");
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is not set. Add your Supabase connection string (see SUPABASE_SETUP.md).");
  }
  return initPglite();
}

async function initPostgres(url: string, local = false): Promise<Db> {
  const [{ default: postgres }, { drizzle }] = await Promise.all([import("postgres"), import("drizzle-orm/postgres-js")]);
  const isLocalHost = local || /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  const client = postgres(url, {
    // Poolers (Supabase/Supavisor) do not keep named prepared statements across connections.
    prepare: false,
    // The local dev DB is PGlite (one session): a single connection keeps it consistent.
    max: Number(process.env.DATABASE_POOL_MAX ?? (local ? 1 : 10)),
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: isLocalHost ? false : "require",
    // Our timestamptz/uuid/jsonb columns are mapped by Drizzle; keep postgres.js from re-parsing them.
    onnotice: () => undefined,
  });
  g.__biteDbKind = "postgres";
  g.__biteDbClose = () => client.end({ timeout: 5 });
  return drizzle(client, { schema }) as unknown as Db;
}

async function initPglite(): Promise<Db> {
  const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
  ]);
  const client = new PGlite();
  const db = drizzle(client, { schema });
  const { resolveMigrationsFolder } = await import("./migrations-path");
  await migrate(db, { migrationsFolder: resolveMigrationsFolder() });
  g.__biteDbKind = "pglite";
  g.__biteDbClose = () => client.close();
  return db as unknown as Db;
}

/** Close the connection pool (scripts and tests call this so the process can exit). */
export async function closeDb() {
  const close = g.__biteDbClose;
  g.__biteDb = undefined;
  g.__biteDbClose = undefined;
  g.__biteDbKind = undefined;
  await close?.();
}

/** Run `fn` in a transaction (READ COMMITTED). Throwing rolls everything back. */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction((tx) => fn(tx));
}
