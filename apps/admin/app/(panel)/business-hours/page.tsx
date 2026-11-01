import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { KitchenControl } from "@/components/admin/settings/kitchen-control";
import { HoursEditor } from "@/components/admin/settings/hours-editor";
import { getAdminHours, getAdminSettings } from "@/services/admin-config.service";
import { getKitchenStatus } from "@/services/settings.service";

export const metadata: Metadata = { title: "Business hours" };

export default function BusinessHoursPage() {
  return (
    <>
      <AdminPageHeader title="Business hours & kitchen" description="Open, close or pause the kitchen instantly, and set your regular timetable. Manual overrides win over the timetable." />
      <Suspense fallback={<AdminPageSkeleton rows={8} />}>
        <HoursContent />
      </Suspense>
    </>
  );
}

async function HoursContent() {
  await requireAdminPage();
  await connection();
  const [settings, hours, status] = await Promise.all([getAdminSettings(), getAdminHours(), getKitchenStatus()]);
  return (
    <div className="grid gap-8">
      <KitchenControl kitchen={(settings.kitchen ?? {}) as Parameters<typeof KitchenControl>[0]["kitchen"]} status={status} />
      <HoursEditor hours={hours as Parameters<typeof HoursEditor>[0]["hours"]} />
    </div>
  );
}
