import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/catalog/product-form";
import { ProductCostForm } from "@/components/admin/catalog/product-cost-form";
import { Button } from "@/components/ui/button";
import { getProductAdmin } from "@/services/admin-catalog.service";
import { getCloudinaryConfig } from "@/lib/cloudinary";
import { getProductFormOptions } from "../_data";
import { storeUrl } from "@/lib/store-url";

export const metadata: Metadata = { title: "Edit product" };

export default function EditProductPage({ params }: PageProps<"/products/[productId]">) {
  return (
    <Suspense fallback={<AdminPageSkeleton rows={8} />}>
      <EditProductContent params={params} />
    </Suspense>
  );
}

async function EditProductContent({ params }: { params: PageProps<"/products/[productId]">["params"] }) {
  await requireAdminPage();
  const { productId } = await params;
  const [detail, options] = await Promise.all([getProductAdmin(productId).catch(() => null), getProductFormOptions()]);
  if (!detail) notFound();
  const { product, cost } = detail;
  return (
    <>
      <AdminPageHeader
        title={product.name}
        description={`Last updated ${new Date(product.updatedAt as string).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`}
        actions={
          <Button variant="outline" size="sm" render={<a href={storeUrl(`/food/${product.slug}`)} target="_blank" rel="noopener" />}>
            <ExternalLink className="size-3.5" /> View on site
          </Button>
        }
      />
      <div className="grid gap-5">
        <ProductCostForm productId={product.id} sellingPrice={product.discountedPrice ?? product.price} cost={cost} />
        <ProductForm product={product} categories={options.categories} groups={options.groups} cloudinaryEnabled={!!getCloudinaryConfig()} />
      </div>
    </>
  );
}
