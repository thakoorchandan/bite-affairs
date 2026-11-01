import type { Metadata } from "next";
import { Suspense } from "react";
import { getLiveKitchenStatus, getPublicHours, getPublicSettings } from "@/features/business-settings/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { listAddresses } from "@/services/account.service";
import { getBusinessSettings, toKitchenConfig } from "@/services/settings.service";
import { CheckoutForm } from "@/components/checkout/checkout-form";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

async function CheckoutLoader() {
  const status = await getLiveKitchenStatus();
  const [settings, hours, user, raw] = await Promise.all([getPublicSettings(), getPublicHours(), getCurrentUser(), getBusinessSettings()]);
  const addresses = user ? await listAddresses(user.id) : [];
  return (
    <CheckoutForm
      status={status}
      settings={settings}
      hours={hours}
      preorderMaxDaysAhead={toKitchenConfig(raw).preorderMaxDaysAhead}
      user={user ? { name: user.name, phone: user.phone ?? "", email: user.email ?? "" } : null}
      addresses={addresses}
    />
  );
}

function CheckoutSkeleton() {
  return (
    <div className="grid animate-pulse gap-8 lg:grid-cols-[1fr_400px]" aria-busy="true" aria-label="Loading checkout">
      <div className="space-y-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-40 rounded-[2rem] bg-muted" />
        ))}
      </div>
      <div className="h-96 rounded-[2rem] bg-muted" />
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <div className="container-page pt-8 pb-10">
      <h1 className="display-heading mb-8 text-5xl sm:text-6xl">Checkout</h1>
      <Suspense fallback={<CheckoutSkeleton />}>
        <CheckoutLoader />
      </Suspense>
    </div>
  );
}
