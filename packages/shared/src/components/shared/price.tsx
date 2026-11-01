import { formatINR } from "@/lib/utilities/money";
import { cn } from "@/lib/utils";

export function Price({ amount, compareAt, className, size = "md" }: { amount: number; compareAt?: number | null; className?: string; size?: "sm" | "md" | "lg" }) {
  const showCompare = compareAt != null && compareAt > amount;
  return (
    <span className={cn("inline-flex items-baseline gap-2 tabular-nums", className)}>
      <span className={cn("font-bold text-foreground", size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-base")}>{formatINR(amount)}</span>
      {showCompare && <span className="text-xs text-muted-foreground line-through">{formatINR(compareAt!)}</span>}
      {showCompare && <span className="rounded-full bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-gold">{Math.round(((compareAt! - amount) / compareAt!) * 100)}% OFF</span>}
    </span>
  );
}
