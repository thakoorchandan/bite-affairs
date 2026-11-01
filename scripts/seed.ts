/**
 * Seeds the database with the real Bite Affairs menu and default settings.
 * Idempotent: existing records are left untouched unless --reset-menu is passed.
 *
 *   npm run seed                   # insert anything missing
 *   npm run seed -- --reset-menu   # overwrite menu names/prices/images from seed-data.ts
 */
import "./_env";
import { and, eq } from "drizzle-orm";
import { closeDb, DEFAULT_WEEKLY_HOURS, getDb, schema, type Db } from "@/db";
import { slugify } from "@/lib/utilities/slug";
import { SEED_ADD_ON_GROUPS, SEED_MENU } from "./seed-data";

const { categories, products, customisationGroups, customisationOptions, productCustomisationGroups, businessSettings, businessHours, websiteContent } = schema;

export async function seed({ resetMenu = false, quiet = false, db: given }: { resetMenu?: boolean; quiet?: boolean; db?: Db } = {}) {
  const db = given ?? (await getDb());
  const log = (...args: unknown[]) => !quiet && console.log(...args);

  // Add-on groups (matched by internal name)
  const groupIds: Record<string, string> = {};
  for (const [key, g] of Object.entries(SEED_ADD_ON_GROUPS)) {
    const [existing] = await db.select({ id: customisationGroups.id }).from(customisationGroups).where(eq(customisationGroups.internalName, g.internalName)).limit(1);
    if (existing) {
      groupIds[key] = existing.id;
      continue;
    }
    const [created] = await db
      .insert(customisationGroups)
      .values({ name: g.name, internalName: g.internalName, selectionType: g.selectionType, isRequired: g.isRequired, minSelect: g.minSelect, maxSelect: g.maxSelect })
      .returning({ id: customisationGroups.id });
    await db.insert(customisationOptions).values(g.options.map((o, i) => ({ groupId: created.id, name: o.name, priceDelta: o.price * 100, isVeg: o.isVeg, position: i })));
    groupIds[key] = created.id;
  }

  let categoriesCreated = 0;
  let productsCreated = 0;
  for (const [ci, cat] of SEED_MENU.entries()) {
    const catFields = { name: cat.name, description: cat.description, image: { url: cat.image, alt: cat.name }, displayOrder: ci, isActive: true };
    const [existingCat] = await db.select().from(categories).where(eq(categories.slug, cat.slug)).limit(1);
    let categoryId: string;
    if (existingCat) {
      categoryId = existingCat.id;
      if (resetMenu) await db.update(categories).set(catFields).where(eq(categories.id, categoryId));
    } else {
      [{ id: categoryId }] = await db.insert(categories).values({ slug: cat.slug, ...catFields }).returning({ id: categories.id });
      categoriesCreated++;
    }

    for (const [pi, p] of cat.products.entries()) {
      const slug = slugify(p.name);
      const fields = {
        name: p.name,
        categoryId,
        price: p.price * 100,
        isVeg: p.isVeg,
        shortDescription: p.shortDescription,
        servingInfo: p.servingInfo,
        displayOrder: pi,
        isFeatured: !!p.isFeatured,
        ...(p.image ? { image: { url: p.image, alt: p.name } } : {}),
      };
      const [existing] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug)).limit(1);
      let productId = existing?.id;
      if (!existing) {
        [{ id: productId }] = await db.insert(products).values({ slug, isActive: true, isAvailable: true, preparationMinutes: 15, ...fields }).returning({ id: products.id });
        productsCreated++;
      } else if (resetMenu) {
        await db.update(products).set(fields).where(eq(products.id, productId));
      }
      if (p.addOnGroup && (!existing || resetMenu)) {
        await db.insert(productCustomisationGroups).values({ productId, groupId: groupIds[p.addOnGroup], position: 0 }).onConflictDoNothing();
      }
    }
  }

  await db.insert(businessSettings).values({ key: "default" }).onConflictDoNothing();
  await db.insert(businessHours).values({ key: "default", weekly: DEFAULT_WEEKLY_HOURS, specialDates: [] }).onConflictDoNothing();

  const [combos] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, "special-combos")).limit(1);
  await db
    .insert(websiteContent)
    .values({
      key: "home",
      data: {
        combos: { categoryId: combos?.id ?? null },
        hero: {
          images: [
            { url: "/images/menu/pizza.webp", alt: "Bite Affairs loaded pizza" },
            { url: "/images/menu/momos.webp", alt: "Bite Affairs steamed momos" },
            { url: "/images/menu/combo-noodles.webp", alt: "Bite Affairs chicken noodles combo" },
          ],
        },
        gallery: ["sandwiches", "burgers", "maggi", "pasta", "dry-bites", "fries", "mexican-chicken-wrap", "combo-fried-rice"].map((n) => ({ url: `/images/menu/${n}.webp`, alt: n.replaceAll("-", " ") })),
      },
    })
    .onConflictDoNothing();

  log(`Seed complete: ${categoriesCreated} categories and ${productsCreated} products created${resetMenu ? " (menu reset)" : ""}.`);
}

if (process.argv[1]?.includes("seed.ts") || process.argv[1]?.endsWith("/seed")) {
  seed({ resetMenu: process.argv.includes("--reset-menu") })
    .then(() => closeDb())
    .catch(async (error) => {
      console.error(error);
      await closeDb();
      process.exit(1);
    });
}
