/** Stable identity for a cart line (same product + same selections + same notes = same line). Client-safe. */
export function lineKey(item: { productId: string; selections?: { groupId: string; optionIds: string[] }[]; notes?: string }): string {
  const sel = [...(item.selections ?? [])]
    .map((s) => `${s.groupId}:${[...s.optionIds].sort().join(",")}`)
    .sort()
    .join("|");
  return `${item.productId}#${sel}#${(item.notes ?? "").trim().toLowerCase()}`;
}
