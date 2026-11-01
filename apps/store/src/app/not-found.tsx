import Link from "next/link";
import { Logo } from "@/components/shared/logo";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <Logo className="text-3xl" />
        <p className="display-heading mt-8 text-[clamp(6rem,25vw,14rem)] leading-none text-gold">404</p>
        <h1 className="display-heading text-3xl sm:text-4xl">This plate is empty</h1>
        <p className="mt-3 text-muted-foreground">The page you&apos;re looking for has been eaten — or never existed.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/" className="rounded-full bg-gold px-6 py-3 font-bold text-primary-foreground">
            Go home
          </Link>
          <Link href="/menu" className="rounded-full border border-border px-6 py-3 font-bold">
            See the menu
          </Link>
        </div>
      </div>
    </div>
  );
}
