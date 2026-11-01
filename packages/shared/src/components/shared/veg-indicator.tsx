import { cn } from "@/lib/utils";

/** FSSAI-style veg / non-veg mark: square outline with a dot (veg) or triangle (non-veg). */
export function VegIndicator({ isVeg, className }: { isVeg: boolean; className?: string }) {
  return (
    <span
      role="img"
      aria-label={isVeg ? "Vegetarian" : "Non-vegetarian"}
      title={isVeg ? "Vegetarian" : "Non-vegetarian"}
      className={cn("inline-grid size-4 shrink-0 place-items-center rounded-[3px] border-[1.5px] bg-background/80", isVeg ? "border-veg" : "border-nonveg", className)}
    >
      {isVeg ? <span className="size-2 rounded-full bg-veg" /> : <span className="size-0 border-x-[4px] border-b-[7px] border-x-transparent border-b-nonveg" />}
    </span>
  );
}
