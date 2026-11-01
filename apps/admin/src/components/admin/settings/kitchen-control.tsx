"use client";

import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck, CircleSlash, Clock, Pause, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormSection } from "@/components/admin/forms/field";
import { SwitchRow } from "@/components/admin/forms/switch-row";
import { useAdminAction } from "@/components/admin/forms/use-admin-action";
import { toLocalDateTimeInput } from "@/components/admin/forms/datetime";
import { KitchenStatusPill } from "@/components/shared/kitchen-status-pill";
import { kitchenControlInputSchema, type KitchenControlFormInput } from "@/lib/validations/admin";
import { saveKitchenControlAction, setKitchenModeAction } from "@/features/admin/hours-actions";
import { formatInZone } from "@/lib/utilities/time";
import type { KitchenStatus } from "@/services/kitchen-status";
import { cn } from "@/lib/utils";

interface KitchenSettings {
  mode?: string | null;
  preordersEnabled?: boolean | null;
  preorderMaxDaysAhead?: number | null;
  closedMessage?: string | null;
  pausedMessage?: string | null;
  pausedUntil?: string | null;
  delayAlertMinutes?: number | null;
  temporaryClosure?: { active?: boolean | null; from?: string | null; until?: string | null; message?: string | null } | null;
}

const MODES = [
  { mode: "AUTO", label: "Follow hours", icon: Clock, hint: "Opens and closes on schedule" },
  { mode: "OPEN", label: "Force open", icon: CircleCheck, hint: "Accept orders now, ignoring hours" },
  { mode: "PAUSED", label: "Pause", icon: Pause, hint: "Stop new orders temporarily" },
  { mode: "CLOSED", label: "Close", icon: CircleSlash, hint: "Closed until you change it" },
] as const;

