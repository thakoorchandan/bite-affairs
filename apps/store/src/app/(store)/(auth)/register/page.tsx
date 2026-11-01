import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/customer/auth-shell";
import { googleAuthEnabled } from "@/lib/auth/options";
import { RegisterForm } from "@/components/customer/register-form";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default function RegisterPage() {
  return (
    <AuthShell kicker="Join the affair" title="Create account">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" />}>
        <RegisterForm googleEnabled={googleAuthEnabled()} />
      </Suspense>
    </AuthShell>
  );
}
