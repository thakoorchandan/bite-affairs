"use server";

import { z } from "zod";
import { and, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
import { getDb, isUniqueViolation, schema, withTransaction } from "@/db";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";
import { generateToken, sha256 } from "@/lib/security/tokens";
import { AppError, toActionError, type ActionResult } from "@/lib/utilities/errors";
import { changePasswordSchema, forgotPasswordSchema, profileSchema, registerSchema, resetPasswordSchema, type RegisterInput } from "@/lib/validations/auth";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { claimGuestOrders } from "@/services/order.service";
import { emailProvider } from "@/lib/notifications/providers";
import { env } from "@/lib/env";

const { users, passwordResetTokens } = schema;

/** Customer self-registration. The role is always CUSTOMER — never taken from input. */
export async function registerCustomer(input: RegisterInput): Promise<ActionResult> {
  try {
    const ip = await getClientIp();
    await enforceRateLimit(`register:${ip}`, 5, 60 * 60);
    const data = registerSchema.parse(input);
    const db = await getDb();
    const clashFilter = data.email ? or(eq(users.phone, data.phone), eq(users.email, data.email)) : eq(users.phone, data.phone);
    const [clash] = await db.select({ phone: users.phone, email: users.email }).from(users).where(clashFilter).limit(1);
    const exists = (field: "phone" | "email") =>
      new AppError(field === "phone" ? "An account with this mobile number already exists. Try signing in." : "An account with this email already exists.", "ACCOUNT_EXISTS", 409, { [field]: ["Already registered"] });
    if (clash) throw exists(clash.phone === data.phone ? "phone" : "email");
    try {
      await db.insert(users).values({ name: data.name, phone: data.phone, email: data.email ?? null, passwordHash: await hashPassword(data.password), role: "CUSTOMER" });
    } catch (error) {
      // Lost a race with another registration using the same phone/email.
      if (isUniqueViolation(error)) throw exists(isUniqueViolation(error, "email") ? "email" : "phone");
      throw error;
    }
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

/** Link guest orders placed in this browser to the signed-in account (requires each order's secret token). */
export async function claimOrdersAction(claims: { orderNumber: string; token: string }[]): Promise<ActionResult<{ claimed: number }>> {
  try {
    const user = await requireUser();
    const parsed = z.array(z.object({ orderNumber: z.string().max(30), token: z.string().max(100) })).max(20).parse(claims);
    return { ok: true, data: { claimed: await claimGuestOrders(user.id, parsed) } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function requestPasswordReset(input: { email: string }): Promise<ActionResult<{ emailConfigured: boolean; devLinkLogged?: boolean }>> {
  try {
    const ip = await getClientIp();
    await enforceRateLimit(`pwreset:${ip}`, 5, 60 * 60);
    const { email } = forgotPasswordSchema.parse(input);
    const db = await getDb();
    const [user] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(and(eq(users.email, email), eq(users.isActive, true))).limit(1);
    const emailConfigured = emailProvider.isConfigured();
    // Development without an email provider: print the link in the server terminal so the flow is testable.
    const devLog = !emailConfigured && process.env.NODE_ENV !== "production";
    // Same response whether or not the account exists (no account enumeration).
    if (user && (emailConfigured || devLog)) {
      const token = generateToken(32);
      await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
      if (devLog) {
        console.info(`\n[dev] Password reset link for ${user.email}: ${env.appUrl}/reset-password?token=${token}\n`);
        return { ok: true, data: { emailConfigured, devLinkLogged: true } };
      }
      await emailProvider.send({
        to: { email: user.email },
        subject: "Reset your Bite Affairs password",
        text: `Hi ${user.name},\n\nReset your password using this link (valid for 1 hour):\n${env.appUrl}/reset-password?token=${token}\n\nIf you didn't request this, ignore this email.`,
      });
    }
    return { ok: true, data: { emailConfigured, devLinkLogged: devLog } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function resetPassword(input: { token: string; password: string }): Promise<ActionResult> {
  try {
    const ip = await getClientIp();
    await enforceRateLimit(`pwreset-confirm:${ip}`, 10, 60 * 60);
    const data = resetPasswordSchema.parse(input);
    const passwordHash = await hashPassword(data.password);
    // Consume the token and change the password atomically: a failure leaves the token usable.
    await withTransaction(async (tx) => {
      const [record] = await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.tokenHash, sha256(data.token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
        .returning({ userId: passwordResetTokens.userId });
      if (!record) throw new AppError("This reset link is invalid or has expired.", "INVALID_TOKEN");
      await tx.update(users).set({ passwordHash, sessionVersion: sqlInc() }).where(eq(users.id, record.userId));
    });
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateProfile(input: z.input<typeof profileSchema>): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const data = profileSchema.parse(input);
    const db = await getDb();
    const identity = data.email ? or(eq(users.phone, data.phone), eq(users.email, data.email)) : eq(users.phone, data.phone);
    const [clash] = await db.select({ id: users.id }).from(users).where(and(ne(users.id, user.id), identity)).limit(1);
    if (clash) throw new AppError("That mobile number or email is used by another account.", "ACCOUNT_EXISTS", 409);
    // Only whitelisted fields are updated; role can never be changed here.
    try {
      await db.update(users).set({ name: data.name, phone: data.phone, email: data.email ?? null }).where(eq(users.id, user.id));
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError("That mobile number or email is used by another account.", "ACCOUNT_EXISTS", 409);
      throw error;
    }
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function changePassword(input: z.input<typeof changePasswordSchema>): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const data = changePasswordSchema.parse(input);
    await enforceRateLimit(`pwchange:${user.id}`, 5, 15 * 60);
    const db = await getDb();
    const [doc] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
    // Google-only accounts have no password yet: they may set one without a current password.
    if (!doc || (doc.passwordHash !== null && !(await verifyPassword(data.currentPassword, doc.passwordHash)))) throw new AppError("Current password is incorrect.", "INVALID_PASSWORD", 400, { currentPassword: ["Incorrect password"] });
    await db.update(users).set({ passwordHash: await hashPassword(data.newPassword), sessionVersion: sqlInc() }).where(eq(users.id, user.id));
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function getSessionSummary(): Promise<{ id: string; name: string; role: string } | null> {
  const user = await getCurrentUser();
  return user ? { id: user.id, name: user.name, role: user.role } : null;
}

/** `session_version + 1` (invalidates every existing session of the user). */
function sqlInc() {
  return sql`${users.sessionVersion} + 1`;
}
