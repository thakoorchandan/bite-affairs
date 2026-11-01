import { existsSync } from "node:fs";
import path from "node:path";

/** Finds the repo's `drizzle/` migrations folder by walking up from the working directory. */
export function resolveMigrationsFolder(): string {
  const fromEnv = process.env.MIGRATIONS_DIR;
  if (fromEnv && existsSync(path.join(fromEnv, "meta", "_journal.json"))) return fromEnv;
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, "drizzle");
    if (existsSync(path.join(candidate, "meta", "_journal.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not find the drizzle/ migrations folder. Run `npm run db:generate` or set MIGRATIONS_DIR.");
}
