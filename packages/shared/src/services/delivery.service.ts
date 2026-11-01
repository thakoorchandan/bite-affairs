import { and, arrayContains, asc, eq } from "drizzle-orm";
import { getDb, schema, type BusinessSettingsDoc, type DbOrTx } from "@/db";

export interface Serviceability {
  serviceable: boolean;
  reason?: string;
  zoneId?: string;
  zoneName?: string;
  deliveryFee: number;
  minOrderAmount: number;
  estimatedMinutes: number;
}

/** Decide whether a PIN code can be delivered to, based only on admin-configured zones. */
export async function checkServiceability(pincode: string, settings: BusinessSettingsDoc, tx?: DbOrTx): Promise<Serviceability> {
  const d = settings.delivery;
  const defaults = { deliveryFee: d.defaultFee ?? 0, minOrderAmount: d.minOrderAmount ?? 0, estimatedMinutes: d.estimatedDeliveryMinutes ?? 30 };
  if (d.enabled === false) return { serviceable: false, reason: "We're not offering delivery at the moment.", ...defaults };
  if (d.suspended) return { serviceable: false, reason: d.suspendedMessage || "Deliveries are temporarily paused.", ...defaults };
  if (!/^\d{6}$/.test(pincode)) return { serviceable: false, reason: "Enter a valid 6-digit PIN code.", ...defaults };

  const q = tx ?? (await getDb());
  const { deliveryZones } = schema;
  const [zone] = await q
    .select()
    .from(deliveryZones)
    .where(and(arrayContains(deliveryZones.pincodes, [pincode]), eq(deliveryZones.isActive, true)))
    .orderBy(asc(deliveryZones.displayOrder))
    .limit(1);
  if (!zone) {
    return { serviceable: false, reason: `Sorry, we don't deliver to ${pincode} yet. Try pickup, or contact us to check.`, ...defaults };
  }
  return {
    serviceable: true,
    zoneId: zone.id,
    zoneName: zone.name,
    deliveryFee: zone.deliveryFee ?? defaults.deliveryFee,
    minOrderAmount: Math.max(defaults.minOrderAmount, zone.minOrderAmount ?? 0),
    estimatedMinutes: zone.estimatedMinutes ?? defaults.estimatedMinutes,
  };
}
