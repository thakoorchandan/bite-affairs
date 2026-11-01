import { LinkButton } from "@/components/customer/link-button";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowRight, ChefHat, Clock, Heart, Leaf, MapPin, Phone, Star, Truck } from "lucide-react";
import { getHomeContent, getActiveTestimonials, getApprovedReviews } from "@/features/content/queries";
import { getBestsellerIds, getPublicMenu } from "@/features/catalog/queries";
import { getPublicHours, getPublicSettings } from "@/features/business-settings/queries";
import { HomeHero } from "@/components/customer/home-hero";
import { Marquee } from "@/components/customer/marquee";
import { CategoryRail } from "@/components/customer/category-rail";
import { AnimatedCounter } from "@/components/customer/animated-counter";
import { HoursList } from "@/components/customer/hours-list";
import { HeaderKitchenStatus } from "@/components/layout/header-status";
import { ProductCard } from "@/components/menu/product-card";
import { effectivePrice } from "@/lib/utilities/product-price";
import { FoodImage } from "@/components/shared/food-image";
import { Reveal, Stagger, StaggerItem } from "@/components/shared/reveal";
import { Price } from "@/components/shared/price";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/utilities/money";
import type { PublicProduct } from "@/types/catalog";

const WHY_ICONS: Record<string, typeof Leaf> = { leaf: Leaf, "chef-hat": ChefHat, heart: Heart };

function SectionHeading({ kicker, title, href, linkLabel }: { kicker: string; title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        <p className="script-accent text-xl sm:text-2xl">{kicker}</p>
        <h2 className="display-heading text-4xl sm:text-6xl">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="group hidden shrink-0 items-center gap-1 text-sm font-bold text-gold sm:flex">
          {linkLabel ?? "View all"} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
        </Link>
      )}
    </div>
  );
}

