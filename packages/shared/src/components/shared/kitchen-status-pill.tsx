import type { KitchenStatus } from "@/services/kitchen-status";
import { formatInZone } from "@/lib/utilities/time";
import { cn } from "@/lib/utils";

export function KitchenStatusPill({ status, className }: { status: KitchenStatus; className?: string }) {
  const open = status.state === "OPEN";
  const label = open ? "Open now" : status.state === "PREORDER" ? "Pre-orders open" : status.state === "PAUSED" ? "Paused" : status.state === "UNAVAILABLE" ? "Unavailable" : "Closed";
  const next = !open && status.nextOpenAt ? ` · Opens ${formatInZone(status.nextOpenAt, status.timezone, { weekday: "short", hour: "numeric", minute: "2-digit" })}` : "";
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold", open ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/25 bg-red-500/10 text-red-300", className)}>
      <span className={cn("relative size-2 rounded-full", open ? "bg-emerald-400" : "bg-red-400")}>
        {open && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70 motion-reduce:hidden" />}
      </span>
      {label}
      {next}
    </span>
  );
}
