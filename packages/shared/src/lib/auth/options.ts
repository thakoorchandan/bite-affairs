import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { authCookieNames, currentAppId, useSecureCookies } from "./cookies";
import { DUMMY_HASH, verifyPassword } from "@/lib/security/password";
import { rateLimit, resetRateLimit } from "@/lib/security/rate-limit";
import { normaliseIndianMobile } from "@/lib/utilities/phone";
import type { Role } from "@/constants/domain";

declare module "next-auth" {
  interface Session {
    user: { id: string; name: string; email?: string | null; phone?: string | null; role: Role; sv: number };
  }
  interface User {
    id: string;
    role: Role;
    phone?: string | null;
    sessionVersion: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    role: Role;
    phone?: string | null;
    sv: number;
  }
}

async function authorizeCredentials(identifierRaw: string, password: string, expectRole?: Role) {
  const identifier = identifierRaw.trim().toLowerCase();
  if (!identifier || !password || password.length > 200) return null;

  const { allowed } = await rateLimit(`login:${identifier}`, 8, 15 * 60);
  if (!allowed) throw new Error("Too many login attempts. Please wait 15 minutes.");

  const db = await getDb();
  const phone = normaliseIndianMobile(identifier);
  const [user] = await db.select().from(schema.users).where(phone ? eq(schema.users.phone, phone) : eq(schema.users.email, identifier)).limit(1);

  // Always run bcrypt so response timing doesn't reveal whether the account exists.
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid || !user.isActive) return null;
  if (expectRole && user.role !== expectRole) return null;

  // Only failed attempts count towards the limit: a successful sign-in (e.g. the kitchen tablet and the
  // owner's phone both signing in) starts the window afresh.
  await resetRateLimit(`login:${identifier}`, 15 * 60).catch(() => undefined);
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  return {
    id: user.id,
    name: user.name,
    email: user.email ?? null,
    phone: user.phone ?? null,
    role: user.role as Role,
    sessionVersion: user.sessionVersion ?? 0,
  };
}

/** "Continue with Google" is offered on the storefront only, and only when both credentials are configured. */
export function googleAuthEnabled() {
  return currentAppId() === "store" && !!process.env.GOOGLE_CLIENT_ID?.trim() && !!process.env.GOOGLE_CLIENT_SECRET?.trim();
}

type DbUserForSession = { id: string; role: Role; phone: string | null; sessionVersion: number; isActive: boolean };

/**
 * Finds or creates the customer behind a Google sign-in. Google has verified the email, so an existing account
 * with that email is linked (its password keeps working). New accounts are CUSTOMERs without a password.
 */
async function upsertGoogleUser(profile: { sub: string; email: string; name: string }): Promise<DbUserForSession | null> {
  const db = await getDb();
  const cols = { id: schema.users.id, role: schema.users.role, phone: schema.users.phone, sessionVersion: schema.users.sessionVersion, isActive: schema.users.isActive, googleSub: schema.users.googleSub };
  const email = profile.email.trim().toLowerCase();
  const [bySub] = await db.select(cols).from(schema.users).where(eq(schema.users.googleSub, profile.sub)).limit(1);
  const [existing] = bySub ? [bySub] : await db.select(cols).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing) {
    if (!existing.googleSub) await db.update(schema.users).set({ googleSub: profile.sub, lastLoginAt: new Date() }).where(eq(schema.users.id, existing.id));
    else await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, existing.id));
    return { ...existing, role: existing.role as Role };
  }
  const [created] = await db
    .insert(schema.users)
    .values({ name: profile.name.slice(0, 80) || email.split("@")[0], email, googleSub: profile.sub, passwordHash: null, role: "CUSTOMER", lastLoginAt: new Date() })
    .returning(cols);
  return created ? { ...created, role: created.role as Role } : null;
}

function buildProviders(): NextAuthOptions["providers"] {
  const customer = CredentialsProvider({
    id: "customer",
    name: "Customer",
    credentials: { identifier: { type: "text" }, password: { type: "password" } },
    authorize: (credentials) => authorizeCredentials(credentials?.identifier ?? "", credentials?.password ?? ""),
  });
  const admin = CredentialsProvider({
    id: "admin",
    name: "Admin",
    credentials: { identifier: { type: "text" }, password: { type: "password" } },
    authorize: (credentials) => authorizeCredentials(credentials?.identifier ?? "", credentials?.password ?? "", "ADMIN"),
  });
  // Each app only exposes its own sign-in methods.
  if (currentAppId() === "admin") return [admin];
  const providers: NextAuthOptions["providers"] = [customer];
  if (googleAuthEnabled()) {
    providers.push(GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID!.trim(), clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim() }));
  }
  return providers;
}

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers: buildProviders(),
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;
      const p = profile as { sub?: string; email?: string; email_verified?: boolean; name?: string } | undefined;
      if (!p?.sub || !p.email || p.email_verified === false) return "/login?error=GoogleEmail";
      const user = await upsertGoogleUser({ sub: p.sub, email: p.email, name: p.name ?? "" });
      if (!user || !user.isActive) return "/login?error=AccountDisabled";
      return true;
    },
    async jwt({ token, user, account, profile }) {
      if (account?.provider === "google") {
        // `user.id` is Google's id here; swap in our own user.
        const p = profile as { sub: string; email: string; name?: string };
        const dbUser = await upsertGoogleUser({ sub: p.sub, email: p.email, name: p.name ?? "" });
        if (dbUser) {
          token.uid = dbUser.id;
          token.role = dbUser.role;
          token.phone = dbUser.phone;
          token.sv = dbUser.sessionVersion ?? 0;
        }
        return token;
      }
      if (user) {
        token.uid = user.id;
        token.role = user.role;
        token.phone = user.phone;
        token.sv = user.sessionVersion;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.uid,
        name: token.name ?? "",
        email: token.email,
        phone: token.phone,
        role: token.role,
        sv: token.sv ?? 0,
      };
      return session;
    },
  },
  // Per-app cookie names (see ./cookies.ts) so the store and admin sessions never overwrite each other.
  useSecureCookies: useSecureCookies(),
  cookies: {
    sessionToken: { name: authCookieNames().sessionToken, options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies() } },
    callbackUrl: { name: authCookieNames().callbackUrl, options: { sameSite: "lax", path: "/", secure: useSecureCookies() } },
    csrfToken: { name: authCookieNames().csrfToken, options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies() } },
  },
};
