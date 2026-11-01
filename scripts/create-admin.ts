/**
 * Creates the first ADMIN account. Run locally with database credentials:
 *
 *   npm run create-admin
 *
 * Requires ADMIN_BOOTSTRAP_SECRET in .env.local; you must re-type it to proceed.
 * Only one bootstrap admin can exist. Use --reset-password to change its password.
 * Non-interactive (CI) use: ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD, ADMIN_BOOTSTRAP_CONFIRM env vars.
 */
import "./_env";
import readline from "node:readline";
import { Writable } from "node:stream";
import { closeDb, eq, getDb, schema, sql } from "@/db";
import { hashPassword } from "@/lib/security/password";
import { passwordSchema } from "@/lib/validations/auth";

function ask(question: string, hidden = false): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
    muted = hidden;
  });
}

async function main() {
  const secret = process.env.ADMIN_BOOTSTRAP_SECRET;
  if (!secret || secret.length < 12) throw new Error("Set ADMIN_BOOTSTRAP_SECRET (at least 12 characters) in .env.local first.");
  const confirm = process.env.ADMIN_BOOTSTRAP_CONFIRM ?? (await ask("Re-enter ADMIN_BOOTSTRAP_SECRET: ", true));
  if (confirm !== secret) throw new Error("Bootstrap secret does not match. Aborting.");

  const db = await getDb();
  const { users } = schema;
  const resetPassword = process.argv.includes("--reset-password");
  const [existing] = await db.select().from(users).where(eq(users.isBootstrapAdmin, true)).limit(1);

  if (existing && !resetPassword) {
    throw new Error(`A bootstrap admin already exists (${existing.email}). Use --reset-password to change its password.`);
  }

  const email = (process.env.ADMIN_EMAIL ?? (await ask("Admin email: "))).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email.");
  const name = existing?.name ?? process.env.ADMIN_NAME ?? ((await ask("Admin name [Bite Affairs Admin]: ")) || "Bite Affairs Admin");
  const password = process.env.ADMIN_PASSWORD ?? (await ask("Password (min 8 chars, letters + numbers): ", true));
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  if (!process.env.ADMIN_PASSWORD) {
    const again = await ask("Confirm password: ", true);
    if (again !== password) throw new Error("Passwords do not match.");
  }
  const passwordHash = await hashPassword(password);

  if (existing) {
    if (existing.email !== email) throw new Error("Email does not match the existing bootstrap admin.");
    await db.update(users).set({ passwordHash, isActive: true, role: "ADMIN", sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, existing.id));
    console.log(`Password reset for ${email}. Existing sessions were signed out.`);
    return;
  }

  const [clash] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (clash) {
    throw new Error(`An account with ${email} already exists. Use a different email for the admin account.`);
  }
  await db.insert(users).values({ name, email, passwordHash, role: "ADMIN", isBootstrapAdmin: true });
  console.log(`Admin account created for ${email}. Sign in at /admin/login.`);
}

main()
  .then(() => closeDb())
  .catch(async (error) => {
    console.error(`✖ ${error.message}`);
    await closeDb();
    process.exit(1);
  });
