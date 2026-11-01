import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { ProductsTable } from "@/components/admin/catalog/products-table";
import { listProductsAdmin } from "@/services/admin-catalog.service";

export const metadata: Metadata = { title: "Products" };

export default function ProductsPage({ searchParams }: PageProps<"/products">) {
  return (
    <>
      <AdminPageHeader title="Products" description="Every dish on the menu. Changes go live on the storefront immediately." />
      <Suspense fallback={<AdminPageSkeleton rows={8} />}>
        <ProductsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ProductsContent({ searchParams }: { searchParams: PageProps<"/products">["searchParams"] }) {
  await requireAdminPage();
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const filters = { q: str(sp.q), category: str(sp.category), availability: str(sp.availability) };
  const { products, categories } = await listProductsAdmin({
    q: filters.q,
    categoryId: filters.category,
    availability: (["available", "soldout", "hidden"].includes(filters.availability) ? filters.availability : "all") as "all",
  });
  return <ProductsTable products={products} categories={categories.map((c) => ({ id: c.id, name: c.name }))} filters={filters} />;
}
