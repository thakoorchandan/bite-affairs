"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Pencil, Plus, Star, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { VegIndicator } from "@/components/shared/veg-indicator";
import { Price } from "@/components/shared/price";
import { paiseToInput, useAdminAction } from "@/components/admin/forms/use-admin-action";
import { patchProductAction } from "@/features/admin/catalog-actions";
import { cn } from "@/lib/utils";
import type { AdminProductRow } from "@/services/admin-catalog.service";

interface Cat {
  id: string;
  name: string;
  isActive?: boolean | null;
}

/** Whole menu at a glance with one-tap stock, bestseller and featured toggles and inline price edits. */
export function MenuOverview({ categories, products }: { categories: Cat[]; products: AdminProductRow[] }) {
  const soldOut = products.filter((p) => p.isAvailable === false).length;
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Categories" value={categories.length} />
        <Stat label="Products" value={products.length} />
        <Stat label="Sold out" value={soldOut} warn={soldOut > 0} />
        <Stat label="Hidden" value={products.filter((p) => !p.isActive).length} />
      </div>
      {categories.map((c) => {
        const items = products.filter((p) => p.categoryId === c.id);
        return (
          <section key={c.id} className="rounded-2xl border border-border bg-card">
            <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{c.name}</h2>
                <span className="text-xs text-muted-foreground">{items.length}</span>
                {c.isActive === false && <Badge variant="secondary">Hidden</Badge>}
              </div>
              <Button variant="ghost" size="sm" render={<Link href={`/products/new?category=${c.id}`} />}>
                <Plus className="size-3.5" /> Add
              </Button>
            </header>
            {items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No products in this category.</p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((p) => (
                  <MenuRow key={p.id} product={p} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-bold tabular-nums", warn && "text-gold")}>{value}</p>
    </div>
  );
}

function MenuRow({ product: p }: { product: AdminProductRow }) {
  const { run, pending } = useAdminAction();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(paiseToInput(p.price));
  const [discounted, setDiscounted] = useState(paiseToInput(p.discountedPrice));

  async function savePrice() {
    const res = await run(() => patchProductAction(p.id, { price, discountedPrice: discounted.trim() === "" ? null : discounted }), { success: `${p.name} price updated` });
    if (res.ok) setEditing(false);
  }

  const toggle = (key: "isBestseller" | "isFeatured", label: string) => (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-pressed={!!p[key]}
            aria-label={`${label}: ${p[key] ? "on" : "off"}`}
            onClick={() => run(() => patchProductAction(p.id, { [key]: !p[key] }), { success: `${label} ${p[key] ? "removed" : "added"}` })}
            className={p[key] ? "text-gold" : "text-muted-foreground"}
          />
        }
      >
        {key === "isBestseller" ? <Star className={p[key] ? "fill-current" : ""} /> : <Sparkles />}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <li className={cn("flex flex-wrap items-center gap-3 px-4 py-2.5", !p.isActive && "opacity-60")}>
      <VegIndicator isVeg={p.isVeg} />
      <Link href={`/products/${p.id}`} className="min-w-0 flex-1 basis-40 truncate text-sm font-medium hover:text-gold">
        {p.name}
      </Link>
      {editing ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void savePrice();
          }}
        >
          <Input aria-label="Price (₹)" value={price} onChange={(e) => setPrice(e.target.value)} className="h-8 w-20" inputMode="decimal" autoFocus />
          <Input aria-label="Discounted price (₹)" placeholder="Offer" value={discounted} onChange={(e) => setDiscounted(e.target.value)} className="h-8 w-20" inputMode="decimal" />
          <Button size="icon-sm" type="submit" disabled={pending} aria-label="Save price">
            <Check />
          </Button>
          <Button size="icon-sm" variant="ghost" type="button" onClick={() => setEditing(false)} aria-label="Cancel">
            <X />
          </Button>
        </form>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="group flex items-center gap-1.5 rounded-md px-1 hover:bg-muted" aria-label={`Edit price of ${p.name}`}>
          <Price amount={p.discountedPrice ?? p.price} compareAt={p.discountedPrice ? p.price : null} size="sm" />
          <Pencil className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
        </button>
      )}
      <div className="flex items-center">
        {toggle("isBestseller", "Bestseller")}
        {toggle("isFeatured", "Featured")}
      </div>
      <label className="flex w-24 items-center justify-end gap-2 text-xs">
        <span className={p.isAvailable === false ? "text-destructive" : "text-muted-foreground"}>{p.isAvailable === false ? "Sold out" : "In stock"}</span>
        <Switch checked={p.isAvailable !== false} onCheckedChange={(v) => run(() => patchProductAction(p.id, { isAvailable: !!v }), { success: v ? `${p.name} back in stock` : `${p.name} sold out` })} aria-label={`${p.name} in stock`} />
      </label>
    </li>
  );
}
