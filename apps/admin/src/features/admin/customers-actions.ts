"use server";

import { z } from "zod";
import { adminAction } from "./guard";
import { createPasswordResetToken, saveCustomerNotes, setCustomerActive } from "@/services/customer-admin.service";
import { uuid } from "@/lib/validations/common";
import { storeUrl } from "@/lib/store-url";

const notesSchema = z.object({ key: z.string().max(60), text: z.string().max(2000) });

export async function saveCustomerNotesAction(input: z.input<typeof notesSchema>) {
  return adminAction({ action: "customer.notes", entityType: "customer" }, async (admin) => {
    const { key, text } = notesSchema.parse(input);
    await saveCustomerNotes(key, text, admin.id);
    return { entityId: key, summary: "Updated customer notes" };
  });
}

/**
 * Creates a one-hour password reset link the owner can share (e.g. on WhatsApp) with a
 * customer who forgot their password — works without an email provider.
 */
export async function generatePasswordResetLinkAction(input: { userId: string }) {
  return adminAction<{ url: string; expiresAt: string }>({ action: "customer.password_reset_link", entityType: "customer" }, async () => {
    const userId = uuid.parse(input.userId);
    const { token, expiresAt, name } = await createPasswordResetToken(userId);
    return { data: { url: storeUrl(`/reset-password?token=${encodeURIComponent(token)}`), expiresAt: expiresAt.toISOString() }, entityId: userId, summary: `Generated password reset link for ${name}` };
  });
}

export async function setCustomerActiveAction(input: { userId: string; isActive: boolean }) {
  return adminAction({ action: input.isActive ? "customer.enable" : "customer.disable", entityType: "customer" }, async () => {
    const userId = uuid.parse(input.userId);
    await setCustomerActive(userId, !!input.isActive);
    return { entityId: userId, summary: input.isActive ? "Enabled customer account" : "Disabled customer account" };
  });
}