async function HomeContent() {
  await connection();
  const [content, menu, bestsellerIds, testimonials, reviews, settings, hours] = await Promise.all([
    getHomeContent(),
    getPublicMenu(),
    getBestsellerIds(8),
    getActiveTestimonials(),
    getApprovedReviews({ limit: 6 }),
    getPublicSettings(),
    getPublicHours(),
  ]);
  const { categories, products } = menu;
  const catImage = new Map(categories.map((c) => [c.id, c.image?.url ?? null]));
  const byId = new Map(products.map((p) => [p.id, p]));
  const available = products.filter((p) => p.isAvailable);

  const orderBestsellers = bestsellerIds.map((id) => byId.get(id)).filter((p): p is PublicProduct => !!p && p.isAvailable);
  const flagged = available.filter((p) => p.isBestseller && !orderBestsellers.some((o) => o.id === p.id));
  let popular = [...orderBestsellers, ...flagged].slice(0, 8);
  const hasRealBestsellers = popular.length > 0;
  if (!hasRealBestsellers) popular = available.filter((p) => p.isFeatured).slice(0, 8);

  const featuredIds = (content.featuredProductIds ?? []) as string[];
  let recommended = featuredIds.map((id) => byId.get(id)).filter((p): p is PublicProduct => !!p && p.isAvailable);
  if (!recommended.length) {
    // One dish from each category gives a broad taste of the menu.
    const seen = new Set<string>();
    recommended = available.filter((p) => (seen.has(p.categoryId) ? false : (seen.add(p.categoryId), true))).slice(0, 8);
  }
  recommended = recommended.filter((p) => !popular.some((x) => x.id === p.id)).slice(0, 4);

  const featuredCats = ((content.featuredCategoryIds ?? []) as string[]).map((id) => categories.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
  const railCategories = featuredCats.length ? featuredCats : categories;

  const comboCategoryId = content.combos?.categoryId as string | undefined;
  const combos = comboCategoryId ? products.filter((p) => p.categoryId === comboCategoryId) : [];
  const heroImages: { url: string; alt?: string | null }[] = (content.hero?.images ?? []).length ? (content.hero!.images! as { url: string; alt?: string | null }[]) : categories.slice(0, 3).flatMap((c) => (c.image ? [c.image] : []));
  const minPrice = available.length ? Math.min(...available.map(effectivePrice)) : 0;
  const quotes = [
    ...testimonials.map((t) => ({ id: t.id, name: t.name, meta: t.location ?? "", quote: t.quote, rating: t.rating ?? 5 })),
    ...reviews.filter((r) => r.comment).map((r) => ({ id: r.id, name: r.customerName, meta: r.productName ?? "", quote: r.comment!, rating: r.rating })),
  ].slice(0, 6);
  const gallery = (content.gallery ?? []) as { url: string; alt?: string | null }[];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const restaurantLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: settings.businessName,
    servesCuisine: ["Chinese", "Indo-Chinese", "Fast Food", "Pizza"],
    priceRange: "₹",
    url: appUrl,
    image: `${appUrl}/images/menu/pizza.webp`,
    address: { "@type": "PostalAddress", addressLocality: settings.city, addressCountry: "IN", ...(settings.addressLine ? { streetAddress: settings.addressLine } : {}) },
    ...(settings.contactPhone ? { telephone: `+91${settings.contactPhone}` } : {}),
    hasMenu: `${appUrl}/menu`,
    acceptsReservations: false,
    openingHoursSpecification: hours.weekly
      .filter((w) => w.isOpen)
      .flatMap((w) => w.slots.map((s) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][w.day], opens: s.open, closes: s.close }))),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(restaurantLd).replace(/</g, "\\u003c") }} />
      <HomeHero
        eyebrow={content.hero?.eyebrow}
        heading={content.hero?.heading || "Real Chinese. Real Flavours. Everyday."}
        subheading={content.hero?.subheading}
        primaryCta={content.hero?.primaryCtaLabel || "Order Now"}
        secondaryCta={content.hero?.secondaryCtaLabel || "Browse Menu"}
        images={heroImages}
        statusSlot={
          <Suspense fallback={<span className="inline-block h-7 w-28 animate-pulse rounded-full bg-muted" />}>
            <HeaderKitchenStatus />
          </Suspense>
        }
      />
      <Marquee items={categories.map((c) => c.name)} />

      <section className="container-page py-20" aria-label="Menu categories">
        <SectionHeading kicker="Something for every craving" title="Explore the menu" href="/menu" linkLabel="Full menu" />
        <CategoryRail categories={railCategories} />
      </section>

      {popular.length > 0 && (
        <section className="container-page pb-20" aria-label={hasRealBestsellers ? "Bestsellers" : "Chef's picks"}>
          <SectionHeading kicker={hasRealBestsellers ? "Most loved right now" : "Hand-picked for you"} title={hasRealBestsellers ? "Bestsellers" : "Chef's picks"} href="/menu" />
          <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {popular.map((p, i) => (
              <StaggerItem key={p.id}>
                <ProductCard product={p} fallbackImage={catImage.get(p.categoryId)} bestseller={hasRealBestsellers} priority={i < 2} />
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      )}

      {combos.length > 0 && (
        <section className="relative overflow-hidden bg-ink py-20" aria-label="Special combos">
          <div aria-hidden className="absolute -top-32 -right-32 size-96 rounded-full bg-gold/15 blur-3xl" />
          <div className="container-page relative">
            <SectionHeading kicker={content.combos?.subheading || "Big flavours, bigger value"} title={content.combos?.heading || "Special Combos"} href={`/menu#cat-special-combos`} />
            <div className="grid gap-6 md:grid-cols-2">
              {combos.map((p, i) => (
                <Reveal key={p.id} delay={i * 0.1}>
                  <Link href={`/food/${p.slug}`} className="group relative block overflow-hidden rounded-[2rem] border border-gold/20">
                    <FoodImage src={p.image?.url} fallbackSrc={catImage.get(p.categoryId)} alt={p.name} className="aspect-[16/10]" imgClassName="transition-transform duration-700 group-hover:scale-105" sizes="(max-width: 768px) 100vw, 50vw" />
                    <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-6">
                      <div>
                        <h3 className="display-heading text-3xl sm:text-4xl">{p.name}</h3>
                        {p.shortDescription && <p className="mt-1 max-w-sm text-sm text-foreground/80">{p.shortDescription}</p>}
                      </div>
                      <span className="brush-label shrink-0 text-2xl sm:text-3xl">{formatINR(effectivePrice(p))}</span>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {recommended.length > 0 && (
        <section className="container-page py-20" aria-label="Recommended">
          <SectionHeading kicker="Try something new" title="Recommended" href="/menu" />
          <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {recommended.map((p) => (
              <StaggerItem key={p.id}>
                <ProductCard product={p} fallbackImage={catImage.get(p.categoryId)} />
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      )}

      <section className="container-page py-20" aria-labelledby="why-heading">
        <div className="mb-10 text-center">
          <p className="script-accent text-2xl">The Bite Affairs promise</p>
          <h2 id="why-heading" className="display-heading text-4xl sm:text-6xl">
            {content.whyChooseUs?.heading || "Why Bite Affairs?"}
          </h2>
        </div>
        <Stagger className="grid gap-5 md:grid-cols-3">
          {((content.whyChooseUs?.items ?? []) as { title?: string; body?: string; icon?: string }[]).map((item, i) => {
            const Icon = WHY_ICONS[item.icon ?? ""] ?? Star;
            return (
              <StaggerItem key={i}>
                <div className="group h-full rounded-[2rem] border border-border bg-card p-8 transition-colors hover:border-gold/40">
                  <span className="grid size-14 place-items-center rounded-2xl bg-gold text-primary-foreground transition-transform duration-500 group-hover:-rotate-6">
                    <Icon className="size-6" />
                  </span>
                  <h3 className="display-heading mt-6 text-2xl">{item.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
        <div className="mt-10 grid grid-cols-2 gap-4 rounded-[2rem] border border-border bg-card/50 p-6 sm:grid-cols-4">
          <div className="text-center">
            <AnimatedCounter value={available.length} className="display-heading text-4xl text-gold sm:text-5xl" />
            <p className="mt-1 text-xs font-semibold text-muted-foreground uppercase">Dishes on the menu</p>
          </div>
          <div className="text-center">
            <AnimatedCounter value={categories.length} className="display-heading text-4xl text-gold sm:text-5xl" />
            <p className="mt-1 text-xs font-semibold text-muted-foreground uppercase">Categories</p>
          </div>
          <div className="text-center">
            <AnimatedCounter value={Math.round(minPrice / 100)} prefix="₹" className="display-heading text-4xl text-gold sm:text-5xl" />
            <p className="mt-1 text-xs font-semibold text-muted-foreground uppercase">Meals from</p>
          </div>
          <div className="text-center">
            <AnimatedCounter value={100} suffix="%" className="display-heading text-4xl text-gold sm:text-5xl" />
            <p className="mt-1 text-xs font-semibold text-muted-foreground uppercase">Delivered by our own team</p>
          </div>
        </div>
      </section>

      {gallery.length > 0 && (
        <section className="container-page py-20" aria-label="Food gallery">
          <SectionHeading kicker="Feast your eyes" title="From our kitchen" />
          <div className="columns-2 gap-4 md:columns-3 lg:columns-4 [&>*]:mb-4">
            {gallery.map((img, i) => (
              <Reveal key={i} delay={(i % 4) * 0.05}>
                <div className="group overflow-hidden rounded-3xl border border-border">
                  <FoodImage src={img.url} alt={img.alt || "Bite Affairs dish"} className={i % 3 === 0 ? "aspect-[3/4]" : "aspect-square"} imgClassName="transition-transform duration-700 group-hover:scale-110" sizes="(max-width: 768px) 50vw, 25vw" />
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {quotes.length > 0 && (
        <section className="container-page py-20" aria-label="Customer testimonials">
          <SectionHeading kicker="Straight from our customers" title="Love notes" />
          <Stagger className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {quotes.map((q) => (
              <StaggerItem key={q.id}>
                <figure className="h-full rounded-[2rem] border border-border bg-card p-7">
                  <div className="flex gap-0.5" aria-label={`${q.rating} out of 5 stars`}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star key={i} className={i < q.rating ? "size-4 fill-gold text-gold" : "size-4 text-muted"} />
                    ))}
                  </div>
                  <blockquote className="mt-4 text-base leading-relaxed">“{q.quote}”</blockquote>
                  <figcaption className="mt-5 text-sm">
                    <span className="font-bold">{q.name}</span>
                    {q.meta && <span className="text-muted-foreground"> · {q.meta}</span>}
                  </figcaption>
                </figure>
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      )}

      <section className="container-page py-20" aria-label="Hours and delivery">
        <div className="grid gap-5 lg:grid-cols-3">
          <Reveal className="rounded-[2rem] border border-border bg-card p-7">
            <Clock className="size-7 text-gold" />
            <h3 className="display-heading mt-4 text-3xl">Kitchen hours</h3>
            <HoursList hours={hours} className="mt-4" />
          </Reveal>
          <Reveal delay={0.1} className="rounded-[2rem] border border-border bg-card p-7">
            <Truck className="size-7 text-gold" />
            <h3 className="display-heading mt-4 text-3xl">Delivery</h3>
            <ul className="mt-4 grid gap-3 text-sm text-foreground/85">
              <li>We cook and deliver every order ourselves — no third-party apps.</li>
              <li>Estimated delivery: about {settings.delivery.estimatedDeliveryMinutes} minutes after your food is ready.</li>
              {settings.delivery.minOrderAmount > 0 && (
                <li>
                  Minimum order: <Price amount={settings.delivery.minOrderAmount} size="sm" />
                </li>
              )}
              {settings.delivery.freeDeliveryThreshold > 0 && (
                <li>
                  Free delivery on orders above <Price amount={settings.delivery.freeDeliveryThreshold} size="sm" />
                </li>
              )}
              {settings.delivery.pickupEnabled && <li>Prefer to collect? Choose pickup at checkout.</li>}
              <li className="text-muted-foreground">Enter your PIN code at checkout to confirm we deliver to you.</li>
            </ul>
          </Reveal>
          <Reveal delay={0.2} className="relative overflow-hidden rounded-[2rem] bg-gold p-7 text-primary-foreground">
            <MapPin className="size-7" />
            <h3 className="display-heading mt-4 text-3xl">Hungry yet?</h3>
            <p className="mt-2 text-sm font-medium">Cloud kitchen in {settings.city}. Order online and we&apos;ll bring it hot to your door.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <LinkButton href="/menu" className="h-12 rounded-full bg-ink px-6 font-bold text-gold hover:bg-ink/90">
                Order now <ArrowRight className="size-4" />
              </LinkButton>
              {settings.contactPhone && (
                <a href={`tel:+91${settings.contactPhone}`} className={cn(buttonVariants({ variant: "outline" }), "h-12 rounded-full border-ink/30 bg-transparent px-6 font-bold text-ink hover:bg-ink/10")}>
                  <Phone className="size-4" /> Call us
                </a>
              )}
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

function HomeSkeleton() {
  return (
    <div className="container-page grid min-h-[80svh] animate-pulse items-center gap-10 py-16 lg:grid-cols-2" aria-busy="true" aria-label="Loading">
      <div className="space-y-5">
        <div className="h-6 w-32 rounded-full bg-muted" />
        <div className="h-28 w-full rounded-2xl bg-muted" />
        <div className="h-28 w-4/5 rounded-2xl bg-muted" />
        <div className="h-5 w-2/3 rounded bg-muted/70" />
        <div className="flex gap-3">
          <div className="h-14 w-40 rounded-full bg-gold/30" />
          <div className="h-14 w-40 rounded-full bg-muted" />
        </div>
      </div>
      <div className="h-[30rem] rounded-[2.5rem] bg-muted" />
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}
