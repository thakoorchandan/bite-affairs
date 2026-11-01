import "server-only";
import { cache } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { authOptions } from "./options";
import { getDb, isUuid, schema } from "@/db";
import { forbidden, unauthorized } from "@/lib/utilities/errors";
import type { Role } from "@/constants/domain";

export interface CurrentUser {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: Role;
}

async function markDynamic() {
  try {
    await connection();
  } catch (error) {
    // Outside a Next.js request (tests/scripts) there is nothing to mark; anything else is real.
    if (!(error instanceof Error && error.message.includes("outside a request scope"))) throw error;
  }
}

/**
 * Resolves the signed-in user and re-validates them against the database (active flag,
 * role and session version), so a demoted/disabled account or a reset password takes
 * effect immediately even though sessions are JWTs. Memoised per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Session reads are per-request; mark them dynamic before next-auth touches crypto/cookies.
  await markDynamic();
  const session = await getServerSession(authOptions);
  const uid = session?.user?.id;
  if (!uid || !isUuid(uid)) return null;
  const db = await getDb();
  const [user] = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, phone: schema.users.phone, role: schema.users.role, isActive: schema.users.isActive, sessionVersion: schema.users.sessionVersion })
    .from(schema.users)
    .where(eq(schema.users.id, uid))
    .limit(1);
  if (!user || !user.isActive) return null;
  // Sessions issued before a password reset / forced sign-out are rejected.
  if ((user.sessionVersion ?? 0) !== (session?.user.sv ?? 0)) return null;
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role as Role };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized("Admin sign-in required");
  if (user.role !== "ADMIN") throw forbidden("Admin access only");
  return user;
}

/** For pages: redirect instead of throwing. */
export async function requireAdminPage(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/login");
  return user;
}

export async function requireCustomerPage(callbackUrl: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  return user;
}
