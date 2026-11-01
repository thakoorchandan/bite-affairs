"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormSection, RupeeInputWrap } from "@/components/admin/forms/field";
import { paiseToInput, useAdminAction } from "@/components/admin/forms/use-admin-action";
import { productCostInputSchema, type ProductCostFormInput } from "@/lib/validations/admin";
import { saveProductCostAction } from "@/features/admin/catalog-actions";
import { formatINR } from "@/lib/utilities/money";

const toPaise = (v: unknown) => {
  const s = String(v ?? "").trim();
  return /^\d+(\.\d{1,2})?$/.test(s) ? Math.round(Number(s) * 100) : 0;
};

/** Estimated per-unit cost of a product, used for profit estimates only. */
export function ProductCostForm({ productId, sellingPrice, cost }: { productId: string; sellingPrice: number; cost: { ingredientCost?: number | null; packagingCost?: number | null; preparationCost?: number | null; otherCost?: number | null; notes?: string | null } | null }) {
  const { run, pending } = useAdminAction();
  const form = useForm<ProductCostFormInput>({
    resolver: zodResolver(productCostInputSchema, undefined, { raw: true }),
    defaultValues: {
      ingredientCost: paiseToInput(cost?.ingredientCost),
      packagingCost: paiseToInput(cost?.packagingCost),
      preparationCost: paiseToInput(cost?.preparationCost),
      otherCost: paiseToInput(cost?.otherCost),
      notes: cost?.notes ?? "",
    },
  });
  const values = useWatch({ control: form.control });
  const total = toPaise(values.ingredientCost) + toPaise(values.packagingCost) + toPaise(values.preparationCost) + toPaise(values.otherCost);
  const margin = sellingPrice - total;
  const e = form.formState.errors;

  return (
    <FormSection title="Cost estimate" description="Estimated cost per unit, used only for profit estimates in Expenses & Profit. Not shown to customers.">
      <form className="grid gap-3" onSubmit={form.handleSubmit((v) => run(() => saveProductCostAction(productId, v), { success: "Cost estimate saved", setError: form.setError as never }))}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["ingredientCost", "Ingredients"],
              ["packagingCost", "Packaging"],
              ["preparationCost", "Preparation"],
              ["otherCost", "Other"],
            ] as const
          ).map(([name, label]) => (
            <Field key={name} label={label} htmlFor={`cost-${name}`} error={e[name]?.message}>
              <RupeeInputWrap>
                <Input id={`cost-${name}`} inputMode="decimal" placeholder="0" {...form.register(name)} />
              </RupeeInputWrap>
            </Field>
          ))}
        </div>
        <Field label="Notes" htmlFor="cost-notes">
          <Textarea id="cost-notes" rows={2} {...form.register("notes")} />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2 text-sm">
          <span>
            Estimated cost <strong>{formatINR(total)}</strong> · margin{" "}
            <strong className={margin < 0 ? "text-destructive" : "text-emerald-400"}>
              {formatINR(margin)} ({sellingPrice ? Math.round((margin / sellingPrice) * 100) : 0}%)
            </strong>
          </span>
          <Button type="submit" size="sm" disabled={pending}>
            Save cost
          </Button>
        </div>
      </form>
    </FormSection>
  );
}
