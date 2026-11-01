import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { DeliverySettingsForm, ZonesManager } from "@/components/admin/settings/delivery-settings";
import { getAdminSettings, listDeliveryZonesAdmin } from "@/services/admin-config.service";

export const metadata: Metadata = { title: "Delivery settings" };

export default function DeliverySettingsPage() {
  return (
    <>
      <AdminPageHeader title="Delivery settings" description="Where you deliver, what it costs, and how long it takes. Checked on the server at checkout." />
      <Suspense fallback={<AdminPageSkeleton />}>
        <DeliveryContent />
      </Suspense>
    </>
  );
}

async function DeliveryContent() {
  await requireAdminPage();
  const [settings, { zones, overlaps }] = await Promise.all([getAdminSettings(), listDeliveryZonesAdmin()]);
  return (
    <div className="grid gap-6">
      <ZonesManager zones={zones} overlaps={overlaps} />
      <DeliverySettingsForm delivery={(settings.delivery ?? {}) as Parameters<typeof DeliverySettingsForm>[0]["delivery"]} />
    </div>
  );
}
