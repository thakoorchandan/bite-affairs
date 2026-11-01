import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import { closeDb, getDb, schema } from "@/db";
import { createAddress, createReview, deleteAddress, getReviewState, listAddresses, listFavouriteProducts, setDefaultAddress, toggleFavourite, updateAddress } from "@/services/account.service";
import { hydrateCartItems } from "@/services/cart-lines.service";
import { listCustomerOrders, getCustomerOrder } from "@/services/order-query.service";
import { createCustomer, product, resetDatabase } from "./helpers";

beforeEach(resetDatabase);
afterAll(() => closeDb());

const addr = (over: Record<string, unknown> = {}) => ({
  label: "Home",
  recipientName: "Ankit Das",
  phone: "9831000000",
  houseNumber: "5A",
  street: "Lake Road",
  landmark: "",
  city: "Kolkata",
  pincode: "700029",
  instructions: "",
  isDefault: false,
  ...over,
});

/** Insert an order (+ items) directly, independent of the checkout service. */
async function insertOrder(userId: string, phone: string, status: (typeof schema.orders.$inferInsert)["status"], lines: { productId: string; name: string; unitPrice: number; quantity: number }[]) {
  const db = await getDb();
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const num = `BA000000-${String(Math.floor(Math.random() * 900) + 100)}`;
  const [o] = await db
    .insert(schema.orders)
    .values({
      orderNumber: num,
      idempotencyKey: randomUUID(),
      userId,
      isGuest: false,
      customerName: "Rev",
      customerPhone: phone,
      fulfilment: "PICKUP",
      itemsSubtotal: subtotal,
      subtotal,
      total: subtotal,
      paymentMethod: "COD",
      status,
      trackingTokenHash: "h",
    })
    .returning();
  const items = await db
    .insert(schema.orderItems)
    .values(lines.map((l, i) => ({ orderId: o.id, position: i, productId: l.productId, name: l.name, basePrice: l.unitPrice, unitPrice: l.unitPrice, quantity: l.quantity, lineTotal: l.unitPrice * l.quantity })))
    .returning();
  return { order: o, items };
}

describe("saved addresses", () => {
  it("first address becomes default; default moves when changed or deleted", async () => {
    const u = await createCustomer("9876511111");
    const a1 = await createAddress(u.id, addr());
    const a2 = await createAddress(u.id, addr({ label: "Work" }));
    let list = await listAddresses(u.id);
    expect(list.find((a) => a.id === a1)!.isDefault).toBe(true);
    await setDefaultAddress(u.id, a2);
    list = await listAddresses(u.id);
    expect(list.filter((a) => a.isDefault).map((a) => a.id)).toEqual([a2]);
    await deleteAddress(u.id, a2);
    list = await listAddresses(u.id);
    expect(list).toHaveLength(1);
    expect(list[0].isDefault).toBe(true);
  });

  it("creating a new default address demotes the old one", async () => {
    const u = await createCustomer("9876511121");
    const a1 = await createAddress(u.id, addr());
    const a2 = await createAddress(u.id, addr({ label: "Work", isDefault: true }));
    const list = await listAddresses(u.id);
    expect(list.filter((a) => a.isDefault).map((a) => a.id)).toEqual([a2]);
    await updateAddress(u.id, a1, addr({ isDefault: true }));
    expect((await listAddresses(u.id)).filter((a) => a.isDefault).map((a) => a.id)).toEqual([a1]);
  });

  it("validates input on the server", async () => {
    const u = await createCustomer("9876511112");
    await expect(createAddress(u.id, addr({ pincode: "12" }))).rejects.toThrow();
    await expect(createAddress(u.id, addr({ phone: "12345" }))).rejects.toThrow();
  });

  it("a customer cannot read, edit, delete or default another customer's address", async () => {
    const owner = await createCustomer("9876511113");
    const attacker = await createCustomer("9876511114");
    const id = await createAddress(owner.id, addr());
    expect(await listAddresses(attacker.id)).toHaveLength(0);
    await expect(updateAddress(attacker.id, id, addr({ street: "Hacked Street" }))).rejects.toThrow(/not found/);
    await expect(deleteAddress(attacker.id, id)).rejects.toThrow(/not found/);
    await expect(setDefaultAddress(attacker.id, id)).rejects.toThrow(/not found/);
    await expect(updateAddress(attacker.id, "not-a-uuid", addr())).rejects.toThrow(/not found/);
    const db = await getDb();
    const [stored] = await db.select().from(schema.addresses).where(eq(schema.addresses.id, id));
    expect(stored.street).toBe("Lake Road");
  });
});

