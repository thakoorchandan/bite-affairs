"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";

/** Animated confirmation mark with a burst of golden particles. */
export function SuccessBurst() {
  const reduce = useReducedMotion();
  const particles = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2;
    return { x: Math.cos(angle) * 90, y: Math.sin(angle) * 90, d: 0.25 + (i % 4) * 0.05 };
  });
  return (
    <div className="relative mx-auto grid size-32 place-items-center">
      {!reduce &&
        particles.map((p, i) => (
          <motion.span
            key={i}
            className="absolute size-2 rounded-full bg-gold"
            initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
            animate={{ x: p.x, y: p.y, opacity: [0, 1, 0], scale: [0, 1.2, 0.6] }}
            transition={{ delay: p.d, duration: 0.9, ease: "easeOut" }}
          />
        ))}
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16 }} className="grid size-24 place-items-center rounded-full bg-gold shadow-[0_0_60px_oklch(0.83_0.17_85/0.5)]">
        <motion.svg viewBox="0 0 24 24" className="size-12 text-primary-foreground" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <motion.path d="M5 12l5 5L20 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.3, duration: 0.5 }} />
        </motion.svg>
        <Check className="sr-only" />
      </motion.div>
    </div>
  );
}
