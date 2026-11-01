# Supabase setup: end to end

Bite Affairs stores everything (menu, orders, customers, settings) in **Supabase Postgres**. The store and the admin are two separate apps that share this one database.

You only need Supabase as a database. The app does **not** use Supabase Auth, Storage or the Data API: sign-in is handled by the app itself (NextAuth) and photos by Cloudinary. That keeps the free plan sufficient and the setup short.

> Time needed: about 15 minutes. Cost: ₹0 (Supabase Free plan).

---

## 1. Create the project

1. Go to <https://supabase.com> → **Start your project** → sign in with GitHub or email.
2. **New project**
   - **Organization**: your personal one.
   - **Name**: `bite-affairs`
   - **Database password**: click **Generate a password**, then **copy it somewhere safe now**. You can't view it again, only reset it.
     - Prefer letters and digits. If it contains `@ : / ? # %` you must URL-encode those characters in the connection string (see Troubleshooting).
   - **Region**: **South Asia (Mumbai)** (`ap-south-1`). It is the closest to Kolkata, and a close region makes every page faster.
   - **Plan**: Free.
3. Click **Create new project** and wait about two minutes until the dashboard shows the project as healthy.

## 2. Get the two connection strings

On the project page click **Connect** (top bar). If you can't find it: **Project Settings → Database → Connection string**.

You need two strings from the same page, both showing your project reference (`<ref>`) and the region host:

| Use | Which one to copy | Port | Goes into |
| --- | --- | --- | --- |
| The running apps | **Session pooler** | `5432` | `DATABASE_URL` |
| Migrations and scripts | **Session pooler** (same string) | `5432` | `DIRECT_URL` |

It looks like this (copy the real one from your dashboard via **Connect → Direct → Session pooler**; the host may say `aws-0` or `aws-1`):

```
postgresql://postgres.<ref>:<YOUR-PASSWORD>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

Replace `[YOUR-PASSWORD]` with the password from step 1.

**Why the session pooler?** The "Direct connection" (`db.<ref>.supabase.co`) is IPv6-only on the free plan, so it times out on many networks. Don't use the transaction pooler (6543) either: this app's driver (postgres.js) sends several queries at once on one connection, and the transaction pooler leaves those hanging, so pages load forever. The session pooler works everywhere; keep `DATABASE_POOL_MAX=5` because the free plan allows about 15 session connections in total.

## 3. Put them in `.env.local`

From the repository root:

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in at least:

```bash
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
DATABASE_POOL_MAX=5
DIRECT_URL=postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
AUTH_SECRET=<run: openssl rand -base64 32>
ADMIN_BOOTSTRAP_SECRET=<any long random string, 12+ characters>
```

Then make the two apps and the scripts read the same file:

```bash
npm run env:link
```

(This links `.env.local` into `apps/store` and `apps/admin`, because Next.js reads environment files from each app's own folder.)

> Never commit `.env.local` (it is already git-ignored). It holds your database password.

## 4. Create the tables

```bash
npm install
npm run db:migrate
```

You should see "Migrations applied". It creates all the tables, indexes, row-level security, and the database triggers. It uses `DIRECT_URL` (session pooler) when `DB_MODE=remote`.

> Which database is used is decided by `DB_MODE` in `.env.local` (`npm run db:use -- remote` for Supabase, `npm run db:use -- local` for the local dev database). Check with `npm run db:check`.

### Check it worked

```bash
npm run db:check
```

It prints the active mode, confirms the connection, counts the tables, and verifies that **row-level security is on for every table** and that the order-history audit trigger exists. In the dashboard, **Table Editor** should now list about 30 tables, each marked with a RLS badge.

## 5. Load the menu and create your admin account

```bash
npm run seed           # your real menu (10 categories, 33 items) + default settings
npm run create-admin   # asks for your email, name and password
```

`create-admin` asks you to re-type `ADMIN_BOOTSTRAP_SECRET` first. It creates the only bootstrap admin; to change that password later run `npm run create-admin -- --reset-password`.

## 6. Run the two apps

In two terminals:

```bash
npm run dev          # storefront → http://localhost:3000
npm run dev:admin    # admin      → http://localhost:3001/login
```

Both talk to the same Supabase database, so an order placed in the store appears in the admin within seconds. Sign in to the admin with the account you just created.

(Without `DATABASE_URL`, `npm run dev` falls back to a throwaway in-memory database with sample data. That mode is for a quick look only: each app then gets its own separate database, so use Supabase when you run both.)

## 7. Lock it down (2 minutes)

The database is already protected: every table has **Row Level Security enabled with no policies**, so Supabase's public API keys can't read or write anything. Do these extra checks:

1. **Never put Supabase's `anon` or `service_role` keys in this project.** The app doesn't need them.
2. **Project Settings → Data API**: if your project has an option to disable the Data API, turn it off, since the app never uses it.
3. **Project Settings → Database → Network restrictions**: optional. Skip it unless your host has fixed IP addresses.
4. If the database password ever leaks: **Project Settings → Database → Reset database password**, then update `DATABASE_URL` and `DIRECT_URL` everywhere.

## 8. Free-plan facts you should know

- **500 MB** of database space: plenty for years of orders at this scale. `npm run export-db` prints how much you've used.
- **Projects pause after about 1 week of no activity** (the first visit after a pause is slow until you click **Resume** in the dashboard). A live restaurant won't hit this, but during setup it can. To avoid it, call the maintenance endpoint daily from a free cron service (for example cron-job.org): `GET https://<your-store>/api/cron/maintenance` with the header `Authorization: Bearer <CRON_SECRET>`.
- **There are no automatic backups on the free plan.** Run `npm run export-db` weekly and keep the folder somewhere safe. The backups are plain JSON, one file per table.
- Check the current limits on <https://supabase.com/pricing> before launch; free tiers change.

