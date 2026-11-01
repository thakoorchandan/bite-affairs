import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Logo } from "@/components/shared/logo";
import { AdminLoginForm } from "./login-form";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };

/** Skips the login screen only when the database confirms a valid, active admin. */
async function RedirectIfSignedIn() {
  const user = await getCurrentUser();
  if (user?.role === "ADMIN") redirect("/dashboard");
  return null;
}

export default function AdminLoginPage() {
  return (
    <main className="grain relative grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:block">
        <Image src="/images/menu/combo-noodles.webp" alt="" fill priority sizes="50vw" className="object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/30 via-background/40 to-background" />
        <div className="absolute bottom-12 left-12 max-w-md">
          <p className="script-accent text-3xl">Good Food. Good Mood.</p>
          <p className="display-heading mt-2 text-5xl">Run the kitchen.</p>
          <p className="mt-3 text-sm text-muted-foreground">Orders, deliveries, menu and money: all in one place.</p>
        </div>
      </div>
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <Logo href="/" className="text-3xl" />
          <h1 className="mt-6 text-2xl font-bold">Admin sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Authorised Bite Affairs staff only.</p>
          <Suspense fallback={null}>
            <RedirectIfSignedIn />
          </Suspense>
          <Suspense fallback={<div className="mt-8 h-56 animate-pulse rounded-xl bg-muted" />}>
            <AdminLoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
