import "server-only";
import { env } from "@/lib/env";

/**
 * Notification delivery channels. In-app notifications (MongoDB) always work; email and
 * WhatsApp are optional and only activate when their credentials are configured. Failures
 * in optional channels are logged and never break the business operation that triggered them.
 */
export interface OutboundMessage {
  to: { email?: string | null; phone?: string | null };
  subject: string;
  text: string;
  /** WhatsApp Cloud API requires pre-approved templates for business-initiated messages. */
  whatsappTemplate?: { name: string; params: string[] };
}

export interface NotificationProvider {
  name: string;
  isConfigured(): boolean;
  send(message: OutboundMessage): Promise<void>;
}

export const emailProvider: NotificationProvider = {
  name: "email",
  isConfigured: () => env.email() !== null,
  async send(message) {
    const cfg = env.email();
    if (!cfg || !message.to.email) return;
    // Resend's free tier: https://resend.com — swap for any HTTP email API.
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: cfg.from, to: [message.to.email], subject: message.subject, text: message.text }),
    });
    if (!res.ok) throw new Error(`Email provider responded ${res.status}`);
  },
};

export const whatsappProvider: NotificationProvider = {
  name: "whatsapp",
  isConfigured: () => env.whatsapp() !== null,
  async send(message) {
    const cfg = env.whatsapp();
    if (!cfg || !message.to.phone || !message.whatsappTemplate) return;
    // Official WhatsApp Business Cloud API (Meta). Only approved templates are used.
    const res = await fetch(`https://graph.facebook.com/v21.0/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: `91${message.to.phone}`,
        type: "template",
        template: {
          name: message.whatsappTemplate.name,
          language: { code: cfg.templateLanguage },
          components: [{ type: "body", parameters: message.whatsappTemplate.params.map((text) => ({ type: "text", text })) }],
        },
      }),
    });
    if (!res.ok) throw new Error(`WhatsApp provider responded ${res.status}`);
  },
};

export const externalProviders: NotificationProvider[] = [emailProvider, whatsappProvider];
