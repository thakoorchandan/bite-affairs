"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Copy, Film, ImageIcon, Link2, Loader2, MoreHorizontal, RefreshCw, Trash2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { NativeSelect } from "@/components/admin/forms/native-select";
import { Field } from "@/components/admin/forms/field";
import { useAdminAction } from "@/components/admin/forms/use-admin-action";
import { MediaUploader } from "./media-uploader";
import { formatBytes } from "./upload";
import { assignMediaToProductAction, deleteMediaAction, mediaReferencesAction, replaceMediaAction, updateMediaAltAction } from "@/features/admin/media-actions";
import type { MediaItem } from "@/services/media.service";

const FREE_TIER_BYTES = 25 * 1024 * 1024 * 1024; // Cloudinary free plan: ~25 credits ≈ 25 GB storage/bandwidth combined

export function MediaLibrary({
  items,
  total,
  page,
  pageSize,
  usage,
  products,
  kind,
}: {
  items: MediaItem[];
  total: number;
  page: number;
  pageSize: number;
  usage: Record<string, { bytes: number; count: number }>;
  products: { id: string; name: string }[];
  kind: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [deleting, setDeleting] = useState<MediaItem | null>(null);
  const [assigning, setAssigning] = useState<MediaItem | null>(null);
  const [altEditing, setAltEditing] = useState<MediaItem | null>(null);
  const [replacing, setReplacing] = useState<MediaItem | null>(null);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    router.replace(`${pathname}?${next.toString()}`);
  };
  const totalBytes = (usage.image?.bytes ?? 0) + (usage.video?.bytes ?? 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <MediaUploader onUploaded={() => router.refresh()} />
        <div className="grid content-start gap-2 rounded-2xl border border-border bg-card p-4 text-sm">
          <p className="font-semibold">Library usage</p>
          <p className="text-muted-foreground">
            {usage.image?.count ?? 0} images · {usage.video?.count ?? 0} videos
          </p>
          <p className="text-muted-foreground">{formatBytes(totalBytes)} stored</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-gold" style={{ width: `${Math.min(100, (totalBytes / FREE_TIER_BYTES) * 100)}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">Approximate share of Cloudinary&apos;s free plan (storage + bandwidth share one credit pool — check your Cloudinary dashboard).</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-40">
          <NativeSelect value={kind} onChange={(e) => setParam("kind", e.target.value)} aria-label="Filter media type">
            <option value="">All media</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
          </NativeSelect>
        </div>
        <span className="text-sm text-muted-foreground">{total} files</span>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={ImageIcon} title="No media yet" description="Upload food photos and short videos. They're optimised automatically for every screen size." />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((m) => (
            <li key={m.id} className="group overflow-hidden rounded-xl border border-border bg-card">
              <div className="relative aspect-square bg-muted">
                {m.kind === "video" ? (
                  <video src={m.url} className="h-full w-full object-cover" muted playsInline preload="metadata" controls />
                ) : (
                  <Image src={m.url} alt={m.alt ?? m.originalFilename ?? ""} fill sizes="(max-width: 640px) 50vw, 20vw" className="object-cover" />
                )}
                <span className="absolute top-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] uppercase">{m.kind === "video" ? <Film className="inline size-3" /> : m.format}</span>
              </div>
              <div className="flex items-center gap-1 p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{m.originalFilename ?? m.publicId.split("/").pop()}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {m.width && m.height ? `${m.width}×${m.height} · ` : ""}
                    {formatBytes(m.bytes)}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Media actions" />}>
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => navigator.clipboard.writeText(m.url).then(() => toast.success("URL copied"))}>
                      <Copy /> Copy URL
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setAssigning(m)}>
                      <UtensilsCrossed /> Assign to product
                    </DropdownMenuItem>
                    {m.kind === "image" && (
                      <DropdownMenuItem onClick={() => setAltEditing(m)}>
                        <Link2 /> Edit alt text
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setReplacing(m)}>
                      <RefreshCw /> Replace everywhere
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleting(m)}>
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParam("page", String(page - 1))}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setParam("page", String(page + 1))}>
            Next
          </Button>
        </div>
      )}

      {deleting && <DeleteMediaDialog media={deleting} onClose={() => setDeleting(null)} />}
      {assigning && <AssignDialog media={assigning} products={products} onClose={() => setAssigning(null)} />}
      {altEditing && <AltDialog media={altEditing} onClose={() => setAltEditing(null)} />}
      {replacing && <ReplaceDialog media={replacing} onClose={() => setReplacing(null)} />}
    </div>
  );
}

