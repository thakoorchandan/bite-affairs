import { Suspense } from "react";
import { requireCustomerPage } from "@/lib/auth/session";
import { listFavouriteProducts } from "@/services/account.service";
import { getPublicMenu } from "@/features/catalog/queries";
import { FavouritesGrid } from "@/components/customer/favourites-grid";
import { AccountSkeleton } from "@/components/customer/account-skeleton";

export const metadata = { title: "Favourites" };

async function Favourites() {
  const user = await requireCustomerPage("/account/favourites");
  const [products, menu] = await Promise.all([listFavouriteProducts(user.id), getPublicMenu()]);
  const fallbackImages = Object.fromEntries(menu.categories.map((c) => [c.id, c.image?.url ?? null]));
  return <FavouritesGrid products={products} fallbackImages={fallbackImages} />;
}

export default function FavouritesPage() {
  return (
    <Suspense fallback={<AccountSkeleton rows={2} />}>
      <Favourites />
    </Suspense>
  );
}
