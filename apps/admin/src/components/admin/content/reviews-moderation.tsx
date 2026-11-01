"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, EyeOff, MessageSquareQuote, Reply, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/admin/forms/confirm-dialog";
import { useAdminAction } from "@/components/admin/forms/use-admin-action";
import { deleteReviewAction, moderateReviewAction } from "@/features/admin/reviews-actions";
import { formatInZone } from "@/lib/utilities/time";
import { cn } from "@/lib/utils";
import type { AdminReview } from "@/services/admin-catalog.service";

const TABS = [
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "HIDDEN", label: "Hidden" },
  { key: "", label: "All" },
] as const;

export function ReviewsModeration({ reviews, counts, status }: { reviews: AdminReview[]; counts: Record<string, number>; status: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <Button
            key={t.key}
            role="tab"
            aria-selected={status === t.key}
            variant={status === t.key ? "default" : "outline"}
            size="sm"
            onClick={() => {
              const next = new URLSearchParams(params.toString());
              if (t.key) next.set("status", t.key);
              else next.set("status", "all");
              router.replace(`${pathname}?${next.toString()}`);
            }}
          >
            {t.label}
            {t.key && <span className="ml-1 tabular-nums opacity-70">{counts[t.key] ?? 0}</span>}
          </Button>
        ))}
      </div>
      {reviews.length === 0 ? (
        <EmptyState icon={MessageSquareQuote} title={status === "PENDING" ? "No reviews waiting" : "No reviews here"} description="Customers can review items from delivered orders. Approved reviews appear on the website." />
      ) : (
        <ul className="grid gap-3">
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewCard({ review: r }: { review: AdminReview }) {
  const { run, pending } = useAdminAction();
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState(r.adminReply ?? "");
  const set = (status: "APPROVED" | "HIDDEN" | "PENDING", adminReply = r.adminReply ?? "") =>
    run(() => moderateReviewAction(r.id, { status, adminReply }), { success: status === "APPROVED" ? "Review published" : status === "HIDDEN" ? "Review hidden" : "Saved" });

  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1" aria-label={`${r.rating} out of 5 stars`}>
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} className={cn("size-4", i < r.rating ? "fill-gold text-gold" : "text-muted-foreground")} />
            ))}
          </div>
          <p className="mt-1 text-sm">
            <span className="font-semibold">{r.customerName ?? "Customer"}</span> on{" "}
            <Link href={`/products/${r.productId}`} className="text-gold hover:underline">
              {r.productName ?? "a product"}
            </Link>
          </p>
          <p className="text-xs text-muted-foreground">{formatInZone(r.createdAt as string)}</p>
        </div>
        <Badge variant={r.status === "APPROVED" ? "default" : r.status === "HIDDEN" ? "secondary" : "outline"}>{r.status === "PENDING" ? "Awaiting approval" : r.status === "APPROVED" ? "Published" : "Hidden"}</Badge>
      </div>
      {r.comment ? <p className="mt-3 text-sm whitespace-pre-line">{r.comment}</p> : <p className="mt-3 text-sm text-muted-foreground italic">Rating only, no comment.</p>}
      {r.adminReply && !replying && <p className="mt-3 rounded-lg bg-muted/60 p-2 text-xs"><span className="font-semibold text-gold">Your reply:</span> {r.adminReply}</p>}
      {replying && (
        <div className="mt-3 grid gap-2">
          <Textarea value={reply} onChange={(e) => setReply(e.target.value)} maxLength={500} rows={3} placeholder="Thank the customer or respond to feedback (shown publicly with the review)." />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={async () => {
                const res = await set(r.status as "APPROVED", reply);
                if (res.ok) setReplying(false);
              }}
            >
              Save reply
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReplying(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
        {r.status !== "APPROVED" && (
          <Button size="sm" disabled={pending} onClick={() => set("APPROVED")}>
            <Check className="size-3.5" /> Approve
          </Button>
        )}
        {r.status !== "HIDDEN" && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => set("HIDDEN")}>
            <EyeOff className="size-3.5" /> Hide
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setReplying((v) => !v)}>
          <Reply className="size-3.5" /> {r.adminReply ? "Edit reply" : "Reply"}
        </Button>
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="ghost" className="ml-auto text-destructive">
              <Trash2 className="size-3.5" /> Delete
            </Button>
          }
          title="Delete this review?"
          description="The customer will be able to review this item again. Prefer hiding if you want to keep a record."
          onConfirm={async () => (await run(() => deleteReviewAction(r.id), { success: "Review deleted" })).ok}
        />
      </div>
    </li>
  );
}
