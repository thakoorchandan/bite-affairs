"use server";

import { z } from "zod";
import { adminAction } from "./guard";
import { markAdminNotificationsRead } from "@/services/admin-orders.service";
import { uuid } from "@/lib/validations/common";

export async function markNotificationsReadAction(input: { ids?: string[]; all?: boolean }) {
  return adminAction<{ updated: number }>({ action: "notifications.read", entityType: "notification", audit: false }, async () => {
    const ids = z.array(uuid).max(200).optional().parse(input.ids);
    const updated = await markAdminNotificationsRead(input.all ? "all" : (ids ?? []));
    return { data: { updated } };
  });
}
