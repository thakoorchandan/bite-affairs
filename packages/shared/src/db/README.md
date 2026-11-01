# Database layer (Supabase Postgres via Drizzle)

- `schema/` – tables (source of truth). `../../../../drizzle/` – SQL migrations (`npm run db:generate`, `npm run db:migrate`).
- `client.ts` – `getDb()`, `withTransaction()`, types `Db` / `Tx` / `DbOrTx`.
  - `DATABASE_URL` set → Postgres (Supabase pooler, `prepare:false`).
  - unset (dev/test) → in-process **PGlite** (real Postgres/WASM), migrated automatically.
- `mappers/order.ts` – `toOrderDoc()`: flat `orders` row → the nested `OrderDoc` shape the UI uses (`order.pricing.total`, `order.customer.name`, …).
- `queries/orders.ts` – load orders with their items as `OrderDoc`s.
- `settings-types.ts` – typed settings/hours/home-content documents + defaults (`mergeDefaults`).
- `errors.ts` – `isUniqueViolation`, `dbErrorMessage`. `sql.ts` – `sumInt`, `countAll`, `rowsOf`, `likeEscape`, `isUuid`.

## Rules
1. **Ids are UUID strings.** Validate route/user input with `isUuid()` / `uuid` (zod) *before* querying (Postgres throws on malformed uuids).
2. **Money is integer paise** (`integer` columns). Aggregates come back as strings from postgres.js → use `sumInt()`/`countAll()`/`avgNum()` (they `mapWith(Number)`).
3. **Transactions:** `withTransaction(async (tx) => …)`; query through `tx` *only* inside it (PGlite has one connection: using the outer `db` inside deadlocks). Services take an optional `tx?: DbOrTx` and default to `await getDb()`.
4. **Atomic writes:** conditional `UPDATE … WHERE <expected state> RETURNING id`; `res.length === 1` means it applied (replaces Mongo's `modifiedCount`).
5. **Uniqueness races:** insert and catch `isUniqueViolation(e)`; or `onConflictDoNothing/Update`.
6. `updated_at` is maintained by a DB trigger; never set it by hand.
7. Dates are `Date` in code, `timestamptz` in the DB; `serialize()` turns them into ISO strings for client components/caches. JSON columns (`jsonb`) hold ISO strings.
8. Never `db.execute` for plain reads; use the query builder (raw results differ between drivers; use `rowsOf()` if you must).
9. RLS is enabled on every table with no policies: the Data API (anon key) can't touch anything. Keep it that way.
