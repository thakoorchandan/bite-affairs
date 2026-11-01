"use client";
import { LinkButton } from "@/components/customer/link-button";

import { Heart, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import type { PublicProduct } from "@/types/catalog";
import { ProductCard, addSimpleProduct } from "@/components/menu/product-card";
import { useFavourites } from "./favourites-provider";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export function FavouritesGrid({ products, fallbackImages }: { products: PublicProduct[]; fallbackImages: Record<string, string | null> }) {
  const { ids, ready, persistent } = useFavourites();
  // Hide items un-favourited in this session without a round-trip.
  const visible = ready && persistent ? products.filter((p) => ids.has(p.id)) : products;
  const addable = visible.filter((p) => p.isAvailable && !p.hasCustomisations);

  if (!visible.length) {
    return <EmptyState icon={Heart} title="No favourites yet" description="Tap the heart on any dish to save it here." action={<LinkButton className="rounded-full" href="/menu">Explore the menu</LinkButton>} />;
  }
  return (
    <div>
      {addable.length > 0 && (
        <div className="mb-4 flex justify-end">
          <Button
            className="rounded-full"
            onClick={() => {
              addable.forEach((p) => addSimpleProduct(p, fallbackImages[p.categoryId]));
              toast.success(`${addable.length} favourite${addable.length > 1 ? "s" : ""} added to cart`);
            }}
          >
            <ShoppingBag className="size-4" /> Add all to cart
          </Button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((p) => (
          <ProductCard key={p.id} product={p} fallbackImage={fallbackImages[p.categoryId]} />
        ))}
      </div>
    </div>
  );
}
