import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageSkeleton } from "@/components/admin/page-header";
import { KitchenDisplay } from "@/components/admin/kds/kitchen-display";
import { asOrderViews } from "@/components/admin/orders/types";
import { getActiveBoardOrders } from "@/services/admin-orders.service";
import { getBusinessSettings } from "@/services/settings.service";

export const metadata: Metadata = { title: "Kitchen Display" };

export default function KitchenDisplayPage() {
  return (
    <Suspense fallback={<AdminPageSkeleton rows={4} />}>
      <KitchenContent />
    </Suspense>
  );
}

async function KitchenContent() {
  await requireAdminPage();
  const [orders, settings] = await Promise.all([getActiveBoardOrders(), getBusinessSettings()]);
  return <KitchenDisplay initial={asOrderViews(orders)} delayMinutes={settings.kitchen?.delayAlertMinutes ?? 45} />;
}
