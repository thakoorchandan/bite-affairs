"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Download, Info, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Field, FormSection, RupeeInputWrap } from "@/components/admin/forms/field";
import { NativeSelect } from "@/components/admin/forms/native-select";
import { ConfirmDialog } from "@/components/admin/forms/confirm-dialog";
import { paiseToInput, useAdminAction } from "@/components/admin/forms/use-admin-action";
import { todayKey } from "@/components/admin/forms/datetime";
import { expenseInputSchema, type ExpenseFormInput } from "@/lib/validations/admin";
import { deleteExpenseAction, saveExpenseAction } from "@/features/admin/finance-actions";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from "@/constants/domain";
import { formatINR } from "@/lib/utilities/money";
import { addDaysToDateKey, toDateKey } from "@/lib/utilities/time";
import { cn } from "@/lib/utils";
import type { ExpenseRow, ProfitReport } from "@/services/finance.service";

function presetRange(preset: string): { from: string; to: string } {
  const today = todayKey();
  const [y, m] = today.split("-").map(Number);
  switch (preset) {
    case "last30":
      return { from: toDateKey(addDaysToDateKey(today, -29)), to: today };
    case "lastMonth": {
      const first = toDateKey({ year: m === 1 ? y - 1 : y, month: m === 1 ? 12 : m - 1, day: 1 });
      const lastDay = toDateKey(addDaysToDateKey(toDateKey({ year: y, month: m, day: 1 }), -1));
      return { from: first, to: lastDay };
    }
    case "thisYear":
      return { from: `${y}-01-01`, to: today };
    default:
      return { from: toDateKey({ year: y, month: m, day: 1 }), to: today };
  }
}

