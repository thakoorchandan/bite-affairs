import { ProductCardSkeleton } from "./product-card";

export function MenuSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading menu">
      <div className="h-11 animate-pulse rounded-full bg-muted" />
      <div className="mt-3 flex gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
