# Plan: Split Bite Affairs into a monorepo (storefront + admin apps)

> Status: **plan only** — no code changed yet. Approve before executing.

## Goal

Turn the single Next.js app into a monorepo with two independently deployable apps:

- `apps/store` — customer storefront (menu, cart, checkout, tracking, account)
- `apps/admin` — admin dashboard (orders, kitchen, deliveries, menu, media, settings, …)

Both share the same MongoDB database and business logic via `packages/*`.

## Target layout

```
bite-affairs/
├── apps/
│   ├── store/                 # Next.js 16 (customer)
│   └── admin/                 # Next.js 16 (admin)
├── packages/
│   ├── db/                    # mongoose models, connection, _helpers
│   ├── services/              # pricing, quote, orders, payments, coupons, …
│   ├── lib/                   # env, auth, security, validations, utilities, cloudinary, payments
│   ├── ui/                    # components/ui + shared brand primitives
│   ├── features-store/        # cart, checkout, catalog queries, account, content
│   └── features-admin/        # orders-actions, catalog-actions, …
├── scripts/                   # seed, create-admin, export-db (use packages)
├── tests/
├── package.json               # npm workspaces root
└── tsconfig.base.json
```

## Cross-app concerns (decide before coding)

1. **Cache invalidation across processes.** Today `updateTag(...)` in admin Server Actions instantly invalidates the store's `'use cache'` entries because they share one process. After splitting, admin edits will NOT invalidate the store's in-memory cache. Options:
   - (a) Admin calls a store revalidation endpoint (`POST /api/revalidate` with a shared secret + tags) after mutations.
   - (b) Move public catalog caching to short TTL + polling, dropping instant invalidation.
   - (c) Keep a single shared cache store (Redis) — conflicts with free-tier goal.
   - **Recommendation:** (a) for tags that matter (catalog, settings, content), keep TTL fallback.

2. **Auth.** One next-auth config today serves both providers. Split: store app uses `customer` provider only, admin app uses `admin` provider only, but both read the same `users` collection and JWT secret. Share a `packages/auth` with provider factories + `getCurrentUser()`.

3. **API ownership.**
   - Store owns: `/api/auth/*`, `/api/orders/track/*`.
   - Admin owns: `/api/admin/live`, `/api/admin/media/sign`.
   - Payments webhook + cron maintenance: keep in **store** app (or a tiny `apps/api`); admin links to it. Simplest: store hosts webhook/cron, admin doesn't need them.
   - Revalidation endpoint (new) in store.

4. **Middleware (`proxy.ts`).** Today one proxy redirects unauthed admin routes. After split, admin app gets its own proxy guarding everything; store app guards `/account/*`. Remove admin guards from store.

5. **Dev in-memory Mongo (`instrumentation.ts`).** Keep only in store app (seeds sample data). Admin app connects to the same `MONGODB_URI` (or the store's dev instance). For local dev, run store first, then admin with `MONGODB_URI` pointing at… actually in-memory mongo isn't reachable by another process. **Problem.** Either:
   - (a) Run a real local Mongo (docker) for dev, or
   - (b) Keep dev sample data in a shared package and have admin also start memory-server if unset (risk: two instances).
   - **Recommendation:** document `docker run mongo` for local dev with both apps, keep in-memory mode only for store-only quick demos.

## Migration phases

### Phase 0 — Monorepo scaffolding (low risk)
- Add root `package.json` with `workspaces: ["apps/*", "packages/*"]`.
- Move current repo contents into `apps/store/` (git mv to preserve history).
- Add `tsconfig.base.json`; apps extend it.
- Update scripts paths (`npm run dev` → `npm run dev -w apps/store`).
- Commit checkpoint.

### Phase 1 — Extract `packages/db`, `packages/services`, `packages/lib`
- Move `src/models` → `packages/db/src/models`, `src/lib/mongodb` → `packages/db`.
- Move `src/services` → `packages/services`.
- Move `src/lib/{env,auth,security,validations,utilities,cloudinary,payments,notifications}` → `packages/lib`.
- Replace `@/*` imports with package imports (`@bite-affairs/db`, etc.).
- Publish packages internally via workspaces (no build step needed if using TS source + `main`/`types` pointing at src, or use `tsc` project references).
- **Risk:** large import churn; do mechanical codemod + typecheck.

### Phase 2 — Extract UI + features
- `packages/ui`: `components/ui`, `components/shared`, `components/layout` primitives.
- `packages/features-store`: `features/{cart,checkout,catalog,account,authentication,content,business-settings}`.
- `packages/features-admin`: `features/admin/*`.
- Keep app-specific components (`components/admin`, `components/menu`, etc.) in their apps or move shared bits.

### Phase 3 — Create `apps/admin`
- Scaffold Next.js 16 app mirroring store config (next.config, tailwind, tsconfig).
- Move `src/app/admin/**` → `apps/admin/app/**` (drop `/admin` prefix → `app/(panel)`, `app/login`).
- Move `src/app/api/admin/**` → `apps/admin/app/api/admin/**`.
- Move admin features usage.
- Add admin `proxy.ts` guarding all routes except `/login`.
- Wire shared packages.

### Phase 4 — Store app cleanup
- Remove `src/app/admin/**`, admin features, admin api routes from store.
- Remove admin guards from store `proxy.ts`.
- Add `/api/revalidate` route for cross-app cache invalidation.
- Admin Server Actions call store revalidate (or a shared helper) after mutations.

### Phase 5 — Scripts & tests
- Update `scripts/*` imports to packages; run from root with `-w` or root scripts.
- Split tests: store integration tests in `apps/store/tests` or keep in `tests/` with app context.
- e2e: two Playwright projects (store + admin) or keep one with both baseUrls.

### Phase 6 — Docs & deploy
- Update README, ARCHITECTURE, DEVELOPMENT_CHECKLIST.
- Deploy: store and admin as separate services (each with its own env, same `MONGODB_URI`/`AUTH_SECRET`).
- Admin subdomain e.g. `admin.<host>`.

## Effort & risk

- Very large refactor (~hundreds of import edits). Recommend doing it in the phased commits above, typechecking after each phase.
- Highest risk: cache invalidation semantics and dev Mongo. Address in Phase 0 decisions.
- Do NOT attempt in one shot; use feature branches per phase.

## What I need from you to proceed

1. Confirm target package manager (npm workspaces vs pnpm). npm keeps current lockfile; pnpm is faster but changes lockfile.
2. Confirm dev Mongo approach (docker local vs keep in-memory only for store).
3. Confirm whether admin should live on a subdomain or a separate domain in prod.
4. Approve Phase 0 start.

## Not in scope (unless requested)

- Splitting the database (stays shared).
- Moving payments webhook out of store.
- Rewriting UI components.