export function KitchenControl({ kitchen, status }: { kitchen: KitchenSettings; status: KitchenStatus }) {
  const { run, pending } = useAdminAction();
  const currentMode = kitchen.mode ?? "AUTO";
  const form = useForm<KitchenControlFormInput>({
    resolver: zodResolver(kitchenControlInputSchema, undefined, { raw: true }),
    defaultValues: {
      mode: currentMode as "AUTO",
      pauseMinutes: "",
      preordersEnabled: !!kitchen.preordersEnabled,
      preorderMaxDaysAhead: String(kitchen.preorderMaxDaysAhead ?? 2),
      closedMessage: kitchen.closedMessage ?? "",
      pausedMessage: kitchen.pausedMessage ?? "",
      temporaryClosureActive: !!kitchen.temporaryClosure?.active,
      temporaryClosureFrom: toLocalDateTimeInput(kitchen.temporaryClosure?.from),
      temporaryClosureUntil: toLocalDateTimeInput(kitchen.temporaryClosure?.until),
      temporaryClosureMessage: kitchen.temporaryClosure?.message ?? "",
      delayAlertMinutes: String(kitchen.delayAlertMinutes ?? 45),
    },
  });
  const e = form.formState.errors;
  const closureActive = useWatch({ control: form.control, name: "temporaryClosureActive" });

  const quick = (mode: "AUTO" | "OPEN" | "CLOSED" | "PAUSED", minutes?: number) =>
    run(() => setKitchenModeAction(mode, minutes), { success: mode === "PAUSED" ? `Orders paused${minutes ? ` for ${minutes} min` : ""}` : mode === "OPEN" ? "Kitchen open" : mode === "CLOSED" ? "Kitchen closed" : "Following business hours" });

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 rounded-2xl border border-gold/25 bg-gradient-to-br from-gold/10 via-card to-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs tracking-wider text-muted-foreground uppercase">Customers see right now</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <KitchenStatusPill status={status} />
              <span className="text-sm text-muted-foreground">{status.message}</span>
            </div>
            {status.closesAt && status.state === "OPEN" && <p className="mt-1 text-xs text-muted-foreground">Closes {formatInZone(status.closesAt, status.timezone, { weekday: "short", hour: "numeric", minute: "2-digit" })}</p>}
            {kitchen.pausedUntil && currentMode === "PAUSED" && <p className="mt-1 text-xs text-muted-foreground">Paused until {formatInZone(kitchen.pausedUntil, status.timezone, { hour: "numeric", minute: "2-digit" })}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              disabled={pending}
              onClick={() => quick(m.mode)}
              aria-pressed={currentMode === m.mode}
              className={cn(
                "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors disabled:opacity-60",
                currentMode === m.mode ? "border-gold bg-gold text-primary-foreground" : "border-border bg-background/50 hover:border-gold/50",
              )}
            >
              <m.icon className="size-5" />
              <span className="text-sm font-semibold">{m.label}</span>
              <span className={cn("text-xs", currentMode === m.mode ? "text-primary-foreground/80" : "text-muted-foreground")}>{m.hint}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Quick pause:</span>
          {[15, 30, 60].map((m) => (
            <Button key={m} size="sm" variant="outline" disabled={pending} onClick={() => quick("PAUSED", m)}>
              <Zap className="size-3" /> {m} min
            </Button>
          ))}
        </div>
      </section>

      <form className="grid gap-5" onSubmit={form.handleSubmit((v) => run(() => saveKitchenControlAction(v), { success: "Kitchen settings saved", setError: form.setError as never }))}>
        <FormSection title="Messages & pre-orders">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Closed message" htmlFor="k-closed" error={e.closedMessage?.message}>
              <Textarea id="k-closed" rows={2} {...form.register("closedMessage")} />
            </Field>
            <Field label="Paused message" htmlFor="k-paused" error={e.pausedMessage?.message}>
              <Textarea id="k-paused" rows={2} {...form.register("pausedMessage")} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Controller control={form.control} name="preordersEnabled" render={({ field }) => <SwitchRow label="Accept pre-orders" description="When closed, customers can schedule an order for opening hours." checked={!!field.value} onCheckedChange={field.onChange} />} />
            <Field label="Pre-order up to (days ahead)" htmlFor="k-days" error={e.preorderMaxDaysAhead?.message}>
              <Input id="k-days" inputMode="numeric" {...form.register("preorderMaxDaysAhead")} />
            </Field>
          </div>
          <Field label="Late-order alert after (minutes)" htmlFor="k-delay" error={e.delayAlertMinutes?.message} hint="Alerts you when an order hasn't been made ready in time. 0 turns alerts off.">
            <Input id="k-delay" inputMode="numeric" className="max-w-40" {...form.register("delayAlertMinutes")} />
          </Field>
          <input type="hidden" {...form.register("mode")} />
        </FormSection>

        <FormSection title="Temporary closure" description="For renovations, festivals or emergencies. Overrides everything else while active.">
          <Controller control={form.control} name="temporaryClosureActive" render={({ field }) => <SwitchRow label="Temporarily unavailable" checked={!!field.value} onCheckedChange={field.onChange} />} />
          {closureActive && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="From (IST)" htmlFor="k-from" error={e.temporaryClosureFrom?.message} hint="Empty = starting now">
                  <Input id="k-from" type="datetime-local" {...form.register("temporaryClosureFrom")} />
                </Field>
                <Field label="Until (IST)" htmlFor="k-until" error={e.temporaryClosureUntil?.message} hint="Empty = until you turn it off">
                  <Input id="k-until" type="datetime-local" {...form.register("temporaryClosureUntil")} />
                </Field>
              </div>
              <Field label="Message to customers" htmlFor="k-tmsg" error={e.temporaryClosureMessage?.message}>
                <Input id="k-tmsg" {...form.register("temporaryClosureMessage")} placeholder="Closed for Durga Puja — back on 24 Oct!" />
              </Field>
            </>
          )}
        </FormSection>
        <Button type="submit" className="w-fit" disabled={pending}>
          Save kitchen settings
        </Button>
      </form>
    </div>
  );
}
