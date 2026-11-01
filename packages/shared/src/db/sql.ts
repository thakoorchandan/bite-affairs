import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/** `sum(col)` as a JS number (Postgres returns bigint/numeric as strings). Null-safe. */
export const sumInt = (col: AnyColumn | SQL) => sql<number>`coalesce(sum(${col}), 0)`.mapWith(Number);
export const countAll = () => sql<number>`count(*)`.mapWith(Number);
export const avgNum = (col: AnyColumn | SQL) => sql<number>`coalesce(avg(${col}), 0)`.mapWith(Number);

/** Escape `%`/`_` so user input can be used inside ILIKE patterns. */
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Convert a UUID-ish string check for route params before querying (avoids a Postgres cast error). */
export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Rows from `db.execute(sql…)`: postgres.js returns an array, PGlite returns `{ rows }`. Prefer the query builder; use this for raw SQL. */
export function rowsOf<T = Record<string, unknown>>(result: unknown): T[] {
  return (Array.isArray(result) ? result : ((result as { rows?: T[] } | null)?.rows ?? [])) as T[];
}
