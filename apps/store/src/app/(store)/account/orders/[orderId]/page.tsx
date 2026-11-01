import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/session";
import { getCustomerOrder } from "@/services/order-query.service";
import { getReviewState } from "@/services/account.service";
import { getPublicSettings } from "@/features/business-settings/queries";
import { LiveTracking } from "@/components/orders/tracking-view";
import { ReorderButton } from "@/components/orders/reorder-button";
import { ReviewPanel } from "@/components/orders/review-panel";
import { AccountSkeleton } from "@/components/customer/account-skeleton";

export const metadata = { title: "Order details" };

async function OrderDetail({ params }: PageProps<"/account/orders/[orderId]">) {
  const { orderId } = await params;
  const user = await requireCustomerPage(`/account/orders/${orderId}`);
  const order = await getCustomerOrder(user.id, orderId);
  if (!order) notFound();
  const [reviews, settings] = await Promise.all([getReviewState(user.id, orderId), getPublicSettings()]);
  const { id, itemsDetailed, ...view } = order;
  void itemsDetailed;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/account/orders" className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-gold">
          <ArrowLeft className="size-4" /> All orders
        </Link>
        <ReorderButton orderId={id} />
      </div>
      <LiveTracking initial={view} contactPhone={settings.contactPhone} />
      {reviews.canReview && <ReviewPanel orderId={id} items={reviews.items} />}
    </div>
  );
}

export default function OrderDetailPage(props: PageProps<"/account/orders/[orderId]">) {
  return (
    <Suspense fallback={<AccountSkeleton rows={3} />}>
      <OrderDetail {...props} />
    </Suspense>
  );
}
