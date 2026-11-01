"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { MotionConfig } from "framer-motion";
import { CartDrawerProvider } from "./cart-drawer-context";
import { FavouritesProvider } from "@/components/customer/favourites-provider";
import { CartSync } from "@/components/customer/cart-sync";

export function StoreProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <MotionConfig reducedMotion="user">
        <FavouritesProvider>
          <CartDrawerProvider>
            <CartSync />
            {children}
          </CartDrawerProvider>
        </FavouritesProvider>
      </MotionConfig>
    </SessionProvider>
  );
}
