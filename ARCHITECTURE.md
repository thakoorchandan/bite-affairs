# Bite Affairs — Architecture

This document records the important technical decisions behind the Bite Affairs platform and the reasons for them. Read it before changing core modules.

## 1. Overview

One Next.js 16 (App Router) application serves both:

- **Storefront** — `apps/store/src/app/(store)/**`: menu, product pages, cart, guest/registered checkout, order tracking, customer accounts.
- **Admin** — `apps/admin/app/**` (own app, `apps/admin/src`): operations (orders, kitchen display, deliveries, payments, customers, analytics) and configuration (menu, media, coupons, hours, delivery, content, settings, expenses).

Both are separate Next.js apps that share one Postgres database, the Drizzle schema and the business services in `packages/shared/src`. UI code never contains business rules; it calls Server Actions (`src/features/**/actions.ts`) or Route Handlers (`src/app/api/**`) which call services.

```
Browser ──► Server Components (read)  ──► features/*/queries.ts ('use cache') ──► services ──► Drizzle ──► Postgres
        └─► Server Actions (write)    ──► adminAction()/requireUser() ─────────► services ──► Drizzle
        └─► Route Handlers            ──► polling feeds, webhooks, signed uploads, cron
```

## 2. Key decisions

| Area | Decision | Why |
| --- | --- | --- |
| Framework | Next.js 16.4 App Router with **Cache Components** + Partial Prefetching | Scaffold default and the direction of Next.js; public menu data is cached per tag and invalidated instantly on admin edits. |
| Database | Supabase Postgres + **Drizzle ORM** | Typed schema, SQL migrations (`drizzle/`), real transactions. Local dev and tests use in-process PGlite. |
| Money | **Integer paise** everywhere (`price: 15500` = ₹155) | No floating-point errors. Forms accept rupees and convert with `rupeesInput` / `rupeesToPaise`. |
| Pricing | Pure functions in `services/pricing.ts`; DB loading in `services/quote.service.ts` | The browser only sends `productId`, `quantity`, `selections`, `notes`. Every price, discount, fee and tax is recomputed on the server, both for previews (`quoteCart`) and inside the checkout transaction. |
| Auth | next-auth v4, Credentials providers (`customer`, `admin`), JWT sessions, bcrypt (12 rounds) | Works with App Router without an adapter. `getCurrentUser()` re-reads the user from the database on every request (active flag, role, `sessionVersion`), so role changes, deactivation and password resets take effect immediately. |
| Authorisation | `requireAdminPage()` in every admin page, `adminAction()` / `requireAdmin()` in every admin mutation/route, `proxy.ts` as an optimistic redirect only | Defence in depth; the proxy alone is never trusted. |
| Admin creation | `npm run create-admin` (needs `ADMIN_BOOTSTRAP_SECRET`, unique `isBootstrapAdmin` index) | No public admin registration exists; customers can never set their role. |
| Guest orders | Secret tracking token = `HMAC_SHA256(AUTH_SECRET, "track:"+orderNumber)` (40 hex chars). Only its SHA-256 is stored. | Unguessable without the server secret, so it isn't predictable from order numbers. It can be re-derived for idempotent retries, and lookup by order number plus mobile is rate limited. |
| Guest → account | `claimOrdersAction` links an order only if the user presents its tracking token (kept in the browser that placed it) | The token proves ownership. Matching email or phone alone is never enough. |
| Checkout atomicity | `withTransaction` (Postgres transaction): re-price, consume coupon, allocate order number, insert order + status history + payment + coupon redemption | All-or-nothing. Coupon usage uses a conditional increment (`usedCount < usageLimit`), and concurrent checkouts conflict on the coupon document and retry. Tested with 6 concurrent checkouts on a 2-use coupon. |
| Idempotency | Client generates `idempotencyKey` per checkout attempt; unique index on `orders.idempotencyKey` | Double-clicks and network retries return the original order (only to the same phone number). |
| Order numbers | `BA<yymmdd>-<seq>` from an atomic daily counter (business timezone) | Human readable; uniqueness is enforced by an index. |
| Order lifecycle | State machine in `services/order-state.ts`; conditional updates `{_id, status: from}` + `expectedFrom` | Invalid jumps are rejected (e.g. Delivered before Out for Delivery). Overrides need a reason and are flagged in the append-only `orderStatusHistory`. Double updates fail with `STALE_STATUS`. |
| COD | Collection recorded separately via `recordCodCollection` | Delivered ≠ paid. Payment becomes `PAID` only when the admin records the cash. |
| Online payments | Razorpay via REST (no SDK). Orders start `AWAITING_PAYMENT`, hidden from the kitchen. Checkout signature + server-side payment fetch + signed webhook all go through the idempotent `markRazorpayOrderPaid`. Unpaid orders expire after 30 min (lazy maintenance). | A browser success message is never trusted, and COD works with zero payment credentials. |
| Real-time | **Polling**, not WebSockets / change streams. Admin: `/api/admin/live?since=` every 5 s when visible (30 s when hidden), returning only orders changed since the last poll. Customer tracking: `/api/orders/track/[n]?t=&since=` every ~8 s, stopping at terminal states. | Change streams/long-lived SSE are unreliable on free serverless tiers. Indexed `updatedAt` queries are cheap, and this works on every host. |
| Background jobs | None. `runMaintenanceIfDue()` piggybacks on admin polling (max once/min via a database lock); optional `/api/cron/maintenance` for a free external cron | No permanently running processes on serverless. |
| Rate limiting | Fixed-window counters in Postgres (`rate_limits`, pruned lazily) | Shared across serverless instances; no Redis needed. |
| Caching | `'use cache'` + `cacheTag` for public catalog/settings/content (`features/*/queries.ts`); admin reads are never cached; Server Actions call `updateTag(...)` | Minimises database reads on the free tier; admin edits show up instantly (no redeploy). Kitchen status is computed per request from cached settings. |
| Media | Browser uploads straight to Cloudinary with a server-issued signature (`/api/admin/media/sign`, admin only); the server verifies Cloudinary's response signature before saving `productMedia`; duplicates detected by etag; deletes call Cloudinary `destroy` | No unsigned uploads; no large files through our server; cleanup on delete/replace. |
| Images before upload | Food photography cropped from the official menu poster (`scripts/extract-reference-images.mjs` → `public/images/menu`) | On-brand imagery from day one, with no stock photos. |
| Notifications | In-app (Postgres, pruned after 60 days) always; email (Resend HTTP API) and WhatsApp (official Cloud API templates) optional via env | No paid service required; provider failures never break orders. |
| Timezone | All hours are stored as `HH:mm` and interpreted in `Asia/Kolkata` via `Intl` (`lib/utilities/time.ts`) | Correct regardless of the server's timezone; supports slots past midnight. |

