import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Server-rendered pagination that preserves the current query string. */
export function Pagination({ page, pages, total, basePath, params }: { page: number; pages: number; total: number; basePath: string; params: Record<string, string | undefined> }) {
  if (pages <= 1) return <p className="pt-3 text-xs text-muted-foreground">{total} result{total === 1 ? "" : "s"}</p>;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  const linkClass = (disabled: boolean) => cn("inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs font-medium", disabled ? "pointer-events-none opacity-40" : "hover:bg-muted");
  return (
    <nav className="flex items-center justify-between gap-3 pt-4" aria-label="Pagination">
      <p className="text-xs text-muted-foreground">
        Page {page} of {pages} · {total} results
      </p>
      <div className="flex gap-2">
        <Link href={href(page - 1)} className={linkClass(page <= 1)} aria-disabled={page <= 1}>
          <ChevronLeft className="size-3.5" /> Prev
        </Link>
        <Link href={href(page + 1)} className={linkClass(page >= pages)} aria-disabled={page >= pages}>
          Next <ChevronRight className="size-3.5" />
        </Link>
      </div>
    </nav>
  );
}

export const nativeSelectClass =
  "h-8 rounded-lg border border-input bg-input/30 px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&>option]:bg-popover";
