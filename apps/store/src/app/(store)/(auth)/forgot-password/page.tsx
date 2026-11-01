import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { AuthShell } from "@/components/customer/auth-shell";
import { ForgotPasswordForm } from "@/components/customer/password-reset-forms";
import { getPublicSettings } from "@/features/business-settings/queries";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };

async function Form() {
  await connection();
  const settings = await getPublicSettings();
  return <ForgotPasswordForm contactPhone={settings.contactPhone} />;
}

export default function ForgotPasswordPage() {
  return (
    <AuthShell kicker="It happens" title="Reset password">
      <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-muted" />}>
        <Form />
      </Suspense>
    </AuthShell>
  );
}
