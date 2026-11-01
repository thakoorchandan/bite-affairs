"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/** Confirmation dialog that collects a reason (required for rejection, cancellation and overrides). */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  required = true,
  minLength = 3,
  suggestions = [],
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  required?: boolean;
  minLength?: number;
  suggestions?: string[];
  onConfirm: (reason: string) => Promise<boolean | void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = !required || reason.trim().length >= minLength;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
        if (!v) setReason("");
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid) return;
            setBusy(true);
            const ok = await onConfirm(reason.trim());
            setBusy(false);
            if (ok !== false) {
              setReason("");
              onOpenChange(false);
            }
          }}
        >
          <Label htmlFor="reason-text">Reason{required ? "" : " (optional)"}</Label>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => setReason(s)} className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-gold/50 hover:text-foreground">
                  {s}
                </button>
              ))}
            </div>
          )}
          <Textarea id="reason-text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} autoFocus placeholder="Visible in the order history" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Back
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={!valid || busy}>
              {busy && <Loader2 className="size-4 animate-spin" />} {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
