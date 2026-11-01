import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { MenuOverview } from "@/components/admin/catalog/menu-overview";
import { Button } from "@/components/ui/button";
import { listProductsAdmin } from "@/services/admin-catalog.service";

export const metadata: Metadata = { title: "Menu" };

export default function MenuPage() {
  return (
    <>
      <AdminPageHeader
        title="Menu overview"
        description="Mark dishes sold out, adjust prices and highlight bestsellers in one place."
        actions={
          <Button render={<Link href="/products/new" />}>
            <Plus className="size-4" /> New product
          </Button>
        }
      />
      <Suspense fallback={<AdminPageSkeleton rows={10} />}>
        <MenuContent />
      </Suspense>
    </>
  );
}

async function MenuContent() {
  await requireAdminPage();
  const { products, categories } = await listProductsAdmin();
  return <MenuOverview products={products} categories={categories.map((c) => ({ id: c.id, name: c.name, isActive: c.isActive }))} />;
}
