"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Field, RupeeInputWrap } from "@/components/admin/forms/field";
import { NativeSelect } from "@/components/admin/forms/native-select";
import { SwitchRow } from "@/components/admin/forms/switch-row";
import { CheckboxList } from "@/components/admin/forms/checkbox-list";
import { ConfirmDialog } from "@/components/admin/forms/confirm-dialog";
import { paiseToInput, useAdminAction } from "@/components/admin/forms/use-admin-action";
import { toLocalDateTimeInput } from "@/components/admin/forms/datetime";
import { couponInputSchema, type CouponFormInput } from "@/lib/validations/admin";
import { deleteCouponAction, saveCouponAction, setCouponActiveAction } from "@/features/admin/coupons-actions";
import { formatINR } from "@/lib/utilities/money";
import { formatInZone } from "@/lib/utilities/time";
import type { AdminCoupon } from "@/services/admin-catalog.service";

interface Opt {
  id: string;
  name: string;
}

function describe(c: AdminCoupon) {
  const off = c.type === "PERCENT" ? `${c.value / 100}% off` : `${formatINR(c.value)} off`;
  const cap = c.type === "PERCENT" && c.maxDiscount ? ` (max ${formatINR(c.maxDiscount)})` : "";
  const min = c.minOrderAmount ? ` · min order ${formatINR(c.minOrderAmount)}` : "";
  return `${off}${cap}${min}`;
}

function status(c: AdminCoupon): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  const now = Date.now();
  if (!c.isActive) return { label: "Inactive", variant: "secondary" };
  if (c.endsAt && new Date(c.endsAt).getTime() < now) return { label: "Expired", variant: "destructive" };
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return { label: "Scheduled", variant: "outline" };
  if (c.usageLimit && c.usedCount >= c.usageLimit) return { label: "Used up", variant: "destructive" };
  return { label: "Live", variant: "default" };
}

