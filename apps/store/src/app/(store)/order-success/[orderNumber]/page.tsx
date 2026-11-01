import { LinkButton } from "@/components/customer/link-button";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getTrackingView } from "@/services/order-query.service";
import { getCurrentUser } from "@/lib/auth/session";
import { getPublicSettings } from "@/features/business-settings/queries";
import { SuccessBurst } from "@/components/orders/success-burst";
import { RememberOrder } from "@/components/orders/remember-order";
import { OrderItemsCard } from "@/components/orders/order-items-card";
import { formatInZone } from "@/lib/utilities/time";

export const metadata: Metadata = { title: "Order placed", robots: { index: false } };

async function SuccessContent({ params, searchParams }: PageProps<"/order-success/[orderNumber]">) {
  const { orderNumber: raw } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : null;
  const orderNumber = decodeURIComponent(raw);
  const user = await getCurrentUser();
  const [order, settings] = await Promise.all([getTrackingView(orderNumber, token, user?.id), getPublicSettings()]);
  if (!order) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <h1 className="display-heading text-4xl">Order not found</h1>
        <p className="mt-3 text-muted-foreground">This link is missing its secure tracking code. Use the order number and your mobile number to find it.</p>
        <LinkButton className="mt-6 rounded-full" href="/track-order">
          Find my order
        </LinkButton>
      </div>
    );
  }
  const trackHref = `/track-order/${encodeURIComponent(order.orderNumber)}${token ? `?t=${encodeURIComponent(token)}` : ""}`;
  const eta = order.fulfilment === "DELIVERY" ? order.estimatedDeliveryAt : order.estimatedReadyAt;
  return (
    <div className="mx-auto max-w-2xl">
      {token && <RememberOrder orderNumber={order.orderNumber} token={token} />}
      <div className="text-center">
        <SuccessBurst />
        <p className="script-accent mt-6 text-2xl">Thank you, {order.customerName}!</p>
        <h1 className="display-heading text-5xl sm:text-6xl">Order placed</h1>
        <p className="mt-3 text-muted-foreground">
          Your order number is <strong className="text-foreground">{order.orderNumber}</strong>.
          {order.payment.method === "COD" && order.payment.status !== "PAID" ? " Please keep cash or UPI ready." : ""}
        </p>
        {order.isPreorder && order.scheduledFor ? (
          <p className="mt-2 text-sm">Scheduled for {formatInZone(order.scheduledFor)}</p>
        ) : eta ? (
          <p className="mt-2 text-sm">
            Estimated {order.fulfilment === "DELIVERY" ? "delivery" : "ready"} by <strong>{formatInZone(eta, undefined, { hour: "numeric", minute: "2-digit" })}</strong>
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <LinkButton className="h-12 rounded-full px-8 font-bold" href={trackHref}>
            Track order
          </LinkButton>
          <LinkButton variant="outline" className="h-12 rounded-full px-8" href="/menu">
            Order more
          </LinkButton>
        </div>
        {!user && (
          <p className="mt-6 text-sm text-muted-foreground">
            <Link href="/register" className="font-bold text-gold hover:underline">
              Create an account
            </Link>{" "}
            to save this order to your history and check out faster next time.
          </p>
        )}
      </div>
      <div className="mt-10">
        <OrderItemsCard order={order} />
      </div>
      {settings.contactPhone && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Questions? Call us on{" "}
          <a href={`tel:+91${settings.contactPhone}`} className="font-bold text-gold">
            +91 {settings.contactPhone}
          </a>
        </p>
      )}
    </div>
  );
}

export default function OrderSuccessPage(props: PageProps<"/order-success/[orderNumber]">) {
  return (
    <div className="container-page py-12">
      <Suspense fallback={<div className="mx-auto h-96 max-w-2xl animate-pulse rounded-[2rem] bg-muted" aria-busy="true" />}>
        <SuccessContent {...props} />
      </Suspense>
    </div>
  );
}