export function FinanceView({ report, expenses, filters }: { report: ProfitReport; expenses: ExpenseRow[]; filters: { from: string; to: string; category: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [editing, setEditing] = useState<ExpenseRow | "new" | null>(null);
  const { run } = useAdminAction();

  const apply = (next: Record<string, string>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.replace(`${pathname}?${p.toString()}`);
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-wrap gap-1.5">
          {[
            ["thisMonth", "This month"],
            ["lastMonth", "Last month"],
            ["last30", "Last 30 days"],
            ["thisYear", "This year"],
          ].map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant="outline"
              onClick={() => {
                const r = presetRange(key);
                setFrom(r.from);
                setTo(r.to);
                apply(r);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ from, to });
          }}
        >
          <Field label="From" htmlFor="f-from">
            <Input id="f-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </Field>
          <Field label="To" htmlFor="f-to">
            <Input id="f-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </Field>
          <Button type="submit" size="sm">
            Apply
          </Button>
        </form>
        <Button size="sm" variant="outline" className="ml-auto" render={<a href={`/expenses/export?from=${filters.from}&to=${filters.to}`} download />}>
          <Download className="size-3.5" /> Export CSV
        </Button>
      </div>

      <ProfitSummary report={report} />

      <FormSection
        title="Expenses"
        description="Record actual money spent. These are your real costs."
        actions={
          <div className="flex items-center gap-2">
            <NativeSelect value={filters.category} onChange={(e) => apply({ category: e.target.value })} aria-label="Filter by category" className="w-44">
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </NativeSelect>
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus className="size-3.5" /> Add expense
            </Button>
          </div>
        }
      >
        {expenses.length === 0 ? (
          <EmptyState icon={Receipt} title="No expenses in this period" description="Add raw material bills, gas, electricity, packaging and other costs to see your real result." className="py-8" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Category</th>
                  <th className="py-2 pr-3 font-medium">Details</th>
                  <th className="py-2 pr-3 font-medium">Paid via</th>
                  <th className="py-2 pr-3 text-right font-medium">Amount</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {expenses.map((x) => (
                  <tr key={x.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{x.incurredOnKey}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline">{EXPENSE_CATEGORY_LABELS[x.category as ExpenseCategory]}</Badge>
                    </td>
                    <td className="max-w-64 py-2 pr-3">
                      <span className="block truncate">{x.vendor || "—"}</span>
                      {x.description && <span className="block truncate text-xs text-muted-foreground">{x.description}</span>}
                    </td>
                    <td className="py-2 pr-3 text-xs">{x.paymentMode}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">{formatINR(x.amount)}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon-sm" aria-label="Edit expense" onClick={() => setEditing(x)}>
                        <Pencil />
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label="Delete expense">
                            <Trash2 className="text-destructive" />
                          </Button>
                        }
                        title="Delete this expense?"
                        onConfirm={async () => (await run(() => deleteExpenseAction(x.id), { success: "Expense deleted" })).ok}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="pt-3 text-right text-xs text-muted-foreground">
                    Total shown
                  </td>
                  <td className="pt-3 pr-3 text-right font-bold tabular-nums">{formatINR(expenses.reduce((s, x) => s + x.amount, 0))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </FormSection>
      {editing && <ExpenseDialog expense={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ProfitSummary({ report: r }: { report: ProfitReport }) {
  const max = Math.max(1, ...r.daily.map((d) => Math.max(d.netSales, d.expenses)));
  const coverage = r.unitsSold ? Math.round(((r.unitsSold - r.unitsWithoutCost) / r.unitsSold) * 100) : 100;
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Net sales" value={r.netSales} hint={`${r.orders} delivered orders`} />
        <Metric label="Recorded expenses" value={r.recordedExpenses} hint="Actual" />
        <Metric label="Net operating result" value={r.netOperatingResult} hint="Net sales − recorded expenses" emphasise />
        <Metric label="Estimated gross profit" value={r.estimatedGrossProfit} hint="Net sales − estimated product cost" estimated />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Daily net sales vs expenses</h3>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-gold" /> Sales
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-ember" /> Expenses
              </span>
            </div>
          </div>
          {r.daily.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data.</p>
          ) : (
            <div className="flex h-44 items-end gap-[2px] overflow-x-auto" role="img" aria-label="Bar chart of daily net sales and expenses">
              {r.daily.map((d) => (
                <div key={d.date} className="group relative flex h-full min-w-1.5 flex-1 items-end gap-px" title={`${d.date}: sales ${formatINR(d.netSales)}, expenses ${formatINR(d.expenses)}`}>
                  <div className="w-1/2 rounded-t-sm bg-gold/85" style={{ height: `${(d.netSales / max) * 100}%` }} />
                  <div className="w-1/2 rounded-t-sm bg-ember/80" style={{ height: `${(d.expenses / max) * 100}%` }} />
                </div>
              ))}
            </div>
          )}
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>{r.range.from}</span>
            <span>{r.range.to}</span>
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-card p-4 text-sm">
          <h3 className="mb-2 font-semibold">Breakdown</h3>
          <dl className="grid gap-1.5">
            <Row label="Gross revenue (list price)" value={r.grossRevenue} />
            <Row label="Product discounts" value={-r.productDiscounts} />
            <Row label="Coupon discounts" value={-r.couponDiscounts} />
            <Row label="Delivery charges" value={r.deliveryRevenue} />
            <Row label={`Tax collected`} value={r.taxCollected} muted />
            <Row label="Net sales" value={r.netSales} strong />
            <Row label="Estimated product cost" value={-r.estimatedProductCost} estimated />
            <Row label="Recorded expenses" value={-r.recordedExpenses} />
          </dl>
          <h4 className="mt-4 mb-1.5 text-xs font-semibold text-muted-foreground uppercase">Expenses by category</h4>
          <dl className="grid gap-1">
            {(Object.entries(r.expensesByCategory) as [ExpenseCategory, number][])
              .filter(([, v]) => v > 0)
              .map(([k, v]) => (
                <Row key={k} label={EXPENSE_CATEGORY_LABELS[k]} value={v} />
              ))}
            {r.recordedExpenses === 0 && <p className="text-xs text-muted-foreground">None recorded.</p>}
          </dl>
        </section>
      </div>
      <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-gold" />
        <span>
          Management estimates only — not audited accounts. Revenue counts delivered orders by order date. <strong className="text-foreground">ESTIMATED</strong> figures use the per-dish cost estimates you entered on product pages
          {r.unitsWithoutCost > 0 ? ` (${coverage}% of units sold have cost data; ${r.unitsWithoutCost} units have none, so estimated cost is understated)` : ""}. “Net operating result” uses only your recorded expenses. Don&apos;t add both together: raw-material bills and product cost estimates describe the same spending.
          {r.unitsWithoutCost === 0 && r.estimatedNetAfterOverheads !== r.estimatedGrossProfit && ` Estimated profit after non-ingredient overheads: ${formatINR(r.estimatedNetAfterOverheads)}.`}
        </span>
      </p>
    </div>
  );
}

function Metric({ label, value, hint, emphasise, estimated }: { label: string; value: number; hint?: string; emphasise?: boolean; estimated?: boolean }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-4", emphasise ? "border-gold/40" : "border-border")}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label} {estimated && <Badge variant="outline" className="h-4 text-[9px]">ESTIMATED</Badge>}
      </p>
      <p className={cn("mt-1 text-xl font-bold tabular-nums sm:text-2xl", value < 0 && "text-destructive")}>{formatINR(value)}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Row({ label, value, strong, muted, estimated }: { label: string; value: number; strong?: boolean; muted?: boolean; estimated?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3", strong && "border-t border-border pt-1.5 font-semibold", muted && "text-muted-foreground")}>
      <dt>
        {label}
        {estimated && <span className="ml-1 text-[10px] text-gold">(est.)</span>}
      </dt>
      <dd className={cn("tabular-nums", value < 0 && "text-muted-foreground")}>{formatINR(value)}</dd>
    </div>
  );
}

function ExpenseDialog({ expense, onClose }: { expense: ExpenseRow | null; onClose: () => void }) {
  const { run, pending } = useAdminAction();
  const form = useForm<ExpenseFormInput>({
    resolver: zodResolver(expenseInputSchema, undefined, { raw: true }),
    defaultValues: {
      category: (expense?.category as ExpenseCategory) ?? "RAW_MATERIALS",
      amount: paiseToInput(expense?.amount),
      incurredOn: expense?.incurredOnKey ?? todayKey(),
      vendor: expense?.vendor ?? "",
      paymentMode: (expense?.paymentMode as "CASH") ?? "CASH",
      description: expense?.description ?? "",
    },
  });
  const e = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit expense" : "Add expense"}</DialogTitle>
        </DialogHeader>
        <form
          id="expense-form"
          className="grid gap-3"
          onSubmit={form.handleSubmit(async (v) => {
            const res = await run(() => saveExpenseAction(expense?.id ?? null, v), { success: "Expense saved", setError: form.setError as never });
            if (res.ok) onClose();
          })}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category" htmlFor="x-cat">
              <NativeSelect id="x-cat" {...form.register("category")}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EXPENSE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Amount" htmlFor="x-amt" error={e.amount?.message} required>
              <RupeeInputWrap>
                <Input id="x-amt" inputMode="decimal" autoFocus {...form.register("amount")} />
              </RupeeInputWrap>
            </Field>
            <Field label="Date" htmlFor="x-date" error={e.incurredOn?.message}>
              <Input id="x-date" type="date" max={todayKey()} {...form.register("incurredOn")} />
            </Field>
            <Field label="Paid via" htmlFor="x-mode">
              <NativeSelect id="x-mode" {...form.register("paymentMode")}>
                {["CASH", "UPI", "CARD", "BANK", "OTHER"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Vendor / payee" htmlFor="x-vendor" error={e.vendor?.message}>
            <Input id="x-vendor" {...form.register("vendor")} />
          </Field>
          <Field label="Notes" htmlFor="x-desc" error={e.description?.message}>
            <Textarea id="x-desc" rows={2} {...form.register("description")} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="expense-form" disabled={pending}>
            Save expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
