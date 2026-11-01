"use client";

import { useRef, useState } from "react";
import { CheckCircle2, CloudUpload, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MEDIA_RULES, uploadToCloudinary, validateMediaFile } from "./upload";
import type { MediaItem } from "@/services/media.service";

interface UploadJob {
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

/** Drag-and-drop / click uploader with per-file progress. */
export function MediaUploader({
  accept = "both",
  subfolder,
  onUploaded,
  multiple = true,
  compact = false,
}: {
  accept?: "image" | "video" | "both";
  subfolder?: "products" | "categories" | "content";
  onUploaded?: (media: MediaItem) => void;
  multiple?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [dragging, setDragging] = useState(false);

  const acceptAttr = [...(accept !== "video" ? MEDIA_RULES.image.types : []), ...(accept !== "image" ? MEDIA_RULES.video.types : [])].join(",");

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).slice(0, multiple ? 10 : 1);
    for (const file of list) {
      const check = validateMediaFile(file);
      if ("error" in check || (accept !== "both" && check.kind !== accept)) {
        toast.error("error" in check ? check.error : `${file.name}: please choose ${accept === "image" ? "an image" : "a video"}`);
        continue;
      }
      const id = `${file.name}-${Date.now()}-${Math.random()}`;
      setJobs((j): UploadJob[] => [{ id, name: file.name, progress: 0, status: "uploading" as const }, ...j].slice(0, 8));
      try {
        const res = await uploadToCloudinary(file, { subfolder, onProgress: (p) => setJobs((j) => j.map((x) => (x.id === id ? { ...x, progress: p } : x))) });
        setJobs((j) => j.map((x) => (x.id === id ? { ...x, progress: 100, status: "done" } : x)));
        if (res.duplicate) toast.info(`${file.name} is already in the library — reused the existing file.`);
        onUploaded?.(res.media);
      } catch (e) {
        setJobs((j) => j.map((x) => (x.id === id ? { ...x, status: "error", error: (e as Error).message } : x)));
        toast.error((e as Error).message);
      }
    }
  }

  return (
    <div className="grid gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-background/40 text-center transition-colors hover:border-gold/60 hover:bg-gold/5",
          compact ? "px-4 py-5" : "px-6 py-10",
          dragging && "border-gold bg-gold/10",
        )}
      >
        <CloudUpload className="size-7 text-gold" aria-hidden />
        <span className="text-sm font-medium">Drop files here or click to upload</span>
        <span className="text-xs text-muted-foreground">
          {accept !== "video" && MEDIA_RULES.image.label}
          {accept === "both" && " · "}
          {accept !== "image" && MEDIA_RULES.video.label}
        </span>
      </button>
      <input ref={inputRef} type="file" className="sr-only" accept={acceptAttr} multiple={multiple} onChange={(e) => e.target.files && handleFiles(e.target.files).finally(() => (e.target.value = ""))} />
      {jobs.length > 0 && (
        <ul className="grid gap-2" aria-live="polite">
          {jobs.map((j) => (
            <li key={j.id} className="rounded-lg border border-border px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                {j.status === "uploading" ? <Loader2 className="size-3.5 animate-spin text-gold" /> : j.status === "done" ? <CheckCircle2 className="size-3.5 text-emerald-400" /> : <XCircle className="size-3.5 text-destructive" />}
                <span className="flex-1 truncate">{j.name}</span>
                <span className="tabular-nums text-muted-foreground">{j.status === "error" ? "Failed" : `${j.progress}%`}</span>
              </div>
              {j.status === "uploading" && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-gold transition-[width]" style={{ width: `${j.progress}%` }} />
                </div>
              )}
              {j.error && <p className="mt-1 text-destructive">{j.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
