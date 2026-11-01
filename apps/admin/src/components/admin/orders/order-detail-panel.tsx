"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Printer, ShieldAlert, StickyNote, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addOrderNoteAction } from "@/features/admin/orders-actions";
import { ORDER_STATUS_LABELS, ORDER_STATUSES, type OrderStatus } from "@/constants/domain";
import { OrderStatusActions } from "./status-actions";
import { useOrderStatus } from "./use-order-status";
import { ReasonDialog } from "./reason-dialog";
import { RecordCodButton } from "../payments/record-cod-dialog";
import { nativeSelectClass } from "../dashboard/pagination";

interface PanelOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  fulfilment: string;
  total: number;
  paymentMethod: string;
  codCollected: boolean;
}

export function OrderDetailPanel({ order, allowed }: { order: PanelOrder; allowed: OrderStatus[] }) {
  const { run } = useOrderStatus();
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [refundTarget, setRefundTarget] = useState<OrderStatus | null>(null);
  const refundStep = allowed.find((s) => s === "REFUND_INITIATED" || s === "REFUNDED") ?? null;
  const showCod = order.paymentMethod === "COD" && !order.codCollected && ["OUT_FOR_DELIVERY", "DELIVERED"].includes(order.status);

  return (
    <div className="flex flex-col gap-3 print:hidden">
      <OrderStatusActions order={order} size="default" className="flex-wrap" />
      <div className="flex flex-wrap gap-2">
        {showCod && <RecordCodButton orderId={order.id} orderNumber={order.orderNumber} total={order.total} />}
        {refundStep && (
          <Button size="sm" variant="outline" onClick={() => setRefundTarget(refundStep)}>
            <Undo2 className="size-4" /> {refundStep === "REFUND_INITIATED" ? "Initiate refund" : "Mark refunded"}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" /> Print receipt
        </Button>
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setOverrideOpen(true)}>
          <ShieldAlert className="size-4" /> Override status
        </Button>
      </div>
      <OverrideDialog open={overrideOpen} onOpenChange={setOverrideOpen} current={order.status} onSubmit={(to, reason) => run(order, to, { override: true, reason })} />
      <ReasonDialog
        open={refundTarget !== null}
        onOpenChange={(v) => !v && setRefundTarget(null)}
        title={refundTarget === "REFUND_INITIATED" ? "Initiate refund?" : "Mark refund as completed?"}
        description={
          refundTarget === "REFUND_INITIATED"
            ? "Record that you've started the refund (issue it from your Razorpay dashboard). The customer will be notified."
            : "Confirm the money has reached the customer. Add the refund reference."
        }
        confirmLabel="Confirm"
        required={false}
        onConfirm={(reason) => run(order, refundTarget!, { note: reason || undefined })}
      />
    </div>
  );
}

function OverrideDialog({ open, onOpenChange, current, onSubmit }: { open: boolean; onOpenChange: (v: boolean) => void; current: OrderStatus; onSubmit: (to: OrderStatus, reason: string) => Promise<boolean> }) {
  const [to, setTo] = useState<OrderStatus | "">("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = !!to && reason.trim().length >= 5;
  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Override order status</DialogTitle>
          <DialogDescription>
            Use only to correct mistakes (e.g. an order handed over without being marked out for delivery). Overrides skip the normal lifecycle and are permanently recorded in the audit history with your name and reason.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid) return;
            setBusy(true);
            const ok = await onSubmit(to as OrderStatus, reason.trim());
            setBusy(false);
            if (ok) {
              setTo("");
              setReason("");
              onOpenChange(false);
            }
          }}
        >
          <Label htmlFor="override-to">New status</Label>
          <select id="override-to" value={to} onChange={(e) => setTo(e.target.value as OrderStatus)} className={nativeSelectClass} required>
            <option value="">Choose…</option>
            {ORDER_STATUSES.filter((s) => s !== current && s !== "AWAITING_PAYMENT").map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <Label htmlFor="override-reason">Reason (required)</Label>
          <Textarea id="override-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={!valid || busy}>
              {busy && <Loader2 className="size-4 animate-spin" />} Apply override
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InternalNoteForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-2 print:hidden"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        const res = await addOrderNoteAction({ orderId, text });
        setBusy(false);
        if (!res.ok) return void toast.error(res.error);
        setText("");
        toast.success("Note added");
        router.refresh();
      }}
    >
      <Label htmlFor="internal-note" className="sr-only">
        Internal note
      </Label>
      <Textarea id="internal-note" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={2} placeholder="Only visible to admins, e.g. 'Customer asked for extra napkins'" />
      <Button type="submit" size="sm" variant="secondary" disabled={busy || !text.trim()} className="justify-self-end">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <StickyNote className="size-4" />} Add note
      </Button>
    </form>
  );
}
