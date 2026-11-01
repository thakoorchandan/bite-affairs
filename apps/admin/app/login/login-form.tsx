"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AdminLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Only allow redirects back into the admin area.
  const raw = params.get("callbackUrl") ?? "";
  const callbackUrl = raw.startsWith("/") && !raw.startsWith("/login") ? raw : "/dashboard";

  return (
    <form
      className="mt-8 grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setPending(true);
        const res = await signIn("admin", { identifier, password, redirect: false });
        if (!res || res.error) {
          setPending(false);
          setError(res?.error && res.error !== "CredentialsSignin" ? res.error : "Incorrect email or password, or this account doesn't have admin access.");
          return;
        }
        router.replace(callbackUrl);
        router.refresh();
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="admin-identifier">Email</Label>
        <Input id="admin-identifier" type="email" autoComplete="username" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="h-11" placeholder="you@example.com" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="admin-password">Password</Label>
        <div className="relative">
          <Input id="admin-password" type={show ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 pr-11" />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground" aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-base font-semibold text-primary-foreground transition hover:bg-primary/80 disabled:opacity-50">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />} Sign in
      </button>
      <p className="text-xs text-muted-foreground">Admin accounts are created by the owner with <code className="rounded bg-muted px-1">npm run create-admin</code>.</p>
    </form>
  );
}
