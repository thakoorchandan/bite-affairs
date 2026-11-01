"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Field, FormSection, RupeeInputWrap } from "@/components/admin/forms/field";
import { SwitchRow } from "@/components/admin/forms/switch-row";
import { ConfirmDialog } from "@/components/admin/forms/confirm-dialog";
import { paiseToInput, useAdminAction } from "@/components/admin/forms/use-admin-action";
import { deliverySettingsInputSchema, deliveryZoneInputSchema, parsePincodeList, type DeliverySettingsFormInput, type DeliveryZoneFormInput } from "@/lib/validations/admin";
import { deleteDeliveryZoneAction, saveDeliveryZoneAction, saveDeliverySettingsAction, setDeliveryZoneActiveAction } from "@/features/admin/delivery-actions";
import { formatINR } from "@/lib/utilities/money";
import type { AdminDeliveryZone } from "@/services/admin-config.service";

interface DeliveryData {
  enabled?: boolean | null;
  suspended?: boolean | null;
  suspendedMessage?: string | null;
  pickupEnabled?: boolean | null;
  defaultFee?: number | null;
  minOrderAmount?: number | null;
  freeDeliveryThreshold?: number | null;
  estimatedDeliveryMinutes?: number | null;
  maxDistanceKm?: number | null;
}

