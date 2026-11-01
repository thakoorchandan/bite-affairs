"use server";

import { refreshStorefront } from "@/lib/revalidate";
import { z } from "zod";
import { CACHE_TAGS } from "@/constants/cache-tags";
import { adminAction } from "./guard";
import { setKitchenMode, updateBusinessHours, updateKitchenControl } from "@/services/admin-config.service";
import type { BusinessHoursFormInput, KitchenControlFormInput } from "@/lib/validations/admin";

async function refresh() {
  await refreshStorefront(CACHE_TAGS.settings);
  await refreshStorefront(CACHE_TAGS.hours);
}

export async function saveKitchenControlAction(input: KitchenControlFormInput) {
  return adminAction({ action: "kitchen.update", entityType: "businessSettings" }, async () => {
    const res = await updateKitchenControl(input);
    await refresh();
    return { summary: `Updated kitchen settings${res.temporaryClosureActive ? " (temporary closure on)" : ""}` };
  });
}

export async function setKitchenModeAction(mode: "AUTO" | "OPEN" | "CLOSED" | "PAUSED", pauseMinutes?: number) {
  return adminAction({ action: "kitchen.mode", entityType: "businessSettings" }, async () => {
    const m = z.enum(["AUTO", "OPEN", "CLOSED", "PAUSED"]).parse(mode);
    await setKitchenMode(m, z.number().int().min(0).max(1440).optional().parse(pauseMinutes));
    await refresh();
    return { summary: `Kitchen set to ${m}${pauseMinutes ? ` for ${pauseMinutes} min` : ""}` };
  });
}

export async function saveBusinessHoursAction(input: BusinessHoursFormInput) {
  return adminAction({ action: "hours.update", entityType: "businessHours" }, async () => {
    await updateBusinessHours(input);
    await refresh();
    return { summary: "Updated business hours" };
  });
}
