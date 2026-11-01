// The database switch.   npm run db:use -- local | remote | (no argument = show current)
// Edits DB_MODE in .env.local (creates the file/line if missing). See packages/shared/src/db/target.ts.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), ".env.local");
const arg = process.argv[2]?.toLowerCase();
const text = existsSync(file) ? readFileSync(file, "utf8") : "";
const current = text.match(/^DB_MODE=(.*)$/m)?.[1]?.trim() || "remote (default)";

if (!arg) {
  console.log(`Database mode: ${current}`);
  process.exit(0);
}
if (arg !== "local" && arg !== "remote") {
  console.error('Usage: npm run db:use -- local | remote');
  process.exit(1);
}
const line = `DB_MODE=${arg}`;
const next = /^DB_MODE=.*$/m.test(text) ? text.replace(/^DB_MODE=.*$/m, line) : `${line}\n${text}`;
writeFileSync(file, next);
console.log(`✓ DB_MODE=${arg} in .env.local`);
if (arg === "local") console.log("  Start the local database first:  npm run dev:db   (then npm run dev / npm run dev:admin)");
else console.log("  Using DATABASE_URL (your real database). Restart the dev servers to apply.");
