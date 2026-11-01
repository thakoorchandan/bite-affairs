import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { ReviewsModeration } from "@/components/admin/content/reviews-moderation";
import { listReviewsAdmin } from "@/services/admin-catalog.service";

export const metadata: Metadata = { title: "Reviews" };

export default function ReviewsPage({ searchParams }: PageProps<"/reviews">) {
  return (
    <>
      <AdminPageHeader title="Reviews" description="Approve customer reviews before they appear on the website. Product ratings update automatically." />
      <Suspense fallback={<AdminPageSkeleton />}>
        <ReviewsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ReviewsContent({ searchParams }: { searchParams: PageProps<"/reviews">["searchParams"] }) {
  await requireAdminPage();
  const sp = await searchParams;
  const raw = typeof sp.status === "string" ? sp.status : "PENDING";
  const status = raw === "all" ? "" : ["PENDING", "APPROVED", "HIDDEN"].includes(raw) ? raw : "PENDING";
  const { reviews, counts } = await listReviewsAdmin(status || undefined);
  return <ReviewsModeration reviews={reviews} counts={counts} status={status} />;
}
