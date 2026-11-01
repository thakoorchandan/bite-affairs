import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ChevronRight, Clock, Flame, Star } from "lucide-react";
import { getPublicMenu, getPublicProduct } from "@/features/catalog/queries";
import { getApprovedReviews } from "@/features/content/queries";
import { ProductGallery } from "@/components/menu/product-gallery";
import { ProductCustomiser } from "@/components/menu/product-customiser";
import { FavouriteButton } from "@/components/menu/favourite-button";
import { ProductCard } from "@/components/menu/product-card";
import { MenuClosedBanner } from "@/components/menu/menu-closed-banner";
import { VegIndicator } from "@/components/shared/veg-indicator";
import { Price } from "@/components/shared/price";
import { Reveal } from "@/components/shared/reveal";
import { formatInZone } from "@/lib/utilities/time";

export async function generateMetadata({ params }: PageProps<"/food/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  await connection();
  const p = await getPublicProduct(slug);
  if (!p) return { title: "Dish not found" };
  const description = p.seo?.description || p.shortDescription || `${p.name} from Bite Affairs, Kolkata.`;
  return {
    title: p.seo?.title || p.name,
    description,
    alternates: { canonical: `/food/${p.slug}` },
    openGraph: { title: p.name, description, images: p.image?.url ? [p.image.url] : undefined },
  };
}

async function ProductContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await connection();
  const [product, menu] = await Promise.all([getPublicProduct(slug), getPublicMenu()]);
  if (!product) notFound();
  const reviews = await getApprovedReviews({ productId: product.id, limit: 6 });
  const category = menu.categories.find((c) => c.id === product.categoryId);
  const fallbackImage = category?.image?.url ?? null;
  const related = menu.products.filter((p) => p.categoryId === product.categoryId && p.id !== product.id && p.isAvailable).slice(0, 4);
  const price = product.discountedPrice ?? product.price;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || product.shortDescription || undefined,
    image: product.image?.url ? [product.image.url.startsWith("http") ? product.image.url : `${appUrl}${product.image.url}`] : undefined,
    category: product.categoryName,
    brand: { "@type": "Brand", name: "Bite Affairs" },
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: (price / 100).toFixed(2),
      availability: product.isAvailable ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `${appUrl}/food/${product.slug}`,
    },
    ...(product.ratingCount > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: product.ratingAverage.toFixed(1), reviewCount: product.ratingCount } } : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
        <Link href="/menu" className="hover:text-gold">
          Menu
        </Link>
        <ChevronRight className="size-3" />
        <Link href={`/menu/${product.categorySlug}`} className="hover:text-gold">
          {product.categoryName}
        </Link>
        <ChevronRight className="size-3" />
        <span className="truncate text-foreground">{product.name}</span>
      </nav>
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
        <Reveal>
          <ProductGallery name={product.name} image={product.image} gallery={product.gallery} videos={product.videos} fallbackImage={fallbackImage} />
        </Reveal>
        <div className="flex flex-col gap-6">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <VegIndicator isVeg={product.isVeg} />
              <span className="text-xs font-semibold text-muted-foreground">{product.isVeg ? "Vegetarian" : "Non-vegetarian"}</span>
              {product.isBestseller && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[10px] font-extrabold text-primary-foreground uppercase">
                  <Flame className="size-3" /> Bestseller
                </span>
              )}
              {!product.isAvailable && <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-bold text-destructive">Sold out</span>}
            </div>
            <div className="flex items-start justify-between gap-4">
              <h1 className="display-heading text-4xl sm:text-6xl">{product.name}</h1>
              <FavouriteButton productId={product.id} name={product.name} className="mt-1 size-11 shrink-0 border border-border" />
            </div>
            {product.shortDescription && <p className="mt-3 text-base text-foreground/80">{product.shortDescription}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <Price amount={price} compareAt={product.discountedPrice ? product.price : null} size="lg" />
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="size-4 text-gold" /> ~{product.preparationMinutes} min prep
              </span>
              {product.servingInfo && <span className="rounded-full border border-border px-2.5 py-0.5 text-xs">{product.servingInfo}</span>}
              {product.spiceLevel > 0 && <span className="text-sm" aria-label={`Spice level ${product.spiceLevel} of 3`}>{"🌶".repeat(product.spiceLevel)}</span>}
              {product.ratingCount > 0 && (
                <span className="inline-flex items-center gap-1 text-sm">
                  <Star className="size-4 fill-gold text-gold" /> {product.ratingAverage.toFixed(1)} <span className="text-muted-foreground">({product.ratingCount})</span>
                </span>
              )}
            </div>
          </div>
          {product.description && <p className="leading-relaxed whitespace-pre-line text-muted-foreground">{product.description}</p>}
          <ProductCustomiser product={product} fallbackImage={fallbackImage} />
        </div>
      </div>

      {reviews.length > 0 && (
        <section className="mt-20" aria-labelledby="reviews-heading">
          <h2 id="reviews-heading" className="display-heading mb-6 text-3xl">
            What customers say
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r) => (
              <figure key={r.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex gap-0.5" aria-label={`${r.rating} out of 5 stars`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} className={i < r.rating ? "size-4 fill-gold text-gold" : "size-4 text-muted"} />
                  ))}
                </div>
                {r.comment && <blockquote className="mt-3 text-sm">“{r.comment}”</blockquote>}
                <figcaption className="mt-3 text-xs text-muted-foreground">
                  {r.customerName} · {formatInZone(r.createdAt, undefined, { dateStyle: "medium" })}
                </figcaption>
                {r.adminReply && <p className="mt-3 rounded-lg bg-muted p-2 text-xs"><span className="font-bold text-gold">Bite Affairs:</span> {r.adminReply}</p>}
              </figure>
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-20" aria-labelledby="related-heading">
          <h2 id="related-heading" className="display-heading mb-6 text-3xl">
            More {product.categoryName}
          </h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} fallbackImage={fallbackImage} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function ProductSkeleton() {
  return (
    <div className="grid animate-pulse gap-10 lg:grid-cols-2" aria-busy="true" aria-label="Loading dish">
      <div className="aspect-square rounded-[2rem] bg-muted sm:aspect-[5/4]" />
      <div className="space-y-4">
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="h-14 w-3/4 rounded-lg bg-muted" />
        <div className="h-4 w-full rounded bg-muted/70" />
        <div className="h-8 w-40 rounded bg-muted" />
        <div className="h-40 rounded-2xl bg-muted/60" />
        <div className="h-12 rounded-full bg-muted" />
      </div>
    </div>
  );
}

export default function FoodPage({ params }: PageProps<"/food/[slug]">) {
  return (
    <div className="container-page pt-6 pb-10">
      <Suspense fallback={null}>
        <MenuClosedBanner />
      </Suspense>
      <Suspense fallback={<ProductSkeleton />}>
        <ProductContent params={params} />
      </Suspense>
    </div>
  );
}
