import { LinkButton } from "@/components/customer/link-button";
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { ChefHat, Heart, Leaf, Truck } from "lucide-react";
import { getHomeContent } from "@/features/content/queries";
import { FoodImage } from "@/components/shared/food-image";
import { Reveal } from "@/components/shared/reveal";

export const metadata: Metadata = { title: "About us", description: "Bite Affairs is an independent cloud kitchen in Kolkata cooking Indo-Chinese favourites and comfort food, delivered by our own team." };

const ICONS: Record<string, typeof Leaf> = { leaf: Leaf, "chef-hat": ChefHat, heart: Heart };

async function About() {
  await connection();
  const content = await getHomeContent();
  const about = content.about;
  const items = (content.whyChooseUs?.items ?? []) as { title?: string; body?: string; icon?: string }[];
  return (
    <>
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <Reveal>
          <p className="script-accent text-2xl">Our story</p>
          <h1 className="display-heading text-5xl sm:text-7xl">{about?.heading || "About Bite Affairs"}</h1>
          <p className="mt-6 text-lg leading-relaxed whitespace-pre-line text-foreground/80">{about?.body}</p>
          <LinkButton className="mt-8 h-12 rounded-full px-8 font-bold" href="/menu">
            See the menu
          </LinkButton>
        </Reveal>
        <Reveal delay={0.1}>
          <FoodImage src={about?.image?.url ?? "/images/menu/combo-noodles.webp"} alt={about?.image?.alt ?? "Food from the Bite Affairs kitchen"} className="aspect-[4/3] rounded-[2.5rem] border border-border" priority sizes="(max-width: 1024px) 100vw, 50vw" />
        </Reveal>
      </div>
      <div className="mt-20 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {[...items, { title: "Delivered by us", body: "No marketplace middlemen — our own team brings your food to you.", icon: "truck" }].map((it, i) => {
          const Icon = it.icon === "truck" ? Truck : (ICONS[it.icon ?? ""] ?? Leaf);
          return (
            <Reveal key={i} delay={i * 0.05} className="rounded-[2rem] border border-border bg-card p-6">
              <Icon className="size-7 text-gold" />
              <h2 className="display-heading mt-4 text-2xl">{it.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{it.body}</p>
            </Reveal>
          );
        })}
      </div>
    </>
  );
}

export default function AboutPage() {
  return (
    <div className="container-page py-10">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[2rem] bg-muted" />}>
        <About />
      </Suspense>
    </div>
  );
}
