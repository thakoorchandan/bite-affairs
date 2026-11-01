"use client";

import { useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Field, RupeeInputWrap } from "@/components/admin/forms/field";
import { NativeSelect } from "@/components/admin/forms/native-select";
import { SwitchRow } from "@/components/admin/forms/switch-row";
import { ConfirmDialog } from "@/components/admin/forms/confirm-dialog";
import { paiseToInput, useAdminAction } from "@/components/admin/forms/use-admin-action";
import { customisationGroupInputSchema, type CustomisationGroupFormInput } from "@/lib/validations/admin";
import { deleteCustomisationGroupAction, saveCustomisationGroupAction } from "@/features/admin/catalog-actions";
import { formatINR } from "@/lib/utilities/money";
import type { AdminCustomisationGroup } from "@/services/admin-catalog.service";

export function CustomisationsManager({ groups }: { groups: AdminCustomisationGroup[] }) {
  const [editing, setEditing] = useState<AdminCustomisationGroup | "new" | null>(null);
  const { run } = useAdminAction();
  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" /> New group
        </Button>
      </div>
      {groups.length === 0 ? (
        <EmptyState icon={SlidersHorizontal} title="No customisation groups" description="Create reusable options like Extra cheese, Portion size or Spice preference, then attach them to products." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {groups.map((g) => (
            <article key={g.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{g.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {g.internalName ? `${g.internalName} · ` : ""}
                    {g.selectionType === "SINGLE" ? "Choose one" : `Choose ${g.minSelect ? `${g.minSelect}–` : "any"}${g.maxSelect ? ` up to ${g.maxSelect}` : ""}`}
                    {g.isRequired ? " · Required" : " · Optional"}
                  </p>
                </div>
                <div className="flex">
                  {!g.isActive && <Badge variant="secondary">Off</Badge>}
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${g.name}`} onClick={() => setEditing(g)}>
                    <Pencil />
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${g.name}`}>
                        <Trash2 className="text-destructive" />
                      </Button>
                    }
                    title={`Delete ${g.name}?`}
                    description={g.usedBy.length ? `It will be removed from ${g.usedBy.length} product(s): ${g.usedBy.map((p) => p.name).join(", ")}.` : "This group isn't used by any product."}
                    onConfirm={async () => (await run(() => deleteCustomisationGroupAction(g.id), { success: "Group deleted" })).ok}
                  />
                </div>
              </div>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {g.options.map((o) => (
                  <li key={o.id} className={`rounded-full border border-border px-2.5 py-0.5 text-xs ${o.isAvailable === false ? "line-through opacity-50" : ""}`}>
                    {o.name} {o.priceDelta ? `+${formatINR(o.priceDelta)}` : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">{g.usedBy.length ? `Used by: ${g.usedBy.map((p) => p.name).join(", ")}` : "Not attached to any product yet."}</p>
            </article>
          ))}
        </div>
      )}
      {editing && <GroupDialog group={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function GroupDialog({ group, onClose }: { group: AdminCustomisationGroup | null; onClose: () => void }) {
  const { run, pending } = useAdminAction();
  const form = useForm<CustomisationGroupFormInput>({
    resolver: zodResolver(customisationGroupInputSchema, undefined, { raw: true }),
    defaultValues: {
      name: group?.name ?? "",
      internalName: group?.internalName ?? "",
      selectionType: (group?.selectionType as "SINGLE" | "MULTIPLE") ?? "MULTIPLE",
      isRequired: group?.isRequired ?? false,
      minSelect: String(group?.minSelect ?? 0),
      maxSelect: String(group?.maxSelect ?? 0),
      isActive: group?.isActive ?? true,
      options: group?.options.map((o) => ({ id: o.id, name: o.name, priceDelta: paiseToInput(o.priceDelta ?? 0) || "0", isAvailable: o.isAvailable !== false, isDefault: !!o.isDefault, isVeg: o.isVeg !== false })) ?? [
        { name: "", priceDelta: "0", isAvailable: true, isDefault: false, isVeg: true },
      ],
    },
  });
  const { register, control, handleSubmit, formState } = form;
  const options = useFieldArray({ control, name: "options" });
  const type = useWatch({ control, name: "selectionType" });
  const e = formState.errors;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{group ? `Edit ${group.name}` : "New customisation group"}</DialogTitle>
        </DialogHeader>
        <form
          id="group-form"
          className="grid gap-4"
          onSubmit={handleSubmit(async (values) => {
            const res = await run(() => saveCustomisationGroupAction(group?.id ?? null, values), { success: "Customisation group saved", setError: form.setError as never });
            if (res.ok) onClose();
          })}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name shown to customers" htmlFor="g-name" error={e.name?.message} required>
              <Input id="g-name" {...register("name")} placeholder="e.g. Extra toppings" />
            </Field>
            <Field label="Internal name" htmlFor="g-int" hint="Only you see this.">
              <Input id="g-int" {...register("internalName")} placeholder="e.g. Pizza toppings" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Selection" htmlFor="g-type">
              <NativeSelect id="g-type" {...register("selectionType")}>
                <option value="MULTIPLE">Multiple choice</option>
                <option value="SINGLE">Single choice</option>
              </NativeSelect>
            </Field>
            {type === "MULTIPLE" && (
              <>
                <Field label="Minimum" htmlFor="g-min" error={e.minSelect?.message}>
                  <Input id="g-min" inputMode="numeric" {...register("minSelect")} />
                </Field>
                <Field label="Maximum" htmlFor="g-max" error={e.maxSelect?.message} hint="0 = no limit">
                  <Input id="g-max" inputMode="numeric" {...register("maxSelect")} />
                </Field>
              </>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Controller control={control} name="isRequired" render={({ field }) => <SwitchRow label="Required" description="Customer must choose before adding to cart." checked={!!field.value} onCheckedChange={field.onChange} />} />
            <Controller control={control} name="isActive" render={({ field }) => <SwitchRow label="Active" description="Inactive groups are hidden everywhere." checked={!!field.value} onCheckedChange={field.onChange} />} />
          </div>
          <div className="grid gap-2">
            <p className="text-[13px] font-medium">Options</p>
            {e.options?.message && <p className="text-xs text-destructive">{e.options.message}</p>}
            {e.options?.root?.message && <p className="text-xs text-destructive">{e.options.root.message}</p>}
            {options.fields.map((o, i) => (
              <div key={o.id} className="grid grid-cols-[1fr_110px_auto] items-start gap-2 rounded-xl border border-border p-2 sm:grid-cols-[1fr_110px_auto_auto_auto_auto]">
                <div>
                  <Input aria-label="Option name" placeholder="Option name" {...register(`options.${i}.name`)} />
                  {e.options?.[i]?.name && <p className="mt-1 text-xs text-destructive">{e.options[i]?.name?.message}</p>}
                </div>
                <div>
                  <RupeeInputWrap>
                    <Input aria-label="Extra price (₹)" inputMode="decimal" {...register(`options.${i}.priceDelta`)} />
                  </RupeeInputWrap>
                  {e.options?.[i]?.priceDelta && <p className="mt-1 text-xs text-destructive">{e.options[i]?.priceDelta?.message}</p>}
                </div>
                {(
                  [
                    ["isAvailable", "Available"],
                    ["isDefault", "Default"],
                    ["isVeg", "Veg"],
                  ] as const
                ).map(([k, label]) => (
                  <Controller
                    key={k}
                    control={control}
                    name={`options.${i}.${k}`}
                    render={({ field }) => (
                      <label className="flex h-8 items-center gap-1.5 text-xs">
                        <Checkbox checked={!!field.value} onCheckedChange={(v) => field.onChange(!!v)} />
                        {label}
                      </label>
                    )}
                  />
                ))}
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove option" disabled={options.fields.length === 1} onClick={() => options.remove(i)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => options.append({ name: "", priceDelta: "0", isAvailable: true, isDefault: false, isVeg: true })}>
              <Plus className="size-3.5" /> Add option
            </Button>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="group-form" disabled={pending}>
            {pending ? "Saving…" : "Save group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
