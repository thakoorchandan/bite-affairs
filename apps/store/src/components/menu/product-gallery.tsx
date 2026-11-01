"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play } from "lucide-react";
import type { ImageRef, VideoRef } from "@/types/catalog";
import { FoodImage } from "@/components/shared/food-image";
import { cloudinaryVideoPoster } from "@/lib/cloudinary/url";
import { cn } from "@/lib/utils";

type Slide = { type: "image"; image: ImageRef } | { type: "video"; video: VideoRef };

export function ProductGallery({ name, image, gallery, videos, fallbackImage }: { name: string; image?: ImageRef | null; gallery: ImageRef[]; videos: VideoRef[]; fallbackImage?: string | null }) {
  const slides: Slide[] = [
    ...(image ? [{ type: "image" as const, image }] : []),
    ...gallery.filter((g) => g.url !== image?.url).map((g) => ({ type: "image" as const, image: g })),
    ...videos.map((v) => ({ type: "video" as const, video: v })),
  ];
  const [index, setIndex] = useState(0);
  const current = slides[index];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square overflow-hidden rounded-[2rem] border border-border bg-card shadow-2xl sm:aspect-[5/4]">
        <AnimatePresence mode="wait">
          <motion.div key={index} initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="absolute inset-0">
            {!current ? (
              <FoodImage src={null} fallbackSrc={fallbackImage} alt={name} priority className="absolute inset-0" sizes="(max-width: 1024px) 100vw, 50vw" />
            ) : current.type === "image" ? (
              <FoodImage src={current.image.url} alt={current.image.alt || name} priority={index === 0} className="absolute inset-0" sizes="(max-width: 1024px) 100vw, 50vw" />
            ) : (
              <video
                src={current.video.url}
                poster={current.video.posterUrl ?? (current.video.url.includes("res.cloudinary.com") ? cloudinaryVideoPoster(current.video.url) : undefined)}
                controls
                playsInline
                preload="metadata"
                className="absolute inset-0 size-full bg-black object-cover"
                aria-label={`${name} video`}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      {slides.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar" role="tablist" aria-label="Product media">
          {slides.map((s, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === index}
              aria-label={s.type === "video" ? `Video ${i + 1}` : `Image ${i + 1}`}
              onClick={() => setIndex(i)}
              className={cn("relative size-16 shrink-0 overflow-hidden rounded-xl border-2 transition sm:size-20", i === index ? "border-gold" : "border-transparent opacity-60 hover:opacity-100")}
            >
              {s.type === "image" ? (
                <FoodImage src={s.image.url} alt="" className="absolute inset-0" sizes="80px" />
              ) : (
                <span className="absolute inset-0 grid place-items-center bg-muted">
                  <Play className="size-5 text-gold" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
