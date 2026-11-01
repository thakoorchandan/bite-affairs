"use client";

import Image from "next/image";
import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Field } from "@/components/admin/forms/field";
import { NativeSelect } from "@/components/admin/forms/native-select";
import { SwitchRow } from "@/components/admin/forms/switch-row";
import { ConfirmDialog } from "@/components/admin/forms/confirm-dialog";
import { useAdminAction } from "@/components/admin/forms/use-admin-action";
import { ImageField } from "@/components/admin/media/image-field";
import { SortableList } from "./sortable-list";
import { categoryInputSchema, type CategoryFormInput } from "@/lib/validations/admin";
import { deleteCategoryAction, reorderCategoriesAction, saveCategoryAction, setCategoryActiveAction } from "@/features/admin/catalog-actions";
import type { AdminCategory } from "@/services/admin-catalog.service";

export function CategoriesManager({ categories, cloudinaryEnabled }: { categories: AdminCategory[]; cloudinaryEnabled: boolean }) {
  const [editing, setEditing] = useState<AdminCategory | "new" | null>(null);
  const { run } = useAdminAction();

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" /> New category
        </Button>
      </div>
      {categories.length === 0 ? (
        <EmptyState icon={FolderTree} title="No categories yet" description="Create your first menu category, e.g. Pizza or Momos." />
      ) : (
        <SortableList
          items={categories}
          getId={(c) => c.id}
          onReorder={(ids) => run(() => reorderCategoriesAction(ids), { success: "Order saved" })}
          renderItem={(c) => (
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">{c.image?.url && <Image src={c.image.url} alt="" fill sizes="48px" className="object-cover" />}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  /menu/{c.slug} · {c.productCount} product{c.productCount === 1 ? "" : "s"}
                </p>
              </div>
              {!c.isActive && <Badge variant="secondary">Hidden</Badge>}
              <Switch
                checked={c.isActive !== false}
                aria-label={`Show ${c.name} on menu`}
                onCheckedChange={(v) => run(() => setCategoryActiveAction(c.id, !!v), { success: v ? `${c.name} is visible` : `${c.name} hidden from menu` })}
              />
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                <Pencil />
              </Button>
              <DeleteCategory category={c} others={categories.filter((x) => x.id !== c.id)} />
            </div>
          )}
        />
      )}
      {editing && <CategoryDialog category={editing === "new" ? null : editing} cloudinaryEnabled={cloudinaryEnabled} onClose={() => setEditing(null)} />}
    </div>
  );
}

function DeleteCategory({ category, others }: { category: AdminCategory; others: AdminCategory[] }) {
  const { run } = useAdminAction();
  const [moveTo, setMoveTo] = useState("");
  const hasProducts = category.productCount > 0;
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${category.name}`}>
          <Trash2 className="text-destructive" />
        </Button>
      }
      title={`Delete ${category.name}?`}
      description={hasProducts ? `This category has ${category.productCount} product(s). Choose where to move them before deleting.` : "This cannot be undone."}
      onConfirm={async () => {
        if (hasProducts && !moveTo) return false;
        const res = await run(() => deleteCategoryAction(category.id, moveTo || null), { success: "Category deleted" });
        return res.ok;
      }}
    >
      {hasProducts && (
        <NativeSelect value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="Move products to">
          <option value="">Move products to…</option>
          {others.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </NativeSelect>
      )}
    </ConfirmDialog>
  );
}

function CategoryDialog({ category, cloudinaryEnabled, onClose }: { category: AdminCategory | null; cloudinaryEnabled: boolean; onClose: () => void }) {
  const { run, pending } = useAdminAction();
  const form = useForm<CategoryFormInput>({
    resolver: zodResolver(categoryInputSchema, undefined, { raw: true }),
    defaultValues: {
      name: category?.name ?? "",
      slug: category?.slug ?? "",
      description: category?.description ?? "",
      image: category?.image ? { url: category.image.url, publicId: category.image.publicId ?? null, alt: category.image.alt ?? null } : null,
      isActive: category?.isActive ?? true,
      seoTitle: category?.seo?.title ?? "",
      seoDescription: category?.seo?.description ?? "",
    },
  });
  const { register, handleSubmit, control, formState } = form;
  const e = formState.errors;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{category ? `Edit ${category.name}` : "New category"}</DialogTitle>
        </DialogHeader>
        <form
          id="category-form"
          className="grid gap-4"
          onSubmit={handleSubmit(async (values) => {
            const res = await run(() => saveCategoryAction(category?.id ?? null, values), { success: category ? "Category updated" : "Category created", setError: form.setError as never });
            if (res.ok) onClose();
          })}
        >
          <Field label="Name" htmlFor="c-name" error={e.name?.message} required>
            <Input id="c-name" {...register("name")} aria-invalid={!!e.name} />
          </Field>
          <Field label="URL slug" htmlFor="c-slug" error={e.slug?.message} hint="Leave empty to generate from the name.">
            <Input id="c-slug" {...register("slug")} placeholder="e.g. momos" />
          </Field>
          <Field label="Description" htmlFor="c-desc" error={e.description?.message}>
            <Textarea id="c-desc" rows={2} {...register("description")} />
          </Field>
          <Field label="Image">
            <Controller control={control} name="image" render={({ field }) => <ImageField value={field.value} onChange={field.onChange} cloudinaryEnabled={cloudinaryEnabled} subfolder="categories" />} />
          </Field>
          <Controller control={control} name="isActive" render={({ field }) => <SwitchRow label="Visible on menu" checked={!!field.value} onCheckedChange={field.onChange} />} />
          <details className="rounded-xl border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">SEO</summary>
            <div className="mt-3 grid gap-3">
              <Field label="SEO title" htmlFor="c-seot" error={e.seoTitle?.message}>
                <Input id="c-seot" {...register("seoTitle")} />
              </Field>
              <Field label="SEO description" htmlFor="c-seod" error={e.seoDescription?.message}>
                <Textarea id="c-seod" rows={2} {...register("seoDescription")} />
              </Field>
            </div>
          </details>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" form="category-form" disabled={pending}>
            {pending ? "Saving…" : "Save category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
