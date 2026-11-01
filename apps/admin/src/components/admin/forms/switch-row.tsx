"use client";

import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";

/** Switch with label/description, laid out as a tappable row. */
export function SwitchRow({ label, description, checked, onCheckedChange, disabled, id }: { label: ReactNode; description?: ReactNode; checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; id?: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border bg-background/40 px-3 py-2.5 has-disabled:cursor-not-allowed has-disabled:opacity-60">
      <span className="grid gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </span>
      <Switch id={id} checked={checked} onCheckedChange={(v) => onCheckedChange(!!v)} disabled={disabled} className="mt-0.5" />
    </label>
  );
}
