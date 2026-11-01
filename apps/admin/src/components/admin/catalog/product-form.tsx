"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Film, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FormSection, RupeeInputWrap } from "@/components/admin/forms/field";
import { NativeSelect } from "@/components/admin/forms/native-select";
import { SwitchRow } from "@/components/admin/forms/switch-row";
import { paiseToInput, useAdminAction } from "@/components/admin/forms/use-admin-action";
import { ImageField } from "@/components/admin/media/image-field";
import { MediaPicker } from "@/components/admin/media/media-picker";
import { productInputSchema, type ProductFormInput } from "@/lib/validations/admin";
import { saveProductAction } from "@/features/admin/catalog-actions";
import type { AdminProductDetail } from "@/services/admin-catalog.service";

interface Option {
  id: string;
  name: string;
}
interface GroupOption extends Option {
  internalName?: string | null;
  optionCount: number;
}

const SPICE = ["Not spicy", "Mild", "Medium", "Hot"];

export function ProductForm({
  product,
  categories,
  groups,
  cloudinaryEnabled,
  defaultCategoryId,
}: {
  product?: AdminProductDetail["product"];
  categories: Option[];
  groups: GroupOption[];
  cloudinaryEnabled: boolean;
  defaultCategoryId?: string;
}) {
  const router = useRouter();
  const { run, pending } = useAdminAction();
  const img = (i?: { url: string; publicId?: string | null; width?: number | null; height?: number | null; alt?: string | null } | null) =>
    i?.url ? { url: i.url, publicId: i.publicId ?? null, width: i.width ?? null, height: i.height ?? null, alt: i.alt ?? null } : null;

  const form = useForm<ProductFormInput>({
    resolver: zodResolver(productInputSchema, undefined, { raw: true }),
    defaultValues: {
      name: product?.name ?? "",
      slug: product?.slug ?? "",
      shortDescription: product?.shortDescription ?? "",
      description: product?.description ?? "",
      categoryId: product?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? "",
      price: paiseToInput(product?.price),
      discountedPrice: paiseToInput(product?.discountedPrice),
      isVeg: product?.isVeg ?? true,
      isBestseller: product?.isBestseller ?? false,
      isFeatured: product?.isFeatured ?? false,
      isNewArrival: product?.isNewArrival ?? false,
      isActive: product?.isActive ?? true,
      isAvailable: product?.isAvailable ?? true,
      preparationMinutes: String(product?.preparationMinutes ?? 15),
      spiceLevel: String(product?.spiceLevel ?? 0),
      servingInfo: product?.servingInfo ?? "",
      tags: (product?.tags ?? []).join(", "),
      displayOrder: product?.displayOrder != null ? String(product.displayOrder) : "",
      seoTitle: product?.seo?.title ?? "",
      seoDescription: product?.seo?.description ?? "",
      image: img(product?.image),
      gallery: (product?.gallery ?? []).map(img).filter((x): x is NonNullable<typeof x> => !!x),
      videos: (product?.videos ?? []).map((v) => ({ url: v.url, publicId: v.publicId ?? null, posterUrl: v.posterUrl ?? null, durationSeconds: v.durationSeconds ?? null })),
      customisationGroupIds: product?.customisationGroupIds ?? [],
    },
  });
  const { register, control, handleSubmit, formState, setValue, getValues } = form;
  const e = formState.errors;
  const gallery = useFieldArray({ control, name: "gallery" });
  const videos = useFieldArray({ control, name: "videos" });
  const selectedGroups = useWatch({ control, name: "customisationGroupIds" }) ?? [];

  const onSubmit = handleSubmit(async (values) => {
    const res = await run(() => saveProductAction(product?.id ?? null, values), { success: product ? "Product saved — live on the menu" : "Product created", setError: form.setError as never });
    if (!res.ok) return;
    if (res.data && !product) router.push(`/products/${res.data.id}`);
    // Saved values become the new baseline, so "Unsaved changes" clears.
    else form.reset(values, { keepValues: true });
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-5 pb-24 lg:grid-cols-[1fr_340px]" noValidate>
      <div className="grid content-start gap-5">
        <FormSection title="Basics">
          <Field label="Name" htmlFor="p-name" error={e.name?.message} required>
            <Input id="p-name" {...register("name")} aria-invalid={!!e.name} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="p-cat" error={e.categoryId?.message} required>
              <NativeSelect id="p-cat" {...register("categoryId")}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="URL slug" htmlFor="p-slug" error={e.slug?.message} hint={product ? "Changing it breaks old links." : "Leave empty to generate from the name."}>
              <Input id="p-slug" {...register("slug")} />
            </Field>
          </div>
          <Field label="Short description" htmlFor="p-short" error={e.shortDescription?.message} hint="Shown on menu cards (max 200 characters).">
            <Textarea id="p-short" rows={2} {...register("shortDescription")} />
          </Field>
          <Field label="Full description" htmlFor="p-desc" error={e.description?.message}>
            <Textarea id="p-desc" rows={5} {...register("description")} />
          </Field>
        </FormSection>

        <FormSection title="Pricing" description="Enter amounts in rupees. A discounted price shows the original price struck through.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price" htmlFor="p-price" error={e.price?.message} required>
              <RupeeInputWrap>
                <Input id="p-price" inputMode="decimal" {...register("price")} aria-invalid={!!e.price} />
              </RupeeInputWrap>
            </Field>
            <Field label="Discounted price" htmlFor="p-dprice" error={e.discountedPrice?.message} hint="Optional. Must be lower than the price.">
              <RupeeInputWrap>
                <Input id="p-dprice" inputMode="decimal" {...register("discountedPrice")} aria-invalid={!!e.discountedPrice} />
              </RupeeInputWrap>
            </Field>
          </div>
        </FormSection>

        <FormSection title="Photos & videos" description="The first image is the main photo on menu cards. Drag order in the gallery with the arrows.">
          <Field label="Main image">
            <Controller control={control} name="image" render={({ field }) => <ImageField value={field.value} onChange={field.onChange} cloudinaryEnabled={cloudinaryEnabled} />} />
          </Field>
          <div className="grid gap-2">
            <p className="text-[13px] font-medium">Gallery ({gallery.fields.length}/12)</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {gallery.fields.map((g, i) => (
                <div key={g.id} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                  <Image src={g.url} alt={g.alt ?? ""} fill sizes="160px" className="object-cover" unoptimized={!g.url.startsWith("/") && !g.url.includes("res.cloudinary.com")} />
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/70 p-1">
                    <Button type="button" variant="ghost" size="icon-xs" aria-label="Move left" disabled={i === 0} onClick={() => gallery.move(i, i - 1)}>
                      <ArrowLeft />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Set as main image"
                      onClick={() => {
                        const current = getValues("image");
                        setValue("image", { url: g.url, publicId: g.publicId ?? null, width: g.width ?? null, height: g.height ?? null, alt: g.alt ?? null }, { shouldDirty: true });
                        if (current?.url) gallery.update(i, current);
                        else gallery.remove(i);
                      }}
                    >
                      <Star />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-xs" aria-label="Remove" onClick={() => gallery.remove(i)}>
                      <Trash2 />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-xs" aria-label="Move right" disabled={i === gallery.fields.length - 1} onClick={() => gallery.move(i, i + 1)}>
                      <ArrowRight />
                    </Button>
                  </div>
                </div>
              ))}
              {gallery.fields.length < 12 && (
                <MediaPicker
                  cloudinaryEnabled={cloudinaryEnabled}
                  onSelect={(m) => gallery.append({ url: m.url, publicId: m.publicId ?? null, width: m.width ?? null, height: m.height ?? null, alt: m.alt ?? null })}
                  trigger={
                    <button type="button" className="grid aspect-square place-items-center rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-gold hover:text-gold">
                      <ImagePlus className="size-5" />
                      <span className="sr-only">Add gallery image</span>
                    </button>
                  }
                />
              )}
            </div>
          </div>
          <div className="grid gap-2">
            <p className="text-[13px] font-medium">Videos ({videos.fields.length}/4)</p>
            {videos.fields.map((v, i) => (
              <div key={v.id} className="flex items-center gap-3 rounded-lg border border-border p-2">
                <Film className="size-4 shrink-0 text-gold" />
                <video src={v.url} className="h-14 w-24 rounded bg-black object-cover" muted preload="metadata" />
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{v.url}</span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove video" onClick={() => videos.remove(i)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            {videos.fields.length < 4 && (
              <MediaPicker
                kind="video"
                title="Choose a video"
                cloudinaryEnabled={cloudinaryEnabled}
                onSelect={(m) => videos.append({ url: m.url, publicId: m.publicId ?? null, posterUrl: null, durationSeconds: m.durationSeconds ?? null })}
                trigger={
                  <Button type="button" variant="outline" size="sm" className="w-fit">
                    <Film className="size-3.5" /> Add video
                  </Button>
                }
              />
            )}
            {e.videos && <p className="text-xs text-destructive">Check the video links.</p>}
          </div>
        </FormSection>

        <FormSection title="Customisations" description="Add-ons and options customers can choose. Manage groups under Customisations.">
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No customisation groups yet.{" "}
              <Link href="/customisations" className="text-gold underline">
                Create one
              </Link>
              .
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {groups.map((g) => {
                const checked = selectedGroups.includes(g.id);
                return (
                  <label key={g.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5 has-data-checked:border-gold/60">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => setValue("customisationGroupIds", v ? [...selectedGroups, g.id] : selectedGroups.filter((x) => x !== g.id), { shouldDirty: true })}
                    />
                    <span className="grid">
                      <span className="text-sm font-medium">{g.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {g.internalName ? `${g.internalName} · ` : ""}
                        {g.optionCount} options
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </FormSection>

        <FormSection title="SEO">
          <Field label="SEO title" htmlFor="p-seot" error={e.seoTitle?.message} hint="Defaults to the product name.">
            <Input id="p-seot" {...register("seoTitle")} />
          </Field>
          <Field label="SEO description" htmlFor="p-seod" error={e.seoDescription?.message}>
            <Textarea id="p-seod" rows={2} {...register("seoDescription")} />
          </Field>
        </FormSection>
      </div>

      <div className="grid content-start gap-5">
        <FormSection title="Status">
          {(
            [
              ["isActive", "Show on menu", "Hidden products are invisible to customers."],
              ["isAvailable", "In stock", "Turn off to mark as sold out (still visible)."],
              ["isVeg", "Vegetarian", "Shows the green veg mark."],
              ["isBestseller", "Bestseller", "Adds a bestseller badge."],
              ["isFeatured", "Featured", "Eligible for homepage highlights."],
              ["isNewArrival", "New", "Adds a ‘New’ badge."],
            ] as const
          ).map(([name, label, description]) => (
            <Controller key={name} control={control} name={name} render={({ field }) => <SwitchRow label={label} description={description} checked={!!field.value} onCheckedChange={field.onChange} />} />
          ))}
        </FormSection>
        <FormSection title="Details">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prep time (min)" htmlFor="p-prep" error={e.preparationMinutes?.message}>
              <Input id="p-prep" inputMode="numeric" {...register("preparationMinutes")} />
            </Field>
            <Field label="Spice level" htmlFor="p-spice" error={e.spiceLevel?.message}>
              <NativeSelect id="p-spice" {...register("spiceLevel")}>
                {SPICE.map((s, i) => (
                  <option key={s} value={String(i)}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Serving info" htmlFor="p-serve" error={e.servingInfo?.message} hint="e.g. 6 pcs, Serves 2">
            <Input id="p-serve" {...register("servingInfo")} />
          </Field>
          <Field label="Tags" htmlFor="p-tags" error={e.tags?.message} hint="Comma separated, helps search (e.g. spicy, cheesy).">
            <Input id="p-tags" {...register("tags")} />
          </Field>
          <Field label="Display order" htmlFor="p-order" error={e.displayOrder?.message} hint="Lower numbers appear first.">
            <Input id="p-order" inputMode="numeric" {...register("displayOrder")} />
          </Field>
        </FormSection>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-2">
          {formState.isDirty && <span className="mr-auto text-xs text-muted-foreground">Unsaved changes</span>}
          <Button type="button" variant="outline" render={<Link href="/products" />}>
            Back to products
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            {product ? "Save changes" : "Create product"}
          </Button>
        </div>
      </div>
    </form>
  );
}
