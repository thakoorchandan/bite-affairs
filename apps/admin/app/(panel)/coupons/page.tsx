import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { CouponsManager } from "@/components/admin/catalog/coupons-manager";
import { listCouponsAdmin, listProductsAdmin } from "@/services/admin-catalog.service";

export const metadata: Metadata = { title: "Coupons" };

export default function CouponsPage() {
  return (
    <>
      <AdminPageHeader title="Coupons" description="Discount codes are validated on the server at checkout, including limits and dates." />
      <Suspense fallback={<AdminPageSkeleton />}>
        <CouponsContent />
      </Suspense>
    </>
  );
}

async function CouponsContent() {
  await requireAdminPage();
  const [coupons, { products, categories }] = await Promise.all([listCouponsAdmin(), listProductsAdmin()]);
  return <CouponsManager coupons={coupons} products={products.map((p) => ({ id: p.id, name: p.name }))} categories={categories.map((c) => ({ id: c.id, name: c.name }))} />;
}
