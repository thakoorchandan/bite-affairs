import Link from "next/link";
import { cn } from "@/lib/utils";

/** Wordmark echoing the menu poster: brush-script "Bite" in gold + "Affairs" in white. */
export function Logo({ className, href = "/", compact = false }: { className?: string; href?: string | null; compact?: boolean }) {
  const mark = (
    <span className={cn("inline-flex items-baseline gap-1 leading-none select-none", className)} aria-label="Bite Affairs">
      <span className="font-script text-[1.65em] text-gold drop-shadow-[0_2px_10px_oklch(0.83_0.17_85/0.35)]">Bite</span>
      {!compact && <span className="font-script text-[1.65em] text-foreground">Affairs</span>}
    </span>
  );
  return href ? (
    <Link href={href} className="rounded-md focus-visible:outline-2" aria-label="Bite Affairs home">
      {mark}
    </Link>
  ) : (
    mark
  );
}
