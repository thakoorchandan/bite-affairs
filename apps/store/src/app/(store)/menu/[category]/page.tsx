import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getBestsellerIds, getPublicMenu } from "@/features/catalog/queries";
import { MenuBrowser } from "@/components/menu/menu-browser";
import { MenuSkeleton } from "@/components/menu/menu-skeleton";
import { MenuClosedBanner } from "@/components/menu/menu-closed-banner";
import { FoodImage } from "@/components/shared/food-image";

export async function generateMetadata({ params }: PageProps<"/menu/[category]">): Promise<Metadata> {
  const { category } = await params;
  await connection();
  const { categories } = await getPublicMenu();
  const cat = categories.find((c) => c.slug === category);
  if (!cat) return { title: "Menu" };
  return { title: cat.name, description: cat.description ?? `${cat.name} at Bite Affairs, Kolkata.`, alternates: { canonical: `/menu/${cat.slug}` } };
}

async function CategoryContent({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  await connection();
  const [{ categories, products }, bestsellerIds] = await Promise.all([getPublicMenu(), getBestsellerIds()]);
  const cat = categories.find((c) => c.slug === category);
  if (!cat) notFound();
  return (
    <>
      <header className="relative mb-8 overflow-hidden rounded-[2rem] border border-border">
        <FoodImage src={cat.image?.url} alt={cat.name} priority className="h-48 sm:h-64" sizes="100vw" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10">
          <p className="script-accent text-xl">{cat.productCount} dishes</p>
          <h1 className="display-heading text-5xl sm:text-7xl">{cat.name}</h1>
          {cat.description && <p className="mt-2 max-w-md text-sm text-foreground/80">{cat.description}</p>}
        </div>
      </header>
      <MenuBrowser categories={categories} products={products} bestsellerIds={bestsellerIds} activeCategorySlug={cat.slug} />
    </>
  );
}

export default function CategoryPage({ params }: PageProps<"/menu/[category]">) {
  return (
    <div className="container-page pt-8 pb-10">
      <Suspense fallback={null}>
        <MenuClosedBanner />
      </Suspense>
      <Suspense fallback={<MenuSkeleton />}>
        <CategoryContent params={params} />
      </Suspense>
    </div>
  );
}
