import { Suspense } from "react";
import { requireCustomerPage } from "@/lib/auth/session";
import { ProfileForm, ChangePasswordForm } from "@/components/customer/profile-forms";
import { AccountSkeleton } from "@/components/customer/account-skeleton";
import { eq, getDb, schema } from "@/db";

export const metadata = { title: "Profile" };

async function Profile() {
  const user = await requireCustomerPage("/account/profile");
  const db = await getDb();
  const [row] = await db.select({ passwordHash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <ProfileForm initial={{ name: user.name, phone: user.phone ?? "", email: user.email ?? "" }} />
      <ChangePasswordForm hasPassword={!!row?.passwordHash} />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<AccountSkeleton rows={2} />}>
      <Profile />
    </Suspense>
  );
}
