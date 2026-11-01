"use client";

import Image from "next/image";
import { Controller, useFieldArray, useForm, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormSection } from "@/components/admin/forms/field";
import { NativeSelect } from "@/components/admin/forms/native-select";
import { SwitchRow } from "@/components/admin/forms/switch-row";
import { CheckboxList } from "@/components/admin/forms/checkbox-list";
import { useAdminAction } from "@/components/admin/forms/use-admin-action";
import { ImageField } from "@/components/admin/media/image-field";
import { MediaPicker } from "@/components/admin/media/media-picker";
import { homeContentInputSchema, type HomeContentFormInput, type ImageRefInput } from "@/lib/validations/admin";
import { saveHomeContentAction } from "@/features/admin/content-actions";
import type { AdminHomeContent } from "@/services/admin-config.service";

const ICONS = ["leaf", "chef-hat", "heart", "flame", "bike", "clock", "star", "sparkles"] as const;
type ImgLike = { url: string; publicId?: string | null; width?: number | null; height?: number | null; alt?: string | null } | null | undefined;
const img = (i: ImgLike): ImageRefInput | null => (i?.url ? { url: i.url, publicId: i.publicId ?? null, width: i.width ?? null, height: i.height ?? null, alt: i.alt ?? null } : null);

type Img = { url: string; publicId?: string | null; width?: number | null; height?: number | null; alt?: string | null };
interface HomeContentShape {
  hero?: { eyebrow?: string; heading?: string; subheading?: string; primaryCtaLabel?: string; secondaryCtaLabel?: string; images?: Img[] };
  banners?: { title?: string; subtitle?: string; href?: string; image?: Img | null; isActive?: boolean }[];
  announcement?: { text?: string; isActive?: boolean };
  featuredCategoryIds?: string[];
  featuredProductIds?: string[];
  combos?: { heading?: string; subheading?: string; categoryId?: string };
  whyChooseUs?: { heading?: string; items?: { title?: string; body?: string; icon?: string }[] };
  about?: { heading?: string; body?: string; image?: Img | null };
  gallery?: Img[];
  footer?: { blurb?: string; copyright?: string };
}