## 3. Data model (collections)

users, addresses, categories, products, productMedia, customisationGroups, favourites, carts, orders, orderStatusHistory, payments, coupons, couponRedemptions, businessHours, businessSettings, deliveryZones, notifications, testimonials, websiteContent, expenses, productCosts, adminActivityLogs, reviews, plus system collections counters, rateLimits, passwordResetTokens.

- **Order item snapshots**: name, slug, prices, selections and the estimated unit cost are copied into the order, so past orders never change when the menu does.
- **Singletons**: `businessSettings`, `businessHours` and `websiteContent` use a unique `key` and are created with defaults on first read.
- **Indexes**: see each model. Notable: unique email/phone (partial), product/category slug, order number, idempotency key, `(userId, createdAt)`, `(status, createdAt)`, `updatedAt` (polling), coupon code, notifications by audience and owner.

## 4. Hosting

- The code is runtime-portable: no Node-only SDKs on hot paths (Razorpay and Cloudinary use `fetch` + `node:crypto`).
- **Preferred: Cloudflare Workers (free)** via the OpenNext Cloudflare adapter. Verify adapter support for the Next.js version in use before deploying.
- **Fallback: Render free web service (Node)**, using `npm run build && npm start`. It spins down after 15 minutes idle (first request ~1 min). Polling and in-memory caches work well on a single long-lived instance.
- **Vercel Hobby** is for development and previews only (its non-commercial terms).
- See README §9.

## 5. Free-tier safeguards

- Paginated admin lists; projection (`select`) on list queries; `$match` on indexed fields first in aggregations.
- Notifications expire after 60 days; rate-limit buckets expire automatically.
- `npm run export-db` for JSON backups, which also reports database size against the free-plan limit.
- Cloudinary delivery uses `f_auto,q_auto` with width limits; uploads are size-checked in the browser.

## 6. Sample data (development only)

- No server-start hooks: for local development run `npm run dev:db` (one shared sample database for both apps) or `npm run demo`.
- Components never contain mock data. They read the same database code paths as production, so connecting Supabase requires no UI changes.
- The storefront announcement bar is switched on with a "Demo mode" notice.

## 7. Testing

- `npm test`: Vitest unit and integration tests against in-process PGlite (real Postgres, real transactions).
- `npm run test:e2e`: Playwright against `next start` with a disposable seeded database (`scripts/e2e-server.ts`).

## Source layout

- `apps/store/src` — storefront-only code.
- `apps/admin/src` + `apps/admin/app` — admin-only code (components, admin services, admin actions).
- `packages/shared/src` — code both apps use (models, db, lib, shared services, ui). Each app's `@/*` resolves to its own `src` first, then `packages/shared/src`. The apps never import each other.
