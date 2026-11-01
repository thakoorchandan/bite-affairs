import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { resolveMigrationUrl } from "./packages/shared/src/db/target";

config({ path: ".env.local" });
config({ path: ".env" });

/**
 * `npm run db:generate`  → writes SQL migrations to ./drizzle from the schema.
 * `npm run db:migrate`   → applies them to DIRECT_URL (falls back to DATABASE_URL).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/shared/src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: resolveMigrationUrl() ?? "postgres://localhost:5432/postgres" },
  strict: true,
  verbose: true,
});
