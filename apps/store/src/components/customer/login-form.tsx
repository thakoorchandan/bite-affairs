"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { safeCallbackUrl } from "./auth-shell";
import { GoogleButton, authErrorMessage } from "./google-button";

export function LoginForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = safeCallbackUrl(params.get("callbackUrl"));
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => authErrorMessage(params.get("error")));

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const res = await signIn("customer", { identifier, password, redirect: false });
        setLoading(false);
        if (!res || res.error) {
          setError(res?.error && res.error !== "CredentialsSignin" ? res.error : "Incorrect mobile/email or password.");
          return;
        }
        router.push(callbackUrl);
        router.refresh();
      }}
    >
      {googleEnabled && <GoogleButton callbackUrl={callbackUrl} />}
      {params.get("registered") === "1" && <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300">Your account is ready. Please sign in.</p>}
      {params.get("reset") === "1" && <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300">Password updated. Please sign in with your new password.</p>}
      <div className="grid gap-1.5">
        <Label htmlFor="identifier">Mobile number or email</Label>
        <Input id="identifier" autoComplete="username" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="h-12 rounded-xl" />
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="text-xs font-semibold text-gold hover:underline">
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-xl pr-11" />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={loading} className="h-12 w-full rounded-full text-base font-bold">
        {loading && <Loader2 className="size-4 animate-spin" />} Sign in
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        New to Bite Affairs?{" "}
        <Link href={`/register${callbackUrl !== "/account" ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`} className="font-bold text-gold hover:underline">
          Create an account
        </Link>
      </p>
      <p className="text-center text-xs text-muted-foreground">
        You can also{" "}
        <Link href="/menu" className="underline">
          order as a guest
        </Link>{" "}
        — no account needed.
      </p>
    </form>
  );
}
