import { LinkButton } from "@/components/customer/link-button";
import Link from "next/link";
import { Suspense } from "react";
import { Package } from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/session";
import { listCustomerOrders } from "@/services/order-query.service";
import { AccountSkeleton } from "@/components/customer/account-skeleton";
import { OrderList, type OrderListItem } from "@/components/orders/order-list";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata = { title: "Orders" };

async function Orders({ searchParams }: PageProps<"/account/orders">) {
  const user = await requireCustomerPage("/account/orders");
  const sp = await searchParams;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const data = await listCustomerOrders(user.id, page, 10);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  if (!data.items.length && page === 1) {
    return <EmptyState icon={Package} title="No orders yet" description="Once you place an order it will show up here." action={<LinkButton className="rounded-full" href="/menu">Browse menu</LinkButton>} />;
  }
  return (
    <div>
      <OrderList orders={data.items as unknown as OrderListItem[]} />
      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={`/account/orders?page=${page - 1}`} className="font-bold text-gold">← Newer</Link> : <span />}
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={`/account/orders?page=${page + 1}`} className="font-bold text-gold">Older →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}

export default function OrdersPage(props: PageProps<"/account/orders">) {
  return (
    <Suspense fallback={<AccountSkeleton rows={4} />}>
      <Orders {...props} />
    </Suspense>
  );
}
