"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { ExternalLink } from "lucide-react";
import { ADMIN_NAV } from "./nav";
import { useAdminLive } from "./admin-live-provider";
import { Logo } from "@/components/shared/logo";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

export function AdminNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { counts } = useAdminLive();
  // Live counts only exist in the browser; render badges after hydration to keep server/client HTML identical.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const badgeValue = (b?: "new" | "ready") => (!hydrated ? 0 : b === "new" ? counts.PLACED ?? 0 : b === "ready" ? counts.READY ?? 0 : 0);

  return (
    <nav aria-label="Admin" className="flex flex-col gap-6">
      {ADMIN_NAV.map((section) => (
        <div key={section.section}>
          <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{section.section}</p>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const count = badgeValue(item.badge);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-gold text-primary-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{item.label}</span>
                    {count > 0 && (
                      <span className={cn("min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold tabular-nums", active ? "bg-ink text-gold" : "bg-gold text-primary-foreground")}>{count}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** `storeHref` comes from the server (runtime STORE_URL), so it is right without a rebuild. */
export function AdminSidebar({ storeHref }: { storeHref: string }) {
  return (
    <aside className="sticky top-0 hidden h-dvh print:hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
        <Logo href="/dashboard" className="text-lg" />
        <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-gold uppercase">Admin</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-5 no-scrollbar">
        <AdminNavLinks />
      </div>
      <div className="border-t border-sidebar-border p-3">
        <a href={storeHref} target="_blank" rel="noopener" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
          <ExternalLink className="size-4" /> View storefront
        </a>
      </div>
    </aside>
  );
}
