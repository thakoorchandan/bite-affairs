import type { Metadata } from "next";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HomeContentForm } from "@/components/admin/content/home-content-form";
import { TestimonialsManager } from "@/components/admin/content/testimonials-manager";
import { SocialLinksForm } from "@/components/admin/content/social-links-form";
import { getAdminHomeContent, getAdminSettings, listTestimonialsAdmin } from "@/services/admin-config.service";
import { listProductsAdmin } from "@/services/admin-catalog.service";
import { getCloudinaryConfig } from "@/lib/cloudinary";
import { storeUrl } from "@/lib/store-url";

export const metadata: Metadata = { title: "Website content" };

export default function WebsiteContentPage() {
  return (
    <>
      <AdminPageHeader
        title="Website content"
        description="Edit the homepage, banners, testimonials and links without touching code. Changes go live when you save."
        actions={
          <Button variant="outline" size="sm" render={<a href={storeUrl("/")} target="_blank" rel="noopener" />}>
            <ExternalLink className="size-3.5" /> Preview site
          </Button>
        }
      />
      <Suspense fallback={<AdminPageSkeleton rows={8} />}>
        <ContentBody />
      </Suspense>
    </>
  );
}

async function ContentBody() {
  await requireAdminPage();
  const [content, testimonials, settings, { products, categories }] = await Promise.all([getAdminHomeContent(), listTestimonialsAdmin(), getAdminSettings(), listProductsAdmin()]);
  return (
    <Tabs defaultValue="home">
      <TabsList>
        <TabsTrigger value="home">Homepage</TabsTrigger>
        <TabsTrigger value="testimonials">Testimonials</TabsTrigger>
        <TabsTrigger value="links">Social links</TabsTrigger>
      </TabsList>
      <TabsContent value="home" className="mt-4">
        <HomeContentForm content={content} categories={categories.map((c) => ({ id: c.id, name: c.name }))} products={products.map((p) => ({ id: p.id, name: p.name }))} cloudinaryEnabled={!!getCloudinaryConfig()} />
      </TabsContent>
      <TabsContent value="testimonials" className="mt-4">
        <TestimonialsManager testimonials={testimonials} />
      </TabsContent>
      <TabsContent value="links" className="mt-4">
        <SocialLinksForm social={(settings.social ?? {}) as Record<string, string | null>} />
      </TabsContent>
    </Tabs>
  );
}
