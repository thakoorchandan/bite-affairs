"use client";

import { Controller, useFieldArray, useForm, useWatch, type Control, type UseFormRegister, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarPlus, Copy, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, FormSection } from "@/components/admin/forms/field";
import { useAdminAction } from "@/components/admin/forms/use-admin-action";
import { todayKey } from "@/components/admin/forms/datetime";
import { businessHoursInputSchema, type BusinessHoursFormInput } from "@/lib/validations/admin";
import { saveBusinessHoursAction } from "@/features/admin/hours-actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Show Monday first.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface HoursData {
  weekly?: { day: number; isOpen?: boolean | null; slots?: { open: string; close: string }[] }[];
  specialDates?: { date: string; isClosed?: boolean | null; slots?: { open: string; close: string }[]; note?: string | null }[];
}

export function HoursEditor({ hours }: { hours: HoursData }) {
  const { run, pending } = useAdminAction();
  const weekly = Array.from({ length: 7 }, (_, day) => {
    const w = hours.weekly?.find((x) => x.day === day);
    return { day, isOpen: w?.isOpen ?? false, slots: (w?.slots ?? []).map((s) => ({ open: s.open, close: s.close })) };
  });
  const form = useForm<BusinessHoursFormInput>({
    resolver: zodResolver(businessHoursInputSchema, undefined, { raw: true }),
    defaultValues: {
      weekly,
      specialDates: (hours.specialDates ?? []).map((s) => ({ date: s.date, isClosed: s.isClosed ?? true, slots: (s.slots ?? []).map((x) => ({ open: x.open, close: x.close })), note: s.note ?? "" })),
    },
  });
  const special = useFieldArray({ control: form.control, name: "specialDates" });
  const values = useWatch({ control: form.control, name: "weekly" });

  function copyToAll(fromDay: number) {
    const src = form.getValues(`weekly.${fromDay}`);
    for (let d = 0; d < 7; d++) if (d !== fromDay) form.setValue(`weekly.${d}`, { day: d, isOpen: src.isOpen, slots: src.slots.map((s) => ({ ...s })) }, { shouldDirty: true });
  }

  return (
    <form className="grid gap-5" onSubmit={form.handleSubmit((v) => run(() => saveBusinessHoursAction(v), { success: "Business hours saved", setError: form.setError as never }))}>
      <FormSection title="Weekly hours" description="Times are in India Standard Time. A closing time earlier than the opening time runs past midnight (e.g. 18:00 → 02:00).">
        <ul className="grid gap-2">
          {DAY_ORDER.map((day) => (
            <li key={day} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[150px_1fr_auto] sm:items-start">
              <div className="flex items-center gap-3">
                <Controller control={form.control} name={`weekly.${day}.isOpen`} render={({ field }) => <Switch checked={!!field.value} onCheckedChange={(v) => field.onChange(!!v)} aria-label={`${DAYS[day]} open`} />} />
                <span className="font-medium">{DAYS[day]}</span>
              </div>
              {values?.[day]?.isOpen ? <SlotList control={form.control} register={form.register} errors={form.formState.errors} name={`weekly.${day}.slots`} /> : <span className="text-sm text-muted-foreground sm:pt-1.5">Closed</span>}
              <Button type="button" variant="ghost" size="sm" onClick={() => copyToAll(day)}>
                <Copy className="size-3.5" /> Copy to all
              </Button>
            </li>
          ))}
        </ul>
      </FormSection>

      <FormSection
        title="Holidays & special hours"
        description="Override a specific date — close for a holiday or open with different hours."
        actions={
          <Button type="button" size="sm" variant="outline" onClick={() => special.append({ date: todayKey(), isClosed: true, slots: [], note: "" })}>
            <CalendarPlus className="size-3.5" /> Add date
          </Button>
        }
      >
        {special.fields.length === 0 && <p className="text-sm text-muted-foreground">No special dates.</p>}
        {special.fields.map((f, i) => (
          <SpecialDateRow key={f.id} index={i} control={form.control} register={form.register} errors={form.formState.errors} onRemove={() => special.remove(i)} />
        ))}
      </FormSection>
      <Button type="submit" className="w-fit" disabled={pending}>
        Save hours
      </Button>
    </form>
  );
}

function SpecialDateRow({ index, control, register, errors, onRemove }: { index: number; control: Control<BusinessHoursFormInput>; register: UseFormRegister<BusinessHoursFormInput>; errors: FieldErrors<BusinessHoursFormInput>; onRemove: () => void }) {
  const isClosed = useWatch({ control, name: `specialDates.${index}.isClosed` });
  const err = errors.specialDates?.[index];
  return (
    <div className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-[170px_150px_1fr_auto] md:items-start">
      <Field label="Date" htmlFor={`sd-${index}`} error={err?.date?.message}>
        <Input id={`sd-${index}`} type="date" {...register(`specialDates.${index}.date`)} />
      </Field>
      <Field label="Status">
        <Controller
          control={control}
          name={`specialDates.${index}.isClosed`}
          render={({ field }) => (
            <label className="flex h-8 items-center gap-2 text-sm">
              <Switch checked={!field.value} onCheckedChange={(v) => field.onChange(!v)} aria-label="Open on this date" /> {field.value ? "Closed" : "Open"}
            </label>
          )}
        />
      </Field>
      <div className="grid gap-2">
        {!isClosed && <SlotList control={control} register={register} errors={errors} name={`specialDates.${index}.slots`} />}
        {err?.slots?.message && <p className="text-xs text-destructive">{err.slots.message}</p>}
        <Input aria-label="Note" placeholder="Note, e.g. Diwali" {...register(`specialDates.${index}.note`)} />
      </div>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove date" onClick={onRemove}>
        <Trash2 />
      </Button>
    </div>
  );
}

function SlotList({ control, register, errors, name }: { control: Control<BusinessHoursFormInput>; register: UseFormRegister<BusinessHoursFormInput>; errors: FieldErrors<BusinessHoursFormInput>; name: `weekly.${number}.slots` | `specialDates.${number}.slots` }) {
  const slots = useFieldArray({ control, name });
  const path = name.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slotErrors = (errors as any)?.[path[0]]?.[path[1]]?.slots as { message?: string; open?: { message?: string }; close?: { message?: string }; root?: { message?: string } }[] | undefined;
  return (
    <div className="grid gap-2">
      {slots.fields.map((s, i) => (
        <div key={s.id} className="flex flex-wrap items-center gap-2">
          <Input type="time" aria-label="Opens" className="w-32" {...register(`${name}.${i}.open`)} />
          <span className="text-muted-foreground">to</span>
          <Input type="time" aria-label="Closes" className="w-32" {...register(`${name}.${i}.close`)} />
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove time slot" onClick={() => slots.remove(i)}>
            <X />
          </Button>
          {(slotErrors?.[i]?.message || slotErrors?.[i]?.open?.message || slotErrors?.[i]?.close?.message || slotErrors?.[i]?.root?.message) && (
            <span className="text-xs text-destructive">{slotErrors?.[i]?.message ?? slotErrors?.[i]?.open?.message ?? slotErrors?.[i]?.close?.message ?? slotErrors?.[i]?.root?.message}</span>
          )}
        </div>
      ))}
      {slots.fields.length === 0 && <span className="text-xs text-gold">Add at least one time slot.</span>}
      {slots.fields.length < 4 && (
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => slots.append({ open: "11:00", close: "23:00" })}>
          <Plus className="size-3.5" /> Add time slot
        </Button>
      )}
    </div>
  );
}
