import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { CustomisationsManager } from "@/components/admin/catalog/customisations-manager";
import { listCustomisationGroupsAdmin } from "@/services/admin-catalog.service";

export const metadata: Metadata = { title: "Customisations" };

export default function CustomisationsPage() {
  return (
    <>
      <AdminPageHeader title="Customisations" description="Reusable add-ons and choices (toppings, portion, spice). Prices are added to the dish price and re-checked at checkout." />
      <Suspense fallback={<AdminPageSkeleton />}>
        <CustomisationsContent />
      </Suspense>
    </>
  );
}

async function CustomisationsContent() {
  await requireAdminPage();
  return <CustomisationsManager groups={await listCustomisationGroupsAdmin()} />;
}
