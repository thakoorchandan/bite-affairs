"use client";

import { Heart } from "lucide-react";
import { motion } from "framer-motion";
import { useFavourites } from "@/components/customer/favourites-provider";
import { cn } from "@/lib/utils";

export function FavouriteButton({ productId, name, className }: { productId: string; name: string; className?: string }) {
  const { isFavourite, toggle } = useFavourites();
  const active = isFavourite(productId);
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.8 }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggle(productId, name);
      }}
      aria-pressed={active}
      aria-label={active ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      className={cn("grid size-9 place-items-center rounded-full bg-background/70 backdrop-blur transition hover:bg-background", className)}
    >
      <Heart className={cn("size-4 transition", active ? "fill-gold text-gold" : "text-foreground")} />
    </motion.button>
  );
}
