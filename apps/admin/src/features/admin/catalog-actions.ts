"use server";

import { refreshStorefront } from "@/lib/revalidate";
import { z } from "zod";
import { CACHE_TAGS } from "@/constants/cache-tags";
import { adminAction } from "./guard";
import * as catalog from "@/services/admin-catalog.service";
import type { CategoryFormInput, CustomisationGroupFormInput, ProductCostFormInput, ProductFormInput } from "@/lib/validations/admin";

const idList = z.array(z.string().uuid()).max(500);

async function refreshCatalog(slug?: string) {
  await refreshStorefront(CACHE_TAGS.catalog);
  if (slug) await refreshStorefront(`product:${slug}`);
}

// Categories
export async function saveCategoryAction(id: string | null, input: CategoryFormInput) {
  return adminAction({ action: id ? "category.update" : "category.create", entityType: "category" }, async () => {
    const res = await catalog.saveCategory(id, input);
    await refreshCatalog();
    await refreshStorefront(CACHE_TAGS.content);
    return { data: res, entityId: res.id, summary: `${id ? "Updated" : "Created"} category ${res.name}` };
  });
}

export async function setCategoryActiveAction(id: string, isActive: boolean) {
  return adminAction({ action: "category.toggle", entityType: "category" }, async () => {
    await catalog.setCategoryActive(id, z.boolean().parse(isActive));
    await refreshCatalog();
    return { entityId: id, summary: `${isActive ? "Enabled" : "Disabled"} category` };
  });
}

export async function deleteCategoryAction(id: string, moveProductsTo?: string | null) {
  return adminAction({ action: "category.delete", entityType: "category" }, async () => {
    const res = await catalog.deleteCategory(id, moveProductsTo);
    await refreshCatalog();
    await refreshStorefront(CACHE_TAGS.content);
    return { data: res, entityId: id, summary: `Deleted category ${res.name}${res.moved ? ` (moved ${res.moved} products)` : ""}` };
  });
}

export async function reorderCategoriesAction(ids: string[]) {
  return adminAction({ action: "category.reorder", entityType: "category" }, async () => {
    await catalog.reorderCategories(idList.parse(ids));
    await refreshCatalog();
    return { summary: "Reordered categories" };
  });
}

// Products
export async function saveProductAction(id: string | null, input: ProductFormInput) {
  return adminAction({ action: id ? "product.update" : "product.create", entityType: "product" }, async () => {
    const res = await catalog.saveProduct(id, input);
    await refreshCatalog(res.slug);
    return { data: res, entityId: res.id, summary: `${id ? "Updated" : "Created"} product ${res.name}` };
  });
}

export async function patchProductAction(id: string, patch: Record<string, unknown>) {
  return adminAction({ action: "product.patch", entityType: "product" }, async () => {
    const res = await catalog.patchProduct(id, patch);
    await refreshCatalog();
    return { entityId: id, summary: `Updated ${res.name}: ${Object.keys(patch).join(", ")}`, metadata: patch };
  });
}

export async function duplicateProductAction(id: string) {
  return adminAction({ action: "product.duplicate", entityType: "product" }, async () => {
    const res = await catalog.duplicateProduct(id);
    await refreshCatalog();
    return { data: res, entityId: res.id, summary: `Duplicated product as ${res.name}` };
  });
}

export async function deleteProductAction(id: string) {
  return adminAction({ action: "product.delete", entityType: "product" }, async () => {
    const res = await catalog.deleteProduct(id);
    await refreshCatalog();
    await refreshStorefront(CACHE_TAGS.content);
    await refreshStorefront(CACHE_TAGS.bestsellers);
    return { entityId: id, summary: `Deleted product ${res.name}` };
  });
}

export async function reorderProductsAction(ids: string[]) {
  return adminAction({ action: "product.reorder", entityType: "product" }, async () => {
    await catalog.reorderProducts(idList.parse(ids));
    await refreshCatalog();
    return { summary: "Reordered products" };
  });
}

export async function saveProductCostAction(productId: string, input: ProductCostFormInput) {
  return adminAction({ action: "product.cost", entityType: "product" }, async (admin) => {
    await catalog.saveProductCost(productId, input, admin.id);
    return { entityId: productId, summary: "Updated product cost estimate" };
  });
}

// Customisation groups
export async function saveCustomisationGroupAction(id: string | null, input: CustomisationGroupFormInput) {
  return adminAction({ action: id ? "customisation.update" : "customisation.create", entityType: "customisationGroup" }, async () => {
    const res = await catalog.saveCustomisationGroup(id, input);
    await refreshCatalog();
    return { data: res, entityId: res.id, summary: `${id ? "Updated" : "Created"} customisation group ${res.name}` };
  });
}

export async function deleteCustomisationGroupAction(id: string) {
  return adminAction({ action: "customisation.delete", entityType: "customisationGroup" }, async () => {
    const res = await catalog.deleteCustomisationGroup(id);
    await refreshCatalog();
    return { entityId: id, summary: `Deleted customisation group ${res.name} (removed from ${res.detachedFrom} products)` };
  });
}
