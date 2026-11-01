import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/customer/auth-shell";
import { googleAuthEnabled } from "@/lib/auth/options";
import { LoginForm } from "@/components/customer/login-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function LoginPage() {
  return (
    <AuthShell kicker="Welcome back" title="Sign in">
      <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-muted" />}>
        <LoginForm googleEnabled={googleAuthEnabled()} />
      </Suspense>
    </AuthShell>
  );
}