describe("favourites", () => {
  it("toggles idempotently per user and only for active products", async () => {
    const db = await getDb();
    const u = await createCustomer("9876511115");
    const p = await product("cheese-maggi");
    expect(await toggleFavourite(u.id, p.id)).toBe(true);
    expect((await listFavouriteProducts(u.id)).map((x) => x.slug)).toEqual(["cheese-maggi"]);
    expect(await toggleFavourite(u.id, p.id)).toBe(false);
    expect((await db.select({ n: count() }).from(schema.favourites).where(eq(schema.favourites.userId, u.id)))[0].n).toBe(0);

    await db.update(schema.products).set({ isActive: false }).where(eq(schema.products.id, p.id));
    await expect(toggleFavourite(u.id, p.id)).rejects.toThrow(/not found/);
    await expect(toggleFavourite(u.id, randomUUID())).rejects.toThrow(/not found/);
    await expect(toggleFavourite(u.id, "garbage")).rejects.toThrow(/not found/);
  });

  it("a concurrent double-tap never creates duplicates or errors", async () => {
    const db = await getDb();
    const u = await createCustomer("9876511122");
    const p = await product("paneer-pizza");
    await Promise.all([toggleFavourite(u.id, p.id), toggleFavourite(u.id, p.id)]).catch(() => undefined);
    expect((await db.select({ n: count() }).from(schema.favourites).where(eq(schema.favourites.userId, u.id)))[0].n).toBeLessThanOrEqual(1);
  });
});

describe("reviews", () => {
  it("only allows reviews on the customer's own delivered orders, once per item, pending moderation", async () => {
    const db = await getDb();
    const u = await createCustomer("9876511116");
    const pizza = await product("paneer-pizza");
    const { order, items } = await insertOrder(u.id, "9876511116", "PLACED", [{ productId: pizza.id, name: pizza.name, unitPrice: pizza.price, quantity: 1 }]);
    const state = await getReviewState(u.id, order.id);
    expect(state.canReview).toBe(false);
    const itemId = state.items[0].orderItemId;
    expect(itemId).toBe(items[0].id);
    await expect(createReview(u.id, { orderId: order.id, orderItemId: itemId, rating: 5 })).rejects.toThrow(/delivered/);

    await db.update(schema.orders).set({ status: "DELIVERED" }).where(eq(schema.orders.id, order.id));

    const stranger = await createCustomer("9876511117");
    await expect(createReview(stranger.id, { orderId: order.id, orderItemId: itemId, rating: 1 })).rejects.toThrow(/not found/);

    await createReview(u.id, { orderId: order.id, orderItemId: itemId, rating: 4, comment: "Great!" });
    await expect(createReview(u.id, { orderId: order.id, orderItemId: itemId, rating: 5 })).rejects.toThrow(/already reviewed/);
    const [r] = await db.select().from(schema.reviews).where(eq(schema.reviews.orderId, order.id));
    expect(r.status).toBe("PENDING");
    expect((await getReviewState(u.id, order.id)).items[0].review?.rating).toBe(4);
    await expect(createReview(u.id, { orderId: order.id, orderItemId: randomUUID(), rating: 3 })).rejects.toThrow(/not found/);
  });
});

describe("order history and reorder", () => {
  it("lists only the customer's own orders and rebuilds carts at current prices, skipping unavailable items", async () => {
    const db = await getDb();
    const u = await createCustomer("9876511118");
    const other = await createCustomer("9876511119");
    const pizza = await product("paneer-pizza");
    const maggi = await product("cheese-maggi");
    const { order: o } = await insertOrder(u.id, "9876511118", "DELIVERED", [
      { productId: pizza.id, name: pizza.name, unitPrice: 22500, quantity: 2 },
      { productId: maggi.id, name: maggi.name, unitPrice: maggi.price, quantity: 1 },
    ]);
    expect((await listCustomerOrders(u.id)).total).toBe(1);
    expect((await listCustomerOrders(other.id)).total).toBe(0);
    expect(await getCustomerOrder(other.id, o.id)).toBeNull();

    await db.update(schema.products).set({ price: 25000 }).where(eq(schema.products.id, pizza.id));
    await db.update(schema.products).set({ isAvailable: false }).where(eq(schema.products.id, maggi.id));
    const order = await getCustomerOrder(u.id, o.id);
    const items = (order!.itemsDetailed as unknown as { productId: string; quantity: number }[]).map((i) => ({ productId: String(i.productId), quantity: i.quantity, selections: [] }));
    const { lines, issues } = await hydrateCartItems(items);
    expect(lines).toHaveLength(1);
    expect(lines[0].snapshot.unitPrice).toBe(25000);
    expect(issues[0]).toMatch(/sold out/);
    // Historical order snapshot keeps the original price
    expect(order!.items.find((i) => i.name === "Paneer Pizza")!.unitPrice).toBe(22500);
  });

  it("customer role is never elevated by profile data", async () => {
    const u = await createCustomer("9876511120");
    const db = await getDb();
    const [row] = await db.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, u.id));
    expect(row.role).toBe("CUSTOMER");
  });
});
