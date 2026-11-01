"use client";
import { LinkButton } from "@/components/customer/link-button";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSession, signOut } from "next-auth/react";
import { Menu, ShoppingBag, User, X, LogOut, Heart, Package } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCartCount } from "@/features/cart/cart-store";
import { useCartDrawer } from "./cart-drawer-context";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/menu", label: "Menu" },
  { href: "/track-order", label: "Track Order" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader({ statusSlot }: { statusSlot?: ReactNode }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const count = useCartCount();
  const { setOpen } = useCartDrawer();
  const { data: session, status } = useSession();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    // Close the mobile menu after navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to route change
    setMobileOpen(false);
  }, [pathname]);

  return (
    <header className={cn("sticky top-0 z-50 transition-all duration-300", scrolled ? "border-b border-border bg-background/80 backdrop-blur-xl" : "bg-transparent")}>
      <div className="container-page flex h-16 items-center gap-4 sm:h-20">
        <Logo className="text-xl sm:text-2xl" />
        <div className="hidden md:block">{statusSlot}</div>
        <nav aria-label="Main" className="ml-auto hidden items-center gap-1 lg:flex">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} className={cn("relative rounded-full px-4 py-2 text-sm font-semibold transition-colors", active ? "text-gold" : "text-foreground/80 hover:text-foreground")}>
                {item.label}
                {active && <motion.span layoutId="nav-pill" className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-gold" />}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 lg:ml-2">
          {status === "authenticated" ? (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" aria-label="Account menu" className="rounded-full" />}>
                <User className="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="truncate">Hi, {session?.user?.name?.split(" ")[0]}</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/account" />}>
                  <User className="size-4" /> My account
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/account/orders" />}>
                  <Package className="size-4" /> Orders
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/account/favourites" />}>
                  <Heart className="size-4" /> Favourites
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })}>
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <LinkButton variant="ghost" size="sm" className="hidden rounded-full sm:inline-flex" href="/login">
              Sign in
            </LinkButton>
          )}
          <Button onClick={() => setOpen(true)} className="relative h-10 rounded-full px-4 font-bold" aria-label={`Open cart, ${count} item${count === 1 ? "" : "s"}`}>
            <ShoppingBag className="size-4" />
            <span className="hidden sm:inline">Cart</span>
            <AnimatePresence mode="popLayout">
              {count > 0 && (
                <motion.span
                  key={count}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 22 }}
                  className="grid min-w-5 place-items-center rounded-full bg-ink px-1 text-[11px] font-bold text-gold tabular-nums"
                >
                  {count}
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
          <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen} onClick={() => setMobileOpen((v) => !v)}>
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>
      <AnimatePresence>
        {mobileOpen && (
          <motion.nav
            aria-label="Mobile"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-border bg-background/95 backdrop-blur-xl lg:hidden"
          >
            <div className="container-page flex flex-col gap-1 py-4">
              <div className="mb-2 md:hidden">{statusSlot}</div>
              {NAV.map((item, i) => (
                <motion.div key={item.href} initial={{ x: -12, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.04 * i }}>
                  <Link href={item.href} className="display-heading block py-2 text-3xl text-foreground hover:text-gold">
                    {item.label}
                  </Link>
                </motion.div>
              ))}
              {status !== "authenticated" && (
                <Link href="/login" className="display-heading block py-2 text-3xl text-gold">
                  Sign in
                </Link>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
