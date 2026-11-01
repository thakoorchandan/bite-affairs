import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BellOff } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { Pagination } from "@/components/admin/dashboard/pagination";
import { NotificationList, type NotificationRow } from "@/components/admin/dashboard/notification-list";
import { EmptyState } from "@/components/shared/empty-state";
import { and, count, desc, eq, getDb, isNull, schema } from "@/db";
import { serialize } from "@/lib/utilities/serialize";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <NotificationsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function NotificationsContent({ searchParams }: { searchParams: PageProps<"/notifications">["searchParams"] }) {
  await requireAdminPage();
  const sp = await searchParams;
  const filter = sp.filter === "unread" ? "unread" : "all";
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 30;
  const db = await getDb();
  const n = schema.notifications;
  const adminOnly = eq(n.audience, "ADMIN");
  const where = filter === "unread" ? and(adminOnly, isNull(n.readAt)) : adminOnly;
  const [items, [{ c: total }], [{ c: unread }]] = await Promise.all([
    db.select().from(n).where(where).orderBy(desc(n.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ c: count() }).from(n).where(where),
    db.select({ c: count() }).from(n).where(and(adminOnly, isNull(n.readAt))),
  ]);
  return (
    <div>
      <AdminPageHeader
        title="Notifications"
        description="New orders, payments, cancellations and delay alerts. Kept for 60 days."
        actions={
          <nav className="flex gap-1 rounded-xl border border-border bg-card p-1" aria-label="Notification filter">
            {(["all", "unread"] as const).map((f) => (
              <Link key={f} href={f === "unread" ? "/notifications?filter=unread" : "/notifications"} aria-current={filter === f ? "page" : undefined} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", filter === f ? "bg-gold text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                {f === "all" ? "All" : `Unread${unread ? ` (${unread})` : ""}`}
              </Link>
            ))}
          </nav>
        }
      />
      {items.length === 0 ? (
        <EmptyState icon={BellOff} title="You're all caught up" description={filter === "unread" ? "No unread alerts." : "Alerts about new orders and payments will appear here."} />
      ) : (
        <>
          <NotificationList items={serialize(items) as unknown as NotificationRow[]} unread={unread} />
          <Pagination page={page} pages={Math.max(1, Math.ceil(total / pageSize))} total={total} basePath="/notifications" params={{ filter: filter === "unread" ? "unread" : undefined }} />
        </>
      )}
    </div>
  );
}
