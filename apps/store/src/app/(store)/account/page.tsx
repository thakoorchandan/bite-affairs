import { LinkButton } from "@/components/customer/link-button";
import Link from "next/link";
import { Suspense } from "react";
import { Heart, MapPin, Package, ArrowRight } from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/session";
import { listCustomerOrders } from "@/services/order-query.service";
import { listAddresses, listFavouriteProductIds } from "@/services/account.service";
import { AccountSkeleton } from "@/components/customer/account-skeleton";
import { OrderList, type OrderListItem } from "@/components/orders/order-list";
import { EmptyState } from "@/components/shared/empty-state";

async function Overview() {
  const user = await requireCustomerPage("/account");
  const [orders, addresses, favs] = await Promise.all([listCustomerOrders(user.id, 1, 3), listAddresses(user.id), listFavouriteProductIds(user.id)]);
  const def = addresses.find((a) => a.isDefault);
  const cards = [
    { href: "/account/orders", label: "Orders", value: orders.total, icon: Package },
    { href: "/account/favourites", label: "Favourites", value: favs.length, icon: Heart },
    { href: "/account/addresses", label: "Saved addresses", value: addresses.length, icon: MapPin },
  ];
  return (
    <div className="space-y-8">
      <div>
        <p className="script-accent text-2xl">Hello, {user.name.split(" ")[0]}!</p>
        <p className="text-sm text-muted-foreground">
          {user.phone ? `+91 ${user.phone}` : ""}
          {user.email ? ` · ${user.email}` : ""}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="group rounded-[1.5rem] border border-border bg-card p-5 transition hover:border-gold/40">
            <c.icon className="size-5 text-gold" />
            <p className="display-heading mt-3 text-4xl">{c.value}</p>
            <p className="text-sm text-muted-foreground">{c.label}</p>
          </Link>
        ))}
      </div>
      {def && (
        <div className="rounded-[1.5rem] border border-border bg-card p-5 text-sm">
          <p className="mb-1 font-bold">Default delivery address</p>
          <p className="text-muted-foreground">
            {def.houseNumber}, {def.street}, {def.city} – {def.pincode}
          </p>
        </div>
      )}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Recent orders</h2>
          {orders.total > 0 && (
            <Link href="/account/orders" className="flex items-center gap-1 text-sm font-bold text-gold">
              View all <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
        {orders.items.length ? (
          <OrderList orders={orders.items as unknown as OrderListItem[]} />
        ) : (
          <EmptyState icon={Package} title="No orders yet" description="Your delicious history starts with the first order." action={<LinkButton className="rounded-full" href="/menu">Order now</LinkButton>} />
        )}
      </section>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <Overview />
    </Suspense>
  );
}
