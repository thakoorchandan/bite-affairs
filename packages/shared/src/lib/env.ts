import "server-only";

/**
 * Server-side environment access. Never import this file from client components:
 * the `server-only` import makes the build fail if that happens.
 */
function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function required(name: string): string {
  const value = optional(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get authSecret() {
    return required("AUTH_SECRET");
  },
  get appUrl() {
    return optional("NEXT_PUBLIC_APP_URL") ?? optional("AUTH_URL") ?? "http://localhost:3000";
  },
  cloudinary() {
    const cloudName = optional("CLOUDINARY_CLOUD_NAME");
    const apiKey = optional("CLOUDINARY_API_KEY");
    const apiSecret = optional("CLOUDINARY_API_SECRET");
    if (!cloudName || !apiKey || !apiSecret) return null;
    return { cloudName, apiKey, apiSecret, folder: optional("CLOUDINARY_FOLDER") ?? "bite-affairs" };
  },
  razorpay() {
    const keyId = optional("RAZORPAY_KEY_ID");
    const keySecret = optional("RAZORPAY_KEY_SECRET");
    if (!keyId || !keySecret) return null;
    return { keyId, keySecret, webhookSecret: optional("RAZORPAY_WEBHOOK_SECRET") };
  },
  email() {
    const apiKey = optional("RESEND_API_KEY");
    const from = optional("EMAIL_FROM");
    if (!apiKey || !from) return null;
    return { apiKey, from };
  },
  whatsapp() {
    const token = optional("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = optional("WHATSAPP_PHONE_NUMBER_ID");
    if (!token || !phoneNumberId) return null;
    return { token, phoneNumberId, templateLanguage: optional("WHATSAPP_TEMPLATE_LANGUAGE") ?? "en" };
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};
