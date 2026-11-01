"use server";

import { refreshStorefront } from "@/lib/revalidate";
import { z } from "zod";
import { CACHE_TAGS } from "@/constants/cache-tags";
import { adminAction } from "./guard";
import { deleteDeliveryZone, saveDeliveryZone, setDeliveryZoneActive, updateDeliverySettings } from "@/services/admin-config.service";
import type { DeliverySettingsFormInput, DeliveryZoneFormInput } from "@/lib/validations/admin";

export async function saveDeliverySettingsAction(input: DeliverySettingsFormInput) {
  return adminAction({ action: "delivery.settings", entityType: "businessSettings" }, async () => {
    await updateDeliverySettings(input);
    await refreshStorefront(CACHE_TAGS.settings);
    return { summary: "Updated delivery settings" };
  });
}

export async function saveDeliveryZoneAction(id: string | null, input: DeliveryZoneFormInput) {
  return adminAction<{ id: string; overlapping: string[] }>({ action: id ? "zone.update" : "zone.create", entityType: "deliveryZone" }, async () => {
    const res = await saveDeliveryZone(id, input);
    await refreshStorefront(CACHE_TAGS.settings);
    return { data: { id: res.id, overlapping: res.overlapping }, entityId: res.id, summary: `${id ? "Updated" : "Created"} delivery zone ${res.name}` };
  });
}

export async function setDeliveryZoneActiveAction(id: string, isActive: boolean) {
  return adminAction({ action: "zone.toggle", entityType: "deliveryZone" }, async () => {
    await setDeliveryZoneActive(id, z.boolean().parse(isActive));
    await refreshStorefront(CACHE_TAGS.settings);
    return { entityId: id, summary: `${isActive ? "Activated" : "Deactivated"} delivery zone` };
  });
}

export async function deleteDeliveryZoneAction(id: string) {
  return adminAction({ action: "zone.delete", entityType: "deliveryZone" }, async () => {
    const res = await deleteDeliveryZone(id);
    await refreshStorefront(CACHE_TAGS.settings);
    return { entityId: id, summary: `Deleted delivery zone ${res.name}` };
  });
}
