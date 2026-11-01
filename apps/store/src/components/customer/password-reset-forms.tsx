"use client";
import { LinkButton } from "@/components/customer/link-button";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { requestPasswordReset, resetPassword } from "@/features/authentication/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function ForgotPasswordForm({ contactPhone }: { contactPhone?: string | null }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<null | { emailConfigured: boolean; devLinkLogged?: boolean }>(null);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="rounded-[2rem] border border-border bg-card p-6 text-sm">
        <MailCheck className="size-8 text-gold" />
        {done.devLinkLogged ? (
          <p className="mt-3">Development mode: email isn&apos;t configured, so if an account exists for <strong>{email}</strong> the reset link was printed in the store&apos;s server terminal.</p>
        ) : done.emailConfigured ? (
          <p className="mt-3">If an account exists for <strong>{email}</strong>, we&apos;ve emailed a reset link. It&apos;s valid for one hour.</p>
        ) : (
          <p className="mt-3">
            Email delivery isn&apos;t set up yet, so we can&apos;t send a reset link automatically. Please contact Bite Affairs{contactPhone ? <> on <a className="font-bold text-gold" href={`tel:+91${contactPhone}`}>+91 {contactPhone}</a></> : ""} and we&apos;ll help you reset your password.
          </p>
        )}
        <LinkButton variant="outline" className="mt-5 rounded-full" href="/login">
          Back to sign in
        </LinkButton>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const res = await requestPasswordReset({ email });
        setLoading(false);
        if (res.ok) setDone(res.data);
        else setError(res.error);
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email on your account</Label>
        <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-xl" />
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
      <Button type="submit" disabled={loading} className="h-12 w-full rounded-full font-bold">
        {loading && <Loader2 className="size-4 animate-spin" />} Send reset link
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) return <p className="text-sm text-destructive">This reset link is incomplete. Please request a new one.</p>;

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (password !== confirm) return setError("Passwords don't match.");
        setLoading(true);
        setError(null);
        const res = await resetPassword({ token, password });
        setLoading(false);
        if (res.ok) router.push("/login?reset=1");
        else setError(res.fieldErrors?.password?.[0] ?? res.error);
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-xl" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input id="confirm" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-12 rounded-xl" />
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
      <Button type="submit" disabled={loading} className="h-12 w-full rounded-full font-bold">
        {loading && <Loader2 className="size-4 animate-spin" />} Update password
      </Button>
    </form>
  );
}
