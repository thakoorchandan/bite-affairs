"use server";

import { refreshStorefront } from "@/lib/revalidate";
import { CACHE_TAGS } from "@/constants/cache-tags";
import { adminAction } from "./guard";
import { deleteTestimonial, saveTestimonial, updateHomeContent, updateSocialLinks } from "@/services/admin-config.service";
import type { HomeContentFormInput, SocialLinksFormInput, TestimonialFormInput } from "@/lib/validations/admin";

export async function saveHomeContentAction(input: HomeContentFormInput) {
  return adminAction({ action: "content.update", entityType: "websiteContent" }, async () => {
    await updateHomeContent(input);
    await refreshStorefront(CACHE_TAGS.content);
    return { entityId: "home", summary: "Updated website content" };
  });
}

export async function saveSocialLinksAction(input: SocialLinksFormInput) {
  return adminAction({ action: "settings.social", entityType: "businessSettings" }, async () => {
    await updateSocialLinks(input);
    await refreshStorefront(CACHE_TAGS.settings);
    return { summary: "Updated social links" };
  });
}

export async function saveTestimonialAction(id: string | null, input: TestimonialFormInput) {
  return adminAction({ action: id ? "testimonial.update" : "testimonial.create", entityType: "testimonial" }, async () => {
    const res = await saveTestimonial(id, input);
    await refreshStorefront(CACHE_TAGS.content);
    return { data: res, entityId: res.id, summary: `${id ? "Updated" : "Added"} testimonial from ${res.name}` };
  });
}

export async function deleteTestimonialAction(id: string) {
  return adminAction({ action: "testimonial.delete", entityType: "testimonial" }, async () => {
    const res = await deleteTestimonial(id);
    await refreshStorefront(CACHE_TAGS.content);
    return { entityId: id, summary: `Deleted testimonial from ${res.name}` };
  });
}
