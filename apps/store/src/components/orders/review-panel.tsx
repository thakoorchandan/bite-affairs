"use client";

import { useState } from "react";
import { Star, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { submitReviewAction } from "@/features/account/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Item {
  orderItemId: string;
  name: string;
  review: { rating: number; comment: string; status: string } | null;
}

function Stars({ value, onChange, size = "md" }: { value: number; onChange?: (v: number) => void; size?: "sm" | "md" }) {
  return (
    <div className="flex gap-1" role={onChange ? "radiogroup" : undefined} aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          role={onChange ? "radio" : undefined}
          aria-checked={onChange ? value === n : undefined}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onClick={() => onChange?.(n)}
          className="disabled:cursor-default"
        >
          <Star className={cn(size === "sm" ? "size-4" : "size-6", n <= value ? "fill-gold text-gold" : "text-muted-foreground/40")} />
        </button>
      ))}
    </div>
  );
}

function ReviewForm({ orderId, item, onDone }: { orderId: string; item: Item; onDone: (r: Item["review"]) => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!rating) return void toast.error("Choose a star rating");
        setLoading(true);
        const res = await submitReviewAction({ orderId, orderItemId: item.orderItemId, rating, comment: comment.trim() || undefined });
        setLoading(false);
        if (!res.ok) return void toast.error(res.error);
        toast.success("Thanks! Your review will appear once approved.");
        onDone({ rating, comment, status: "PENDING" });
      }}
    >
      <Stars value={rating} onChange={setRating} />
      <Textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 1000))} rows={2} placeholder="How was it? (optional)" className="rounded-xl" />
      <Button type="submit" size="sm" disabled={loading} className="rounded-full">
        {loading && <Loader2 className="size-3.5 animate-spin" />} Submit review
      </Button>
    </form>
  );
}

export function ReviewPanel({ orderId, items: initial }: { orderId: string; items: Item[] }) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="rounded-[2rem] border border-border bg-card p-6">
      <h2 className="text-lg font-bold">Rate your food</h2>
      <p className="mb-4 text-sm text-muted-foreground">Your feedback helps us cook better. Reviews are published after a quick check.</p>
      <ul className="divide-y divide-border">
        {items.map((it) => (
          <li key={it.orderItemId} className="py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">{it.name}</span>
              {it.review ? (
                <span className="flex items-center gap-2">
                  <Stars value={it.review.rating} size="sm" />
                  <span className="text-[11px] text-muted-foreground">{it.review.status === "APPROVED" ? "Published" : it.review.status === "PENDING" ? "Awaiting approval" : "Received"}</span>
                </span>
              ) : (
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setOpen(open === it.orderItemId ? null : it.orderItemId)}>
                  {open === it.orderItemId ? "Cancel" : "Write review"}
                </Button>
              )}
            </div>
            {!it.review && open === it.orderItemId && (
              <ReviewForm
                orderId={orderId}
                item={it}
                onDone={(r) => {
                  setItems((prev) => prev.map((x) => (x.orderItemId === it.orderItemId ? { ...x, review: r } : x)));
                  setOpen(null);
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
