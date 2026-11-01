"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormSection, RupeeInputWrap } from "@/components/admin/forms/field";
import { SwitchRow } from "@/components/admin/forms/switch-row";
import { paiseToInput, useAdminAction } from "@/components/admin/forms/use-admin-action";
import {
  businessProfileInputSchema,
  notificationSettingsInputSchema,
  paymentSettingsInputSchema,
  taxInputSchema,
  type BusinessProfileFormInput,
  type NotificationSettingsFormInput,
  type PaymentSettingsFormInput,
  type TaxFormInput,
} from "@/lib/validations/admin";
import { passwordSchema } from "@/lib/validations/auth";
import { z } from "zod";
import { changeAdminPasswordAction, saveBusinessProfileAction, saveNotificationSettingsAction, savePaymentSettingsAction, saveTaxSettingsAction } from "@/features/admin/settings-actions";

export interface SettingsData {
  businessName?: string | null;
  contactPhone?: string | null;
  contactWhatsapp?: string | null;
  contactEmail?: string | null;
  addressLine?: string | null;
  city?: string | null;
  gstin?: string | null;
  fssaiNumber?: string | null;
  tax?: { rateBps?: number | null; inclusive?: boolean | null; label?: string | null } | null;
  payments?: { codEnabled?: boolean | null; codMaxOrderAmount?: number | null; razorpayEnabled?: boolean | null } | null;
  notifications?: { adminEmail?: string | null; emailEnabled?: boolean | null; whatsappEnabled?: boolean | null; soundAlerts?: boolean | null } | null;
}

export interface EnvStatus {
  razorpay: boolean;
  razorpayWebhook: boolean;
  email: boolean;
  whatsapp: boolean;
  cloudinary: boolean;
}

function EnvBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${ok ? "text-emerald-400" : "text-muted-foreground"}`}>
      {ok ? <CheckCircle2 className="size-3.5" /> : <CircleAlert className="size-3.5" />} {label}: {ok ? "configured" : "not configured"}
    </span>
  );
}

export function BusinessProfileForm({ settings }: { settings: SettingsData }) {
  const { run, pending } = useAdminAction();
  const form = useForm<BusinessProfileFormInput>({
    resolver: zodResolver(businessProfileInputSchema, undefined, { raw: true }),
    defaultValues: {
      businessName: settings.businessName ?? "Bite Affairs",
      contactPhone: settings.contactPhone ?? "",
      contactWhatsapp: settings.contactWhatsapp ?? "",
      contactEmail: settings.contactEmail ?? "",
      addressLine: settings.addressLine ?? "",
      city: settings.city ?? "Kolkata",
      gstin: settings.gstin ?? "",
      fssaiNumber: settings.fssaiNumber ?? "",
    },
  });
  const e = form.formState.errors;
  return (
    <FormSection title="Business profile" description="Shown in the footer, contact page, receipts and structured data for search engines.">
      <form className="grid gap-3" onSubmit={form.handleSubmit((v) => run(() => saveBusinessProfileAction(v), { success: "Business profile saved", setError: form.setError as never }))}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Business name" htmlFor="bp-name" error={e.businessName?.message} required>
            <Input id="bp-name" {...form.register("businessName")} />
          </Field>
          <Field label="City" htmlFor="bp-city" error={e.city?.message} required>
            <Input id="bp-city" {...form.register("city")} />
          </Field>
          <Field label="Phone" htmlFor="bp-phone" error={e.contactPhone?.message}>
            <Input id="bp-phone" type="tel" {...form.register("contactPhone")} />
          </Field>
          <Field label="WhatsApp number" htmlFor="bp-wa" error={e.contactWhatsapp?.message}>
            <Input id="bp-wa" type="tel" {...form.register("contactWhatsapp")} />
          </Field>
          <Field label="Email" htmlFor="bp-email" error={e.contactEmail?.message}>
            <Input id="bp-email" type="email" {...form.register("contactEmail")} />
          </Field>
          <Field label="Kitchen address" htmlFor="bp-addr" error={e.addressLine?.message} hint="Used for pickup orders.">
            <Input id="bp-addr" {...form.register("addressLine")} />
          </Field>
          <Field label="GSTIN" htmlFor="bp-gst" error={e.gstin?.message}>
            <Input id="bp-gst" className="uppercase" {...form.register("gstin")} />
          </Field>
          <Field label="FSSAI licence no." htmlFor="bp-fssai" error={e.fssaiNumber?.message}>
            <Input id="bp-fssai" inputMode="numeric" {...form.register("fssaiNumber")} />
          </Field>
        </div>
        <Button type="submit" className="w-fit" disabled={pending}>
          Save profile
        </Button>
      </form>
    </FormSection>
  );
}

export function TaxForm({ settings }: { settings: SettingsData }) {
  const { run, pending } = useAdminAction();
  const form = useForm<TaxFormInput>({
    resolver: zodResolver(taxInputSchema, undefined, { raw: true }),
    defaultValues: { ratePercent: String((settings.tax?.rateBps ?? 0) / 100), inclusive: settings.tax?.inclusive !== false, label: settings.tax?.label ?? "GST" },
  });
  const e = form.formState.errors;
  return (
    <FormSection title="Tax" description="Set to 0 if your menu prices already include all taxes and you don't want a breakdown. Confirm the right GST treatment with your accountant.">
      <form className="grid gap-3" onSubmit={form.handleSubmit((v) => run(() => saveTaxSettingsAction(v), { success: "Tax settings saved", setError: form.setError as never }))}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Rate (%)" htmlFor="tx-rate" error={e.ratePercent?.message}>
            <Input id="tx-rate" inputMode="decimal" {...form.register("ratePercent")} />
          </Field>
          <Field label="Label" htmlFor="tx-label" error={e.label?.message}>
            <Input id="tx-label" {...form.register("label")} />
          </Field>
        </div>
        <Controller
          control={form.control}
          name="inclusive"
          render={({ field }) => <SwitchRow label="Prices include tax" description="On: tax is shown as part of the price. Off: tax is added on top at checkout." checked={!!field.value} onCheckedChange={field.onChange} />}
        />
        <Button type="submit" className="w-fit" disabled={pending}>
          Save tax
        </Button>
      </form>
    </FormSection>
  );
}

export function PaymentsForm({ settings, env }: { settings: SettingsData; env: EnvStatus }) {
  const { run, pending } = useAdminAction();
  const form = useForm<PaymentSettingsFormInput>({
    resolver: zodResolver(paymentSettingsInputSchema, undefined, { raw: true }),
    defaultValues: {
      codEnabled: settings.payments?.codEnabled !== false,
      codMaxOrderAmount: paiseToInput(settings.payments?.codMaxOrderAmount ?? 0) || "0",
      razorpayEnabled: !!settings.payments?.razorpayEnabled && env.razorpay,
    },
  });
  const e = form.formState.errors;
  return (
    <FormSection title="Payments">
      <form className="grid gap-3" onSubmit={form.handleSubmit((v) => run(() => savePaymentSettingsAction(v), { success: "Payment settings saved", setError: form.setError as never }))}>
        <Controller control={form.control} name="codEnabled" render={({ field }) => <SwitchRow label="Cash on Delivery" description="Collect cash or UPI at the door. Collection is recorded separately from delivery." checked={!!field.value} onCheckedChange={field.onChange} />} />
        <Field label="COD limit per order" htmlFor="pay-codmax" error={e.codMaxOrderAmount?.message} hint="0 = no limit">
          <RupeeInputWrap>
            <Input id="pay-codmax" inputMode="decimal" className="max-w-40" {...form.register("codMaxOrderAmount")} />
          </RupeeInputWrap>
        </Field>
        <Controller
          control={form.control}
          name="razorpayEnabled"
          render={({ field }) => (
            <SwitchRow
              label="Online payments (Razorpay)"
              description={env.razorpay ? "UPI, cards and wallets via Razorpay Checkout." : "Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the environment to enable."}
              checked={!!field.value}
              disabled={!env.razorpay}
              onCheckedChange={field.onChange}
            />
          )}
        />
        <div className="flex flex-wrap gap-4">
          <EnvBadge ok={env.razorpay} label="Razorpay keys" />
          <EnvBadge ok={env.razorpayWebhook} label="Razorpay webhook secret" />
        </div>
        <Button type="submit" className="w-fit" disabled={pending}>
          Save payments
        </Button>
      </form>
    </FormSection>
  );
}

export function NotificationsForm({ settings, env }: { settings: SettingsData; env: EnvStatus }) {
  const { run, pending } = useAdminAction();
  const form = useForm<NotificationSettingsFormInput>({
    resolver: zodResolver(notificationSettingsInputSchema, undefined, { raw: true }),
    defaultValues: {
      adminEmail: settings.notifications?.adminEmail ?? "",
      emailEnabled: !!settings.notifications?.emailEnabled && env.email,
      whatsappEnabled: !!settings.notifications?.whatsappEnabled && env.whatsapp,
      soundAlerts: settings.notifications?.soundAlerts !== false,
    },
  });
  return (
    <FormSection title="Customer notifications" description="In-app order updates always work. Email and WhatsApp are optional add-ons.">
      <form className="grid gap-3" onSubmit={form.handleSubmit((v) => run(() => saveNotificationSettingsAction(v), { success: "Notification settings saved", setError: form.setError as never }))}>
        <Field label="Admin email" htmlFor="n-email" error={form.formState.errors.adminEmail?.message}>
          <Input id="n-email" type="email" className="max-w-sm" {...form.register("adminEmail")} />
        </Field>
        <Controller control={form.control} name="emailEnabled" render={({ field }) => <SwitchRow label="Email customers about order updates" description={env.email ? "Sent via Resend." : "Set RESEND_API_KEY and EMAIL_FROM to enable."} disabled={!env.email} checked={!!field.value} onCheckedChange={field.onChange} />} />
        <Controller
          control={form.control}
          name="whatsappEnabled"
          render={({ field }) => (
            <SwitchRow label="WhatsApp order updates" description={env.whatsapp ? "Official WhatsApp Business Cloud API (approved template required)." : "Set the WhatsApp Cloud API variables to enable."} disabled={!env.whatsapp} checked={!!field.value} onCheckedChange={field.onChange} />
          )}
        />
        <Controller control={form.control} name="soundAlerts" render={({ field }) => <SwitchRow label="Sound alerts for new orders" description="Default for admin screens; each device can also mute from the top bar." checked={!!field.value} onCheckedChange={field.onChange} />} />
        <Button type="submit" className="w-fit" disabled={pending}>
          Save notifications
        </Button>
      </form>
    </FormSection>
  );
}

const pwSchema = z.object({ currentPassword: z.string().min(1, "Enter your current password"), newPassword: passwordSchema, confirm: z.string() }).refine((v) => v.newPassword === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

export function AdminPasswordForm() {
  const { run, pending } = useAdminAction();
  const form = useForm<z.input<typeof pwSchema>>({ resolver: zodResolver(pwSchema, undefined, { raw: true }), defaultValues: { currentPassword: "", newPassword: "", confirm: "" } });
  const e = form.formState.errors;
  return (
    <FormSection title="Your admin password" description="Changing it signs out every other device.">
      <form
        className="grid max-w-md gap-3"
        onSubmit={form.handleSubmit(async (v) => {
          const res = await run(() => changeAdminPasswordAction({ currentPassword: v.currentPassword, newPassword: v.newPassword }), { success: "Password changed. Please sign in again.", setError: form.setError as never, refresh: false });
          if (res.ok) await signOut({ callbackUrl: "/login" });
        })}
      >
        <Field label="Current password" htmlFor="pw-cur" error={e.currentPassword?.message}>
          <Input id="pw-cur" type="password" autoComplete="current-password" {...form.register("currentPassword")} />
        </Field>
        <Field label="New password" htmlFor="pw-new" error={e.newPassword?.message} hint="At least 8 characters with letters and numbers.">
          <Input id="pw-new" type="password" autoComplete="new-password" {...form.register("newPassword")} />
        </Field>
        <Field label="Confirm new password" htmlFor="pw-conf" error={e.confirm?.message}>
          <Input id="pw-conf" type="password" autoComplete="new-password" {...form.register("confirm")} />
        </Field>
        <Button type="submit" className="w-fit" disabled={pending}>
          Change password
        </Button>
      </form>
    </FormSection>
  );
}

export function IntegrationsStatus({ env }: { env: EnvStatus }) {
  return (
    <FormSection title="Integrations" description="Configured through environment variables on your hosting provider (never stored in the database).">
      <div className="grid gap-2 sm:grid-cols-2">
        <EnvBadge ok={env.cloudinary} label="Cloudinary media" />
        <EnvBadge ok={env.razorpay} label="Razorpay" />
        <EnvBadge ok={env.email} label="Email (Resend)" />
        <EnvBadge ok={env.whatsapp} label="WhatsApp Cloud API" />
      </div>
    </FormSection>
  );
}
