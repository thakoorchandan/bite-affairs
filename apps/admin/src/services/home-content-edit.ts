import { eq } from "drizzle-orm";
import { getDb, schema, type DbOrTx } from "@/db";

/**
 * Read-modify-write helper for the `website_content.data` JSON singleton, used when other admin operations
 * (deleting a category/product/media file) must remove or rewrite references stored inside it.
 * `mutate` receives a mutable clone and returns true when it changed something.
 */
export async function editHomeContentData(tx: DbOrTx | undefined, mutate: (data: Record<string, unknown>) => boolean): Promise<boolean> {
  const db = tx ?? (await getDb());
  const [row] = await db.select({ data: schema.websiteContent.data }).from(schema.websiteContent).where(eq(schema.websiteContent.key, "home")).for("update").limit(1);
  if (!row) return false;
  const data = structuredClone(row.data ?? {}) as Record<string, unknown>;
  if (!mutate(data)) return false;
  await db.update(schema.websiteContent).set({ data }).where(eq(schema.websiteContent.key, "home"));
  return true;
}
