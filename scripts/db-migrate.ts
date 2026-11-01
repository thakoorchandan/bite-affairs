/** Applies SQL migrations from ./drizzle to the selected database (DB_MODE). Idempotent.   npm run db:migrate */
import "./_env";
import { resolveDbTarget, resolveMigrationUrl } from "@/db/target";
import { resolveMigrationsFolder } from "@/db/migrations-path";

async function main() {
  const target = resolveDbTarget();
  const url = resolveMigrationUrl();
  if (!url) throw new Error("No database configured: set DATABASE_URL (and DIRECT_URL) or use DB_MODE=local (see .env.example).");
  const [{ default: postgres }, { drizzle }, { migrate }] = await Promise.all([import("postgres"), import("drizzle-orm/postgres-js"), import("drizzle-orm/postgres-js/migrator")]);
  const local = target.mode === "local";
  const client = postgres(url, { max: 1, prepare: false, ssl: local || /@(localhost|127\.0\.0\.1)[:/]/.test(url) ? false : "require", onnotice: () => undefined });
  try {
    await migrate(drizzle(client), { migrationsFolder: resolveMigrationsFolder() });
    console.log(`✓ Migrations applied (${target.mode} database)`);
  } finally {
    await client.end({ timeout: 5 });
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
