import { LinkButton } from "@/components/customer/link-button";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getTrackingView } from "@/services/order-query.service";
import { getCurrentUser } from "@/lib/auth/session";
import { getPublicSettings } from "@/features/business-settings/queries";
import { LiveTracking } from "@/components/orders/tracking-view";
import { RememberOrder } from "@/components/orders/remember-order";

export const metadata: Metadata = { title: "Track order", robots: { index: false } };

async function TrackContent({ params, searchParams }: PageProps<"/track-order/[orderNumber]">) {
  const { orderNumber } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : null;
  const user = await getCurrentUser();
  const [order, settings] = await Promise.all([getTrackingView(decodeURIComponent(orderNumber), token, user?.id), getPublicSettings()]);
  if (!order) {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <h1 className="display-heading text-4xl">We couldn&apos;t open that order</h1>
        <p className="mt-3 text-muted-foreground">For your privacy, tracking links include a secure code. Look your order up with its number and your mobile number instead.</p>
        <LinkButton className="mt-6 rounded-full" href="/track-order">
          Find my order
        </LinkButton>
      </div>
    );
  }
  return (
    <>
      {token && <RememberOrder orderNumber={order.orderNumber} token={token} />}
      <LiveTracking initial={order} token={token} contactPhone={settings.contactPhone} />
    </>
  );
}

export default function TrackOrderPage(props: PageProps<"/track-order/[orderNumber]">) {
  return (
    <div className="container-page pt-8 pb-10">
      <h1 className="display-heading mb-8 text-5xl sm:text-6xl">
        Track <span className="gold-text">Order</span>
      </h1>
      <Suspense fallback={<div className="h-[32rem] animate-pulse rounded-[2rem] bg-muted" aria-busy="true" aria-label="Loading order" />}>
        <TrackContent {...props} />
      </Suspense>
    </div>
  );
}
