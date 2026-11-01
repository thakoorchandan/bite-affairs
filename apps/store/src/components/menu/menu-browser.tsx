"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X, SlidersHorizontal, SearchX } from "lucide-react";
import type { PublicCategory, PublicProduct } from "@/types/catalog";
import { ProductCard, effectivePrice } from "./product-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Diet = "all" | "veg" | "nonveg";
type Sort = "recommended" | "price-asc" | "price-desc";
type Quick = "bestseller" | "featured" | "discounted" | "new";

const QUICK: { id: Quick; label: string }[] = [
  { id: "bestseller", label: "Bestsellers" },
  { id: "featured", label: "Featured" },
  { id: "discounted", label: "Offers" },
  { id: "new", label: "New" },
];

export function MenuBrowser({
  categories,
  products,
  bestsellerIds,
  activeCategorySlug,
}: {
  categories: PublicCategory[];
  products: PublicProduct[];
  bestsellerIds: string[];
  activeCategorySlug?: string;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [diet, setDiet] = useState<Diet>("all");
  const [sort, setSort] = useState<Sort>("recommended");
  const [quick, setQuick] = useState<Set<Quick>>(new Set());
  const [activeSection, setActiveSection] = useState<string | null>(activeCategorySlug ?? categories[0]?.slug ?? null);
  const navRef = useRef<HTMLDivElement>(null);
  const bestsellers = useMemo(() => new Set(bestsellerIds), [bestsellerIds]);
  const catImage = useMemo(() => new Map(categories.map((c) => [c.id, c.image?.url ?? null])), [categories]);

  const visibleCategories = activeCategorySlug ? categories.filter((c) => c.slug === activeCategorySlug) : categories;

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    let list = products.filter((p) => visibleCategories.some((c) => c.id === p.categoryId));
    if (q) list = list.filter((p) => [p.name, p.shortDescription ?? "", p.categoryName, ...p.tags].join(" ").toLowerCase().includes(q));
    if (diet !== "all") list = list.filter((p) => (diet === "veg" ? p.isVeg : !p.isVeg));
    if (quick.has("bestseller")) list = list.filter((p) => p.isBestseller || bestsellers.has(p.id));
    if (quick.has("featured")) list = list.filter((p) => p.isFeatured);
    if (quick.has("discounted")) list = list.filter((p) => p.discountedPrice != null);
    if (quick.has("new")) list = list.filter((p) => p.isNewArrival);
    if (sort !== "recommended") list = [...list].sort((a, b) => (sort === "price-asc" ? 1 : -1) * (effectivePrice(a) - effectivePrice(b)));
    // Available items first, sold-out at the end of each group.
    return [...list].sort((a, b) => Number(!a.isAvailable) - Number(!b.isAvailable));
  }, [products, visibleCategories, deferredQuery, diet, quick, sort, bestsellers]);

  const grouped = sort === "recommended";
  const sections = grouped ? visibleCategories.map((c) => ({ category: c, items: filtered.filter((p) => p.categoryId === c.id) })).filter((s) => s.items.length) : [];

  // Scroll-spy for the sticky category nav (all-categories view only).
  useEffect(() => {
    if (activeCategorySlug || !grouped) return;
    const els = categories.map((c) => document.getElementById(`cat-${c.slug}`)).filter((e): e is HTMLElement => !!e);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSection(visible[0].target.id.replace("cat-", ""));
      },
      { rootMargin: "-140px 0px -60% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [categories, activeCategorySlug, grouped, filtered.length]);

  useEffect(() => {
    const chip = navRef.current?.querySelector<HTMLElement>(`[data-slug="${activeSection}"]`);
    chip?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeSection]);

  const toggleQuick = (id: Quick) =>
    setQuick((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const hasFilters = query || diet !== "all" || quick.size > 0 || sort !== "recommended";
  const reset = () => {
    setQuery("");
    setDiet("all");
    setQuick(new Set());
    setSort("recommended");
  };

  return (
    <div>
      <div className="sticky top-16 z-30 -mx-4 border-b border-border bg-background/85 px-4 pt-3 pb-3 backdrop-blur-xl sm:top-20 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search momos, pizza, Chicken 65…"
              aria-label="Search the menu"
              className="h-11 rounded-full pr-10 pl-10 text-sm"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <div role="radiogroup" aria-label="Diet" className="flex shrink-0 rounded-full border border-border p-1">
              {(["all", "veg", "nonveg"] as Diet[]).map((d) => (
                <button
                  key={d}
                  role="radio"
                  aria-checked={diet === d}
                  onClick={() => setDiet(d)}
                  className={cn("relative rounded-full px-3 py-1.5 text-xs font-bold transition", diet === d ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {diet === d && <motion.span layoutId="diet-pill" className="absolute inset-0 rounded-full bg-gold" transition={{ type: "spring", stiffness: 400, damping: 30 }} />}
                  <span className="relative">{d === "all" ? "All" : d === "veg" ? "Veg" : "Non-veg"}</span>
                </button>
              ))}
            </div>
            {QUICK.map((q) => (
              <button
                key={q.id}
                onClick={() => toggleQuick(q.id)}
                aria-pressed={quick.has(q.id)}
                className={cn("shrink-0 rounded-full border px-3 py-2 text-xs font-bold transition", quick.has(q.id) ? "border-gold bg-gold/15 text-gold" : "border-border text-muted-foreground hover:text-foreground")}
              >
                {q.label}
              </button>
            ))}
            <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
              <SelectTrigger className="h-9 shrink-0 rounded-full text-xs" aria-label="Sort">
                <SlidersHorizontal className="size-3.5" />
                <SelectValue>{(v: string) => (v === "price-asc" ? "Price: low to high" : v === "price-desc" ? "Price: high to low" : "Recommended")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recommended">Recommended</SelectItem>
                <SelectItem value="price-asc">Price: low to high</SelectItem>
                <SelectItem value="price-desc">Price: high to low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div ref={navRef} className="mt-3 flex gap-2 overflow-x-auto no-scrollbar" aria-label="Categories">
          {!activeCategorySlug ? (
            categories.map((c) => (
              <a
                key={c.id}
                href={`#cat-${c.slug}`}
                data-slug={c.slug}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(`cat-${c.slug}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  setActiveSection(c.slug);
                }}
                className={cn("relative shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition", activeSection === c.slug ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {activeSection === c.slug && <motion.span layoutId="cat-pill" className="absolute inset-0 rounded-full bg-gold" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                <span className="relative">{c.name}</span>
              </a>
            ))
          ) : (
            <>
              <Link href="/menu" className="shrink-0 rounded-full border border-border px-4 py-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
                All
              </Link>
              {categories.map((c) => (
                <Link
                  key={c.id}
                  href={`/menu/${c.slug}`}
                  data-slug={c.slug}
                  aria-current={c.slug === activeCategorySlug ? "page" : undefined}
                  className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition", c.slug === activeCategorySlug ? "bg-gold text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {c.name}
                </Link>
              ))}
            </>
          )}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {filtered.length} dishes shown
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No dishes match"
          description="Try a different search or clear the filters."
          action={
            hasFilters ? (
              <button onClick={reset} className="text-sm font-bold text-gold underline-offset-4 hover:underline">
                Clear all filters
              </button>
            ) : null
          }
          className="mt-10"
        />
      ) : grouped ? (
        <div className="mt-8 flex flex-col gap-14">
          {sections.map(({ category, items }) => (
            <section key={category.id} id={`cat-${category.slug}`} aria-labelledby={`h-${category.slug}`} className="scroll-mt-44 sm:scroll-mt-48">
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <h2 id={`h-${category.slug}`} className="display-heading text-3xl sm:text-4xl">
                    {category.name}
                  </h2>
                  {category.description && <p className="mt-1 text-sm text-muted-foreground">{category.description}</p>}
                </div>
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">{items.length} items</span>
              </div>
              <ProductGrid items={items} catImage={catImage} bestsellers={bestsellers} />
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-8">
          <ProductGrid items={filtered} catImage={catImage} bestsellers={bestsellers} />
        </div>
      )}
    </div>
  );
}

function ProductGrid({ items, catImage, bestsellers }: { items: PublicProduct[]; catImage: Map<string, string | null>; bestsellers: Set<string> }) {
  return (
    <motion.div layout className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <AnimatePresence mode="popLayout">
        {items.map((p) => (
          <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.25 }}>
            <ProductCard product={p} fallbackImage={catImage.get(p.categoryId)} bestseller={bestsellers.has(p.id)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
