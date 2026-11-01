"use server";

import { z } from "zod";
import { adminAction } from "./guard";
import { deleteCoupon, saveCoupon, setCouponActive } from "@/services/admin-catalog.service";
import type { CouponFormInput } from "@/lib/validations/admin";

export async function saveCouponAction(id: string | null, input: CouponFormInput) {
  return adminAction({ action: id ? "coupon.update" : "coupon.create", entityType: "coupon" }, async () => {
    const res = await saveCoupon(id, input);
    return { data: res, entityId: res.id, summary: `${id ? "Updated" : "Created"} coupon ${res.code}` };
  });
}

export async function setCouponActiveAction(id: string, isActive: boolean) {
  return adminAction({ action: "coupon.toggle", entityType: "coupon" }, async () => {
    await setCouponActive(id, z.boolean().parse(isActive));
    return { entityId: id, summary: `${isActive ? "Activated" : "Deactivated"} coupon` };
  });
}

export async function deleteCouponAction(id: string) {
  return adminAction<{ deactivated: boolean }>({ action: "coupon.delete", entityType: "coupon" }, async () => {
    const res = await deleteCoupon(id);
    return { data: { deactivated: res.deactivated }, entityId: id, summary: res.deactivated ? `Deactivated used coupon ${res.code}` : `Deleted coupon ${res.code}` };
  });
}
