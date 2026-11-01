"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { changePassword, updateProfile } from "@/features/authentication/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

function useFieldErrors() {
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const fromResult = (fe?: Record<string, string[] | undefined>) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(fe ?? {})) if (v?.[0]) out[k] = v[0];
    setErrors(out);
  };
  return { errors, setErrors, fromResult };
}

export function ProfileForm({ initial }: { initial: { name: string; phone: string; email: string } }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(false);
  const { errors, fromResult } = useFieldErrors();
  return (
    <form
      className="space-y-4 rounded-[2rem] border border-border bg-card p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        const res = await updateProfile({ ...form, email: form.email || undefined });
        setLoading(false);
        if (!res.ok) {
          fromResult(res.fieldErrors);
          return void toast.error(res.error);
        }
        fromResult();
        toast.success("Profile updated");
        router.refresh();
      }}
    >
      <h2 className="text-lg font-bold">Personal details</h2>
      {(
        [
          ["name", "Full name", "name", "text"],
          ["phone", "Mobile number", "tel-national", "tel"],
          ["email", "Email", "email", "email"],
        ] as const
      ).map(([id, label, ac, type]) => (
        <div key={id} className="grid gap-1.5">
          <Label htmlFor={`p-${id}`}>{label}</Label>
          <Input id={`p-${id}`} type={type} autoComplete={ac} value={form[id]} onChange={(e) => setForm({ ...form, [id]: e.target.value })} aria-invalid={!!errors[id]} className="h-11 rounded-xl" />
          {errors[id] && <p className="text-xs font-semibold text-destructive">{errors[id]}</p>}
        </div>
      ))}
      <Button type="submit" disabled={loading} className="rounded-full">
        {loading && <Loader2 className="size-4 animate-spin" />} Save changes
      </Button>
    </form>
  );
}

/** `hasPassword` is false for accounts created with Google: they set a first password without the current one. */
export function ChangePasswordForm({ hasPassword = true }: { hasPassword?: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [loading, setLoading] = useState(false);
  const { errors, fromResult } = useFieldErrors();
  return (
    <form
      className="space-y-4 rounded-[2rem] border border-border bg-card p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        const res = await changePassword({ currentPassword: current, newPassword: next });
        setLoading(false);
        if (!res.ok) {
          fromResult(res.fieldErrors);
          return void toast.error(res.error);
        }
        toast.success(hasPassword ? "Password changed. Please sign in again." : "Password set. You can now also sign in with it.");
        await signOut({ callbackUrl: "/login" });
      }}
    >
      <h2 className="text-lg font-bold">{hasPassword ? "Change password" : "Set a password"}</h2>
      {!hasPassword && <p className="text-sm text-muted-foreground">You signed up with Google. Add a password to also sign in with your email or mobile number.</p>}
      {hasPassword && <div className="grid gap-1.5">
        <Label htmlFor="current">Current password</Label>
        <Input id="current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className="h-11 rounded-xl" />
        {errors.currentPassword && <p className="text-xs font-semibold text-destructive">{errors.currentPassword}</p>}
      </div>}
      <div className="grid gap-1.5">
        <Label htmlFor="new">New password</Label>
        <Input id="new" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} className="h-11 rounded-xl" />
        {errors.newPassword ? <p className="text-xs font-semibold text-destructive">{errors.newPassword}</p> : <p className="text-xs text-muted-foreground">At least 8 characters with a letter and a number.</p>}
      </div>
      <Button type="submit" variant="outline" disabled={loading} className="rounded-full">
        {loading && <Loader2 className="size-4 animate-spin" />} {hasPassword ? "Update password" : "Set password"}
      </Button>
    </form>
  );
}
