import type { ReactNode } from "react";
import Image from "next/image";

export function AuthShell({ title, kicker, children }: { title: string; kicker: string; children: ReactNode }) {
  return (
    <div className="container-page grid min-h-[calc(100svh-5rem)] items-center gap-10 py-10 lg:grid-cols-2">
      <div className="relative hidden h-[34rem] overflow-hidden rounded-[2.5rem] border border-border lg:block">
        <Image src="/images/menu/momos.webp" alt="Steamed momos" fill sizes="50vw" className="object-cover" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-10">
          <p className="script-accent text-3xl">Good Food. Good Mood.</p>
          <p className="display-heading mt-2 text-5xl">Real Chinese. Real Flavours.</p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-md">
        <p className="script-accent text-2xl">{kicker}</p>
        <h1 className="display-heading mb-8 text-5xl">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function safeCallbackUrl(value: string | null | undefined, fallback = "/account"): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/admin") ? value : fallback;
}
