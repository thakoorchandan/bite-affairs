"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormSection } from "@/components/admin/forms/field";
import { useAdminAction } from "@/components/admin/forms/use-admin-action";
import { socialLinksInputSchema, type SocialLinksFormInput } from "@/lib/validations/admin";
import { saveSocialLinksAction } from "@/features/admin/content-actions";

const FIELDS = [
  ["instagram", "Instagram", "https://instagram.com/biteaffairs"],
  ["facebook", "Facebook", "https://facebook.com/…"],
  ["youtube", "YouTube", "https://youtube.com/@…"],
  ["whatsapp", "WhatsApp link", "https://wa.me/91XXXXXXXXXX"],
  ["googleMaps", "Google Maps", "https://maps.app.goo.gl/…"],
] as const;

export function SocialLinksForm({ social }: { social: Partial<Record<(typeof FIELDS)[number][0], string | null>> }) {
  const { run, pending } = useAdminAction();
  const form = useForm<SocialLinksFormInput>({
    resolver: zodResolver(socialLinksInputSchema, undefined, { raw: true }),
    defaultValues: Object.fromEntries(FIELDS.map(([k]) => [k, social[k] ?? ""])),
  });
  return (
    <FormSection title="Social links" description="Shown in the footer and contact page.">
      <form className="grid gap-3" onSubmit={form.handleSubmit((v) => run(() => saveSocialLinksAction(v), { success: "Social links saved", setError: form.setError as never }))}>
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map(([k, label, ph]) => (
            <Field key={k} label={label} htmlFor={`s-${k}`} error={form.formState.errors[k]?.message}>
              <Input id={`s-${k}`} placeholder={ph} {...form.register(k)} />
            </Field>
          ))}
        </div>
        <Button type="submit" size="sm" className="w-fit" disabled={pending}>
          Save links
        </Button>
      </form>
    </FormSection>
  );
}
