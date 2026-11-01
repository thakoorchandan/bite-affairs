"use client";
import { LinkButton } from "@/components/customer/link-button";

import Image from "next/image";
import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, UtensilsCrossed } from "lucide-react";

interface HeroProps {
  eyebrow?: string | null;
  heading: string;
  subheading?: string | null;
  primaryCta: string;
  secondaryCta: string;
  images: { url: string; alt?: string | null }[];
  statusSlot?: ReactNode;
}

const ease = [0.22, 1, 0.36, 1] as const;

export function HomeHero({ eyebrow, heading, subheading, primaryCta, secondaryCta, images, statusSlot }: HeroProps) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const yBack = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 120]);
  const yFront = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -60]);
  const words = heading.split(" ");
  const [main, second, third] = [images[0], images[1], images[2]];

  return (
    <section ref={ref} className="relative isolate overflow-hidden grain">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_70%_20%,oklch(0.83_0.17_85/0.22),transparent_55%),radial-gradient(ellipse_at_10%_90%,oklch(0.65_0.2_40/0.18),transparent_50%)]" />
      <div className="container-page grid min-h-[calc(100svh-5rem)] items-center gap-10 py-10 lg:grid-cols-[1.1fr_1fr] lg:py-16">
        <div className="relative z-10">
          {statusSlot && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }} className="mb-5">
              {statusSlot}
            </motion.div>
          )}
          {eyebrow && (
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5, ease }} className="mb-3 text-xs font-bold tracking-[0.3em] text-gold uppercase">
              {eyebrow}
            </motion.p>
          )}
          <h1 className="display-heading text-[clamp(3.2rem,11vw,8.5rem)]">
            {words.map((w, i) => (
              <span key={i} className="inline-block overflow-hidden pr-[0.18em] align-bottom">
                <motion.span
                  className={`inline-block ${i % 3 === 1 ? "gold-text" : ""}`}
                  initial={{ y: "110%" }}
                  animate={{ y: 0 }}
                  transition={{ delay: 0.15 + i * 0.07, duration: 0.8, ease }}
                >
                  {w}
                </motion.span>
              </span>
            ))}
          </h1>
          {subheading && (
            <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.6, ease }} className="mt-6 max-w-lg text-base text-foreground/75 sm:text-lg">
              {subheading}
            </motion.p>
          )}
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75, duration: 0.6, ease }} className="mt-8 flex flex-wrap gap-3">
            <LinkButton size="lg" className="group h-14 rounded-full px-8 text-base font-extrabold shadow-[0_10px_40px_-10px_oklch(0.83_0.17_85/0.7)]" href="/menu">
              {primaryCta}
              <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
            </LinkButton>
            <LinkButton size="lg" variant="outline" className="h-14 rounded-full border-foreground/20 px-8 text-base font-bold" href="/menu#cat-special-combos">
              <UtensilsCrossed className="size-4" /> {secondaryCta}
            </LinkButton>
          </motion.div>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1, duration: 0.8 }} className="script-accent mt-10 text-2xl sm:text-3xl">
            Good Food. Good Mood.
          </motion.p>
        </div>

        <div className="relative h-[24rem] sm:h-[32rem] lg:h-[38rem]">
          {main && (
            <motion.div style={{ y: yBack }} initial={{ opacity: 0, scale: 0.9, rotate: -4 }} animate={{ opacity: 1, scale: 1, rotate: -3 }} transition={{ duration: 1, ease }} className="absolute inset-x-6 top-0 bottom-16 overflow-hidden rounded-[2.5rem] border border-gold/20 shadow-2xl sm:inset-x-10">
              <Image src={main.url} alt={main.alt ?? "Bite Affairs food"} fill priority sizes="(max-width: 1024px) 90vw, 45vw" className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
            </motion.div>
          )}
          {second && (
            <motion.div style={{ y: yFront }} initial={{ opacity: 0, x: -30, rotate: -8 }} animate={{ opacity: 1, x: 0, rotate: -6 }} transition={{ delay: 0.35, duration: 0.9, ease }} className="absolute bottom-0 left-0 h-40 w-40 overflow-hidden rounded-3xl border-4 border-background shadow-2xl sm:h-52 sm:w-52">
              <Image src={second.url} alt={second.alt ?? ""} fill sizes="220px" className="object-cover" />
            </motion.div>
          )}
          {third && (
            <motion.div style={{ y: yFront }} initial={{ opacity: 0, x: 30, rotate: 10 }} animate={{ opacity: 1, x: 0, rotate: 6 }} transition={{ delay: 0.5, duration: 0.9, ease }} className="absolute right-0 bottom-8 h-36 w-36 overflow-hidden rounded-full border-4 border-gold shadow-2xl sm:h-48 sm:w-48">
              <Image src={third.url} alt={third.alt ?? ""} fill sizes="200px" className="object-cover" />
            </motion.div>
          )}
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.9, type: "spring", stiffness: 200, damping: 14 }}
            className="absolute top-6 right-2 grid size-24 place-items-center rounded-full bg-gold text-center text-primary-foreground shadow-xl sm:size-28"
          >
            <span className="display-heading text-sm leading-tight sm:text-base">
              Real
              <br />
              Chinese
            </span>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
