"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MessageSquareQuote, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Field, FormSection } from "@/components/admin/forms/field";
import { NativeSelect } from "@/components/admin/forms/native-select";
import { SwitchRow } from "@/components/admin/forms/switch-row";
import { ConfirmDialog } from "@/components/admin/forms/confirm-dialog";
import { useAdminAction } from "@/components/admin/forms/use-admin-action";
import { testimonialInputSchema, type TestimonialFormInput } from "@/lib/validations/admin";
import { deleteTestimonialAction, saveTestimonialAction } from "@/features/admin/content-actions";
import type { AdminTestimonial } from "@/services/admin-config.service";

export function TestimonialsManager({ testimonials }: { testimonials: AdminTestimonial[] }) {
  const [editing, setEditing] = useState<AdminTestimonial | "new" | null>(null);
  const { run } = useAdminAction();
  return (
    <FormSection
      title="Customer testimonials"
      description="Only add real feedback from real customers (with their permission). Approved product reviews are shown separately."
      actions={
        <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
          <Plus className="size-3.5" /> Add testimonial
        </Button>
      }
    >
      {testimonials.length === 0 ? (
        <EmptyState icon={MessageSquareQuote} title="No testimonials" description="The homepage hides this section until you add one." className="py-8" />
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {testimonials.map((t) => (
            <li key={t.id} className="rounded-xl border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {t.name}
                    {t.location && <span className="text-muted-foreground"> · {t.location}</span>}
                  </p>
                  <p className="flex gap-0.5" aria-label={`${t.rating} stars`}>
                    {Array.from({ length: t.rating ?? 5 }, (_, i) => (
                      <Star key={i} className="size-3 fill-gold text-gold" />
                    ))}
                  </p>
                </div>
                <div className="flex items-center">
                  {!t.isActive && <Badge variant="secondary">Hidden</Badge>}
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit testimonial from ${t.name}`} onClick={() => setEditing(t)}>
                    <Pencil />
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete testimonial from ${t.name}`}>
                        <Trash2 className="text-destructive" />
                      </Button>
                    }
                    title="Delete testimonial?"
                    onConfirm={async () => (await run(() => deleteTestimonialAction(t.id), { success: "Testimonial deleted" })).ok}
                  />
                </div>
              </div>
              <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">“{t.quote}”</p>
            </li>
          ))}
        </ul>
      )}
      {editing && <TestimonialDialog testimonial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </FormSection>
  );
}

function TestimonialDialog({ testimonial, onClose }: { testimonial: AdminTestimonial | null; onClose: () => void }) {
  const { run, pending } = useAdminAction();
  const form = useForm<TestimonialFormInput>({
    resolver: zodResolver(testimonialInputSchema, undefined, { raw: true }),
    defaultValues: {
      name: testimonial?.name ?? "",
      location: testimonial?.location ?? "",
      quote: testimonial?.quote ?? "",
      rating: String(testimonial?.rating ?? 5),
      avatarUrl: testimonial?.avatarUrl ?? "",
      isActive: testimonial?.isActive ?? true,
      displayOrder: String(testimonial?.displayOrder ?? 0),
    },
  });
  const e = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{testimonial ? "Edit testimonial" : "Add testimonial"}</DialogTitle>
          <DialogDescription>Shown on the homepage.</DialogDescription>
        </DialogHeader>
        <form
          id="testimonial-form"
          className="grid gap-3"
          onSubmit={form.handleSubmit(async (v) => {
            const res = await run(() => saveTestimonialAction(testimonial?.id ?? null, v), { success: "Testimonial saved", setError: form.setError as never });
            if (res.ok) onClose();
          })}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer name" htmlFor="t-name" error={e.name?.message} required>
              <Input id="t-name" {...form.register("name")} />
            </Field>
            <Field label="Area" htmlFor="t-loc" hint="e.g. Salt Lake">
              <Input id="t-loc" {...form.register("location")} />
            </Field>
          </div>
          <Field label="What they said" htmlFor="t-quote" error={e.quote?.message} required>
            <Textarea id="t-quote" rows={4} {...form.register("quote")} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Rating" htmlFor="t-rating">
              <NativeSelect id="t-rating" {...form.register("rating")}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={String(n)}>
                    {n} star{n > 1 ? "s" : ""}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Display order" htmlFor="t-order" error={e.displayOrder?.message}>
              <Input id="t-order" inputMode="numeric" {...form.register("displayOrder")} />
            </Field>
          </div>
          <Field label="Photo URL" htmlFor="t-avatar" error={e.avatarUrl?.message} hint="Optional https link.">
            <Input id="t-avatar" {...form.register("avatarUrl")} />
          </Field>
          <Controller control={form.control} name="isActive" render={({ field }) => <SwitchRow label="Show on website" checked={!!field.value} onCheckedChange={field.onChange} />} />
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="testimonial-form" disabled={pending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
