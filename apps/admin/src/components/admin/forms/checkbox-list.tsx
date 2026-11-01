"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

/** Searchable multi-select rendered as a checkbox list. */
export function CheckboxList({ options, value, onChange, placeholder = "Search…", emptyLabel = "Nothing to choose" }: { options: { id: string; label: string; hint?: string }[]; value: string[]; onChange: (v: string[]) => void; placeholder?: string; emptyLabel?: string }) {
  const [q, setQ] = useState("");
  const filtered = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="grid gap-2 rounded-xl border border-border p-2">
      {options.length > 8 && <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="h-8" />}
      <div className="max-h-48 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">{emptyLabel}</p>
        ) : (
          filtered.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
              <Checkbox checked={value.includes(o.id)} onCheckedChange={(v) => onChange(v ? [...value, o.id] : value.filter((x) => x !== o.id))} />
              <span className="flex-1 truncate">{o.label}</span>
              {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
            </label>
          ))
        )}
      </div>
      {value.length > 0 && <p className="px-2 text-xs text-muted-foreground">{value.length} selected</p>}
    </div>
  );
}
