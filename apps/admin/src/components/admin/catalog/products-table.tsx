"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Copy, ListOrdered, Pencil, Plus, Search, Star, Trash2, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { VegIndicator } from "@/components/shared/veg-indicator";
import { Price } from "@/components/shared/price";
import { NativeSelect } from "@/components/admin/forms/native-select";
import { ConfirmDialog } from "@/components/admin/forms/confirm-dialog";
import { useAdminAction } from "@/components/admin/forms/use-admin-action";
import { SortableList } from "./sortable-list";
import { deleteProductAction, duplicateProductAction, patchProductAction, reorderProductsAction } from "@/features/admin/catalog-actions";
import type { AdminProductRow } from "@/services/admin-catalog.service";

interface Cat {
  id: string;
  name: string;
}

export function ProductsTable({ products, categories, filters }: { products: AdminProductRow[]; categories: Cat[]; filters: { q: string; category: string; availability: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { run } = useAdminAction();
  const [q, setQ] = useState(filters.q);
  const [reorder, setReorder] = useState(false);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  }

  const canReorder = !!filters.category && !filters.q && (!filters.availability || filters.availability === "all");
  const rows = useMemo(() => products, [products]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setParam("q", q.trim());
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q !== filters.q && setParam("q", q.trim())} placeholder="Search products or tags" className="h-9 pl-8" aria-label="Search products" />
        </form>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <NativeSelect value={filters.category} onChange={(e) => setParam("category", e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={filters.availability} onChange={(e) => setParam("availability", e.target.value)} aria-label="Filter by availability">
            <option value="">All statuses</option>
            <option value="available">Available</option>
            <option value="soldout">Sold out</option>
            <option value="hidden">Hidden</option>
          </NativeSelect>
        </div>
        {canReorder && (
          <Button variant={reorder ? "default" : "outline"} onClick={() => setReorder((r) => !r)}>
            <ListOrdered className="size-4" /> {reorder ? "Done" : "Reorder"}
          </Button>
        )}
        <Button render={<Link href="/products/new" />}>
          <Plus className="size-4" /> New product
        </Button>
      </div>
      {!canReorder && <p className="text-xs text-muted-foreground">Tip: filter by a single category to drag-and-drop products into display order.</p>}

      {rows.length === 0 ? (
        <EmptyState icon={UtensilsCrossed} title="No products found" description={filters.q || filters.category || filters.availability ? "Try clearing the filters." : "Add your first dish to the menu."} />
      ) : reorder && canReorder ? (
        <SortableList
          items={rows}
          getId={(p) => p.id}
          onReorder={(ids) => run(() => reorderProductsAction(ids), { success: "Order saved" })}
          renderItem={(p) => (
            <div className="flex items-center gap-3">
              <Thumb p={p} />
              <span className="truncate font-medium">{p.name}</span>
            </div>
          )}
        />
      ) : (
        <ul className="grid gap-2">
          {rows.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-2.5">
              <Thumb p={p} />
              <div className="min-w-0 flex-1 basis-48">
                <div className="flex items-center gap-2">
                  <VegIndicator isVeg={p.isVeg} />
                  <Link href={`/products/${p.id}`} className="truncate font-medium hover:text-gold">
                    {p.name}
                  </Link>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{p.categoryName}</span>
                  {p.isBestseller && <Badge variant="outline" className="h-4 text-[10px]"><Star className="size-2.5" />Bestseller</Badge>}
                  {p.isFeatured && <Badge variant="outline" className="h-4 text-[10px]">Featured</Badge>}
                  {!p.isActive && <Badge variant="secondary" className="h-4 text-[10px]">Hidden</Badge>}
                </div>
              </div>
              <Price amount={p.discountedPrice ?? p.price} compareAt={p.discountedPrice ? p.price : null} size="sm" />
              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={p.isAvailable !== false}
                  onCheckedChange={(v) => run(() => patchProductAction(p.id, { isAvailable: !!v }), { success: v ? `${p.name} is available` : `${p.name} marked sold out` })}
                  aria-label={`${p.name} available`}
                />
                <span className={p.isAvailable === false ? "text-destructive" : "text-muted-foreground"}>{p.isAvailable === false ? "Sold out" : "In stock"}</span>
              </label>
              <div className="flex">
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`} render={<Link href={`/products/${p.id}`} />}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Duplicate ${p.name}`}
                  onClick={async () => {
                    const res = await run(() => duplicateProductAction(p.id), { success: "Duplicated (hidden until you publish it)" });
                    if (res.ok && res.data) router.push(`/products/${res.data.id}`);
                  }}
                >
                  <Copy />
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${p.name}`}>
                      <Trash2 className="text-destructive" />
                    </Button>
                  }
                  title={`Delete ${p.name}?`}
                  description="It will disappear from the menu, carts and favourites. Past orders keep their own copy of the item. To hide it temporarily, mark it sold out instead."
                  onConfirm={async () => (await run(() => deleteProductAction(p.id), { success: "Product deleted" })).ok}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thumb({ p }: { p: AdminProductRow }) {
  return <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">{p.image?.url && <Image src={p.image.url} alt="" fill sizes="48px" className="object-cover" />}</div>;
}
