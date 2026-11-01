"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Receipt } from "lucide-react";
import { toast } from "sonner";
import { findMyOrder } from "@/features/checkout/actions";
import { getRememberedOrders, trackingUrl, type StoredOrderRef } from "@/features/checkout/tracking-storage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatInZone } from "@/lib/utilities/time";

export function TrackLookupForm() {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<StoredOrderRef[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read browser storage after mount
    setRecent(getRememberedOrders().slice(0, 5));
  }, []);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form
        className="space-y-4 rounded-[2rem] border border-border bg-card p-6 sm:p-8"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError(null);
          const res = await findMyOrder({ orderNumber, phone });
          setLoading(false);
          if (!res.ok) {
            setError(res.error);
            toast.error(res.error);
            return;
          }
          router.push(trackingUrl(res.data.orderNumber, res.data.token));
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="orderNumber">Order number</Label>
          <Input id="orderNumber" required value={orderNumber} onChange={(e) => setOrderNumber(e.target.value.toUpperCase())} placeholder="BA261031-004" className="h-12 rounded-xl uppercase" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="phone">Mobile number used for the order</Label>
          <Input id="phone" required inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" className="h-12 rounded-xl" />
        </div>
        {error && (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={loading} className="h-12 w-full rounded-full font-bold">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Find my order
        </Button>
        <p className="text-xs text-muted-foreground">
          Signed in?{" "}
          <Link href="/account/orders" className="font-bold text-gold hover:underline">
            See all your orders
          </Link>
        </p>
      </form>
      <div>
        <h2 className="mb-4 text-lg font-bold">Orders from this device</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Orders you place on this device will appear here for quick tracking.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((o) => (
              <li key={o.orderNumber}>
                <Link href={trackingUrl(o.orderNumber, o.token)} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-gold/40">
                  <Receipt className="size-5 text-gold" />
                  <span className="flex-1 font-bold">{o.orderNumber}</span>
                  <span className="text-xs text-muted-foreground">{formatInZone(o.placedAt, undefined, { dateStyle: "medium" })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
