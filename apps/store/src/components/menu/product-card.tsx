"use client";
import { LinkButton } from "@/components/customer/link-button";

import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, Flame, Sparkles, Clock } from "lucide-react";
import { toast } from "sonner";
import type { PublicProduct } from "@/types/catalog";
import { FoodImage } from "@/components/shared/food-image";
import { VegIndicator } from "@/components/shared/veg-indicator";
import { Price } from "@/components/shared/price";
import { Button } from "@/components/ui/button";
import { FavouriteButton } from "./favourite-button";
import { QuantityStepper } from "@/components/cart/cart-line-item";
import { cart, useCart } from "@/features/cart/cart-store";
import { lineKey } from "@/services/pricing-key";
import { useCartDrawer } from "@/components/layout/cart-drawer-context";
import { cn } from "@/lib/utils";

import { effectivePrice } from "@/lib/utilities/product-price";
export { effectivePrice };

export function addSimpleProduct(product: PublicProduct, fallbackImage?: string | null) {
  cart.add({
    productId: product.id,
    quantity: 1,
    selections: [],
    snapshot: { name: product.name, slug: product.slug, imageUrl: product.image?.url ?? fallbackImage ?? null, isVeg: product.isVeg, unitPrice: effectivePrice(product), selectionLabels: [] },
  });
}

export function ProductCard({ product, fallbackImage, bestseller, priority, layout = "grid" }: { product: PublicProduct; fallbackImage?: string | null; bestseller?: boolean; priority?: boolean; layout?: "grid" | "row" }) {
  const { lines } = useCart();
  const { setOpen } = useCartDrawer();
  const simpleKey = lineKey({ productId: product.id, selections: [] });
  const inCart = lines.find((l) => l.key === simpleKey);
  const soldOut = !product.isAvailable;
  const href = `/food/${product.slug}`;

  const onAdd = () => {
    addSimpleProduct(product, fallbackImage);
    toast.success(`${product.name} added`, { action: { label: "View cart", onClick: () => setOpen(true) }, duration: 2500 });
  };

  const action = soldOut ? (
    <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">Sold out</span>
  ) : product.hasCustomisations ? (
    <LinkButton size="sm" className="h-9 rounded-full px-4 font-bold" href={href} aria-label={`Customise ${product.name}`}>
      Add <Plus className="size-3.5" />
    </LinkButton>
  ) : inCart ? (
    <QuantityStepper size="sm" value={inCart.quantity} onChange={(v) => cart.setQuantity(inCart.key, v)} label={product.name} />
  ) : (
    <Button size="sm" className="h-9 rounded-full px-4 font-bold" onClick={onAdd} aria-label={`Add ${product.name} to cart`}>
      Add <Plus className="size-3.5" />
    </Button>
  );

  return (
    <motion.article
      layout="position"
      whileHover={soldOut ? undefined : { y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={cn(
        "group relative flex overflow-hidden rounded-3xl border border-border bg-card shadow-[0_10px_40px_-20px_rgba(0,0,0,0.8)] transition-colors hover:border-gold/40",
        layout === "grid" ? "flex-col" : "flex-row",
        soldOut && "opacity-60 grayscale-[.6]",
      )}
    >
      <Link href={href} className={cn("relative block shrink-0", layout === "grid" ? "aspect-[4/3]" : "w-32 sm:w-40")} aria-label={product.name}>
        <FoodImage
          src={product.image?.url}
          fallbackSrc={fallbackImage}
          alt={product.image?.alt || product.name}
          priority={priority}
          className="absolute inset-0"
          imgClassName="transition-transform duration-700 ease-out group-hover:scale-110"
          sizes={layout === "grid" ? "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" : "160px"}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent opacity-70" />
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {(bestseller || product.isBestseller) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-primary-foreground uppercase">
              <Flame className="size-3" /> Bestseller
            </span>
          )}
          {product.isNewArrival && (
            <span className="inline-flex items-center gap-1 rounded-full bg-ember px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-white uppercase">
              <Sparkles className="size-3" /> New
            </span>
          )}
        </div>
      </Link>
      {layout === "grid" && <FavouriteButton productId={product.id} name={product.name} className="absolute top-3 right-3" />}
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <div className="flex items-start gap-2">
          <VegIndicator isVeg={product.isVeg} className="mt-1" />
          <h3 className="min-w-0 flex-1 text-base leading-snug font-bold">
            <Link href={href} className="hover:text-gold">
              {product.name}
            </Link>
          </h3>
        </div>
        {product.shortDescription && <p className="line-clamp-2 text-sm text-muted-foreground">{product.shortDescription}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {product.servingInfo && <span className="rounded-full border border-border px-2 py-0.5">{product.servingInfo}</span>}
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" /> {product.preparationMinutes} min
          </span>
          {product.spiceLevel > 0 && <span aria-label={`Spice level ${product.spiceLevel} of 3`}>{"🌶".repeat(product.spiceLevel)}</span>}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <Price amount={effectivePrice(product)} compareAt={product.discountedPrice ? product.price : null} />
          {action}
        </div>
      </div>
    </motion.article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card" aria-hidden>
      <div className="aspect-[4/3] animate-pulse bg-muted" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted/70" />
        <div className="flex justify-between pt-2">
          <div className="h-5 w-16 animate-pulse rounded bg-muted" />
          <div className="h-9 w-20 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
    </div>
  );
}
