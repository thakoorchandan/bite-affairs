import { eq, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { AppError } from "@/lib/utilities/errors";

/**
 * Fixed-window rate limiter stored in Postgres so limits hold across serverless instances.
 * Expired buckets are pruned lazily (≈1% of calls), so no scheduled job is needed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
  const db = await getDb();
  const windowStart = Math.floor(Date.now() / (windowSeconds * 1000));
  const id = `${key}:${windowStart}`;
  const expiresAt = new Date((windowStart + 1) * windowSeconds * 1000 + 1000);
  const [row] = await db
    .insert(schema.rateLimits)
    .values({ key: id, count: 1, expiresAt })
    .onConflictDoUpdate({ target: schema.rateLimits.key, set: { count: sql`${schema.rateLimits.count} + 1` } })
    .returning({ count: schema.rateLimits.count });
  if (Math.random() < 0.01) void db.delete(schema.rateLimits).where(lt(schema.rateLimits.expiresAt, new Date())).catch(() => undefined);
  const count = row?.count ?? 1;
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

/** Clears the current window's bucket for `key` (e.g. after a successful sign-in, so only failures count). */
export async function resetRateLimit(key: string, windowSeconds: number): Promise<void> {
  const db = await getDb();
  const windowStart = Math.floor(Date.now() / (windowSeconds * 1000));
  await db.delete(schema.rateLimits).where(eq(schema.rateLimits.key, `${key}:${windowStart}`));
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number, message = "Too many attempts. Please wait a moment and try again.") {
  const { allowed } = await rateLimit(key, limit, windowSeconds);
  if (!allowed) throw new AppError(message, "RATE_LIMITED", 429);
}
