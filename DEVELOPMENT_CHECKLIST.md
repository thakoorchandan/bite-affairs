# Development Checklist

Status legend: **Not started** · **In progress** · **Implemented** (code exists, manually exercised) · **Tested** (automated tests cover it) · **Completed** (implemented + tested + verified in the running app).

Verification on 2026-10-31:

- `tsc` clean, `eslint .` clean.
- 65/65 Vitest unit and integration tests pass, against an in-memory MongoDB replica set.
- `next build` succeeds with no database at build time.
- 9/9 Playwright end-to-end tests pass against the production build (desktop and mobile).
- Every storefront and admin route was rendered in dev against sample data with no server errors or hydration warnings.

## Foundation
| Feature | Status | Notes |
| --- | --- | --- |
| Next.js 16 App Router + Cache Components, TS, Tailwind 4, shadcn/ui (Base UI), Framer Motion | Completed | |
| MongoDB connection reuse + transactions | Completed | `lib/mongodb/connection.ts` |
| 25 Mongoose models with indexes | Completed | `src/models` |
| Auth (next-auth credentials, bcrypt, RBAC, session invalidation) | Completed | DB re-check on every request |
| Admin bootstrap script | Implemented | `npm run create-admin` (interactive; not in automated tests) |
| Seed from real menu poster (10 categories / 33 items) | Completed | `scripts/seed-data.ts` |
| Sample-data mode for local development | Completed | auto in `npm run dev` without `MONGODB_URI`; `npm run demo` |
| Rate limiting (Mongo-backed), security headers, proxy gate | Completed | |

## Customer website
| Feature | Status | Notes |
| --- | --- | --- |
| Homepage (hero, categories, bestsellers, combos, gallery, why us, testimonials, hours, delivery, contact) | Completed | content from admin |
| Kitchen status (open/closed/paused/unavailable/pre-order) | Completed | e2e Scenario 7 |
| Menu: search, category nav, veg filter, sort, featured/bestseller/offers/new, sold-out | Completed | |
| Product page: gallery, video, customisations with live price, notes, favourites, reviews | Completed | e2e customisation test |
| Cart (guest localStorage + server sync for accounts, server pricing) | Completed | |
| Checkout: guest + registered, saved addresses, PIN serviceability, pickup, coupons, pre-orders | Completed | e2e Scenario 1 |
| Cash on Delivery | Completed | |
| Razorpay (server order, signature verify, webhook, failures, expiry) | Tested | Unit/integration only; needs live test keys to verify end to end |
| Order confirmation + secure tracking (token, live polling) | Completed | |
| Order lookup by number + mobile (rate limited) | Implemented | |
| Registration, login, logout, password reset | Implemented | Reset email needs `RESEND_API_KEY`; admin can generate a reset link |
| Account: profile, addresses, favourites, orders, reorder, reviews | Tested | `storefront.test.ts` |
| Guest → account order linking (token proof) | Tested | |
| About, contact, privacy, terms, sitemap, robots, JSON-LD | Implemented | |

## Admin
| Feature | Status | Notes |
| --- | --- | --- |
| Admin login, protected routes and actions, audit log | Completed | e2e security test |
| Dashboard with date filters (IST) | Completed | `admin-ops.test.ts` |
| Live orders board + order detail + status machine + overrides + notes + receipt | Completed | e2e Scenarios 3–5 |
| Kitchen display (timers, delays, sound, fullscreen) | Implemented | |
| Deliveries (assign, maps, call, notes, proof, delivered, separate COD collection) | Completed | e2e Scenario 5 |
| Payments, customers (registered + guest), notifications, analytics, activity logs | Tested | |
| Categories / products / customisations / menu overview / reorder | Completed | e2e Scenario 6 |
| Media library (signed Cloudinary uploads, dedupe, cleanup) | Tested | Signatures and dedupe tested with mocks; real uploads need Cloudinary keys |
| Coupons (all rules, concurrency-safe redemption) | Tested | |
| Reviews moderation + ratings | Tested | |
| Website content + testimonials | Implemented | |
| Business hours, kitchen control, holidays, temporary closure | Completed | |
| Delivery settings + zones | Tested | |
| Settings (profile, tax, payments, notifications, admin password) | Tested | |
| Expenses, product costs, profit report + CSV | Tested | Estimates are clearly labelled |

## Platform
| Feature | Status | Notes |
| --- | --- | --- |
| Real-time via polling (admin 5 s, tracking 8 s) | Completed | |
| Notifications: in-app; email (Resend) / WhatsApp Cloud API optional | Implemented | External channels untested without credentials |
| Lazy maintenance + optional cron endpoint | Implemented | |
| Backups (`npm run export-db`) | Implemented | |
| Deployment to a free host | **Not started** | Needs your accounts; see README §8 |

## Owner decisions still needed
- Real **business hours** (seeded placeholder: 11:00–23:00 daily).
- **Serviceable PIN codes** and delivery fees (none seeded for production).
- **Fried Momo** veg / non-veg (seeded as non-veg).
- **GST** treatment (seeded: prices inclusive, 0%).
- Real food photography (Cloudinary), contact phone / address, FSSAI / GSTIN.

## Next steps
1. Create Atlas + Cloudinary accounts and fill in `.env.local`, then run `npm run seed` and `npm run create-admin`.
2. Enter the owner decisions above in the admin.
3. Deploy (README §8) and run the e2e suite against staging.
4. Optional: Razorpay test keys → verify online payment end to end.
