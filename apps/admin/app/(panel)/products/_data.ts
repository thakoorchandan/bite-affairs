import { asc, count, eq, getDb, schema } from "@/db";

/** Options for the product form's category and customisation pickers. */
export async function getProductFormOptions() {
  const db = await getDb();
  const [categories, groups] = await Promise.all([
    db.select({ id: schema.categories.id, name: schema.categories.name }).from(schema.categories).orderBy(asc(schema.categories.displayOrder)),
    db
      .select({ id: schema.customisationGroups.id, name: schema.customisationGroups.name, internalName: schema.customisationGroups.internalName, optionCount: count(schema.customisationOptions.id) })
      .from(schema.customisationGroups)
      .leftJoin(schema.customisationOptions, eq(schema.customisationOptions.groupId, schema.customisationGroups.id))
      .groupBy(schema.customisationGroups.id)
      .orderBy(asc(schema.customisationGroups.name)),
  ]);
  return { categories, groups: groups.map((g) => ({ ...g, internalName: g.internalName ?? null })) };
}
