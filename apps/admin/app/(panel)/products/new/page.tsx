import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/catalog/product-form";
import { getCloudinaryConfig } from "@/lib/cloudinary";
import { getProductFormOptions } from "../_data";

export const metadata: Metadata = { title: "New product" };

export default function NewProductPage({ searchParams }: PageProps<"/products/new">) {
  return (
    <>
      <AdminPageHeader title="New product" description="Add a dish to the menu." />
      <Suspense fallback={<AdminPageSkeleton rows={8} />}>
        <NewProductContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NewProductContent({ searchParams }: { searchParams: PageProps<"/products/new">["searchParams"] }) {
  await requireAdminPage();
  const [{ categories, groups }, sp] = await Promise.all([getProductFormOptions(), searchParams]);
  if (!categories.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Create a category first on the{" "}
        <Link href="/categories" className="text-gold underline">
          Categories
        </Link>{" "}
        page.
      </p>
    );
  }
  return <ProductForm categories={categories} groups={groups} cloudinaryEnabled={!!getCloudinaryConfig()} defaultCategoryId={typeof sp.category === "string" ? sp.category : undefined} />;
}
