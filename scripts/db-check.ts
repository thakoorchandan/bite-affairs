/** Shows which database is selected and checks that it answers.   npm run db:check */
import "./_env";
import { closeDb, getDb, sql } from "@/db";
import { resolveDbTarget } from "@/db/target";

async function main() {
  const t = resolveDbTarget();
  const where = t.url ? t.url.replace(/\/\/[^@]*@/, "//***@") : "(none: in-memory PGlite)";
  console.log(`Mode: ${t.mode}\nURL:  ${where}`);
  const db = await getDb();
  const res = (await db.execute(sql`select current_database() as db, version() as v`)) as unknown as { rows?: { db: string; v: string }[] } & { db?: string; v?: string }[];
  const row = (res.rows ?? res)[0] as { db: string; v: string };
  console.log(`✓ Connected to "${row.db}" · ${row.v.split(" on ")[0]}`);
  const rows = async (q: ReturnType<typeof sql>) => {
    const r = (await db.execute(q)) as unknown as { rows?: Record<string, unknown>[] } & Record<string, unknown>[];
    return (r.rows ?? r) as Record<string, unknown>[];
  };
  const tables = await rows(sql`select c.relname as name, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname not like '\_\_drizzle%' order by 1`);
  const noRls = tables.filter((t) => !t.rls).map((t) => t.name);
  console.log(`Tables: ${tables.length}${tables.length ? "" : "  (none: run npm run db:migrate)"}`);
  if (tables.length) console.log(noRls.length ? `⚠ Row-level security is OFF for: ${noRls.join(", ")}` : "✓ Row-level security is on for every table");
  const trg = await rows(sql`select count(*)::int as n from pg_trigger where not tgisinternal`);
  console.log(`Triggers: ${trg[0]?.n ?? 0}`);
  await closeDb();
}
main().catch((e) => {
  console.error("✗ Could not connect:", e instanceof Error ? e.message : e);
  process.exit(1);
});
