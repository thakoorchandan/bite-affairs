"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordCodCollectionAction } from "@/features/admin/orders-actions";
import { formatINR, paiseToRupeesString } from "@/lib/utilities/money";
import { useAdminLive } from "../admin-live-provider";

/** Records cash actually collected for a COD order. Separate from marking the order delivered. */
export function RecordCodButton({ orderId, orderNumber, total, size = "sm", className }: { orderId: string; orderNumber: string; total: number; size?: "sm" | "default" | "lg"; className?: string }) {
  const router = useRouter();
  const { refresh } = useAdminLive();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(paiseToRupeesString(total));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = /^\d+(\.\d{1,2})?$/.test(amount.trim());
  const paise = valid ? Math.round(Number(amount) * 100) : 0;

  return (
    <>
      <Button size={size} variant="outline" className={className} onClick={() => setOpen(true)}>
        <Banknote className="size-4 text-emerald-300" /> Record cash
      </Button>
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record cash collected · {orderNumber}</DialogTitle>
            <DialogDescription>Amount due: {formatINR(total)}. Record exactly what you received.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!valid) return;
              setBusy(true);
              const res = await recordCodCollectionAction({ orderId, amountCollected: paise, note: note || undefined });
              setBusy(false);
              if (!res.ok) return void toast.error(res.error);
              toast.success(res.data.fullyPaid ? `Cash recorded for ${orderNumber}` : `Recorded — short by ${formatINR(res.data.shortBy)}`);
              setOpen(false);
              refresh();
              router.refresh();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor={`cod-${orderId}`}>Amount received (₹)</Label>
              <Input id={`cod-${orderId}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 text-lg font-semibold" aria-invalid={!valid} />
              {valid && paise < total && <p className="text-xs text-orange-300">This is {formatINR(total - paise)} less than the amount due. The payment stays marked unpaid.</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`cod-note-${orderId}`}>Note (optional)</Label>
              <Input id={`cod-note-${orderId}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Paid via UPI to owner" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={!valid || busy}>
                {busy && <Loader2 className="size-4 animate-spin" />} Record {valid ? formatINR(paise) : ""}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
