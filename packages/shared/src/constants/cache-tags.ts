/**
 * Cache tags for `use cache` data. Admin mutations call `updateTag(TAG)` (Server Actions)
 * or `revalidateTag(TAG, "max")` (Route Handlers) so the storefront reflects changes immediately.
 */
export const CACHE_TAGS = {
  catalog: "catalog",
  settings: "settings",
  hours: "hours",
  content: "content",
  reviews: "reviews",
  bestsellers: "bestsellers",
} as const;
