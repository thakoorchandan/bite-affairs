"use server";

import { refreshStorefront } from "@/lib/revalidate";
import { CACHE_TAGS } from "@/constants/cache-tags";
import { adminAction } from "./guard";
import { updateBusinessProfile, updateNotificationSettings, updatePaymentSettings, updateTaxSettings } from "@/services/admin-config.service";
import { eq, getDb, schema, sql } from "@/db";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { changePasswordSchema } from "@/lib/validations/auth";
import { AppError } from "@/lib/utilities/errors";
import type { BusinessProfileFormInput, NotificationSettingsFormInput, PaymentSettingsFormInput, TaxFormInput } from "@/lib/validations/admin";

export async function saveBusinessProfileAction(input: BusinessProfileFormInput) {
  return adminAction({ action: "settings.profile", entityType: "businessSettings" }, async () => {
    await updateBusinessProfile(input);
    await refreshStorefront(CACHE_TAGS.settings);
    return { summary: "Updated business profile" };
  });
}

export async function saveTaxSettingsAction(input: TaxFormInput) {
  return adminAction({ action: "settings.tax", entityType: "businessSettings" }, async () => {
    const d = await updateTaxSettings(input);
    await refreshStorefront(CACHE_TAGS.settings);
    return { summary: `Tax set to ${d.ratePercent / 100}% (${d.inclusive ? "inclusive" : "exclusive"})` };
  });
}

export async function savePaymentSettingsAction(input: PaymentSettingsFormInput) {
  return adminAction({ action: "settings.payments", entityType: "businessSettings" }, async () => {
    const d = await updatePaymentSettings(input);
    await refreshStorefront(CACHE_TAGS.settings);
    return { summary: `Payments: COD ${d.codEnabled ? "on" : "off"}, Razorpay ${d.razorpayEnabled ? "on" : "off"}` };
  });
}

export async function saveNotificationSettingsAction(input: NotificationSettingsFormInput) {
  return adminAction({ action: "settings.notifications", entityType: "businessSettings" }, async () => {
    await updateNotificationSettings(input);
    return { summary: "Updated notification settings" };
  });
}

/** Changes the signed-in admin's password and signs out other sessions. */
export async function changeAdminPasswordAction(input: { currentPassword: string; newPassword: string }) {
  return adminAction({ action: "admin.password", entityType: "user" }, async (admin) => {
    const data = changePasswordSchema.parse(input);
    await enforceRateLimit(`admin-pw:${admin.id}`, 5, 15 * 60);
    const db = await getDb();
    const [doc] = await db.select({ passwordHash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, admin.id)).limit(1);
    if (!doc?.passwordHash || !(await verifyPassword(data.currentPassword, doc.passwordHash))) {
      throw new AppError("Current password is incorrect.", "INVALID_PASSWORD", 400, { currentPassword: ["Incorrect password"] });
    }
    await db.update(schema.users).set({ passwordHash: await hashPassword(data.newPassword), sessionVersion: sql`${schema.users.sessionVersion} + 1` }).where(eq(schema.users.id, admin.id));
    return { entityId: admin.id, summary: "Changed admin password" };
  });
}