## 9. Deploying

1. Set the same variables in your host's dashboard: `DATABASE_URL` (session pooler, port 5432), `DATABASE_POOL_MAX=5`, `AUTH_SECRET`, `NEXTAUTH_URL` / `AUTH_URL` / `NEXT_PUBLIC_APP_URL` (that app's own public URL), plus Cloudinary / Razorpay / email keys if you use them.
2. Deploy the store and the admin as two separate projects. Give both the **same** `DATABASE_URL` and `AUTH_SECRET`.
3. To make admin edits show on the store immediately, set `STORE_URL` (the store's public URL) and the same `REVALIDATE_SECRET` on **both** apps.
4. Run migrations from your computer (`npm run db:migrate`), not during the deploy.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `password authentication failed for user "postgres"` | With the pooler the user is **`postgres.<ref>`**, not `postgres`. Copy the string from the dashboard again. |
| `getaddrinfo ENOTFOUND db.<ref>.supabase.co` or a timeout | You used the *Direct connection* (IPv6-only on Free). Use the pooler strings from step 2. |
| Pages or API calls load forever / `statement timeout` | `DATABASE_URL` points at the transaction pooler (6543). Use the session pooler (5432) and restart the dev servers. |
| `too many connections` / `remaining connection slots are reserved` | Lower `DATABASE_POOL_MAX` (for example `3`) in the env of the app that is hitting it. |
| `relation "orders" does not exist` | Migrations weren't applied: run `npm run db:migrate` . |
| `invalid input syntax for type uuid` | A hand-made URL contained a malformed id. The app validates ids; this only appears if you edit data by hand. |
| Password contains `@ : / ? # %` | URL-encode it in the connection string: `@`→`%40`, `:`→`%3A`, `/`→`%2F`, `?`→`%3F`, `#`→`%23`, `%`→`%25`. Or reset it to letters and digits. |
| First request after a long pause is very slow or fails | The free project was paused: open the dashboard and click **Resume project**, then retry. |
| `npm run db:check` says RLS is off | Re-run the migrations; do **not** add policies by hand. |

## Moving existing MongoDB data

The earlier version of this app only ever held sample data (the menu is re-created by `npm run seed`), so there is nothing to carry over. If you had real MongoDB orders, export them first with the old code; ask for a one-off importer.
