import { Suspense } from "react";
import { requireCustomerPage } from "@/lib/auth/session";
import { listAddresses } from "@/services/account.service";
import { AddressManager } from "@/components/customer/address-manager";
import { AccountSkeleton } from "@/components/customer/account-skeleton";

export const metadata = { title: "Addresses" };

async function Addresses() {
  const user = await requireCustomerPage("/account/addresses");
  const addresses = await listAddresses(user.id);
  return <AddressManager addresses={addresses} defaults={{ name: user.name, phone: user.phone ?? "", city: "Kolkata" }} />;
}

export default function AddressesPage() {
  return (
    <Suspense fallback={<AccountSkeleton rows={2} />}>
      <Addresses />
    </Suspense>
  );
}
