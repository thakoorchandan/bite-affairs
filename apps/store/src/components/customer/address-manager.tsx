"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { SavedAddress } from "@/services/account.service";
import { deleteAddressAction, saveAddressAction, setDefaultAddressAction } from "@/features/account/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/shared/empty-state";

type FormState = { label: string; recipientName: string; phone: string; houseNumber: string; street: string; landmark: string; city: string; pincode: string; instructions: string; isDefault: boolean };

export function AddressManager({ addresses, defaults }: { addresses: SavedAddress[]; defaults: { name: string; phone: string; city: string } }) {
  const router = useRouter();
  const [editing, setEditing] = useState<SavedAddress | "new" | null>(null);
  const [deleting, setDeleting] = useState<SavedAddress | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const blank: FormState = { label: "Home", recipientName: defaults.name, phone: defaults.phone, houseNumber: "", street: "", landmark: "", city: defaults.city, pincode: "", instructions: "", isDefault: addresses.length === 0 };
  const [form, setForm] = useState<FormState>(blank);

  const openEdit = (a: SavedAddress | "new") => {
    setErrors({});
    setForm(
      a === "new"
        ? blank
        : { label: a.label ?? "Home", recipientName: a.recipientName, phone: a.phone, houseNumber: a.houseNumber, street: a.street, landmark: a.landmark ?? "", city: a.city, pincode: a.pincode, instructions: a.instructions ?? "", isDefault: !!a.isDefault },
    );
    setEditing(a);
  };

  const save = async () => {
    setBusy(true);
    const res = await saveAddressAction({ id: editing && editing !== "new" ? editing.id : undefined, data: form });
    setBusy(false);
    if (!res.ok) {
      const fe: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.fieldErrors ?? {})) if (v?.[0]) fe[k] = v[0];
      setErrors(fe);
      return void toast.error(res.error);
    }
    toast.success("Address saved");
    setEditing(null);
    router.refresh();
  };

  const fields: [keyof FormState, string, string?][] = [
    ["label", "Label (Home, Work…)"],
    ["recipientName", "Recipient name", "name"],
    ["phone", "Mobile number", "tel-national"],
    ["houseNumber", "House / flat no.", "address-line1"],
    ["street", "Street / locality", "address-line2"],
    ["landmark", "Landmark (optional)"],
    ["city", "City", "address-level2"],
    ["pincode", "PIN code", "postal-code"],
    ["instructions", "Delivery instructions (optional)"],
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Saved addresses</h2>
        <Button className="rounded-full" onClick={() => openEdit("new")} disabled={addresses.length >= 10}>
          <Plus className="size-4" /> Add address
        </Button>
      </div>
      {addresses.length === 0 ? (
        <EmptyState icon={MapPin} title="No saved addresses" description="Save your home or office for one-tap checkout." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          <AnimatePresence initial={false}>
            {addresses.map((a) => (
              <motion.li key={a.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-[1.5rem] border border-border bg-card p-5 text-sm">
                <div className="mb-2 flex items-center gap-2">
                  <MapPin className="size-4 text-gold" />
                  <span className="font-bold">{a.label}</span>
                  {a.isDefault && <span className="rounded bg-gold/20 px-1.5 text-[10px] font-bold text-gold">DEFAULT</span>}
                </div>
                <p className="text-muted-foreground">
                  {a.recipientName} · +91 {a.phone}
                  <br />
                  {a.houseNumber}, {a.street}
                  {a.landmark ? `, ${a.landmark}` : ""}
                  <br />
                  {a.city} – {a.pincode}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => openEdit(a)}>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  {!a.isDefault && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full"
                      onClick={async () => {
                        const res = await setDefaultAddressAction(a.id);
                        if (!res.ok) return void toast.error(res.error);
                        router.refresh();
                      }}
                    >
                      <Star className="size-3.5" /> Make default
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="rounded-full text-destructive" onClick={() => setDeleting(a)}>
                    <Trash2 className="size-3.5" /> Delete
                  </Button>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add address" : "Edit address"}</DialogTitle>
            <DialogDescription>We check delivery availability for your PIN code at checkout.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {fields.map(([key, label, ac]) => (
              <div key={key} className={key === "instructions" || key === "street" ? "grid gap-1.5 sm:col-span-2" : "grid gap-1.5"}>
                <Label htmlFor={`a-${key}`}>{label}</Label>
                <Input
                  id={`a-${key}`}
                  autoComplete={ac}
                  value={form[key] as string}
                  onChange={(e) => setForm({ ...form, [key]: key === "pincode" ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value })}
                  aria-invalid={!!errors[key]}
                  className="h-10 rounded-xl"
                />
                {errors[key] && <p className="text-xs font-semibold text-destructive">{errors[key]}</p>}
              </div>
            ))}
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox checked={form.isDefault} onCheckedChange={(v) => setForm({ ...form, isDefault: !!v })} /> Set as default address
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy} className="rounded-full">
                {busy && <Loader2 className="size-4 animate-spin" />} Save address
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this address?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.label}: {deleting?.houseNumber}, {deleting?.street}. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!deleting) return;
                const res = await deleteAddressAction(deleting.id);
                setDeleting(null);
                if (!res.ok) return void toast.error(res.error);
                toast.success("Address deleted");
                router.refresh();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
