/**
 * THE database switch. Set one variable in .env.local:
 *
 *   DB_MODE=local    → the local dev database (`npm run dev:db`), at LOCAL_DATABASE_URL
 *                      (default postgres://postgres:postgres@127.0.0.1:54329/postgres). Never allowed in production.
 *   DB_MODE=remote   → your real database at DATABASE_URL (Supabase). This is also the default when DB_MODE is unset.
 *
 * Flip it with `npm run db:use -- local` / `npm run db:use -- remote`. Plain module (no aliases) so drizzle.config.ts can import it.
 */
export const DEFAULT_LOCAL_DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:54329/postgres";

export type DbTarget = { mode: "local" | "remote"; url: string | undefined };

export function resolveDbTarget(env: NodeJS.ProcessEnv = process.env): DbTarget {
  const raw = env.DB_MODE?.trim().toLowerCase();
  if (raw && raw !== "local" && raw !== "remote") throw new Error(`DB_MODE must be "local" or "remote" (got "${env.DB_MODE}").`);
  if (raw === "local") {
    if (env.NODE_ENV === "production") throw new Error('DB_MODE=local is not allowed in production. Use DB_MODE=remote with DATABASE_URL.');
    return { mode: "local", url: env.LOCAL_DATABASE_URL?.trim() || DEFAULT_LOCAL_DATABASE_URL };
  }
  return { mode: "remote", url: env.DATABASE_URL?.trim() || undefined };
}

/** Connection string for migrations/tools: the direct (session) URL when remote and available. */
export function resolveMigrationUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const t = resolveDbTarget(env);
  return t.mode === "remote" ? env.DIRECT_URL?.trim() || t.url : t.url;
}
