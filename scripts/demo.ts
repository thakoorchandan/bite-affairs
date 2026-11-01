/**
 * DEMO MODE — run the full app with sample data, no hosted database needed.
 *
 *   npm run demo                # local Postgres (PGlite) + real menu + sample customers/orders, then store + admin dev servers
 *   npm run demo -- --simulate  # also places a new sample order every ~90 seconds (watch the admin go live)
 *
 * Database choice: by default a throwaway in-memory PGlite is started and served over the Postgres wire protocol
 * (scripts/local-db.ts) so the store (:3000) and admin (:3001) processes share ONE database. Your .env.local
 * DATABASE_URL is deliberately ignored, so real data can never be touched. To demo against your own local Postgres
 * instead, set DEMO_DATABASE_URL (it is seeded with sample data, so use an empty/disposable database only).
 */
import "./_env";
import { spawn, type ChildProcess } from "node:child_process";

const PORT = process.env.PORT ?? "3000";
const ADMIN_PORT = process.env.ADMIN_PORT ?? "3001";
const simulate = process.argv.includes("--simulate");

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo mode is for local development only.");
  const appUrl = `http://localhost:${PORT}`;
  const adminUrl = `http://localhost:${ADMIN_PORT}`;

  let stopDb = async () => {};
  let databaseUrl = process.env.DEMO_DATABASE_URL?.trim();
  if (databaseUrl) {
    console.log("⏳ Using DEMO_DATABASE_URL (migrations must already be applied)…");
  } else {
    console.log("⏳ Starting local in-memory Postgres (PGlite)…");
    const { createLocalDatabase } = await import("./local-db");
    const local = await createLocalDatabase();
    databaseUrl = local.url;
    stopDb = () => local.stop();
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DB_MODE: "remote", // use the throwaway database below, whatever .env.local says
    DATABASE_URL: databaseUrl,
    ...(process.env.DEMO_DATABASE_URL ? {} : { DATABASE_POOL_MAX: "1" }), // PGlite is a single session
    AUTH_SECRET: process.env.DEMO_AUTH_SECRET ?? "demo-only-secret-not-for-production-0001",
    NEXTAUTH_URL: appUrl,
    AUTH_URL: appUrl,
    NEXT_PUBLIC_APP_URL: appUrl,
    // The admin refreshes the storefront cache over HTTP (separate processes).
    STORE_URL: appUrl,
    REVALIDATE_SECRET: process.env.REVALIDATE_SECRET ?? "demo-revalidate-secret-not-for-production",
    RAZORPAY_KEY_ID: "",
    RAZORPAY_KEY_SECRET: "",
    RESEND_API_KEY: "",
    WHATSAPP_ACCESS_TOKEN: "",
  };
  Object.assign(process.env, env);

  const { closeDb } = await import("@/db");
  const { seed } = await import("./seed");
  const { loadDemoData, createDemoAdmin, simulateIncomingOrder, DEMO_ADMIN, DEMO_CUSTOMER } = await import("./demo-data");
  console.log("🍜 Seeding the real menu…");
  await seed({ quiet: true });
  console.log("🧪 Generating sample customers, orders, reviews and expenses…");
  const summary = await loadDemoData();
  await createDemoAdmin();

  const children: ChildProcess[] = [
    spawn("npm", ["run", "dev", "-w", "apps/store"], { env: { ...env, PORT }, stdio: "inherit" }),
    spawn("npm", ["run", "dev", "-w", "apps/admin"], { env: { ...env, PORT: ADMIN_PORT, NEXTAUTH_URL: adminUrl, AUTH_URL: adminUrl, NEXT_PUBLIC_APP_URL: adminUrl }, stdio: "inherit" }),
  ];

  console.log(`
┌──────────────────────────────────────────────────────────────────────┐
│  BITE AFFAIRS · DEMO MODE (sample data, throwaway database)            │
├──────────────────────────────────────────────────────────────────────┤
│  Storefront   ${appUrl.padEnd(55)}│
│  Admin        ${adminUrl.padEnd(55)}│
│               ${DEMO_ADMIN.email} / ${DEMO_ADMIN.password}`.padEnd(73) + `│
│  Customer     ${DEMO_CUSTOMER.phone} / ${DEMO_CUSTOMER.password}`.padEnd(73) + `│
│  Track order  ${`/track-order/${summary.riyaTracking.orderNumber}?t=${summary.riyaTracking.token}`.slice(0, 55).padEnd(55)}│
│  Delivery PINs 700016 700017 700019 700020 700025 700026 700029       │
│  Coupons      WELCOME10 · FLAT50 · MOMO20                             │
│  Data         ${`${summary.orders} orders, ${summary.customers} customers${simulate ? " · new order every ~90s" : ""}`.padEnd(55)}│
└──────────────────────────────────────────────────────────────────────┘
Full tracking link: ${appUrl}/track-order/${summary.riyaTracking.orderNumber}?t=${summary.riyaTracking.token}
`);

  let timer: NodeJS.Timeout | undefined;
  if (simulate) {
    const tick = async () => {
      try {
        const o = await simulateIncomingOrder();
        console.log(`🛎️  Simulated new order ${o.orderNumber} (₹${o.total / 100})`);
      } catch (e) {
        console.warn("Simulated order skipped:", (e as Error).message);
      }
      timer = setTimeout(tick, 60_000 + Math.random() * 60_000);
    };
    timer = setTimeout(tick, 45_000);
  }

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    if (timer) clearTimeout(timer);
    for (const c of children) c.kill("SIGTERM");
    await closeDb().catch(() => undefined);
    await stopDb().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  for (const c of children) c.on("exit", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
