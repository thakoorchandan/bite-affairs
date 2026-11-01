import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getBestsellerIds, getPublicMenu } from "@/features/catalog/queries";
import { MenuBrowser } from "@/components/menu/menu-browser";
import { MenuSkeleton } from "@/components/menu/menu-skeleton";
import { MenuClosedBanner } from "@/components/menu/menu-closed-banner";

export const metadata: Metadata = {
  title: "Menu",
  description: "Explore the full Bite Affairs menu: momos, pizzas, burgers, sandwiches, Maggi, pasta, dry bites, wraps, fries and special Chinese combos.",
  alternates: { canonical: "/menu" },
};

async function MenuContent() {
  await connection();
  const [{ categories, products }, bestsellerIds] = await Promise.all([getPublicMenu(), getBestsellerIds()]);
  return <MenuBrowser categories={categories} products={products} bestsellerIds={bestsellerIds} />;
}

export default function MenuPage() {
  return (
    <div className="container-page pt-8 pb-10">
      <header className="mb-6">
        <p className="script-accent text-2xl">Fresh from our kitchen</p>
        <h1 className="display-heading text-5xl sm:text-7xl">
          The <span className="gold-text">Menu</span>
        </h1>
      </header>
      <Suspense fallback={null}>
        <MenuClosedBanner />
      </Suspense>
      <Suspense fallback={<MenuSkeleton />}>
        <MenuContent />
      </Suspense>
    </div>
  );
}
