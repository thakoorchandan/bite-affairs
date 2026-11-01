# Bite Affairs

**Real Chinese. Real Flavours. Everyday.** · *Good Food. Good Mood.*

Bite Affairs is a cloud kitchen ordering and management platform for Kolkata. It has two parts:

- a **customer website** with the menu, customisation, cart, checkout (guest or registered), Cash on Delivery or Razorpay payment, and live order tracking;
- a private **admin dashboard** covering orders, the kitchen display, your own deliveries, menu and media, coupons, business hours, delivery zones, website content, analytics, and expenses with estimated profit.

It is built with Next.js 16, TypeScript, Tailwind CSS 4, shadcn/ui (Base UI), Framer Motion, Supabase Postgres with Drizzle, next-auth and Cloudinary. It runs on free tiers and needs no domain.

> See [ARCHITECTURE.md](ARCHITECTURE.md) for technical decisions and [DEVELOPMENT_CHECKLIST.md](DEVELOPMENT_CHECKLIST.md) for feature status.

---

## 1. Requirements

- Node.js 20+ (developed on Node 24)
- A free Supabase project (see [SUPABASE_SETUP.md](SUPABASE_SETUP.md)); local development needs no account
- Optional: a free Cloudinary account (image and video uploads), Razorpay (online payments), Resend (emails)

## 2. Try it instantly with sample data

The store and the admin are **two separate Next.js apps** (`apps/store` on port 3000, `apps/admin` on port 3001) that share one database.

```bash
npm install
npm run demo            # shared in-memory database + both apps; add -- --simulate for live incoming orders
```

`npm run demo` starts a throwaway Postgres (PGlite), fills it with the real menu and **sample** customers, about 30 days of orders, a live order board, reviews and expenses, then starts both apps. The terminal prints the logins:

