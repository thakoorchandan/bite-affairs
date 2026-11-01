import type { Metadata } from "next";
import { Suspense } from "react";
import { CloudOff } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { MediaLibrary } from "@/components/admin/media/media-library";
import { getCloudinaryConfig } from "@/lib/cloudinary";
import { listMedia } from "@/services/media.service";
import { asc, getDb, schema } from "@/db";

export const metadata: Metadata = { title: "Media library" };

export default function MediaPage({ searchParams }: PageProps<"/media">) {
  return (
    <>
      <AdminPageHeader title="Media library" description="Food photos and videos stored on Cloudinary. Uploads go straight from your device to Cloudinary using a signed, admin-only request." />
      <Suspense fallback={<AdminPageSkeleton />}>
        <MediaContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function MediaContent({ searchParams }: { searchParams: PageProps<"/media">["searchParams"] }) {
  await requireAdminPage();
  if (!getCloudinaryConfig()) {
    return (
      <div className="grid max-w-2xl gap-3 rounded-2xl border border-gold/30 bg-gold/5 p-6">
        <CloudOff className="size-7 text-gold" />
        <h2 className="text-lg font-semibold">Connect Cloudinary to upload media</h2>
        <p className="text-sm text-muted-foreground">
          Create a free Cloudinary account, then add <code className="text-gold">CLOUDINARY_CLOUD_NAME</code>, <code className="text-gold">CLOUDINARY_API_KEY</code> and{" "}
          <code className="text-gold">CLOUDINARY_API_SECRET</code> to your environment variables and redeploy.
        </p>
        <p className="text-sm text-muted-foreground">Until then you can still use the bundled menu photos or paste https image links in product, category and website forms.</p>
      </div>
    );
  }
  const sp = await searchParams;
  const kind = sp.kind === "image" || sp.kind === "video" ? sp.kind : undefined;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const db = await getDb();
  const [media, products] = await Promise.all([listMedia({ kind, page }), db.select({ id: schema.products.id, name: schema.products.name }).from(schema.products).orderBy(asc(schema.products.name))]);
  return <MediaLibrary {...media} kind={kind ?? ""} products={products} />;
}
