import type { Metadata } from "next";
import { Suspense, ViewTransition } from "react";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { AdminLiveProvider } from "@/components/admin/admin-live-provider";
import { storeUrl } from "@/lib/store-url";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Bite Affairs Admin" }, robots: { index: false, follow: false } };

/**
 * Admin shell. Authorisation is enforced per page (requireAdminPage) and per action
 * (requireAdmin / adminAction) — the proxy redirect is only an optimistic shortcut.
 */
export default function AdminPanelLayout({ children }: LayoutProps<"/">) {
  return (
    <AdminLiveProvider>
      <div className="flex min-h-dvh bg-background">
        {/* Sidebar/topbar read the current URL, so they stream inside Suspense. */}
        <Suspense fallback={<div className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block" />}>
          <AdminSidebar storeHref={storeUrl("/")} />
        </Suspense>
        <div className="flex min-w-0 flex-1 flex-col">
          <Suspense fallback={<div className="sticky top-0 z-40 h-16 border-b border-border bg-background/85" />}>
            <AdminTopbar />
          </Suspense>
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <ViewTransition default="page">{children}</ViewTransition>
          </main>
        </div>
      </div>
    </AdminLiveProvider>
  );
}
