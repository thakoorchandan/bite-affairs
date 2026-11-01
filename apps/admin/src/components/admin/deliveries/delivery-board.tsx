"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, Camera, CheckCircle2, Hand, Loader2, MapPin, MessageCircle, NotebookPen, PackageCheck, Phone, Route } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { updateDeliveryAction } from "@/features/admin/orders-actions";
import { useAdminLive } from "../admin-live-provider";
import { useMergedOrders } from "../orders/orders-board";
import { formatElapsed, minutesSince, useNow, useOrderStatus } from "../orders/use-order-status";
import { mapsUrl, telUrl, whatsappUrl, type OrderView } from "../orders/types";
import { RecordCodButton } from "../payments/record-cod-dialog";
import { formatINR } from "@/lib/utilities/money";
import { formatInZone } from "@/lib/utilities/time";
import { cn } from "@/lib/utils";

export function DeliveryBoard({ initial, adminId }: { initial: OrderView[]; adminId: string }) {
  const orders = useMergedOrders(initial);
  const now = useNow(30000);
  const delivery = useMemo(() => orders.filter((o) => o.fulfilment === "DELIVERY"), [orders]);
  const ready = delivery.filter((o) => o.status === "READY").sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const onRoad = delivery.filter((o) => o.status === "OUT_FOR_DELIVERY").sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const upcoming = delivery.filter((o) => o.status === "CONFIRMED" || o.status === "PREPARING").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Ready to go" value={ready.length} tone="text-emerald-300" />
        <Stat label="On the road" value={onRoad.length} tone="text-violet-300" />
        <Stat label="In the kitchen" value={upcoming} tone="text-muted-foreground" />
      </div>
      <Column title="Ready for pickup from kitchen" icon={PackageCheck} empty="No orders waiting. Ready delivery orders appear here automatically.">
        {ready.map((o) => (
          <DeliveryCard key={o.id} order={o} now={now} adminId={adminId} />
        ))}
      </Column>
      <Column title="Out for delivery" icon={Bike} empty="Nothing on the road right now.">
        {onRoad.map((o) => (
          <DeliveryCard key={o.id} order={o} now={now} adminId={adminId} />
        ))}
      </Column>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-2 py-3">
      <p className={cn("text-2xl font-bold tabular-nums", tone)}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Column({ title, icon: Icon, empty, children }: { title: string; icon: typeof Bike; empty: string; children: React.ReactNode[] }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon className="size-4 text-gold" /> {title}
      </h2>
      {children.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{empty}</p> : <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{children}</div>}
    </section>
  );
}

