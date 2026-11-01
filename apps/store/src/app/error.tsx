"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="grid min-h-[60dvh] place-items-center px-4 text-center">
      <div>
        <p className="script-accent text-3xl">Oops!</p>
        <h1 className="display-heading text-4xl sm:text-5xl">Something burnt in the kitchen</h1>
        <p className="mt-3 text-muted-foreground">An unexpected error happened. Please try again.</p>
        {error.digest && <p className="mt-2 text-xs text-muted-foreground">Reference: {error.digest}</p>}
        <div className="mt-8 flex justify-center gap-3">
          <button onClick={reset} className="rounded-full bg-gold px-6 py-3 font-bold text-primary-foreground">
            Try again
          </button>
          <Link href="/" className="rounded-full border border-border px-6 py-3 font-bold">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
