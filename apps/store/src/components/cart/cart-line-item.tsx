"use client";

import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { cart, type CartLine } from "@/features/cart/cart-store";
import { FoodImage } from "@/components/shared/food-image";
import { VegIndicator } from "@/components/shared/veg-indicator";
import { formatINR } from "@/lib/utilities/money";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function QuantityStepper({ value, onChange, size = "md", label }: { value: number; onChange: (v: number) => void; size?: "sm" | "md"; label: string }) {
  return (
    <div className={cn("inline-flex items-center rounded-full border border-gold/40 bg-gold/10", size === "sm" ? "h-8" : "h-10")} role="group" aria-label={`Quantity for ${label}`}>
      <Button variant="ghost" size={size === "sm" ? "icon-sm" : "icon"} className="rounded-full text-gold hover:bg-gold/20" aria-label="Decrease quantity" onClick={() => onChange(value - 1)}>
        <Minus className="size-3.5" />
      </Button>
      <motion.span key={value} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="min-w-6 text-center text-sm font-bold tabular-nums" aria-live="polite">
        {value}
      </motion.span>
      <Button variant="ghost" size={size === "sm" ? "icon-sm" : "icon"} className="rounded-full text-gold hover:bg-gold/20" aria-label="Increase quantity" disabled={value >= 50} onClick={() => onChange(value + 1)}>
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}

export function CartLineItem({ line, issue, onNavigate }: { line: CartLine; issue?: string; onNavigate?: () => void }) {
  return (
    <motion.li layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} className={cn("flex gap-3 rounded-2xl border border-border bg-card/60 p-3", issue && "border-destructive/40")}>
      <Link href={`/food/${line.snapshot.slug}`} onClick={onNavigate} className="shrink-0">
        <FoodImage src={line.snapshot.imageUrl} alt={line.snapshot.name} className="size-20 rounded-xl" sizes="80px" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-2">
          <VegIndicator isVeg={line.snapshot.isVeg} className="mt-0.5" />
          <Link href={`/food/${line.snapshot.slug}`} onClick={onNavigate} className="line-clamp-2 text-sm leading-snug font-semibold hover:text-gold">
            {line.snapshot.name}
          </Link>
          <Button variant="ghost" size="icon-sm" className="-mt-1 ml-auto shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Remove ${line.snapshot.name}`} onClick={() => cart.remove(line.key)}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
        {line.snapshot.selectionLabels.length > 0 && <p className="text-xs text-muted-foreground">{line.snapshot.selectionLabels.join(", ")}</p>}
        {line.notes && <p className="text-xs text-muted-foreground italic">“{line.notes}”</p>}
        {issue && <p className="text-xs font-medium text-destructive">{issue}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <QuantityStepper size="sm" value={line.quantity} onChange={(v) => cart.setQuantity(line.key, v)} label={line.snapshot.name} />
          <span className="text-sm font-bold tabular-nums">{formatINR(line.snapshot.unitPrice * line.quantity)}</span>
        </div>
      </div>
    </motion.li>
  );
}
