import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/customer/auth-shell";
import { ResetPasswordForm } from "@/components/customer/password-reset-forms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <AuthShell kicker="Almost there" title="New password">
      <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-muted" />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
