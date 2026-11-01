// Fails if apps/store and apps/admin depend on each other. Shared code belongs in packages/shared/src.
//   npm run check:boundaries
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const skip = new Set(["node_modules", "public"]);
const importRe = /(?:from\s+|import\s*\(\s*|import\s+|require\(\s*)["']([^"']+)["']/g;
const problems = [];

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name) || e.name.startsWith(".next")) continue;
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, out) : /\.(tsx?|mjs|css)$/.test(e.name) && out.push(p);
  }
  return out;
}

const apps = { store: path.join(root, "apps/store"), admin: path.join(root, "apps/admin") };
for (const [name, dir] of Object.entries(apps)) {
  const other = name === "store" ? "admin" : "store";
  for (const file of walk(dir)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(importRe)) {
      const spec = m[1];
      if (new RegExp(`apps/${other}\\b`).test(spec)) problems.push(`${path.relative(root, file)}: imports ${spec}`);
      if (spec.startsWith(".")) {
        const target = path.resolve(path.dirname(file), spec);
        const inOwn = target.startsWith(dir + path.sep);
        const inShared = target.startsWith(path.join(root, "packages/shared") + path.sep);
        if (!inOwn && !inShared) problems.push(`${path.relative(root, file)}: relative import leaves the app (${spec})`);
      }
    }
  }
}

// The same relative path must not exist in both app src trees (would shadow shared code differently per app).
const rel = (d) => (existsSync(d) ? walk(d).map((f) => path.relative(d, f)) : []);
const adminSrc = new Set(rel(path.join(apps.admin, "src")));
for (const f of rel(path.join(apps.store, "src"))) if (adminSrc.has(f)) problems.push(`src/${f} exists in both apps; move it to packages/shared/src`);

if (problems.length) {
  console.error("Boundary violations:\n" + problems.map((p) => "  - " + p).join("\n"));
  process.exit(1);
}
console.log("Boundaries OK: apps/store and apps/admin do not depend on each other.");