function ReplaceDialog({ media, onClose }: { media: MediaItem; onClose: () => void }) {
  const { run } = useAdminAction();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Replace this {media.kind}</DialogTitle>
          <DialogDescription>Upload the new file. Every product, category and page using the old file switches to the new one, and the old file is deleted.</DialogDescription>
        </DialogHeader>
        <MediaUploader
          accept={media.kind as "image" | "video"}
          multiple={false}
          compact
          onUploaded={async (n) => {
            if (n.id === media.id) return;
            const res = await run(() => replaceMediaAction(media.id, n.id), { success: "Replaced everywhere" });
            if (res.ok) onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function DeleteMediaDialog({ media, onClose }: { media: MediaItem; onClose: () => void }) {
  const { run, pending } = useAdminAction();
  const [refs, setRefs] = useState<{ products: { name: string }[]; categories: { name: string }[]; websiteContent: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    void mediaReferencesAction(media.url).then((r) => alive && r.ok && setRefs(r.data));
    return () => {
      alive = false;
    };
  }, [media.url]);
  const used = refs && (refs.products.length || refs.categories.length || refs.websiteContent);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this {media.kind}?</DialogTitle>
          <DialogDescription>It will be removed from Cloudinary permanently.</DialogDescription>
        </DialogHeader>
        {!refs ? (
          <Loader2 className="size-4 animate-spin text-gold" />
        ) : used ? (
          <div className="rounded-lg border border-gold/30 bg-gold/10 p-3 text-xs">
            <p className="font-semibold text-gold">Currently used by:</p>
            <ul className="mt-1 list-disc pl-4">
              {refs.products.map((p) => (
                <li key={`p-${p.name}`}>Product: {p.name}</li>
              ))}
              {refs.categories.map((c) => (
                <li key={`c-${c.name}`}>Category: {c.name}</li>
              ))}
              {refs.websiteContent && <li>Website content</li>}
            </ul>
            <p className="mt-1">These references will be removed.</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not used anywhere.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              const res = await run(() => deleteMediaAction(media.id), { success: "Media deleted" });
              if (res.ok) onClose();
            }}
          >
            {pending && <Loader2 className="size-3.5 animate-spin" />} Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({ media, products, onClose }: { media: MediaItem; products: { id: string; name: string }[]; onClose: () => void }) {
  const { run, pending } = useAdminAction();
  const [productId, setProductId] = useState("");
  const [slot, setSlot] = useState<"primary" | "gallery" | "video">(media.kind === "video" ? "video" : "primary");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign to product</DialogTitle>
        </DialogHeader>
        <Field label="Product" htmlFor="as-product">
          <NativeSelect id="as-product" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Choose a product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {media.kind === "image" && (
          <Field label="Use as" htmlFor="as-slot">
            <NativeSelect id="as-slot" value={slot} onChange={(e) => setSlot(e.target.value as "primary" | "gallery")}>
              <option value="primary">Main image</option>
              <option value="gallery">Gallery image</option>
            </NativeSelect>
          </Field>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!productId || pending}
            onClick={async () => {
              const res = await run(() => assignMediaToProductAction(media.id, productId, slot), { success: "Assigned — live on the menu" });
              if (res.ok) onClose();
            }}
          >
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AltDialog({ media, onClose }: { media: MediaItem; onClose: () => void }) {
  const { run, pending } = useAdminAction();
  const [alt, setAlt] = useState(media.alt ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alt text</DialogTitle>
          <DialogDescription>Describe the photo for screen readers and search engines, e.g. “Cheesy paneer pizza slice”.</DialogDescription>
        </DialogHeader>
        <Input value={alt} maxLength={160} onChange={(e) => setAlt(e.target.value)} />
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={async () => {
              const res = await run(() => updateMediaAltAction(media.id, alt), { success: "Saved" });
              if (res.ok) onClose();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

