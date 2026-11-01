import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, MapPin, MessageCircle, Phone, Star } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageSkeleton } from "@/components/admin/page-header";
import { SectionCard, StatCard } from "@/components/admin/dashboard/stat-card";
import { CustomerNotesForm, PasswordResetLinkButton, ToggleCustomerActive } from "@/components/admin/customers/customer-tools";
import { telUrl, whatsappUrl } from "@/components/admin/orders/types";
import { OrderStatusBadge } from "@/components/shared/order-status-badge";
import { Button } from "@/components/ui/button";
import { getCustomerDetail } from "@/services/customer-admin.service";
import type { OrderStatus } from "@/constants/domain";
import { formatINR } from "@/lib/utilities/money";
import { formatInZone } from "@/lib/utilities/time";

export const metadata: Metadata = { title: "Customer" };

export default function CustomerDetailPage({ params }: PageProps<"/customers/[customerId]">) {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <CustomerContent params={params} />
    </Suspense>
  );
}

async function CustomerContent({ params }: { params: PageProps<"/customers/[customerId]">["params"] }) {
  await requireAdminPage();
  const { customerId } = await params;
  const detail = await getCustomerDetail(decodeURIComponent(customerId));
  if (!detail) notFound();
  const { profile, stats, orders, favourites, addresses } = detail;
  const key = profile.type === "GUEST" ? `guest-${profile.phone}` : profile.id!;

  return (
    <div className="space-y-6">
      <Link href={`/customers${profile.type === "GUEST" ? "?type=guest" : ""}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Customers
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{profile.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {profile.type === "GUEST" ? "Guest customer (no account)" : profile.isActive === false ? "Registered · account disabled" : "Registered customer"}
            {profile.joinedAt && ` · joined ${formatInZone(profile.joinedAt, undefined, { dateStyle: "medium" })}`}
            {profile.lastLoginAt && ` · last sign-in ${formatInZone(profile.lastLoginAt, undefined, { dateStyle: "medium" })}`}
          </p>
        </div>
        {profile.phone && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" render={<a href={telUrl(profile.phone)} />}>
              <Phone className="size-4" /> {profile.phone}
            </Button>
            <Button size="sm" variant="outline" render={<a href={whatsappUrl(profile.phone)} target="_blank" rel="noopener noreferrer" />}>
              <MessageCircle className="size-4" /> WhatsApp
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Orders" value={stats.orders} />
        <StatCard label="Total spend" value={formatINR(stats.spend)} tone="gold" />
        <StatCard label="Avg order" value={formatINR(stats.aov)} />
        <StatCard label="Last order" value={stats.lastOrderAt ? formatInZone(stats.lastOrderAt, undefined, { dateStyle: "medium" }) : "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Order history" description={`${orders.length} most recent`} className="lg:col-span-2">
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="-mx-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2.5 hover:bg-muted/40">
                    <span className="font-mono text-sm font-bold text-gold">{o.orderNumber}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {(o.items as { name: string; quantity: number }[]).map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                    </span>
                    <OrderStatusBadge status={o.status as OrderStatus} />
                    <span className="w-24 text-right text-xs text-muted-foreground">{formatInZone(o.createdAt!, undefined, { dateStyle: "medium" })}</span>
                    <span className="w-20 text-right font-semibold tabular-nums">{formatINR(o.pricing!.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <div className="space-y-4">
          <SectionCard title="Frequently ordered" action={<Star className="size-4 text-gold" />}>
            {favourites.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {favourites.map((f, i) => (
                  <li key={f.name} className="flex justify-between gap-2">
                    <span>
                      <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                      {f.name}
                    </span>
                    <span className="tabular-nums text-muted-foreground">×{f.qty}</span>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
          <SectionCard title="Admin notes" description="Private to the kitchen team">
            <CustomerNotesForm customerKey={key} initial={profile.notes ?? ""} />
          </SectionCard>
          {profile.type === "REGISTERED" && (
            <>
              <SectionCard title="Saved addresses" action={<MapPin className="size-4 text-muted-foreground" />}>
                {addresses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No saved addresses.</p>
                ) : (
                  <ul className="space-y-3 text-sm">
                    {addresses.map((a) => (
                      <li key={a.id}>
                        <p className="font-medium">
                          {a.label} {a.isDefault && <span className="ml-1 rounded bg-gold/15 px-1.5 text-[10px] font-bold text-gold uppercase">Default</span>}
                        </p>
                        <p className="text-muted-foreground">
                          {a.houseNumber}, {a.street}
                          {a.landmark ? `, near ${a.landmark}` : ""}, {a.city} – {a.pincode}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
              <SectionCard title="Account">
                <div className="grid gap-3">
                  <p className="text-xs text-muted-foreground">{profile.email ? `Email: ${profile.email}` : "No email on file."}</p>
                  <PasswordResetLinkButton userId={profile.id!} />
                  <ToggleCustomerActive userId={profile.id!} isActive={profile.isActive !== false} />
                </div>
              </SectionCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
