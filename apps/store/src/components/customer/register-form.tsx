"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { registerCustomer } from "@/features/authentication/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { safeCallbackUrl } from "./auth-shell";
import { GoogleButton } from "./google-button";

export function RegisterForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = safeCallbackUrl(params.get("callbackUrl"));
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [loading, setLoading] = useState(false);

  const field = (id: keyof typeof form, label: string, props: React.ComponentProps<typeof Input> = {}, hint?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={form[id]} onChange={(e) => setForm({ ...form, [id]: e.target.value })} aria-invalid={!!errors[id]} className="h-12 rounded-xl" {...props} />
      {errors[id] ? <p className="text-xs font-semibold text-destructive">{errors[id]}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});
        const res = await registerCustomer({ ...form, email: form.email || undefined });
        if (!res.ok) {
          setLoading(false);
          const fe: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.fieldErrors ?? {})) if (v?.[0]) fe[k] = v[0];
          setErrors(fe);
          toast.error(res.error);
          return;
        }
        // Sign the new account in straight away (one retry for a dropped request).
        let login = await signIn("customer", { identifier: form.phone, password: form.password, redirect: false });
        if (!login?.ok) login = await signIn("customer", { identifier: form.phone, password: form.password, redirect: false });
        setLoading(false);
        toast.success("Welcome to Bite Affairs!");
        router.push(login?.ok ? callbackUrl : `/login?registered=1&callbackUrl=${encodeURIComponent(callbackUrl)}`);
        router.refresh();
      }}
    >
      {googleEnabled && <GoogleButton callbackUrl={callbackUrl} label="Sign up with Google" />}
      {field("name", "Full name", { autoComplete: "name", required: true })}
      {field("phone", "Mobile number", { autoComplete: "tel-national", inputMode: "tel", required: true }, "Used to sign in and for delivery updates.")}
      {field("email", "Email (optional)", { type: "email", autoComplete: "email" }, "Needed for password reset by email.")}
      {field("password", "Password", { type: "password", autoComplete: "new-password", required: true }, "At least 8 characters with a letter and a number.")}
      <Button type="submit" disabled={loading} className="h-12 w-full rounded-full text-base font-bold">
        {loading && <Loader2 className="size-4 animate-spin" />} Create account
      </Button>
      <p className="text-center text-xs text-muted-foreground">Orders you placed as a guest on this device will be linked to your new account automatically.</p>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-gold hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
