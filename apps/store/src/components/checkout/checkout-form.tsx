"use client";
import { LinkButton } from "@/components/customer/link-button";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Bike, CalendarClock, CheckCircle2, Loader2, MapPin, ShoppingBag, Store, Wallet, CreditCard, Zap } from "lucide-react";
import { toast } from "sonner";
import type { KitchenStatus, HoursConfig } from "@/services/kitchen-status";
import type { PublicSettings } from "@/features/business-settings/queries";
import type { SavedAddress } from "@/services/account.service";
import { cart, useCart } from "@/features/cart/cart-store";
import { placeOrder, confirmOnlinePayment, reportPaymentFailure } from "@/features/checkout/actions";
import { rememberOrder } from "@/features/checkout/tracking-storage";
import { useQuote } from "./use-quote";
import { OrderTotals } from "./order-summary";
import { CouponField } from "./coupon-field";
import { loadRazorpay, type RazorpaySuccess } from "./razorpay";
import { buildPreorderSlots } from "./preorder-slots";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { VegIndicator } from "@/components/shared/veg-indicator";
import { formatINR } from "@/lib/utilities/money";
import { formatInZone } from "@/lib/utilities/time";
import { cn } from "@/lib/utils";

type Fulfilment = "DELIVERY" | "PICKUP";
type Payment = "COD" | "RAZORPAY";
type FieldErrors = Record<string, string | undefined>;

const PHONE_RE = /^[6-9]\d{9}$/;
const cleanPhone = (v: string) => {
  const d = v.replace(/\D/g, "");
  return d.length === 12 && d.startsWith("91") ? d.slice(2) : d.length === 11 && d.startsWith("0") ? d.slice(1) : d;
};

