"use client";

import Image from "next/image";
import { useCallback, useState, type ReactElement } from "react";
import { Film, Link2, Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listMediaAction } from "@/features/admin/media-actions";
import { MediaUploader } from "./media-uploader";
import { BUNDLED_IMAGES } from "./upload";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/services/media.service";

export interface PickedMedia {
  kind: "image" | "video";
  url: string;
  publicId?: string | null;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  durationSeconds?: number | null;
}

function toPicked(m: MediaItem): PickedMedia {
  return { kind: m.kind as "image" | "video", url: m.url, publicId: m.publicId, width: m.width ?? null, height: m.height ?? null, alt: m.alt ?? null, durationSeconds: m.durationSeconds ?? null };
}

/**
 * Dialog for choosing media: from the Cloudinary library, a fresh upload, the bundled menu
 * imagery, or a pasted https URL (useful before Cloudinary is configured).
 */
export function MediaPicker({
  trigger,
  kind = "image",
  cloudinaryEnabled,
  subfolder,
  onSelect,
  title = "Choose media",
}: {
  trigger: ReactElement;
  kind?: "image" | "video";
  cloudinaryEnabled: boolean;
  subfolder?: "products" | "categories" | "content";
  onSelect: (media: PickedMedia) => void;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [url, setUrl] = useState("");

  const load = useCallback(
    async (query: string) => {
      if (!cloudinaryEnabled) return;
      setLoading(true);
      const res = await listMediaAction({ kind, q: query || undefined });
      if (res.ok) setItems(res.data.items);
      setLoading(false);
    },
    [cloudinaryEnabled, kind],
  );

  const choose = (m: PickedMedia) => {
    onSelect(m);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void load(q);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{kind === "video" ? "Pick a video from the library or upload one." : "Pick an image from the library, upload a new one, or use a link."}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={cloudinaryEnabled ? "library" : kind === "image" ? "bundled" : "url"}>
          <TabsList className="flex-wrap">
            {cloudinaryEnabled && <TabsTrigger value="library">Library</TabsTrigger>}
            {cloudinaryEnabled && <TabsTrigger value="upload">Upload</TabsTrigger>}
            {kind === "image" && <TabsTrigger value="bundled">Menu photos</TabsTrigger>}
            <TabsTrigger value="url">Paste link</TabsTrigger>
          </TabsList>

          {cloudinaryEnabled && (
            <TabsContent value="library" className="mt-3 grid gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    void load(e.target.value);
                  }}
                  placeholder="Search by file name"
                  className="pl-8"
                />
              </div>
              {loading ? (
                <div className="grid h-40 place-items-center">
                  <Loader2 className="size-5 animate-spin text-gold" />
                </div>
              ) : items.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No {kind}s yet. Upload one from the Upload tab.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {items.map((m) => (
                    <button key={m.id} type="button" onClick={() => choose(toPicked(m))} className="group relative aspect-square overflow-hidden rounded-lg border border-border hover:ring-2 hover:ring-gold">
                      {m.kind === "video" ? (
                        <div className="grid h-full place-items-center bg-muted">
                          <Film className="size-6 text-gold" />
                          <span className="absolute inset-x-1 bottom-1 truncate text-[10px]">{m.originalFilename}</span>
                        </div>
                      ) : (
                        <Image src={m.url} alt={m.alt ?? ""} fill sizes="180px" className="object-cover transition-transform group-hover:scale-105" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>
          )}

          {cloudinaryEnabled && (
            <TabsContent value="upload" className="mt-3">
              <MediaUploader accept={kind} subfolder={subfolder} multiple={false} onUploaded={(m) => choose(toPicked(m))} />
            </TabsContent>
          )}

          {kind === "image" && (
            <TabsContent value="bundled" className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {BUNDLED_IMAGES.map((b) => (
                <button key={b.url} type="button" onClick={() => choose({ kind: "image", url: b.url, alt: b.alt })} className="group relative aspect-square overflow-hidden rounded-lg border border-border hover:ring-2 hover:ring-gold">
                  <Image src={b.url} alt={b.alt} fill sizes="180px" className="object-cover" />
                  <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-[10px] capitalize">{b.alt}</span>
                </button>
              ))}
            </TabsContent>
          )}

          <TabsContent value="url" className="mt-3 grid gap-2">
            {!cloudinaryEnabled && (
              <p className="rounded-lg border border-gold/30 bg-gold/10 p-3 text-xs text-gold">
                Cloudinary isn&apos;t configured, so uploads are off. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to enable the media library.
              </p>
            )}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={kind === "video" ? "https://res.cloudinary.com/…/video.mp4" : "https://res.cloudinary.com/…/image.jpg"} className="pl-8" />
              </div>
              <Button type="button" disabled={!/^https:\/\/\S+$/.test(url.trim())} onClick={() => choose({ kind, url: url.trim() })}>
                Use link
              </Button>
            </div>
            <p className={cn("text-xs text-muted-foreground")}>Only https links are accepted. Images from res.cloudinary.com are optimised automatically.</p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
