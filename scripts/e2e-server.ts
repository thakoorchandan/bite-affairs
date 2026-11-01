/**
 * Starts a disposable environment for Playwright: an in-process PGlite served over the Postgres wire protocol
 * (scripts/local-db.ts), the seeded menu, an open kitchen, a test delivery zone, a test admin and coupon, then
 * `next start` for the store (E2E_PORT, default 3100) and the admin (E2E_ADMIN_PORT, default 3101).
 * Run `npm run build` first. Used by playwright.config.ts (webServer).
 */
import "./_env";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

const PORT = process.env.E2E_PORT ?? "3100";
const ADMIN_PORT = process.env.E2E_ADMIN_PORT ?? "3101";

async function main() {
  const { createLocalDatabase } = await import("./local-db");
  const localDb = await createLocalDatabase({ port: Number(process.env.E2E_DB_PORT ?? 0) });

  const baseEnv = {
    ...process.env,
    DB_MODE: "remote", // these processes use the database passed below, whatever .env.local says
    DATABASE_URL: localDb.url,
    // PGlite is one session: a single pooled connection keeps the shared wire-protocol server consistent.
    DATABASE_POOL_MAX: "1",
    AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-secret-e2e-secret-e2e-secret-e2e",
    // The admin tells the store to refresh its cache after edits (separate processes).
    REVALIDATE_SECRET: "e2e-revalidate-secret-e2e-revalidate",
    // Dummy Google credentials: enough to render "Continue with Google" and start the redirect in tests.
    GOOGLE_CLIENT_ID: process.env.E2E_GOOGLE_CLIENT_ID ?? "e2e-google-client.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: process.env.E2E_GOOGLE_CLIENT_SECRET ?? "e2e-google-secret",
    RAZORPAY_KEY_ID: "",
    RAZORPAY_KEY_SECRET: "",
    CLOUDINARY_CLOUD_NAME: "",
  };
  const storeUrl = `http://localhost:${PORT}`;
  const adminUrl = `http://localhost:${ADMIN_PORT}`;
  Object.assign(process.env, baseEnv);

  // Seed through this process's own connection to the PGlite server.
  const { seed } = await import("./seed");
  const { getDb, closeDb, schema, eq } = await import("@/db");
  const { hashPassword } = await import("@/lib/security/password");
  const db = await getDb();
  await seed({ quiet: true, db });
  await db.update(schema.businessSettings).set({ kitchen: { mode: "OPEN" }, contactPhone: "9000000000" }).where(eq(schema.businessSettings.key, "default"));
  await db.insert(schema.deliveryZones).values({ name: "Test zone", pincodes: ["700001", "700016", "700017"], deliveryFee: 3000, estimatedMinutes: 30 });
  await db.insert(schema.users).values({ name: "E2E Admin", email: "admin@biteaffairs.test", passwordHash: await hashPassword("Admin12345"), role: "ADMIN", isBootstrapAdmin: true });
  await db.insert(schema.coupons).values({ code: "WELCOME10", type: "PERCENT", value: 1000, perCustomerLimit: 0, isActive: true });
  await closeDb();

  const children: ChildProcess[] = [];
  const start = (app: "store" | "admin", port: string, url: string) => {
    const child = spawn("npx", ["next", "start", "-p", port], {
      cwd: path.resolve("apps", app),
      env: { ...baseEnv, NEXTAUTH_URL: url, AUTH_URL: url, NEXT_PUBLIC_APP_URL: url, STORE_URL: storeUrl, NEXT_PUBLIC_STORE_URL: storeUrl, NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? ".next" },
      stdio: "inherit",
    });
    children.push(child);
    return child;
  };
  let stopping = false;
  const shutdown = async (code = 0) => {
    if (stopping) return;
    stopping = true;
    for (const c of children) c.kill("SIGTERM");
    await localDb.stop().catch(() => undefined);
    process.exit(code);
  };
  start("admin", ADMIN_PORT, adminUrl).on("exit", (code) => void shutdown(code ?? 0));
  start("store", PORT, storeUrl).on("exit", (code) => void shutdown(code ?? 0));
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
