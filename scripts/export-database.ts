/**
 * Exports every table to a JSON file.
 *   npm run export-db            -> ./backups/<timestamp>/<table>.json
 * Dates are written as ISO strings; uuid/jsonb/array columns keep their JSON form. Use it as a human-readable
 * safety net; for full restores prefer `pg_dump` / Supabase backups.
 */
import "./_env";
import { mkdir, writeFile } from "node:fs/promises";
import { closeDb, getDb, sql } from "@/db";

const SKIP_TABLES = new Set(["rate_limits"]);

type Rows<T> = { rows: T[] } | T[];
const rowsOf = <T>(res: unknown): T[] => (Array.isArray(res) ? (res as T[]) : ((res as Rows<T> & { rows: T[] }).rows ?? []));

async function main() {
  const db = await getDb();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = `backups/${stamp}`;
  await mkdir(dir, { recursive: true });
  const tables = rowsOf<{ tablename: string }>(await db.execute(sql`select tablename from pg_tables where schemaname = 'public' order by tablename`))
    .map((r) => r.tablename)
    .filter((n) => !n.startsWith("__drizzle") && !SKIP_TABLES.has(n));
  for (const name of tables) {
    const rows = rowsOf<Record<string, unknown>>(await db.execute(sql.raw(`select * from "${name.replace(/"/g, '""')}"`)));
    await writeFile(`${dir}/${name}.json`, JSON.stringify(rows));
    console.log(`${name}: ${rows.length} rows`);
  }
  const [size] = rowsOf<{ bytes: string | number }>(await db.execute(sql`select pg_database_size(current_database()) as bytes`));
  console.log(`\nExported to ${dir}. Database size: ${(Number(size?.bytes ?? 0) / 1024 / 1024).toFixed(2)} MB.`);
}

main()
  .then(() => closeDb())
  .catch(async (e) => {
    console.error(e);
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