export function CouponsManager({ coupons, products, categories }: { coupons: AdminCoupon[]; products: Opt[]; categories: Opt[] }) {
  const [editing, setEditing] = useState<AdminCoupon | "new" | null>(null);
  const { run } = useAdminAction();
  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" /> New coupon
        </Button>
      </div>
      {coupons.length === 0 ? (
        <EmptyState icon={Tag} title="No coupons yet" description="Create discount codes like WELCOME10 for first orders or weekend specials." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {coupons.map((c) => {
            const s = status(c);
            return (
              <article key={c.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 font-mono text-lg font-bold tracking-wider text-gold"
                      onClick={() => navigator.clipboard.writeText(c.code).then(() => toast.success("Code copied"))}
                      aria-label={`Copy code ${c.code}`}
                    >
                      {c.code} <Copy className="size-3.5 opacity-60" />
                    </button>
                    <p className="text-sm">{describe(c)}</p>
                  </div>
                  <Badge variant={s.variant}>{s.label}</Badge>
                </div>
                {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Redemptions</dt>
                    <dd className="font-semibold tabular-nums">
                      {c.redemptions}
                      {c.usageLimit ? ` / ${c.usageLimit}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Discount given</dt>
                    <dd className="font-semibold tabular-nums">{formatINR(c.totalDiscount)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">Valid</dt>
                    <dd>
                      {c.startsAt ? formatInZone(c.startsAt, undefined, { dateStyle: "medium" }) : "Now"} → {c.endsAt ? formatInZone(c.endsAt, undefined, { dateStyle: "medium", timeStyle: "short" }) : "No end date"}
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {c.firstOrderOnly && <Badge variant="outline">First order only</Badge>}
                  {c.perCustomerLimit ? <Badge variant="outline">{c.perCustomerLimit}× per customer</Badge> : <Badge variant="outline">Unlimited per customer</Badge>}
                  {(c.applicableProductIds?.length ?? 0) + (c.applicableCategoryIds?.length ?? 0) > 0 && <Badge variant="outline">Restricted items</Badge>}
                  {c.isPublic && <Badge variant="outline">Public</Badge>}
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
                  <label className="flex items-center gap-2 text-xs">
                    <Switch checked={!!c.isActive} onCheckedChange={(v) => run(() => setCouponActiveAction(c.id, !!v), { success: v ? "Coupon activated" : "Coupon deactivated" })} aria-label={`${c.code} active`} />
                    Active
                  </label>
                  <div className="flex">
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.code}`} onClick={() => setEditing(c)}>
                      <Pencil />
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${c.code}`}>
                          <Trash2 className="text-destructive" />
                        </Button>
                      }
                      title={`Delete ${c.code}?`}
                      description={c.redemptions > 0 ? "This coupon has been used, so it will be deactivated instead to keep order history accurate." : "This cannot be undone."}
                      onConfirm={async () => (await run(() => deleteCouponAction(c.id), { success: (d) => (d.deactivated ? "Coupon deactivated" : "Coupon deleted") })).ok}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {editing && <CouponDialog coupon={editing === "new" ? null : editing} products={products} categories={categories} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CouponDialog({ coupon, products, categories, onClose }: { coupon: AdminCoupon | null; products: Opt[]; categories: Opt[]; onClose: () => void }) {
  const { run, pending } = useAdminAction();
  const form = useForm<CouponFormInput>({
    resolver: zodResolver(couponInputSchema, undefined, { raw: true }),
    defaultValues: {
      code: coupon?.code ?? "",
      description: coupon?.description ?? "",
      type: (coupon?.type as "PERCENT" | "FLAT") ?? "PERCENT",
      value: coupon ? (coupon.type === "PERCENT" ? String(coupon.value / 100) : paiseToInput(coupon.value)) : "",
      maxDiscount: paiseToInput(coupon?.maxDiscount),
      minOrderAmount: paiseToInput(coupon?.minOrderAmount || null),
      startsAt: toLocalDateTimeInput(coupon?.startsAt),
      endsAt: toLocalDateTimeInput(coupon?.endsAt),
      usageLimit: coupon?.usageLimit ? String(coupon.usageLimit) : "",
      perCustomerLimit: String(coupon?.perCustomerLimit ?? 1),
      firstOrderOnly: coupon?.firstOrderOnly ?? false,
      applicableProductIds: coupon?.applicableProductIds ?? [],
      applicableCategoryIds: coupon?.applicableCategoryIds ?? [],
      isActive: coupon?.isActive ?? true,
      isPublic: coupon?.isPublic ?? false,
    },
  });
  const { register, control, handleSubmit, formState } = form;
  const type = useWatch({ control, name: "type" });
  const e = formState.errors;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{coupon ? `Edit ${coupon.code}` : "New coupon"}</DialogTitle>
        </DialogHeader>
        <form
          id="coupon-form"
          className="grid gap-4"
          onSubmit={handleSubmit(async (values) => {
            const res = await run(() => saveCouponAction(coupon?.id ?? null, values), { success: "Coupon saved", setError: form.setError as never });
            if (res.ok) onClose();
          })}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Code" htmlFor="cp-code" error={e.code?.message} required>
              <Input id="cp-code" className="font-mono uppercase" {...register("code")} placeholder="WELCOME10" />
            </Field>
            <Field label="Description" htmlFor="cp-desc" error={e.description?.message} hint="Shown to customers when applied.">
              <Input id="cp-desc" {...register("description")} placeholder="10% off your first order" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Discount type" htmlFor="cp-type">
              <NativeSelect id="cp-type" {...register("type")}>
                <option value="PERCENT">Percentage</option>
                <option value="FLAT">Flat amount</option>
              </NativeSelect>
            </Field>
            <Field label={type === "PERCENT" ? "Percent off" : "Amount off"} htmlFor="cp-value" error={(e.value as { message?: string } | undefined)?.message} required>
              {type === "PERCENT" ? (
                <div className="relative">
                  <Input id="cp-value" inputMode="decimal" {...register("value")} className="pr-7" />
                  <span className="absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              ) : (
                <RupeeInputWrap>
                  <Input id="cp-value" inputMode="decimal" {...register("value")} />
                </RupeeInputWrap>
              )}
            </Field>
            <Field label="Max discount" htmlFor="cp-max" error={e.maxDiscount?.message} hint={type === "PERCENT" ? "Optional cap" : "Not needed for flat"}>
              <RupeeInputWrap>
                <Input id="cp-max" inputMode="decimal" disabled={type === "FLAT"} {...register("maxDiscount")} />
              </RupeeInputWrap>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Minimum order" htmlFor="cp-min" error={e.minOrderAmount?.message}>
              <RupeeInputWrap>
                <Input id="cp-min" inputMode="decimal" {...register("minOrderAmount")} placeholder="0" />
              </RupeeInputWrap>
            </Field>
            <Field label="Total uses" htmlFor="cp-limit" error={e.usageLimit?.message} hint="Empty = unlimited">
              <Input id="cp-limit" inputMode="numeric" {...register("usageLimit")} />
            </Field>
            <Field label="Uses per customer" htmlFor="cp-per" error={e.perCustomerLimit?.message} hint="0 = unlimited">
              <Input id="cp-per" inputMode="numeric" {...register("perCustomerLimit")} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Starts (IST)" htmlFor="cp-start" error={e.startsAt?.message}>
              <Input id="cp-start" type="datetime-local" {...register("startsAt")} />
            </Field>
            <Field label="Ends (IST)" htmlFor="cp-end" error={e.endsAt?.message}>
              <Input id="cp-end" type="datetime-local" {...register("endsAt")} />
            </Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Controller control={control} name="isActive" render={({ field }) => <SwitchRow label="Active" checked={!!field.value} onCheckedChange={field.onChange} />} />
            <Controller control={control} name="firstOrderOnly" render={({ field }) => <SwitchRow label="First order only" checked={!!field.value} onCheckedChange={field.onChange} />} />
            <Controller control={control} name="isPublic" render={({ field }) => <SwitchRow label="Show publicly" description="Advertise on the site" checked={!!field.value} onCheckedChange={field.onChange} />} />
          </div>
          <details className="rounded-xl border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Restrict to products or categories</summary>
            <p className="mt-2 text-xs text-muted-foreground">Leave both empty to apply to the whole cart. Otherwise the discount only counts eligible items.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Categories">
                <Controller control={control} name="applicableCategoryIds" render={({ field }) => <CheckboxList options={categories.map((c) => ({ id: c.id, label: c.name }))} value={field.value ?? []} onChange={field.onChange} />} />
              </Field>
              <Field label="Products">
                <Controller control={control} name="applicableProductIds" render={({ field }) => <CheckboxList options={products.map((c) => ({ id: c.id, label: c.name }))} value={field.value ?? []} onChange={field.onChange} placeholder="Search products" />} />
              </Field>
            </div>
          </details>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="coupon-form" disabled={pending}>
            {pending ? "Saving…" : "Save coupon"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
