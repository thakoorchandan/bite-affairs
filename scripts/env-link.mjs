// Links the root .env.local into every app so Next.js (which reads env files per app folder) and the
// scripts (which read the repo root) all see the same values.   npm run env:link [-- --force]
import { existsSync, lstatSync, readdirSync, symlinkSync, unlinkSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, ".env.local");
if (!existsSync(source)) {
  console.error("No .env.local at the repo root. Run: cp .env.example .env.local   (then fill it in)");
  process.exit(1);
}
const force = process.argv.includes("--force");
for (const app of readdirSync(path.join(root, "apps"), { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const target = path.join(root, "apps", app.name, ".env.local");
  const exists = existsSync(target) || (() => { try { return lstatSync(target).isSymbolicLink(); } catch { return false; } })();
  if (exists) {
    const isLink = lstatSync(target).isSymbolicLink();
    if (!isLink && !force) {
      console.warn(`! apps/${app.name}/.env.local is a real file; left untouched (use --force to replace it with a link).`);
      continue;
    }
    unlinkSync(target);
  }
  symlinkSync(path.relative(path.dirname(target), source), target);
  console.log(`✓ apps/${app.name}/.env.local → ../../.env.local`);
}
