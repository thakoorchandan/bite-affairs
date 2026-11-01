import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import { closeDb, getDb, schema } from "@/db";
import { friesWithPeriPeri, product, resetDatabase } from "./helpers";

beforeAll(resetDatabase);
afterAll(() => closeDb());

describe("seed (the real menu from the poster)", () => {
  it("imports 10 categories and 33 products at the poster's prices", async () => {
    const db = await getDb();
    expect((await db.select({ n: count() }).from(schema.categories))[0].n).toBe(10);
    expect((await db.select({ n: count() }).from(schema.products))[0].n).toBe(33);
    expect((await product("chicken-seekh-kabab")).price).toBe(29500);
    expect((await product("spicy-masala-maggi")).price).toBe(8600);
    const { optionId } = await friesWithPeriPeri();
    const [opt] = await db.select().from(schema.customisationOptions).where(eq(schema.customisationOptions.id, optionId));
    expect(opt.priceDelta).toBe(1700);
  });

  it("is idempotent", async () => {
    const { seed } = await import("../../scripts/seed");
    await seed({ quiet: true });
    const db = await getDb();
    expect((await db.select({ n: count() }).from(schema.products))[0].n).toBe(33);
  });
});
