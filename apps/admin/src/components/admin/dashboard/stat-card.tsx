import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function StatCard({ label, value, hint, icon: Icon, tone = "default", href }: { label: string; value: string | number; hint?: string; icon?: LucideIcon; tone?: "default" | "gold" | "success" | "warning" | "danger"; href?: string }) {
  const toneClass = {
    default: "text-foreground",
    gold: "text-gold",
    success: "text-emerald-300",
    warning: "text-orange-300",
    danger: "text-red-300",
  }[tone];
  const body = (
    <div className={cn("group relative h-full overflow-hidden rounded-2xl border border-border bg-card p-4 transition-colors", href && "hover:border-gold/40")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        {Icon && <Icon className={cn("size-4 opacity-80", toneClass)} aria-hidden />}
      </div>
      <p className={cn("mt-2 text-2xl font-bold tabular-nums sm:text-3xl", toneClass)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {tone === "gold" && <div className="pointer-events-none absolute -top-10 -right-10 size-28 rounded-full bg-gold/10 blur-2xl" aria-hidden />}
    </div>
  );
  return href ? <Link href={href} className="block h-full rounded-2xl">{body}</Link> : body;
}

export function SectionCard({ title, description, action, children, className }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card", className)}>
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}