export function DeliverySettingsForm({ delivery }: { delivery: DeliveryData }) {
  const { run, pending } = useAdminAction();
  const form = useForm<DeliverySettingsFormInput>({
    resolver: zodResolver(deliverySettingsInputSchema, undefined, { raw: true }),
    defaultValues: {
      enabled: delivery.enabled !== false,
      suspended: !!delivery.suspended,
      suspendedMessage: delivery.suspendedMessage ?? "",
      pickupEnabled: delivery.pickupEnabled !== false,
      defaultFee: paiseToInput(delivery.defaultFee ?? 0) || "0",
      minOrderAmount: paiseToInput(delivery.minOrderAmount ?? 0) || "0",
      freeDeliveryThreshold: paiseToInput(delivery.freeDeliveryThreshold ?? 0) || "0",
      estimatedDeliveryMinutes: String(delivery.estimatedDeliveryMinutes ?? 30),
      maxDistanceKm: String(delivery.maxDistanceKm ?? 0),
    },
  });
  const e = form.formState.errors;
  const suspended = useWatch({ control: form.control, name: "suspended" });
  return (
    <FormSection title="Delivery rules" description="Defaults apply when a zone doesn't set its own fee, minimum or time.">
      <form className="grid gap-4" onSubmit={form.handleSubmit((v) => run(() => saveDeliverySettingsAction(v), { success: "Delivery settings saved", setError: form.setError as never }))}>
        <div className="grid gap-2 sm:grid-cols-3">
          <Controller control={form.control} name="enabled" render={({ field }) => <SwitchRow label="Delivery enabled" checked={!!field.value} onCheckedChange={field.onChange} />} />
          <Controller control={form.control} name="pickupEnabled" render={({ field }) => <SwitchRow label="Pickup available" description="Customers collect from the kitchen" checked={!!field.value} onCheckedChange={field.onChange} />} />
          <Controller control={form.control} name="suspended" render={({ field }) => <SwitchRow label="Pause deliveries" description="e.g. heavy rain" checked={!!field.value} onCheckedChange={field.onChange} />} />
        </div>
        {suspended && (
          <Field label="Message while paused" htmlFor="d-smsg" error={e.suspendedMessage?.message}>
            <Input id="d-smsg" {...form.register("suspendedMessage")} />
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Default delivery fee" htmlFor="d-fee" error={e.defaultFee?.message}>
            <RupeeInputWrap>
              <Input id="d-fee" inputMode="decimal" {...form.register("defaultFee")} />
            </RupeeInputWrap>
          </Field>
          <Field label="Minimum order" htmlFor="d-min" error={e.minOrderAmount?.message}>
            <RupeeInputWrap>
              <Input id="d-min" inputMode="decimal" {...form.register("minOrderAmount")} />
            </RupeeInputWrap>
          </Field>
          <Field label="Free delivery above" htmlFor="d-free" error={e.freeDeliveryThreshold?.message} hint="0 = never free">
            <RupeeInputWrap>
              <Input id="d-free" inputMode="decimal" {...form.register("freeDeliveryThreshold")} />
            </RupeeInputWrap>
          </Field>
          <Field label="Delivery time (min)" htmlFor="d-eta" error={e.estimatedDeliveryMinutes?.message}>
            <Input id="d-eta" inputMode="numeric" {...form.register("estimatedDeliveryMinutes")} />
          </Field>
          <Field label="Max distance (km)" htmlFor="d-km" error={e.maxDistanceKm?.message} hint="For your reference; PIN codes decide serviceability.">
            <Input id="d-km" inputMode="numeric" {...form.register("maxDistanceKm")} />
          </Field>
        </div>
        <Button type="submit" className="w-fit" disabled={pending}>
          Save delivery rules
        </Button>
      </form>
    </FormSection>
  );
}

export function ZonesManager({ zones, overlaps }: { zones: AdminDeliveryZone[]; overlaps: { pincode: string; zoneNames: string[] }[] }) {
  const [editing, setEditing] = useState<AdminDeliveryZone | "new" | null>(null);
  const { run } = useAdminAction();
  return (
    <FormSection
      title="Delivery zones"
      description="Only PIN codes listed in an active zone can order delivery. Everything else is shown as not serviceable."
      actions={
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="size-3.5" /> New zone
        </Button>
      }
    >
      {zones.filter((z) => z.isActive).length === 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-gold/30 bg-gold/10 p-3 text-sm text-gold">
          <AlertTriangle className="size-4 shrink-0" /> No active delivery zones — customers can&apos;t place delivery orders until you add at least one.
        </p>
      )}
      {overlaps.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-xs">
          <AlertTriangle className="size-4 shrink-0 text-gold" />
          <span>
            Some PIN codes are in more than one active zone; the zone listed first is used:{" "}
            {overlaps
              .slice(0, 8)
              .map((o) => `${o.pincode} (${o.zoneNames.join(", ")})`)
              .join("; ")}
          </span>
        </p>
      )}
      {zones.length === 0 ? (
        <EmptyState icon={MapPin} title="No delivery zones" description="Group nearby PIN codes into zones with their own fee and delivery time." className="py-8" />
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {zones.map((z) => (
            <li key={z.id} className="grid gap-2 rounded-xl border border-border bg-background/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{z.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Fee {formatINR(z.deliveryFee ?? 0)}
                    {z.minOrderAmount ? ` · Min ${formatINR(z.minOrderAmount)}` : ""}
                    {z.estimatedMinutes ? ` · ~${z.estimatedMinutes} min` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Switch checked={z.isActive !== false} onCheckedChange={(v) => run(() => setDeliveryZoneActiveAction(z.id, !!v), { success: v ? "Zone active" : "Zone paused" })} aria-label={`${z.name} active`} />
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${z.name}`} onClick={() => setEditing(z)}>
                    <Pencil />
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${z.name}`}>
                        <Trash2 className="text-destructive" />
                      </Button>
                    }
                    title={`Delete ${z.name}?`}
                    description="Customers in these PIN codes will no longer be able to order delivery."
                    onConfirm={async () => (await run(() => deleteDeliveryZoneAction(z.id), { success: "Zone deleted" })).ok}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {((z.pincodes ?? []) as string[]).slice(0, 18).map((p) => (
                  <Badge key={p} variant="outline" className="font-mono">
                    {p}
                  </Badge>
                ))}
                {(z.pincodes?.length ?? 0) > 18 && <Badge variant="secondary">+{(z.pincodes?.length ?? 0) - 18}</Badge>}
              </div>
              {(z.areas?.length ?? 0) > 0 && <p className="text-xs text-muted-foreground">{z.areas?.join(", ")}</p>}
            </li>
          ))}
        </ul>
      )}
      {editing && <ZoneDialog zone={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </FormSection>
  );
}

function ZoneDialog({ zone, onClose }: { zone: AdminDeliveryZone | null; onClose: () => void }) {
  const { run, pending } = useAdminAction();
  const form = useForm<DeliveryZoneFormInput>({
    resolver: zodResolver(deliveryZoneInputSchema, undefined, { raw: true }),
    defaultValues: {
      name: zone?.name ?? "",
      pincodes: (zone?.pincodes ?? []).join(", "),
      areas: (zone?.areas ?? []).join(", "),
      deliveryFee: paiseToInput(zone?.deliveryFee ?? 0) || "0",
      minOrderAmount: paiseToInput(zone?.minOrderAmount),
      estimatedMinutes: zone?.estimatedMinutes != null ? String(zone.estimatedMinutes) : "",
      isActive: zone?.isActive ?? true,
      displayOrder: String(zone?.displayOrder ?? 0),
    },
  });
  const e = form.formState.errors;
  const pinText = useWatch({ control: form.control, name: "pincodes" }) ?? "";
  const parsed = parsePincodeList(pinText);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{zone ? `Edit ${zone.name}` : "New delivery zone"}</DialogTitle>
        </DialogHeader>
        <form
          id="zone-form"
          className="grid gap-3"
          onSubmit={form.handleSubmit(async (v) => {
            const res = await run(() => saveDeliveryZoneAction(zone?.id ?? null, v), { success: "Zone saved", setError: form.setError as never });
            if (res.ok) {
              if (res.data?.overlapping?.length) toast.warning(`Also in another zone: ${res.data.overlapping.slice(0, 5).join(", ")}`);
              onClose();
            }
          })}
        >
          <Field label="Zone name" htmlFor="z-name" error={e.name?.message} required>
            <Input id="z-name" {...form.register("name")} placeholder="e.g. Salt Lake & New Town" />
          </Field>
          <Field
            label="PIN codes"
            htmlFor="z-pins"
            error={(e.pincodes as { message?: string } | undefined)?.message}
            hint={`${parsed.valid.length} valid PIN code${parsed.valid.length === 1 ? "" : "s"}${parsed.invalid.length ? ` · invalid: ${parsed.invalid.slice(0, 4).join(", ")}` : ""}`}
            required
          >
            <Textarea id="z-pins" rows={3} className="font-mono" {...form.register("pincodes")} placeholder="700091, 700064, 700106" />
          </Field>
          <Field label="Areas / localities" htmlFor="z-areas" hint="Optional, comma separated — shown to customers.">
            <Input id="z-areas" {...form.register("areas")} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Delivery fee" htmlFor="z-fee" error={e.deliveryFee?.message}>
              <RupeeInputWrap>
                <Input id="z-fee" inputMode="decimal" {...form.register("deliveryFee")} />
              </RupeeInputWrap>
            </Field>
            <Field label="Min order" htmlFor="z-min" error={e.minOrderAmount?.message} hint="Optional">
              <RupeeInputWrap>
                <Input id="z-min" inputMode="decimal" {...form.register("minOrderAmount")} />
              </RupeeInputWrap>
            </Field>
            <Field label="Time (min)" htmlFor="z-eta" error={e.estimatedMinutes?.message} hint="Optional">
              <Input id="z-eta" inputMode="numeric" {...form.register("estimatedMinutes")} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Display order" htmlFor="z-order" error={e.displayOrder?.message}>
              <Input id="z-order" inputMode="numeric" {...form.register("displayOrder")} />
            </Field>
            <Controller control={form.control} name="isActive" render={({ field }) => <SwitchRow label="Active" checked={!!field.value} onCheckedChange={field.onChange} />} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="zone-form" disabled={pending}>
            Save zone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
