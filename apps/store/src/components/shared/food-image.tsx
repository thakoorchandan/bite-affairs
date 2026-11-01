import Image from "next/image";
import { UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Optimised food image. Cloudinary and local images go through next/image (responsive
 * sizes, lazy loading, AVIF/WebP). Shows an on-brand placeholder when no image exists.
 */
export function FoodImage({
  src,
  alt,
  className,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  priority = false,
  fallbackSrc,
  imgClassName,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  fallbackSrc?: string | null;
  imgClassName?: string;
}) {
  const url = src || fallbackSrc;
  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      {url ? (
        <Image src={url} alt={alt} fill sizes={sizes} priority={priority} className={cn("object-cover", !src && fallbackSrc && "opacity-80 saturate-[.85]", imgClassName)} />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_30%_20%,oklch(0.83_0.17_85/0.18),transparent_60%)]">
          <UtensilsCrossed className="size-8 text-gold/60" aria-hidden />
        </div>
      )}
    </div>
  );
}
