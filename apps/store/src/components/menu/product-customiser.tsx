"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, Check } from "lucide-react";
import { toast } from "sonner";
import type { PublicProductDetail } from "@/types/catalog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { QuantityStepper } from "@/components/cart/cart-line-item";
import { VegIndicator } from "@/components/shared/veg-indicator";
import { cart } from "@/features/cart/cart-store";
import { useCartDrawer } from "@/components/layout/cart-drawer-context";
import { formatINR } from "@/lib/utilities/money";
import { effectivePrice } from "./product-card";
import { cn } from "@/lib/utils";

function initialSelections(product: PublicProductDetail): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const g of product.customisationGroups) {
    const defaults = g.options.filter((o) => o.isDefault && o.isAvailable).map((o) => o.id);
    if (g.selectionType === "SINGLE") {
      const first = defaults[0] ?? (g.isRequired ? g.options.find((o) => o.isAvailable)?.id : undefined);
      out[g.id] = first ? [first] : [];
    } else out[g.id] = defaults;
  }
  return out;
}

/** Customisation, quantity and notes with a live price. The server re-validates and re-prices everything. */
export function ProductCustomiser({ product, fallbackImage }: { product: PublicProductDetail; fallbackImage?: string | null }) {
  const [selections, setSelections] = useState<Record<string, string[]>>(() => initialSelections(product));
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [added, setAdded] = useState(false);
  const { setOpen } = useCartDrawer();
  const base = effectivePrice(product);

  const { unit, errors, labels } = useMemo(() => {
    let delta = 0;
    const errs: Record<string, string> = {};
    const lbls: string[] = [];
    for (const g of product.customisationGroups) {
      const chosen = selections[g.id] ?? [];
      const min = g.isRequired ? Math.max(1, g.minSelect) : g.minSelect;
      const max = g.selectionType === "SINGLE" ? 1 : g.maxSelect > 0 ? g.maxSelect : Infinity;
      if (chosen.length < min) errs[g.id] = min === 1 ? "Please choose one" : `Choose at least ${min}`;
      if (chosen.length > max) errs[g.id] = `Choose up to ${max}`;
      for (const id of chosen) {
        const o = g.options.find((x) => x.id === id);
        if (o) {
          delta += o.priceDelta;
          lbls.push(o.name);
        }
      }
    }
    return { unit: base + delta, errors: errs, labels: lbls };
  }, [selections, product.customisationGroups, base]);

  const toggle = (groupId: string, optionId: string, single: boolean, max: number) => {
    setSelections((prev) => {
      const current = prev[groupId] ?? [];
      if (single) return { ...prev, [groupId]: [optionId] };
      if (current.includes(optionId)) return { ...prev, [groupId]: current.filter((x) => x !== optionId) };
      if (max > 0 && current.length >= max) {
        toast.message(`You can choose up to ${max}`);
        return prev;
      }
      return { ...prev, [groupId]: [...current, optionId] };
    });
  };

  const [showErrors, setShowErrors] = useState(false);
  const canAdd = product.isAvailable && Object.keys(errors).length === 0;

  const add = () => {
    if (!product.isAvailable) return;
    if (Object.keys(errors).length) {
      setShowErrors(true);
      toast.error("Please complete the required choices");
      return;
    }
    cart.add({
      productId: product.id,
      quantity,
      selections: Object.entries(selections)
        .filter(([, ids]) => ids.length)
        .map(([groupId, optionIds]) => ({ groupId, optionIds })),
      notes: notes.trim() || undefined,
      snapshot: { name: product.name, slug: product.slug, imageUrl: product.image?.url ?? fallbackImage ?? null, isVeg: product.isVeg, unitPrice: unit, selectionLabels: labels },
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
    toast.success(`${quantity} × ${product.name} added to cart`, { action: { label: "View cart", onClick: () => setOpen(true) } });
  };

  return (
    <div className="flex flex-col gap-6">
      {product.customisationGroups.map((g) => {
        const single = g.selectionType === "SINGLE";
        const chosen = selections[g.id] ?? [];
        return (
          <fieldset key={g.id} className="rounded-2xl border border-border bg-card/60 p-4">
            <legend className="sr-only">{g.name}</legend>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-bold">{g.name}</h3>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", g.isRequired ? "bg-gold/15 text-gold" : "bg-muted text-muted-foreground")}>
                {g.isRequired ? "Required" : single ? "Optional" : g.maxSelect > 0 ? `Up to ${g.maxSelect}` : "Optional"}
              </span>
            </div>
            <div className="grid gap-2" role={single ? "radiogroup" : "group"} aria-label={g.name}>
              {g.options.map((o) => {
                const selected = chosen.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    role={single ? "radio" : "checkbox"}
                    aria-checked={selected}
                    disabled={!o.isAvailable}
                    onClick={() => toggle(g.id, o.id, single, g.maxSelect)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm transition",
                      selected ? "border-gold bg-gold/10" : "border-border hover:border-gold/40",
                      !o.isAvailable && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span className={cn("grid size-5 shrink-0 place-items-center border-2 transition", single ? "rounded-full" : "rounded-md", selected ? "border-gold bg-gold text-primary-foreground" : "border-muted-foreground/40")}>
                      {selected && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <VegIndicator isVeg={o.isVeg} className="size-3.5" />
                    <span className="flex-1 font-medium">{o.name}</span>
                    <span className="text-xs font-semibold text-muted-foreground tabular-nums">{!o.isAvailable ? "Unavailable" : o.priceDelta ? `+${formatINR(o.priceDelta)}` : "Free"}</span>
                  </button>
                );
              })}
            </div>
            {showErrors && errors[g.id] && <p className="mt-2 text-xs font-semibold text-destructive">{errors[g.id]}</p>}
          </fieldset>
        );
      })}

      <div className="grid gap-2">
        <Label htmlFor="notes">Special instructions (optional)</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 200))} placeholder="E.g. less spicy, no onion" rows={2} className="rounded-xl" />
        <span className="text-right text-[11px] text-muted-foreground">{notes.length}/200</span>
      </div>

      <div className="sticky bottom-3 z-20 flex items-center gap-3 rounded-2xl border border-border bg-background/90 p-3 shadow-2xl backdrop-blur-xl lg:static lg:border-none lg:bg-transparent lg:p-0 lg:shadow-none">
        {product.isAvailable && <QuantityStepper value={quantity} onChange={(v) => setQuantity(Math.max(1, Math.min(50, v)))} label={product.name} />}
        <Button onClick={add} disabled={!product.isAvailable} aria-disabled={!canAdd} className="h-12 flex-1 rounded-full text-base font-extrabold">
          <AnimatePresence mode="wait" initial={false}>
            {added ? (
              <motion.span key="ok" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} className="flex items-center gap-2">
                <Check className="size-5" /> Added!
              </motion.span>
            ) : (
              <motion.span key="add" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} className="flex items-center gap-2">
                <ShoppingBag className="size-4" />
                {product.isAvailable ? `Add · ${formatINR(unit * quantity)}` : "Sold out"}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </div>
    </div>
  );
}
