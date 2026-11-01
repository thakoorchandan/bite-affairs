"use client";

import Image from "next/image";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaPicker } from "./media-picker";
import type { ImageRefInput } from "@/lib/validations/admin";
import { cn } from "@/lib/utils";

/** Single image slot with preview, change and remove. */
export function ImageField({
  value,
  onChange,
  cloudinaryEnabled,
  subfolder = "products",
  aspect = "aspect-[4/3]",
  label = "Image",
}: {
  value: ImageRefInput | null | undefined;
  onChange: (v: ImageRefInput | null) => void;
  cloudinaryEnabled: boolean;
  subfolder?: "products" | "categories" | "content";
  aspect?: string;
  label?: string;
}) {
  const unoptimized = !!value?.url && !value.url.startsWith("/") && !value.url.includes("res.cloudinary.com");
  return (
    <div className="grid gap-2">
      <div className={cn("relative w-full max-w-xs overflow-hidden rounded-xl border border-border bg-muted", aspect)}>
        {value?.url ? (
          <Image src={value.url} alt={value.alt ?? label} fill sizes="320px" className="object-cover" unoptimized={unoptimized} />
        ) : (
          <div className="grid h-full place-items-center text-xs text-muted-foreground">No {label.toLowerCase()}</div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <MediaPicker
          cloudinaryEnabled={cloudinaryEnabled}
          subfolder={subfolder}
          onSelect={(m) => onChange({ url: m.url, publicId: m.publicId ?? null, width: m.width ?? null, height: m.height ?? null, alt: m.alt ?? value?.alt ?? null })}
          trigger={
            <Button type="button" variant="outline" size="sm">
              <ImagePlus className="size-3.5" /> {value?.url ? "Change" : "Choose"}
            </Button>
          }
        />
        {value?.url && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            <Trash2 className="size-3.5" /> Remove
          </Button>
        )}
      </div>
    </div>
  );
}