function DeliveryCard({ order, now, adminId }: { order: OrderView; now: number; adminId: string }) {
  const router = useRouter();
  const { refresh } = useAdminLive();
  const { run, pendingId } = useOrderStatus();
  const [busy, setBusy] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [confirmDelivered, setConfirmDelivered] = useState(false);
  const [note, setNote] = useState(order.delivery?.notes ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const a = order.address;
  const maps = mapsUrl(a);
  const isCod = order.payment.method === "COD";
  const mine = order.delivery?.assignedTo === adminId;
  const statusBusy = pendingId === order.id;

  const update = async (patch: Parameters<typeof updateDeliveryAction>[0], success: string) => {
    setBusy(Object.keys(patch).find((k) => k !== "orderId") ?? "x");
    const res = await updateDeliveryAction(patch);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(success);
    refresh();
    router.refresh();
    return true;
  };

  const uploadProof = async (file: File) => {
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) return void toast.error("Choose an image under 8 MB.");
    setBusy("proof");
    try {
      const signRes = await fetch("/api/admin/media/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "image", subfolder: "deliveries" }) });
      const sign = await signRes.json();
      if (!signRes.ok) throw new Error(sign.error ?? "Uploads are not available");
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", sign.apiKey);
      form.append("timestamp", String(sign.timestamp));
      form.append("signature", sign.signature);
      form.append("folder", sign.folder);
      const up = await fetch(sign.uploadUrl, { method: "POST", body: form });
      const data = await up.json();
      if (!up.ok || !data.secure_url) throw new Error(data.error?.message ?? "Upload failed");
      setBusy(null);
      await update({ orderId: order.id, proofImageUrl: data.secure_url }, "Delivery proof saved");
    } catch (e) {
      setBusy(null);
      toast.error((e as Error).message);
    }
  };

  return (
    <article className={cn("flex flex-col rounded-2xl border bg-card p-4", order.status === "READY" ? "border-emerald-500/40" : "border-violet-500/40")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a href={`/orders/${order.id}`} className="font-mono text-sm font-bold text-gold hover:underline">
            {order.orderNumber}
          </a>
          <p className="truncate text-lg font-semibold">{order.customer.name}</p>
          <p className="text-xs text-muted-foreground">
            Placed {formatElapsed(minutesSince(order.createdAt, now))} ago
            {order.estimatedDeliveryAt && ` · ETA ${formatInZone(order.estimatedDeliveryAt, undefined, { hour: "numeric", minute: "2-digit" })}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold tabular-nums">{formatINR(order.pricing.total)}</p>
          <p className={cn("text-xs font-bold", isCod ? (order.payment.cod?.collected ? "text-emerald-300" : "text-orange-300") : "text-emerald-300")}>
            {isCod ? (order.payment.cod?.collected ? "Cash collected" : "COLLECT CASH") : "Paid online"}
          </p>
          {order.pricing.deliveryFee ? <p className="text-[11px] text-muted-foreground">incl. {formatINR(order.pricing.deliveryFee)} delivery</p> : null}
        </div>
      </div>

      {a && (
        <address className="mt-3 rounded-xl bg-muted/40 p-3 text-sm not-italic">
          <p className="font-medium">
            {a.houseNumber}, {a.street}
          </p>
          {a.landmark && <p className="text-muted-foreground">Near {a.landmark}</p>}
          <p>
            {a.city} – <b className="text-gold">{a.pincode}</b>
          </p>
          {a.instructions && <p className="mt-1.5 text-xs font-medium text-orange-200">“{a.instructions}”</p>}
        </address>
      )}
      {order.customerNotes && <p className="mt-2 text-xs text-muted-foreground">Order note: {order.customerNotes}</p>}
      {order.delivery?.notes && <p className="mt-2 text-xs text-gold">Delivery note: {order.delivery.notes}</p>}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button variant="outline" size="lg" render={<a href={telUrl(order.customer.phone)} />} aria-label={`Call ${order.customer.name}`}>
          <Phone className="size-4" /> Call
        </Button>
        <Button variant="outline" size="lg" render={<a href={whatsappUrl(order.customer.phone, `Hi ${order.customer.name}, your Bite Affairs order ${order.orderNumber} is on its way!`)} target="_blank" rel="noopener noreferrer" />}>
          <MessageCircle className="size-4" /> Chat
        </Button>
        <Button variant="outline" size="lg" disabled={!maps} render={maps ? <a href={maps} target="_blank" rel="noopener noreferrer" /> : undefined}>
          <MapPin className="size-4" /> Map
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {!mine && (
          <Button size="sm" variant="ghost" disabled={busy === "assignToSelf"} onClick={() => update({ orderId: order.id, assignToSelf: true }, "Assigned to you")}>
            {busy === "assignToSelf" ? <Loader2 className="size-4 animate-spin" /> : <Hand className="size-4" />} Assign to me
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setNoteOpen(true)}>
          <NotebookPen className="size-4" /> Note
        </Button>
        <Button size="sm" variant="ghost" disabled={busy === "proof"} onClick={() => fileRef.current?.click()}>
          {busy === "proof" ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} {order.delivery?.proofImageUrl ? "Replace proof" : "Proof photo"}
        </Button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && uploadProof(e.target.files[0])} />
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
        {order.status === "READY" && (
          <Button size="lg" className="h-12 text-base font-bold" disabled={statusBusy} onClick={() => run(order, "OUT_FOR_DELIVERY")}>
            {statusBusy ? <Loader2 className="size-5 animate-spin" /> : <Route className="size-5" />} Start delivery
          </Button>
        )}
        {order.status === "OUT_FOR_DELIVERY" && (
          <Button size="lg" className="h-12 text-base font-bold" disabled={statusBusy} onClick={() => setConfirmDelivered(true)}>
            {statusBusy ? <Loader2 className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />} Mark delivered
          </Button>
        )}
        {isCod && !order.payment.cod?.collected && order.status === "OUT_FOR_DELIVERY" && <RecordCodButton orderId={order.id} orderNumber={order.orderNumber} total={order.pricing.total} size="lg" className="h-11" />}
      </div>

      <AlertDialog open={confirmDelivered} onOpenChange={setConfirmDelivered}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {order.orderNumber} as delivered?</AlertDialogTitle>
            <AlertDialogDescription>{isCod ? "Cash collection is recorded separately — use “Record cash” after you've been paid." : "The customer will be notified."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(order, "DELIVERED")}>Delivered</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delivery note · {order.orderNumber}</DialogTitle>
          </DialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} placeholder="e.g. Left with security guard" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy === "notes"} onClick={async () => (await update({ orderId: order.id, notes: note }, "Note saved")) && setNoteOpen(false)}>
              {busy === "notes" && <Loader2 className="size-4 animate-spin" />} Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