export function HomeContentForm({ content, categories, products, cloudinaryEnabled }: { content: AdminHomeContent; categories: { id: string; name: string }[]; products: { id: string; name: string }[]; cloudinaryEnabled: boolean }) {
  const { run, pending } = useAdminAction();
  const c = content as unknown as HomeContentShape;
  const form = useForm<HomeContentFormInput>({
    resolver: zodResolver(homeContentInputSchema, undefined, { raw: true }),
    defaultValues: {
      hero: {
        eyebrow: c.hero?.eyebrow ?? "",
        heading: c.hero?.heading ?? "",
        subheading: c.hero?.subheading ?? "",
        primaryCtaLabel: c.hero?.primaryCtaLabel ?? "Order Now",
        secondaryCtaLabel: c.hero?.secondaryCtaLabel ?? "Browse Menu",
        images: (c.hero?.images ?? []).map(img).filter((x): x is ImageRefInput => !!x),
      },
      banners: (c.banners ?? []).map((b) => ({ title: b.title ?? "", subtitle: b.subtitle ?? "", href: b.href ?? "", image: img(b.image), isActive: b.isActive !== false })),
      announcement: { text: c.announcement?.text ?? "", isActive: !!c.announcement?.isActive },
      featuredCategoryIds: (c.featuredCategoryIds ?? []) as string[],
      featuredProductIds: (c.featuredProductIds ?? []) as string[],
      combos: { heading: c.combos?.heading ?? "", subheading: c.combos?.subheading ?? "", categoryId: (c.combos?.categoryId as string | undefined) ?? "" },
      whyChooseUs: {
        heading: c.whyChooseUs?.heading ?? "",
        items: (c.whyChooseUs?.items ?? []).map((i) => ({ title: i.title ?? "", body: i.body ?? "", icon: (ICONS as readonly string[]).includes(i.icon ?? "") ? (i.icon as (typeof ICONS)[number]) : "star" })),
      },
      about: { heading: c.about?.heading ?? "", body: c.about?.body ?? "", image: img(c.about?.image) },
      gallery: (c.gallery ?? []).map(img).filter((x): x is ImageRefInput => !!x),
      footer: { blurb: c.footer?.blurb ?? "", copyright: c.footer?.copyright ?? "" },
    },
  });
  const { register, control, handleSubmit, formState } = form;
  const e = formState.errors;
  const banners = useFieldArray({ control, name: "banners" });
  const why = useFieldArray({ control, name: "whyChooseUs.items" });

  return (
    <form
      className="grid gap-5 pb-24"
      noValidate
      onSubmit={handleSubmit((values) => run(() => saveHomeContentAction(values), { success: "Website updated — changes are live", setError: form.setError as never }))}
    >
      <FormSection title="Hero" description="The first thing customers see on the homepage.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Eyebrow" htmlFor="h-eyebrow" error={e.hero?.eyebrow?.message} hint="Small line above the heading">
            <Input id="h-eyebrow" {...register("hero.eyebrow")} />
          </Field>
          <Field label="Heading" htmlFor="h-heading" error={e.hero?.heading?.message} required>
            <Input id="h-heading" {...register("hero.heading")} />
          </Field>
        </div>
        <Field label="Subheading" htmlFor="h-sub" error={e.hero?.subheading?.message}>
          <Textarea id="h-sub" rows={2} {...register("hero.subheading")} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Primary button" htmlFor="h-cta1" error={e.hero?.primaryCtaLabel?.message}>
            <Input id="h-cta1" {...register("hero.primaryCtaLabel")} />
          </Field>
          <Field label="Secondary button" htmlFor="h-cta2" error={e.hero?.secondaryCtaLabel?.message}>
            <Input id="h-cta2" {...register("hero.secondaryCtaLabel")} />
          </Field>
        </div>
        <Field label="Hero images (up to 6)">
          <ImageArray control={control} name="hero.images" max={6} cloudinaryEnabled={cloudinaryEnabled} />
        </Field>
      </FormSection>

      <FormSection title="Announcement bar" description="A short message at the top of every page, e.g. a new launch or holiday hours.">
        <Field label="Message" htmlFor="ann" error={e.announcement?.text?.message}>
          <Input id="ann" {...register("announcement.text")} />
        </Field>
        <Controller control={control} name="announcement.isActive" render={({ field }) => <SwitchRow label="Show announcement" checked={!!field.value} onCheckedChange={field.onChange} />} />
      </FormSection>

      <FormSection
        title="Promotional banners"
        actions={
          banners.fields.length < 6 && (
            <Button type="button" size="sm" variant="outline" onClick={() => banners.append({ title: "", subtitle: "", href: "/menu", image: null, isActive: true })}>
              <Plus className="size-3.5" /> Add banner
            </Button>
          )
        }
      >
        {banners.fields.length === 0 && <p className="text-sm text-muted-foreground">No banners. Add one to promote combos or offers.</p>}
        {banners.fields.map((b, i) => (
          <div key={b.id} className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-[1fr_260px]">
            <div className="grid gap-3">
              <Field label="Title" htmlFor={`b-t-${i}`} error={e.banners?.[i]?.title?.message}>
                <Input id={`b-t-${i}`} {...register(`banners.${i}.title`)} />
              </Field>
              <Field label="Subtitle" htmlFor={`b-s-${i}`}>
                <Input id={`b-s-${i}`} {...register(`banners.${i}.subtitle`)} />
              </Field>
              <Field label="Link" htmlFor={`b-h-${i}`} error={e.banners?.[i]?.href?.message} hint="e.g. /menu/special-combos">
                <Input id={`b-h-${i}`} {...register(`banners.${i}.href`)} />
              </Field>
              <div className="flex items-center gap-2">
                <Controller control={control} name={`banners.${i}.isActive`} render={({ field }) => <SwitchRow label="Active" checked={!!field.value} onCheckedChange={field.onChange} />} />
                <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => banners.remove(i)}>
                  <Trash2 className="size-3.5" /> Remove
                </Button>
              </div>
            </div>
            <Controller control={control} name={`banners.${i}.image`} render={({ field }) => <ImageField value={field.value} onChange={field.onChange} cloudinaryEnabled={cloudinaryEnabled} subfolder="content" aspect="aspect-[16/9]" label="Banner image" />} />
          </div>
        ))}
      </FormSection>

      <FormSection title="Featured on the homepage" description="Leave empty to let the site pick automatically (active categories, featured/bestseller products).">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Featured categories">
            <Controller control={control} name="featuredCategoryIds" render={({ field }) => <CheckboxList options={categories.map((x) => ({ id: x.id, label: x.name }))} value={field.value ?? []} onChange={field.onChange} />} />
          </Field>
          <Field label="Featured products">
            <Controller control={control} name="featuredProductIds" render={({ field }) => <CheckboxList options={products.map((x) => ({ id: x.id, label: x.name }))} value={field.value ?? []} onChange={field.onChange} placeholder="Search products" />} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Special combos section">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Heading" htmlFor="co-h">
            <Input id="co-h" {...register("combos.heading")} />
          </Field>
          <Field label="Subheading" htmlFor="co-s">
            <Input id="co-s" {...register("combos.subheading")} />
          </Field>
          <Field label="Category to show" htmlFor="co-c">
            <NativeSelect id="co-c" {...register("combos.categoryId")}>
              <option value="">— None —</option>
              {categories.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Why choose Bite Affairs"
        actions={
          why.fields.length < 6 && (
            <Button type="button" size="sm" variant="outline" onClick={() => why.append({ title: "", body: "", icon: "star" })}>
              <Plus className="size-3.5" /> Add point
            </Button>
          )
        }
      >
        <Field label="Heading" htmlFor="why-h">
          <Input id="why-h" {...register("whyChooseUs.heading")} />
        </Field>
        {why.fields.map((w, i) => (
          <div key={w.id} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[140px_1fr_2fr_auto] sm:items-start">
            <NativeSelect aria-label="Icon" {...register(`whyChooseUs.items.${i}.icon`)}>
              {ICONS.map((ic) => (
                <option key={ic} value={ic}>
                  {ic}
                </option>
              ))}
            </NativeSelect>
            <div>
              <Input aria-label="Title" placeholder="Title" {...register(`whyChooseUs.items.${i}.title`)} />
              {e.whyChooseUs?.items?.[i]?.title && <p className="mt-1 text-xs text-destructive">{e.whyChooseUs.items[i]?.title?.message}</p>}
            </div>
            <Textarea aria-label="Description" rows={2} placeholder="Description" {...register(`whyChooseUs.items.${i}.body`)} />
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove point" onClick={() => why.remove(i)}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </FormSection>

      <FormSection title="About section">
        <div className="grid gap-4 md:grid-cols-[1fr_280px]">
          <div className="grid gap-3">
            <Field label="Heading" htmlFor="ab-h">
              <Input id="ab-h" {...register("about.heading")} />
            </Field>
            <Field label="Story" htmlFor="ab-b" error={e.about?.body?.message}>
              <Textarea id="ab-b" rows={6} {...register("about.body")} />
            </Field>
          </div>
          <Controller control={control} name="about.image" render={({ field }) => <ImageField value={field.value} onChange={field.onChange} cloudinaryEnabled={cloudinaryEnabled} subfolder="content" label="About image" />} />
        </div>
      </FormSection>

      <FormSection title="Food gallery" description="Photos shown in the homepage gallery (up to 24).">
        <ImageArray control={control} name="gallery" max={24} cloudinaryEnabled={cloudinaryEnabled} />
      </FormSection>

      <FormSection title="Footer">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Footer text" htmlFor="f-b">
            <Input id="f-b" {...register("footer.blurb")} />
          </Field>
          <Field label="Copyright name" htmlFor="f-c">
            <Input id="f-c" {...register("footer.copyright")} />
          </Field>
        </div>
      </FormSection>

      <SubmitBar pending={pending} dirty={formState.isDirty} />
    </form>
  );
}

function SubmitBar({ pending, dirty }: { pending: boolean; dirty: boolean }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 px-4 py-3 backdrop-blur lg:left-64">
      <div className="mx-auto flex max-w-6xl items-center justify-end gap-2">
        {dirty && <span className="mr-auto text-xs text-muted-foreground">Unsaved changes</span>}
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-3.5 animate-spin" />} Save website content
        </Button>
      </div>
    </div>
  );
}

function ImageArray({ control, name, max, cloudinaryEnabled }: { control: Control<HomeContentFormInput>; name: "gallery" | "hero.images"; max: number; cloudinaryEnabled: boolean }) {
  const arr = useFieldArray({ control, name });
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {arr.fields.map((f, i) => (
        <div key={f.id} className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
          <Image src={f.url} alt={f.alt ?? ""} fill sizes="140px" className="object-cover" unoptimized={!f.url.startsWith("/") && !f.url.includes("res.cloudinary.com")} />
          <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/70 p-0.5">
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Move left" disabled={i === 0} onClick={() => arr.move(i, i - 1)}>
              <ArrowLeft />
            </Button>
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Remove" onClick={() => arr.remove(i)}>
              <Trash2 />
            </Button>
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Move right" disabled={i === arr.fields.length - 1} onClick={() => arr.move(i, i + 1)}>
              <ArrowRight />
            </Button>
          </div>
        </div>
      ))}
      {arr.fields.length < max && (
        <MediaPicker
          cloudinaryEnabled={cloudinaryEnabled}
          subfolder="content"
          onSelect={(m) => arr.append({ url: m.url, publicId: m.publicId ?? null, width: m.width ?? null, height: m.height ?? null, alt: m.alt ?? null })}
          trigger={
            <button type="button" className="grid aspect-square place-items-center rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-gold hover:text-gold">
              <ImagePlus className="size-5" />
              <span className="sr-only">Add image</span>
            </button>
          }
        />
      )}
    </div>
  );
}
