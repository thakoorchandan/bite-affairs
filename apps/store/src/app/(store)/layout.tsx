import { Suspense, ViewTransition } from "react";
import { StoreProviders } from "@/components/layout/store-providers";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter, SiteFooterSkeleton } from "@/components/layout/site-footer";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { HeaderKitchenStatus } from "@/components/layout/header-status";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { Logo } from "@/components/shared/logo";

/** Static stand-in while the header (which reads the current URL) streams in. */
function HeaderFallback() {
  return (
    <div className="sticky top-0 z-50">
      <div className="container-page flex h-16 items-center sm:h-20">
        <Logo className="text-xl sm:text-2xl" />
      </div>
    </div>
  );
}

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreProviders>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-gold focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>
      <Suspense fallback={null}>
        <AnnouncementBar />
      </Suspense>
      <Suspense fallback={<HeaderFallback />}>
        <SiteHeader
          statusSlot={
            <Suspense fallback={<span className="inline-block h-6 w-24 animate-pulse rounded-full bg-muted" />}>
              <HeaderKitchenStatus />
            </Suspense>
          }
        />
      </Suspense>
      <main id="main" className="flex-1">
        {/* Route changes crossfade the page body; header and footer stay put (see globals.css). */}
        <ViewTransition default="page">{children}</ViewTransition>
      </main>
      <Suspense fallback={<SiteFooterSkeleton />}>
        <SiteFooter />
      </Suspense>
      <CartDrawer />
    </StoreProviders>
  );
}
