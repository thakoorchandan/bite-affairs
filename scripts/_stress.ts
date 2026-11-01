import postgres from "postgres";
import { createLocalDatabase } from "./local-db";
async function main() {
  const db = await createLocalDatabase({ port: 0 });
  const a = postgres(db.url, { prepare: false, max: 4, ssl: false });
  const b = postgres(db.url, { prepare: false, max: 4, ssl: false });
  await a`create table t (id serial primary key, v int)`;
  const tx = (c: typeof a, v: number) => c.begin(async (sql) => { await sql`insert into t (v) values (${v})`; await new Promise((r) => setTimeout(r, 40)); await sql`insert into t (v) values (${v})`; return 2; });
  await Promise.all([
    ...Array.from({ length: 200 }, (_, i) => (i % 2 ? a : b)`insert into t (v) values (${i})`),
    ...Array.from({ length: 12 }, (_, i) => tx(i % 2 ? a : b, 1000 + i)),
    ...Array.from({ length: 50 }, () => b`select count(*)::int n from t`),
  ]);
  const rolled = await a.begin(async (sql) => { await sql`insert into t (v) values (-1)`; throw new Error("x"); }).catch(() => "rolled");
  const [{ n }] = await a`select count(*)::int n from t`;
  const [{ neg }] = await a`select count(*)::int neg from t where v = -1`;
  console.log("rows", n, "(expected 224)", "rollback", rolled, "leaked", neg);
  // a client that dies mid-transaction must not wedge the DB
  const c = postgres(db.url, { prepare: false, max: 1, ssl: false });
  const hung = c.begin(async (sql) => { await sql`insert into t (v) values (-2)`; await new Promise(() => undefined); });
  void hung; await new Promise((r) => setTimeout(r, 300)); await c.end({ timeout: 0 }).catch(() => undefined);
  const [{ after }] = await b`select count(*)::int after from t where v = -2`;
  console.log("dead-client txn rolled back:", after === 0);
  await a.end(); await b.end(); await db.stop();
}
main().catch((e) => { console.error("FAIL", e?.message ?? e); process.exit(1); });
