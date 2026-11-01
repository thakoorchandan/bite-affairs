import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { CategoriesManager } from "@/components/admin/catalog/categories-manager";
import { listCategoriesAdmin } from "@/services/admin-catalog.service";
import { getCloudinaryConfig } from "@/lib/cloudinary";

export const metadata: Metadata = { title: "Categories" };

export default function CategoriesPage() {
  return (
    <>
      <AdminPageHeader title="Categories" description="Organise the menu. Drag to reorder — the storefront follows this order." />
      <Suspense fallback={<AdminPageSkeleton />}>
        <CategoriesContent />
      </Suspense>
    </>
  );
}

async function CategoriesContent() {
  await requireAdminPage();
  const categories = await listCategoriesAdmin();
  return <CategoriesManager categories={categories} cloudinaryEnabled={!!getCloudinaryConfig()} />;
}