function Section({ step, title, icon: Icon, children }: { step: number; title: string; icon: typeof MapPin; children: React.ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-border bg-card p-5 sm:p-7" aria-labelledby={`step-${step}`}>
      <h2 id={`step-${step}`} className="mb-5 flex items-center gap-3 text-lg font-bold">
        <span className="grid size-8 place-items-center rounded-full bg-gold text-sm font-extrabold text-primary-foreground">{step}</span>
        <Icon className="size-4 text-gold" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ id, label, error, children, hint }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-semibold text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function CheckoutForm({
  status,
  settings,
  hours,
  preorderMaxDaysAhead,
  user,
  addresses,
}: {
  status: KitchenStatus;
  settings: PublicSettings;
  hours: HoursConfig;
  preorderMaxDaysAhead: number;
  user: { name: string; phone: string; email: string } | null;
  addresses: SavedAddress[];
}) {
  const router = useRouter();
  const { lines, couponCode } = useCart();
  const deliveryAvailable = settings.delivery.enabled && !settings.delivery.suspended;
  const [fulfilment, setFulfilment] = useState<Fulfilment>(deliveryAvailable ? "DELIVERY" : "PICKUP");
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];
  const [addressId, setAddressId] = useState<string | "new">(defaultAddress?.id ?? "new");
  const [addr, setAddr] = useState({ houseNumber: "", street: "", landmark: "", city: settings.city || "Kolkata", pincode: "", instructions: "" });
  const [saveAddress, setSaveAddress] = useState(!!user && addresses.length === 0);
  const [timing, setTiming] = useState<"ASAP" | "LATER">(status.canOrderNow ? "ASAP" : "LATER");
  const [scheduledFor, setScheduledFor] = useState<string>("");
  const [payment, setPayment] = useState<Payment>(settings.payments.codEnabled ? "COD" : "RAZORPAY");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [paymentPending, setPaymentPending] = useState<string | null>(null);
  // One idempotency key per checkout attempt: retries of the same submission can't create duplicates.
  const idempotencyKey = useRef<string>("");
  useEffect(() => {
    idempotencyKey.current = crypto.randomUUID();
  }, []);

  const selected = addressId !== "new" ? addresses.find((a) => a.id === addressId) : undefined;
  const pincode = fulfilment === "DELIVERY" ? (selected ? selected.pincode : addr.pincode) : undefined;
  const normalisedPhone = cleanPhone(phone);
  const { quote, loading } = useQuote({ lines, fulfilment, pincode, couponCode, phone: PHONE_RE.test(normalisedPhone) ? normalisedPhone : undefined });

  const slots = useMemo(() => (status.canPreorder || settings.preordersEnabled ? buildPreorderSlots(hours, preorderMaxDaysAhead) : []), [hours, preorderMaxDaysAhead, status.canPreorder, settings.preordersEnabled]);
  const slotsByDay = useMemo(() => {
    const m = new Map<string, typeof slots>();
    for (const s of slots) m.set(s.day, [...(m.get(s.day) ?? []), s]);
    return [...m.entries()];
  }, [slots]);

  const canSchedule = settings.preordersEnabled && slots.length > 0 && status.state !== "UNAVAILABLE";
  const orderingBlocked = !status.canOrderNow && !canSchedule;
  const mustSchedule = !status.canOrderNow && canSchedule;
  const effectiveTiming = mustSchedule ? "LATER" : timing;

  if (!lines.length && !paymentPending) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Your cart is empty"
        description="Add a few dishes before checking out."
        action={
          <LinkButton className="rounded-full" href="/menu">
            Browse the menu
          </LinkButton>
        }
      />
    );
  }

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (name.trim().length < 2) e.name = "Please enter your name";
    if (!PHONE_RE.test(normalisedPhone)) e.phone = "Enter a valid 10-digit mobile number";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email";
    if (fulfilment === "DELIVERY" && !selected) {
      if (!addr.houseNumber.trim()) e["address.houseNumber"] = "Required";
      if (addr.street.trim().length < 3) e["address.street"] = "Required";
      if (addr.city.trim().length < 2) e["address.city"] = "Required";
      if (!/^\d{6}$/.test(addr.pincode)) e["address.pincode"] = "Enter a valid 6-digit PIN code";
    }
    if (effectiveTiming === "LATER" && !scheduledFor) e.scheduledFor = "Choose a time for your pre-order";
    setErrors(e);
    if (Object.keys(e).length) {
      const first = document.querySelector<HTMLElement>(`[data-field="${Object.keys(e)[0]}"]`);
      first?.focus();
      return false;
    }
    return true;
  };

  const finishSuccess = (orderNumber: string, token: string) => {
    rememberOrder({ orderNumber, token, placedAt: new Date().toISOString() });
    cart.clear();
    idempotencyKey.current = crypto.randomUUID();
    router.push(`/order-success/${encodeURIComponent(orderNumber)}?t=${encodeURIComponent(token)}`);
  };

  const openRazorpay = async (rp: { keyId: string; razorpayOrderId: string; amount: number }, orderNumber: string, token: string) => {
    const loaded = await loadRazorpay();
    if (!loaded || !window.Razorpay) {
      toast.error("Couldn't load the payment window. Check your connection and try again.");
      setPaymentPending(rp.razorpayOrderId);
      return;
    }
    setPaymentPending(rp.razorpayOrderId);
    rememberOrder({ orderNumber, token, placedAt: new Date().toISOString() });
    const instance = new window.Razorpay({
      key: rp.keyId,
      amount: rp.amount,
      currency: "INR",
      name: "Bite Affairs",
      description: `Order ${orderNumber}`,
      order_id: rp.razorpayOrderId,
      prefill: { name: name.trim(), contact: `+91${normalisedPhone}`, email: email || undefined },
      theme: { color: "#F5B800" },
      handler: async (resp: RazorpaySuccess) => {
        setSubmitting(true);
        const res = await confirmOnlinePayment({ razorpayOrderId: resp.razorpay_order_id, razorpayPaymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature });
        setSubmitting(false);
        if (res.ok) finishSuccess(res.data.orderNumber, res.data.trackingToken);
        else toast.error(res.error, { description: "If money was deducted, it will be confirmed automatically or refunded. Contact us with your order number." });
      },
      modal: {
        ondismiss: () => {
          void reportPaymentFailure({ razorpayOrderId: rp.razorpayOrderId, reason: "Payment window closed" });
          toast.message("Payment not completed", { description: "You can retry the payment. Unpaid orders are cancelled automatically after 30 minutes." });
        },
      },
    });
    instance.on("payment.failed", (resp: unknown) => {
      const reason = (resp as { error?: { description?: string } })?.error?.description ?? "Payment failed";
      void reportPaymentFailure({ razorpayOrderId: rp.razorpayOrderId, reason });
      toast.error(reason);
    });
    instance.open();
  };

  const submit = async () => {
    if (submitting || orderingBlocked) return;
    if (!validate()) return;
    if (quote?.blockingReasons.length) {
      toast.error(quote.blockingReasons[0]);
      return;
    }
    setSubmitting(true);
    const res = await placeOrder({
      idempotencyKey: idempotencyKey.current,
      items: cart.toServerItems(lines),
      customer: { name: name.trim(), phone: normalisedPhone, email: email.trim() || undefined },
      fulfilment,
      address: fulfilment === "DELIVERY" ? (selected ? { houseNumber: selected.houseNumber, street: selected.street, landmark: selected.landmark ?? "", city: selected.city, pincode: selected.pincode, instructions: addr.instructions } : addr) : undefined,
      savedAddressId: fulfilment === "DELIVERY" && selected ? selected.id : undefined,
      saveAddress: fulfilment === "DELIVERY" && !selected && !!user && saveAddress,
      couponCode: couponCode || undefined,
      paymentMethod: payment,
      customerNotes: notes.trim() || undefined,
      scheduledFor: effectiveTiming === "LATER" && scheduledFor ? scheduledFor : undefined,
    });
    setSubmitting(false);
    if (!res.ok) {
      const fe: FieldErrors = {};
      for (const [k, v] of Object.entries(res.fieldErrors ?? {})) {
        const key = k.replace(/^customer\./, "");
        fe[key] = Array.isArray(v) ? v[0] : undefined;
      }
      setErrors(fe);
      toast.error(res.error);
      return;
    }
    const data = res.data;
    if (data.status === "CANCELLED") {
      idempotencyKey.current = crypto.randomUUID();
      toast.error("That attempt couldn't be completed. Please try again.");
      return;
    }
    if (data.paymentMethod === "RAZORPAY" && data.razorpay) {
      await openRazorpay(data.razorpay, data.orderNumber, data.trackingToken);
      return;
    }
    finishSuccess(data.orderNumber, data.trackingToken);
  };

  const blocking = quote?.blockingReasons ?? [];
  const placeDisabled = submitting || orderingBlocked || !quote || blocking.length > 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        noValidate
      >
        {!status.canOrderNow && (
          <div role="status" className={cn("flex items-start gap-3 rounded-2xl border p-4 text-sm", orderingBlocked ? "border-destructive/40 bg-destructive/10" : "border-gold/30 bg-gold/10")}>
            <CalendarClock className={cn("mt-0.5 size-5 shrink-0", orderingBlocked ? "text-destructive" : "text-gold")} />
            <div>
              <p className="font-bold">{status.message}</p>
              <p className="text-muted-foreground">
                {status.nextOpenAt && `We open again ${formatInZone(status.nextOpenAt, status.timezone, { weekday: "long", hour: "numeric", minute: "2-digit" })}. `}
                {orderingBlocked ? "Ordering is unavailable until then." : "You can place a pre-order for a time when we're open."}
              </p>
            </div>
          </div>
        )}

        <Section step={1} title="Your details" icon={Zap}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="name" label="Full name" error={errors.name}>
              <Input id="name" data-field="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} className="h-11 rounded-xl" />
            </Field>
            <Field id="phone" label="Mobile number" error={errors.phone} hint="We'll call this number if we need to reach you.">
              <div className="flex">
                <span className="grid place-items-center rounded-l-xl border border-r-0 border-input px-3 text-sm text-muted-foreground">+91</span>
                <Input id="phone" data-field="phone" inputMode="tel" autoComplete="tel-national" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!!errors.phone} className="h-11 rounded-l-none rounded-r-xl" maxLength={20} />
              </div>
            </Field>
            <div className="sm:col-span-2">
              <Field id="email" label="Email (optional)" error={errors.email} hint="For order updates by email, if enabled.">
                <Input id="email" data-field="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} className="h-11 rounded-xl" />
              </Field>
            </div>
          </div>
          {!user && (
            <p className="mt-4 text-xs text-muted-foreground">
              Checking out as a guest.{" "}
              <Link href="/login?callbackUrl=/checkout" className="font-bold text-gold hover:underline">
                Sign in
              </Link>{" "}
              to use saved addresses and see order history.
            </p>
          )}
        </Section>

        <Section step={2} title="Delivery or pickup" icon={Bike}>
          <div role="radiogroup" aria-label="Fulfilment" className="grid grid-cols-2 gap-3">
            {(
              [
                { id: "DELIVERY", label: "Delivery", sub: deliveryAvailable ? "To your door" : "Unavailable now", icon: Bike, disabled: !deliveryAvailable },
                { id: "PICKUP", label: "Pickup", sub: settings.delivery.pickupEnabled ? "Collect from kitchen" : "Unavailable", icon: Store, disabled: !settings.delivery.pickupEnabled },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={fulfilment === o.id}
                disabled={o.disabled}
                onClick={() => setFulfilment(o.id)}
                className={cn("flex items-center gap-3 rounded-2xl border p-4 text-left transition", fulfilment === o.id ? "border-gold bg-gold/10" : "border-border hover:border-gold/40", o.disabled && "cursor-not-allowed opacity-50")}
              >
                <o.icon className={cn("size-6", fulfilment === o.id ? "text-gold" : "text-muted-foreground")} />
                <span>
                  <span className="block font-bold">{o.label}</span>
                  <span className="text-xs text-muted-foreground">{o.sub}</span>
                </span>
              </button>
            ))}
          </div>
          {settings.delivery.suspended && <p className="mt-3 text-sm text-gold">Deliveries are temporarily paused.</p>}

          <AnimatePresence initial={false}>
            {fulfilment === "DELIVERY" && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="mt-5 grid gap-4">
                  {addresses.length > 0 && (
                    <div role="radiogroup" aria-label="Saved addresses" className="grid gap-2">
                      {addresses.map((a) => (
                        <button
                          type="button"
                          key={a.id}
                          role="radio"
                          aria-checked={addressId === a.id}
                          onClick={() => setAddressId(a.id)}
                          className={cn("flex items-start gap-3 rounded-2xl border p-4 text-left text-sm transition", addressId === a.id ? "border-gold bg-gold/10" : "border-border hover:border-gold/40")}
                        >
                          <MapPin className="mt-0.5 size-4 shrink-0 text-gold" />
                          <span>
                            <span className="font-bold">{a.label}</span> {a.isDefault && <span className="ml-1 rounded bg-gold/20 px-1.5 text-[10px] font-bold text-gold">DEFAULT</span>}
                            <span className="block text-muted-foreground">
                              {a.houseNumber}, {a.street}
                              {a.landmark ? `, ${a.landmark}` : ""}, {a.city} – {a.pincode}
                            </span>
                          </span>
                        </button>
                      ))}
                      <button
                        type="button"
                        role="radio"
                        aria-checked={addressId === "new"}
                        onClick={() => setAddressId("new")}
                        className={cn("rounded-2xl border border-dashed p-3 text-sm font-bold transition", addressId === "new" ? "border-gold text-gold" : "border-border text-muted-foreground hover:text-foreground")}
                      >
                        + Use a new address
                      </button>
                    </div>
                  )}
                  {addressId === "new" && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field id="houseNumber" label="House / flat no." error={errors["address.houseNumber"]}>
                        <Input id="houseNumber" data-field="address.houseNumber" autoComplete="address-line1" value={addr.houseNumber} onChange={(e) => setAddr({ ...addr, houseNumber: e.target.value })} className="h-11 rounded-xl" />
                      </Field>
                      <Field id="street" label="Street / locality" error={errors["address.street"]}>
                        <Input id="street" data-field="address.street" autoComplete="address-line2" value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} className="h-11 rounded-xl" />
                      </Field>
                      <Field id="landmark" label="Landmark (optional)">
                        <Input id="landmark" value={addr.landmark} onChange={(e) => setAddr({ ...addr, landmark: e.target.value })} className="h-11 rounded-xl" />
                      </Field>
                      <Field id="city" label="City" error={errors["address.city"]}>
                        <Input id="city" data-field="address.city" autoComplete="address-level2" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} className="h-11 rounded-xl" />
                      </Field>
                      <Field id="pincode" label="PIN code" error={errors["address.pincode"]}>
                        <Input id="pincode" data-field="address.pincode" inputMode="numeric" autoComplete="postal-code" maxLength={6} value={addr.pincode} onChange={(e) => setAddr({ ...addr, pincode: e.target.value.replace(/\D/g, "") })} className="h-11 rounded-xl" />
                      </Field>
                      {user && (
                        <label className="flex items-center gap-2 self-end pb-3 text-sm">
                          <Checkbox checked={saveAddress} onCheckedChange={(v) => setSaveAddress(!!v)} /> Save this address
                        </label>
                      )}
                    </div>
                  )}
                  {pincode && /^\d{6}$/.test(pincode) && quote?.delivery && (
                    <p className={cn("flex items-center gap-2 text-sm font-semibold", quote.delivery.serviceable ? "text-emerald-400" : "text-destructive")} role="status">
                      {quote.delivery.serviceable ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
                      {quote.delivery.serviceable ? `We deliver to ${pincode}${quote.delivery.zoneName ? ` (${quote.delivery.zoneName})` : ""} · ~${quote.delivery.estimatedMinutes} min after cooking` : quote.delivery.reason}
                    </p>
                  )}
                  <Field id="instructions" label="Delivery instructions (optional)">
                    <Input id="instructions" value={addr.instructions} onChange={(e) => setAddr({ ...addr, instructions: e.target.value.slice(0, 300) })} placeholder="E.g. ring the bell twice, call on arrival" className="h-11 rounded-xl" />
                  </Field>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Section>

        <Section step={3} title="When" icon={CalendarClock}>
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Order timing">
            <button
              type="button"
              role="radio"
              aria-checked={effectiveTiming === "ASAP"}
              disabled={!status.canOrderNow}
              onClick={() => setTiming("ASAP")}
              className={cn("rounded-2xl border p-4 text-left transition", effectiveTiming === "ASAP" ? "border-gold bg-gold/10" : "border-border", !status.canOrderNow && "cursor-not-allowed opacity-50")}
            >
              <span className="block font-bold">As soon as possible</span>
              <span className="text-xs text-muted-foreground">{status.canOrderNow ? `Ready in ~${quote?.estimatedPrepMinutes || 20} min` : "Kitchen closed"}</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={effectiveTiming === "LATER"}
              disabled={!canSchedule}
              onClick={() => setTiming("LATER")}
              className={cn("rounded-2xl border p-4 text-left transition", effectiveTiming === "LATER" ? "border-gold bg-gold/10" : "border-border", !canSchedule && "cursor-not-allowed opacity-50")}
            >
              <span className="block font-bold">Schedule for later</span>
              <span className="text-xs text-muted-foreground">{canSchedule ? "Pick a time slot" : "Pre-orders unavailable"}</span>
            </button>
          </div>
          {effectiveTiming === "LATER" && canSchedule && (
            <div className="mt-4">
              <Field id="scheduledFor" label="Time slot" error={errors.scheduledFor}>
                <Select value={scheduledFor} onValueChange={(v) => setScheduledFor(String(v ?? ""))}>
                  <SelectTrigger id="scheduledFor" data-field="scheduledFor" className="h-11 w-full rounded-xl">
                    <SelectValue placeholder="Choose a time">{(v: string) => (v ? formatInZone(v, hours.timezone, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Choose a time")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {slotsByDay.map(([day, daySlots]) => (
                      <SelectGroup key={day}>
                        <SelectLabel>{day}</SelectLabel>
                        {daySlots.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}
        </Section>

        <Section step={4} title="Payment" icon={Wallet}>
          <div role="radiogroup" aria-label="Payment method" className="grid gap-3 sm:grid-cols-2">
            {settings.payments.codEnabled && (
              <button type="button" role="radio" aria-checked={payment === "COD"} onClick={() => setPayment("COD")} className={cn("flex items-center gap-3 rounded-2xl border p-4 text-left transition", payment === "COD" ? "border-gold bg-gold/10" : "border-border hover:border-gold/40")}>
                <Wallet className="size-6 text-gold" />
                <span>
                  <span className="block font-bold">{fulfilment === "PICKUP" ? "Pay at pickup" : "Cash on Delivery"}</span>
                  <span className="text-xs text-muted-foreground">Cash or UPI when you receive your food</span>
                </span>
              </button>
            )}
            {settings.payments.razorpayEnabled && (
              <button type="button" role="radio" aria-checked={payment === "RAZORPAY"} onClick={() => setPayment("RAZORPAY")} className={cn("flex items-center gap-3 rounded-2xl border p-4 text-left transition", payment === "RAZORPAY" ? "border-gold bg-gold/10" : "border-border hover:border-gold/40")}>
                <CreditCard className="size-6 text-gold" />
                <span>
                  <span className="block font-bold">Pay online</span>
                  <span className="text-xs text-muted-foreground">UPI, cards, netbanking via Razorpay</span>
                </span>
              </button>
            )}
          </div>
          {!settings.payments.codEnabled && !settings.payments.razorpayEnabled && <p className="text-sm text-destructive">No payment methods are available right now. Please contact us.</p>}
          <div className="mt-5">
            <Field id="notes" label="Note for the kitchen (optional)">
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 500))} placeholder="Allergies, cutlery, anything else we should know" className="rounded-xl" />
            </Field>
          </div>
        </Section>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>

      <aside className="h-fit space-y-5 rounded-[2rem] border border-border bg-card p-6 lg:sticky lg:top-28">
        <h2 className="display-heading text-2xl">Order summary</h2>
        <ul className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {lines.map((l) => (
            <li key={l.key} className="flex gap-3 text-sm">
              <VegIndicator isVeg={l.snapshot.isVeg} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {l.quantity} × {l.snapshot.name}
                </p>
                {l.snapshot.selectionLabels.length > 0 && <p className="text-xs text-muted-foreground">{l.snapshot.selectionLabels.join(", ")}</p>}
              </div>
              <span className="tabular-nums">{formatINR(l.snapshot.unitPrice * l.quantity)}</span>
            </li>
          ))}
        </ul>
        <CouponField code={couponCode} onApply={(c) => cart.setCoupon(c)} quote={quote} loading={loading} />
        <OrderTotals quote={quote} loading={loading} fulfilment={fulfilment} pincodeChecked={!!quote?.delivery?.checked} />
        {blocking.length > 0 && (
          <ul role="alert" className="space-y-1 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
            {blocking.map((b) => (
              <li key={b}>• {b}</li>
            ))}
          </ul>
        )}
        {paymentPending && (
          <p className="rounded-xl border border-gold/30 bg-gold/10 p-3 text-xs">
            Your order is reserved and waiting for payment. Press the button below to retry the payment.
          </p>
        )}
        <Button type="button" onClick={() => void submit()} disabled={placeDisabled} className="h-14 w-full rounded-full text-base font-extrabold">
          {submitting ? (
            <>
              <Loader2 className="size-5 animate-spin" /> Placing order…
            </>
          ) : orderingBlocked ? (
            "Kitchen closed"
          ) : payment === "RAZORPAY" ? (
            `Pay ${quote ? formatINR(quote.totals.total) : ""}`
          ) : (
            `Place order ${quote ? `· ${formatINR(quote.totals.total)}` : ""}`
          )}
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          By placing this order you agree to our{" "}
          <Link href="/terms-and-conditions" className="underline">
            terms
          </Link>
          . Prices are confirmed by our server at checkout.
        </p>
      </aside>
    </div>
  );
}