- Admin (http://localhost:3001): `admin@demo.biteaffairs.local` / `Admin12345`
- Customer (http://localhost:3000): `9830000001` / `Demo12345`

The data resets on every restart.

### Switching between the local and the real database

One switch, `DB_MODE` in `.env.local`:

```bash
npm run db:use -- local     # local dev database (run `npm run dev:db` in another terminal first)
npm run db:use -- remote    # your real Supabase database (DATABASE_URL)
npm run db:use              # show the current mode
npm run db:check            # prints the active mode and tests the connection
```

Both apps and every script (`seed`, `create-admin`, `db:migrate`, `export-db`) follow the switch; restart the dev servers after changing it. `local` is refused in production, so a deployed app can never point at the dev database.

## 3. Local setup with your own database

```bash
npm install
cp .env.example .env.local        # then fill in the values (see below)
npm run env:link                  # links .env.local into both apps (Next.js reads env per app folder)
npm run db:migrate                # creates the tables in the selected database (see DB_MODE below)
npm run seed                      # imports the real menu from the menu poster + default settings
npm run create-admin              # creates the first admin account (asks for email + password)
npm run dev                       # store:  http://localhost:3000
npm run dev:admin                 # admin:  http://localhost:3001
```

Create the Supabase database as described in [SUPABASE_SETUP.md](SUPABASE_SETUP.md) and put its connection strings in `DATABASE_URL` / `DIRECT_URL`.

### Environment variables

Every variable is documented in [`.env.example`](.env.example). Only these are required:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Supabase Postgres connection string (**session** pooler, port 5432) |
| `AUTH_SECRET` | Signs sessions and order-tracking links. Generate with `openssl rand -base64 32`. |
| `NEXTAUTH_URL` / `AUTH_URL` / `NEXT_PUBLIC_APP_URL` | The public URL of each app (store and admin have different values) |
| `ADMIN_BOOTSTRAP_SECRET` | Needed only to run `npm run create-admin` |

Cloudinary, Razorpay, Resend and WhatsApp are optional. The app works fully without them: Cash on Delivery, the bundled menu photos and in-app notifications.

> Never commit `.env.local`. Variables without `NEXT_PUBLIC_` never reach the browser.

## 4. Creating the first admin

```bash
npm run create-admin
```

The script:

- asks you to re-type `ADMIN_BOOTSTRAP_SECRET`;
- asks for the email, name and password (min 8 characters, letters and numbers; input is hidden);
- hashes the password with bcrypt and creates the `ADMIN` user.

Only one bootstrap admin can exist. To reset its password, run `npm run create-admin -- --reset-password`; this also signs out its existing sessions. There is no public admin sign-up page.

Then sign in at the admin app's **`/login`** (http://localhost:3001/login locally).

## 4b. Sign in with Google (optional)

Customers can sign up and sign in with Google on the storefront. The button only appears when both variables are set.

1. Open <https://console.cloud.google.com/> → create (or pick) a project.
2. **APIs & Services → OAuth consent screen**: choose **External**, fill in the app name and support email, add your email as a test user while the app is in testing.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → **Web application**.
   - Authorised JavaScript origins: `http://localhost:3000` (and later your store URL).
   - Authorised redirect URIs: `http://localhost:3000/api/auth/callback/google` (and later `https://<your-store>/api/auth/callback/google`).
4. Put the client ID and secret into `.env.local` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then restart `npm run dev`.

How accounts work: a Google sign-in with an email that already has an account is linked to it (Google has verified the email). New Google users get a customer account without a password; they can add one in **Account → Profile → Set a password**. Google sign-in is never offered in the admin app.

## 5. First-day setup in the admin

1. **Settings**: contact phone/WhatsApp, address, GSTIN/FSSAI if applicable, tax settings.
2. **Delivery Settings**: add delivery zones with your **serviceable PIN codes**. Until you add some, delivery checkout is refused and only pickup works.
3. **Business Hours**: set the real weekly timings. The seed defaults to 11:00–23:00 daily, so change these. Add holidays as special dates.
4. **Menu / Products**: check the imported menu. Mark items veg or non-veg correctly. *Fried Momo* was imported as non-veg because the poster doesn't state its filling. Upload real photos to the **Media Library**.
5. **Website Content**: hero text, about, testimonials (real ones only), social links.
6. **Coupons** (optional).

## 6. Everyday operations

- **Orders** and the **Kitchen Display** update automatically every few seconds. New orders play a chime (toggle it in the top bar).
- Flow: **Accept → Preparing → Ready → Out for Delivery → Delivered**. Use **Deliveries** on your phone to call the customer, open Google Maps, and mark delivered.
- **Cash on Delivery**: after delivering, tap **Record cash collected**. Delivery and payment are tracked separately.
- **Close / pause the kitchen** in Business Hours. The website reflects it immediately and blocks ordering.

## 7. Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `npm run dev:admin` | Store (port 3000) / admin (port 3001) dev servers |
| `npm run db:use -- local\|remote` | **The database switch** (`DB_MODE`); `npm run db:check` shows the active one |
| `npm run dev:db` | Shared local Postgres (PGlite) with the real menu + sample data; prints a `DATABASE_URL` |
| `npm run demo` | Shared sample database + both apps; `-- --simulate` adds incoming orders |
| `npm run build` / `build:admin` / `build:all` | Production builds |
| `npm start` / `npm run start:admin` | Production servers |
| `npm run db:generate` / `db:migrate` / `db:check` | Drizzle migrations |
| `npm run seed` | Insert the menu + defaults (idempotent). `-- --reset-menu` re-applies names/prices from `scripts/seed-data.ts` |
| `npm run create-admin` | Create (or `-- --reset-password`) the bootstrap admin |
| `npm run export-db` | Back up every table to `backups/<timestamp>/*.json` and print database size |
| `npm run extract-images` | Re-crop food photos from `public/reference/bite-affairs-menu.jpg` |
| `npm test` | Unit + integration tests (in-process PGlite) |
| `npm run test:e2e` | Playwright tests against both apps (run `npm run build:all` first) |
| `npm run typecheck:all` / `lint:all` | TypeScript / ESLint for both apps |
| `npm run check:boundaries` | Fails if store and admin import each other |
| `npm run check` | Boundaries + typecheck + tests |

### Backups

Supabase Free has no point-in-time backups, so run `npm run export-db` regularly (weekly at least) and keep the files somewhere safe. The script reports the database size against the free limit.

## 8. Testing

```bash
npm test                 # unit + integration
npm run build:all && npm run test:e2e
```

The e2e script starts a shared local database, the store on port 3100 and the admin on port 3101 (`E2E_PORT`, `E2E_ADMIN_PORT`). To build into another folder, set `NEXT_DIST_DIR`.

Integration tests run on an in-process PGlite (real Postgres compiled to WASM), so transactions, unique indexes and concurrency behave like Postgres.

## 9. Deployment (free tier, no domain)

The app is portable. Choose one option below. Whichever host you use, set the environment variables in its dashboard and point `NEXTAUTH_URL`, `AUTH_URL` and `NEXT_PUBLIC_APP_URL` at the free subdomain it gives you.

### Option A: Cloudflare Workers (preferred)

Each app deploys as its own project (for example `www.` for the store and `admin.` for the admin).

1. `npm i -D @opennextjs/cloudflare wrangler`, then follow the OpenNext Cloudflare guide (`opennextjs-cloudflare build && opennextjs-cloudflare deploy`).
2. In `wrangler.jsonc`, set `compatibility_flags: ["nodejs_compat"]` and a compatibility date of 2025-03-20 or later.
3. Add the secrets with `wrangler secret put DATABASE_URL` and so on.
4. **Before going live**, confirm that the OpenNext adapter supports this Next.js version (16.4) and Cache Components, and check the current Workers free limits and terms. If anything is unsupported, use Option B.

### Option B: Render (free Node web service)

1. Create a new **Web Service** from the GitHub repo.
2. Build command: `npm ci && npm run build`. Start command: `npm start`.
3. Add the environment variables.
4. Note that free instances sleep after 15 minutes without traffic, and the first request then takes about a minute. Upgrading this one service later removes the sleep.

### After deploying

- Deploy **two projects** from this repo: root directory `apps/store` and `apps/admin` (or run `npm run build -w apps/<app>`). Give both the same `DATABASE_URL` and `AUTH_SECRET`; each gets its own `AUTH_URL`/`NEXTAUTH_URL`/`NEXT_PUBLIC_APP_URL`. Set `STORE_URL` and `REVALIDATE_SECRET` in the admin (and `REVALIDATE_SECRET` in the store) so menu edits refresh the storefront cache.
- **Razorpay** (optional): add the webhook `https://<your-host>/api/payments/razorpay/webhook` for `payment.captured` and `payment.failed`, put its secret in `RAZORPAY_WEBHOOK_SECRET`, then enable Razorpay in Admin → Settings.
- **Cron** (optional): to expire unpaid online orders and raise delayed-order alerts even when no admin is online, call `GET /api/cron/maintenance` every 5 minutes with the header `Authorization: Bearer $CRON_SECRET` from a free cron service such as cron-job.org.
- **Vercel Hobby** is fine for previews but restricted to non-commercial use, so don't run the live business on it.

Re-check each provider's current limits and terms before going live; free tiers change.

## 10. Project structure

```
apps/
  store/                 customer website (its own Next.js app)
    src/app/(store)/     routes
    src/app/api/         auth, order tracking, payments webhook, cron, revalidate
    src/features|components|services/   storefront-only code
  admin/                 admin dashboard (its own Next.js app, port 3001)
    app/                 login + (panel) routes + admin APIs
    src/                 admin components, server actions, services
packages/
  shared/src/            code both apps use: db (Drizzle schema, client), lib, constants, services, components/ui
scripts/                 seed, create-admin, export-database, local-db, demo, e2e-server, check-boundaries
tests/                   unit, integration, e2e
```

In each app `@/*` resolves to the app's own `src` first, then `packages/shared/src`. The apps never import each other (`npm run check:boundaries`).
