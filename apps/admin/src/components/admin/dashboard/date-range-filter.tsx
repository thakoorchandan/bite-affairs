"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PRESETS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["month", "This month"],
  ["custom", "Custom"],
] as const;

/** Preset + custom date range control that writes `range`, `from`, `to` into the URL. */
export function DateRangeFilter({ preset, from, to, className }: { preset: string; from: string; to: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [custom, setCustom] = useState({ from, to });
  const [showCustom, setShowCustom] = useState(preset === "custom");

  const go = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`, { scroll: false }));
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1" role="group" aria-label="Date range">
        {PRESETS.map(([key, label]) => {
          const active = key === "custom" ? showCustom : !showCustom && preset === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => (key === "custom" ? setShowCustom(true) : (setShowCustom(false), go({ range: key, from: null, to: null })))}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors", active ? "bg-gold text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
              aria-pressed={active}
            >
              {label}
            </button>
          );
        })}
        {pending && <Loader2 className="mx-1 size-3.5 animate-spin text-muted-foreground" aria-label="Loading" />}
      </div>
      {showCustom && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.from && custom.to) go({ range: "custom", from: custom.from, to: custom.to });
          }}
        >
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
          <Input type="date" aria-label="From date" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="h-8 w-40" required />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" aria-label="To date" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="h-8 w-40" required />
          <Button type="submit" size="sm">Apply</Button>
        </form>
      )}
    </div>
  );
}
