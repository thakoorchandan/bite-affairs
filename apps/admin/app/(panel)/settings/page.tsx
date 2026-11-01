import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { AdminPasswordForm, BusinessProfileForm, IntegrationsStatus, NotificationsForm, PaymentsForm, TaxForm, type SettingsData } from "@/components/admin/settings/settings-forms";
import { emailEnvConfigured, getAdminSettings, razorpayEnvConfigured, whatsappEnvConfigured } from "@/services/admin-config.service";
import { getCloudinaryConfig } from "@/lib/cloudinary";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <AdminPageHeader title="Settings" description="Business details, tax, payment methods and notifications." />
      <Suspense fallback={<AdminPageSkeleton rows={8} />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  await requireAdminPage();
  const settings = (await getAdminSettings()) as unknown as SettingsData;
  const env = {
    razorpay: razorpayEnvConfigured(),
    razorpayWebhook: !!process.env.RAZORPAY_WEBHOOK_SECRET?.trim(),
    email: emailEnvConfigured(),
    whatsapp: whatsappEnvConfigured(),
    cloudinary: !!getCloudinaryConfig(),
  };
  return (
    <div className="grid gap-5">
      <BusinessProfileForm settings={settings} />
      <div className="grid gap-5 xl:grid-cols-2">
        <PaymentsForm settings={settings} env={env} />
        <TaxForm settings={settings} />
      </div>
      <NotificationsForm settings={settings} env={env} />
      <div className="grid gap-5 xl:grid-cols-2">
        <AdminPasswordForm />
        <IntegrationsStatus env={env} />
      </div>
    </div>
  );
}
