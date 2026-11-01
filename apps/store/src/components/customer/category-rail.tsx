"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { PublicCategory } from "@/types/catalog";
import { FoodImage } from "@/components/shared/food-image";
import { Stagger, StaggerItem } from "@/components/shared/reveal";

export function CategoryRail({ categories }: { categories: PublicCategory[] }) {
  return (
    <Stagger className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
      {categories.map((c) => (
        <StaggerItem key={c.id} className="w-40 shrink-0 snap-start sm:w-auto">
          <motion.div whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
            <Link href={`/menu/${c.slug}`} className="group block overflow-hidden rounded-3xl border border-border bg-card">
              <div className="relative aspect-square">
                <FoodImage src={c.image?.url} alt={c.name} className="absolute inset-0" imgClassName="transition-transform duration-700 group-hover:scale-110" sizes="(max-width: 640px) 160px, 20vw" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <h3 className="display-heading text-lg leading-none text-foreground group-hover:text-gold sm:text-xl">{c.name}</h3>
                  <p className="mt-1 text-[11px] font-semibold text-muted-foreground">{c.productCount} items</p>
                </div>
              </div>
            </Link>
          </motion.div>
        </StaggerItem>
      ))}
    </Stagger>
  );
}
