"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, Loader2, Save, UserX, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { generatePasswordResetLinkAction, saveCustomerNotesAction, setCustomerActiveAction } from "@/features/admin/customers-actions";

export function CustomerNotesForm({ customerKey, initial }: { customerKey: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const dirty = text !== saved;
  return (
    <form
      className="grid gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await saveCustomerNotesAction({ key: customerKey, text });
        setBusy(false);
        if (res.ok) {
          setSaved(text);
          toast.success("Notes saved");
        }
        else toast.error(res.error);
      }}
    >
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} placeholder="Preferences, allergies, delivery tips… (admins only)" aria-label="Customer notes" />
      <Button type="submit" size="sm" variant="secondary" disabled={busy || !dirty} className="justify-self-end">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save notes
      </Button>
    </form>
  );
}

export function PasswordResetLinkButton({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  return (
    <div className="grid gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await generatePasswordResetLinkAction({ userId });
          setBusy(false);
          if (!res.ok) return void toast.error(res.error);
          setLink(res.data.url);
        }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Create password reset link
      </Button>
      {link && (
        <div className="grid gap-1.5">
          <div className="flex gap-2">
            <Input readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Password reset link" />
            <Button
              size="icon"
              variant="outline"
              aria-label="Copy link"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                toast.success("Link copied");
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Valid for 1 hour, single use. Share it only with the account owner.</p>
        </div>
      )}
    </div>
  );
}

export function ToggleCustomerActive({ userId, isActive }: { userId: string; isActive: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    setBusy(true);
    const res = await setCustomerActiveAction({ userId, isActive: !isActive });
    setBusy(false);
    setOpen(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(isActive ? "Account disabled" : "Account enabled");
    router.refresh();
  };
  return (
    <>
      <Button size="sm" variant={isActive ? "destructive" : "outline"} onClick={() => (isActive ? setOpen(true) : apply())} disabled={busy}>
        {isActive ? <UserX className="size-4" /> : <UserCheck className="size-4" />} {isActive ? "Disable account" : "Enable account"}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable this customer account?</AlertDialogTitle>
            <AlertDialogDescription>They will be signed out and unable to sign in. Their order history is kept. You can re-enable the account at any time.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={apply}>
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
