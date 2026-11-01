import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountNav } from "@/components/customer/account-nav";

export const metadata: Metadata = { title: { default: "My account", template: "%s · My account · Bite Affairs" }, robots: { index: false } };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-page pt-8 pb-10">
      <h1 className="display-heading mb-6 text-5xl sm:text-6xl">
        My <span className="gold-text">Account</span>
      </h1>
      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-28 lg:h-fit">
          <Suspense fallback={<div className="h-12 animate-pulse rounded-xl bg-muted lg:h-64" />}>
            <AccountNav />
          </Suspense>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
