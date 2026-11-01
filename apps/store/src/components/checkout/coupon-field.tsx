"use client";

import { useState } from "react";
import { Tag, X, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { CartQuote } from "@/features/cart/actions";

export function CouponField({ code, onApply, quote, loading }: { code?: string; onApply: (code?: string) => void; quote: CartQuote | null; loading?: boolean }) {
  const [value, setValue] = useState(code ?? "");
  const status = quote?.coupon;
  return (
    <div>
      {code ? (
        <div className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${status?.applied ? "border-emerald-500/40 bg-emerald-500/10" : "border-destructive/40 bg-destructive/10"}`}>
          {status?.applied ? <Check className="size-4 text-emerald-400" /> : <Tag className="size-4 text-destructive" />}
          <div className="flex-1">
            <p className="font-bold">{code}</p>
            <p className="text-xs text-muted-foreground">{loading && !status ? "Checking…" : status?.applied ? status.message || "Coupon applied" : status?.message || "Checking…"}</p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Remove coupon" onClick={() => { onApply(undefined); setValue(""); }}>
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) onApply(value.trim().toUpperCase());
          }}
        >
          <div className="relative flex-1">
            <Tag className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={value} onChange={(e) => setValue(e.target.value.toUpperCase())} placeholder="Coupon code" aria-label="Coupon code" maxLength={24} className="h-11 rounded-xl pl-9 uppercase" />
          </div>
          <Button type="submit" variant="outline" className="h-11 rounded-xl px-5 font-bold" disabled={!value.trim()}>
            Apply
          </Button>
        </form>
      )}
    </div>
  );
}
