/**
 * SAMPLE data for local demos only (`npm run demo`). Everything here is fictional and is
 * written into a throwaway local database (PGlite) — never into production. The menu itself is the
 * real seed (scripts/seed-data.ts); only customers, orders, reviews, expenses etc. are mock.
 */
import "./_env";
import { getDb, schema, eq, and, sql, desc, asc, gte, inArray, type Db } from "@/db";
import { hashPassword } from "@/lib/security/password";
import { computeTotals, priceLines, type PricingGroup, type PricingProduct } from "@/services/pricing";
import { getZonedParts } from "@/lib/utilities/time";
import { deriveTrackingToken } from "@/services/order.service";
import { sha256 } from "@/lib/security/tokens";
import type { OrderStatus } from "@/constants/domain";

const {
  addresses, businessSettings, categories, counters, couponRedemptions, coupons, customisationGroups, customisationOptions, deliveryZones, expenses, favourites,
  notifications, orderItems, orderStatusHistory, orders, payments, productCosts, productCustomisationGroups, products, reviews, testimonials, users, websiteContent,
} = schema;

export const DEMO_ADMIN = { email: "admin@demo.biteaffairs.local", password: "Admin12345" };
export const DEMO_CUSTOMER = { phone: "9830000001", email: "riya@demo.biteaffairs.local", password: "Demo12345" };

// Deterministic pseudo-random so every demo run looks the same.
let seedState = 20261031;
function rand() {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));

const FIRST = ["Riya", "Arjun", "Ananya", "Sourav", "Priya", "Rahul", "Ishita", "Debanjan", "Sneha", "Aritra", "Megha", "Rohit", "Tanya", "Subham", "Puja", "Kunal", "Sayan", "Nikita", "Abhishek", "Moumita"];
const LAST = ["Sen", "Das", "Ghosh", "Banerjee", "Mukherjee", "Chatterjee", "Bose", "Roy", "Dutta", "Saha", "Paul", "Mitra"];
const ZONES = [
  { name: "Park Street & Camac Street", pincodes: ["700016", "700017"], fee: 3000, eta: 25, streets: ["Park Street", "Camac Street", "Elliot Road", "Rawdon Street"] },
  { name: "Ballygunge & Gariahat", pincodes: ["700019", "700029"], fee: 4000, eta: 35, streets: ["Gariahat Road", "Ballygunge Circular Road", "Hindustan Park", "Lake Road"] },
  { name: "Bhowanipore & Kalighat", pincodes: ["700020", "700025", "700026"], fee: 3500, eta: 30, streets: ["Harish Mukherjee Road", "Sarat Bose Road", "Kalighat Road", "Ashutosh Mukherjee Road"] },
];
const LANDMARKS = ["Near the metro station", "Opposite the pharmacy", "Next to the park", "Behind the bank", "", ""];
const INSTRUCTIONS = ["Call on arrival", "Please ring the bell twice", "Leave with the security guard", "", "", ""];
const NOTES = ["Less spicy please", "Extra chutney", "No onions", "", "", "", ""];

/** Hourly order weights (IST) — lunch and dinner peaks. */
const HOUR_WEIGHTS: [number, number][] = [
  [11, 2], [12, 6], [13, 9], [14, 6], [15, 3], [16, 3], [17, 4], [18, 6], [19, 9], [20, 12], [21, 10], [22, 5],
];
function pickHour() {
  const total = HOUR_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [h, w] of HOUR_WEIGHTS) if ((r -= w) <= 0) return h;
  return 20;
}

/** A Date for `daysAgo` days back at an IST wall-clock hour/minute. */
function istDate(daysAgo: number, hour: number, minute: number) {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  const p = getZonedParts(d, "Asia/Kolkata");
  return new Date(Date.UTC(p.year, p.month - 1, p.day, hour, minute) - 330 * 60_000);
}

export async function loadDemoData(given?: Db) {
  const db = given ?? (await getDb());
  const productRows = await db.select().from(products);
  const categoryRows = await db.select().from(categories);
  const groupRows = await db.select().from(customisationGroups).orderBy(asc(customisationGroups.createdAt), asc(customisationGroups.name));
  const optionRows = await db.select().from(customisationOptions).orderBy(asc(customisationOptions.position));
  const linkRows = await db.select().from(productCustomisationGroups).orderBy(asc(productCustomisationGroups.position));
  const catById = new Map(categoryRows.map((c) => [c.id, c]));
  const groupIdsByProduct = new Map<string, string[]>();
  for (const l of linkRows) groupIdsByProduct.set(l.productId, [...(groupIdsByProduct.get(l.productId) ?? []), l.groupId]);
  const productMap = new Map<string, PricingProduct>(
    productRows.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        slug: p.slug,
        categoryId: p.categoryId,
        categoryName: catById.get(p.categoryId)?.name,
        categoryActive: true,
        price: p.price,
        discountedPrice: p.discountedPrice,
        isActive: true,
        isAvailable: true,
        isVeg: p.isVeg,
        imageUrl: p.image?.url ?? catById.get(p.categoryId)?.image?.url,
        preparationMinutes: p.preparationMinutes ?? 15,
        customisationGroupIds: groupIdsByProduct.get(p.id) ?? [],
      },
    ]),
  );
  const groupMap = new Map<string, PricingGroup>(
    groupRows.map((g) => [
      g.id,
      {
        id: g.id,
        name: g.name,
        selectionType: g.selectionType,
        isRequired: !!g.isRequired,
        minSelect: g.minSelect ?? 0,
        maxSelect: g.maxSelect ?? 0,
        isActive: true,
        options: optionRows.filter((o) => o.groupId === g.id).map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDelta ?? 0, isAvailable: true })),
      },
    ]),
  );

  // ── Business setup ────────────────────────────────────────────────────────
  const [settings] = await db.select().from(businessSettings).where(eq(businessSettings.key, "default")).limit(1);
  await db
    .update(businessSettings)
    .set({
      kitchen: { ...(settings?.kitchen ?? {}), mode: "OPEN", preordersEnabled: true },
      contactPhone: "9000000000",
      contactWhatsapp: "9000000000",
      contactEmail: "hello@demo.biteaffairs.local",
      addressLine: "Demo address, Park Street",
      delivery: { ...(settings?.delivery ?? {}), freeDeliveryThreshold: 49900, minOrderAmount: 14900 },
      social: { ...(settings?.social ?? {}), instagram: "https://instagram.com/" },
      updatedAt: new Date(),
    })
    .where(eq(businessSettings.key, "default"));
  const [home] = await db.select().from(websiteContent).where(eq(websiteContent.key, "home")).limit(1);
  const homeData = { ...(home?.data ?? {}), announcement: { ...((home?.data?.announcement as object | undefined) ?? {}), text: "Demo mode — all customers, orders and reviews are sample data.", isActive: true } };
  await db.insert(websiteContent).values({ key: "home", data: homeData }).onConflictDoUpdate({ target: websiteContent.key, set: { data: homeData, updatedAt: new Date() } });
  const zoneDocs = await db.insert(deliveryZones).values(ZONES.map((z, i) => ({ name: z.name, pincodes: z.pincodes, deliveryFee: z.fee, estimatedMinutes: z.eta, displayOrder: i }))).returning();

  // Bestseller/new flags + a couple of discounts so the menu UI shows every badge.
  const bySlug = new Map(productRows.map((p) => [p.slug, p]));
  const patch = (slugs: string[], set: Partial<typeof products.$inferInsert>) => db.update(products).set(set).where(inArray(products.slug, slugs));
  await patch(["chicken-65", "chicken-steam-momo", "chicken-loaded-pizza", "chicken-fried-rice-combo"], { isBestseller: true });
  await patch(["mexican-chicken-wrap", "pure-bhetki-fish-fry"], { isNewArrival: true });
  await patch(["veggie-loaded-pizza"], { discountedPrice: 21900 });
  await patch(["chilli-cheese-sandwich"], { isAvailable: false });
  await db.insert(productCosts).values(productRows.map((p) => ({ productId: p.id, ingredientCost: Math.round(p.price * (0.32 + rand() * 0.12)), packagingCost: 1200, preparationCost: 800 })));
  const veggie = bySlug.get("veggie-loaded-pizza");
  if (veggie && productMap.has(veggie.id)) productMap.get(veggie.id)!.discountedPrice = 21900;

  // ── Coupons ───────────────────────────────────────────────────────────────
  const [welcome] = await db.insert(coupons).values({ code: "WELCOME10", description: "10% off your first order (up to ₹75)", type: "PERCENT", value: 1000, maxDiscount: 7500, firstOrderOnly: true, perCustomerLimit: 1, isActive: true, isPublic: true }).returning();
  const [flat50] = await db.insert(coupons).values({ code: "FLAT50", description: "₹50 off on orders above ₹399", type: "FLAT", value: 5000, minOrderAmount: 39900, perCustomerLimit: 3, usageLimit: 200, isActive: true, isPublic: true }).returning();
  await db.insert(coupons).values({ code: "MOMO20", description: "20% off momos", type: "PERCENT", value: 2000, applicableCategoryIds: [categoryRows.find((c) => c.slug === "momos")!.id], perCustomerLimit: 2, isActive: true });

  // ── Customers ─────────────────────────────────────────────────────────────
  const passwordHash = await hashPassword(DEMO_CUSTOMER.password);
  const customers: { id?: string; name: string; phone: string; email?: string; zone: (typeof ZONES)[number]; street: string }[] = [];
  for (let i = 0; i < 40; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    const phone = `98300${String(i + 1).padStart(5, "0")}`;
    customers.push({ name, phone, zone: ZONES[i % ZONES.length], street: pick(ZONES[i % ZONES.length].streets), email: i < 14 ? `${name.split(" ")[0].toLowerCase()}${i}@demo.biteaffairs.local` : undefined });
  }
  // First 14 are registered accounts; the rest order as guests.
  for (const [i, c] of customers.slice(0, 14).entries()) {
    const createdAt = istDate(between(20, 60), 12, 0);
    const [user] = await db.insert(users).values({ name: c.name, phone: c.phone, email: i === 0 ? DEMO_CUSTOMER.email : c.email, passwordHash, role: "CUSTOMER", createdAt, updatedAt: createdAt }).returning({ id: users.id });
    c.id = user.id;
    await db.insert(addresses).values({ userId: user.id, label: "Home", recipientName: c.name, phone: c.phone, houseNumber: `${between(1, 120)}${pick(["", "A", "B"])}`, street: c.street, landmark: pick(LANDMARKS), city: "Kolkata", pincode: pick(c.zone.pincodes), isDefault: true });
  }
  const riya = customers[0];
  await db.insert(addresses).values({ userId: riya.id!, label: "Work", recipientName: riya.name, phone: riya.phone, houseNumber: "4th floor, 22", street: "Camac Street", landmark: "Above the café", city: "Kolkata", pincode: "700017" });
  await db.insert(favourites).values(["chicken-65", "paneer-pizza", "chicken-steam-momo"].map((slug) => ({ userId: riya.id!, productId: bySlug.get(slug)!.id })));

  // ── Orders: 30 days of history + a live board for today ───────────────────
  const productIds = [...productMap.keys()];
  const popular = ["chicken-65", "chicken-steam-momo", "chicken-fried-rice-combo", "chicken-noodles-combo", "margaretta-pizza", "chicken-loaded-pizza", "french-fries", "spicy-masala-maggi", "chicken-tikki-burger", "fried-momo"]
    .map((s) => bySlug.get(s)?.id)
    .filter((x): x is string => !!x);
  const fries = bySlug.get("french-fries")!;
  const periGroup = (groupIdsByProduct.get(fries.id) ?? []).map((id) => groupMap.get(id)).find(Boolean);
  const daySeq = new Map<string, number>();
  const ordersPerCustomer = new Map<string, number>();

  async function makeOrder(opts: { createdAt: Date; status: OrderStatus; customerIndex: number; fulfilment: "DELIVERY" | "PICKUP"; couponId?: string }) {
    const c = customers[opts.customerIndex];
    const lineCount = between(1, 3);
    const items = Array.from({ length: lineCount }, () => {
      const productId = rand() < 0.65 ? pick(popular) : pick(productIds);
      const selections = productId === fries.id && rand() < 0.5 && periGroup ? [{ groupId: periGroup.id, optionIds: [periGroup.options[0].id] }] : [];
      return { productId, quantity: rand() < 0.75 ? 1 : 2, selections, notes: pick(NOTES) || undefined };
    });
    const unique = [...new Map(items.map((i) => [i.productId, i])).values()];
    const { lines } = priceLines(unique, productMap, groupMap);
    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    let couponDiscount = 0;
    let coupon: typeof welcome | null = null;
    if (opts.couponId === flat50.id && subtotal >= 39900) {
      couponDiscount = 5000;
      coupon = flat50;
    } else if (opts.couponId === welcome.id) {
      couponDiscount = Math.min(7500, Math.floor(subtotal / 10));
      coupon = welcome;
    }
    const zone = c.zone;
    const deliveryFee = opts.fulfilment === "PICKUP" || subtotal - couponDiscount >= 49900 ? 0 : zone.fee;
    const totals = computeTotals({ lines, couponDiscount, deliveryFee, taxRateBps: 0, taxInclusive: true });

    const p = getZonedParts(opts.createdAt, "Asia/Kolkata");
    const day = `${String(p.year).slice(2)}${String(p.month).padStart(2, "0")}${String(p.day).padStart(2, "0")}`;
    const seq = (daySeq.get(day) ?? 0) + 1;
    daySeq.set(day, seq);
    const orderNumber = `BA${day}-${String(seq).padStart(3, "0")}`;

    const happy: OrderStatus[] = opts.fulfilment === "PICKUP" ? ["PLACED", "CONFIRMED", "PREPARING", "READY", "DELIVERED"] : ["PLACED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"];
    const flow: OrderStatus[] =
      opts.status === "CANCELLED" ? ["PLACED", "CONFIRMED", "CANCELLED"] : opts.status === "REJECTED" ? ["PLACED", "REJECTED"] : happy.slice(0, happy.indexOf(opts.status) + 1);
    const stepMinutes = [0, 3, 8, 22, 26, 55];
    const timeline = flow.map((status, i) => ({ status, at: new Date(opts.createdAt.getTime() + (stepMinutes[i] ?? i * 10) * 60_000) }));
    const delivered = opts.status === "DELIVERED";
    const failed = ["CANCELLED", "REJECTED"].includes(opts.status);
    const paidOnline = rand() < 0.3 && !failed;
    const codCollected = delivered && !paidOnline && rand() < 0.92;
    const updatedAt = timeline[timeline.length - 1].at;
    const prep = Math.max(...lines.map((l) => l.preparationMinutes));
    const paymentStatus = paidOnline ? "PAID" : codCollected ? "PAID" : failed ? "FAILED" : "PENDING";
    const method = paidOnline ? "RAZORPAY" : "COD";
    const rzpOrderId = paidOnline ? `order_demo${orderNumber.replace(/\W/g, "")}` : null;
    const rzpPaymentId = paidOnline ? `pay_demo${orderNumber.replace(/\W/g, "")}` : null;
    const delivery = opts.fulfilment === "DELIVERY";

    const [order] = await db
      .insert(orders)
      .values({
        orderNumber,
        idempotencyKey: `demo-${orderNumber}`,
        userId: c.id ?? null,
        isGuest: !c.id,
        customerName: c.name,
        customerPhone: c.phone,
        customerEmail: c.email ?? null,
        fulfilment: opts.fulfilment,
        addressHouseNumber: delivery ? `${between(1, 120)}` : null,
        addressStreet: delivery ? c.street : null,
        addressLandmark: delivery ? pick(LANDMARKS) : null,
        addressCity: delivery ? "Kolkata" : null,
        addressPincode: delivery ? zone.pincodes[0] : null,
        addressInstructions: delivery ? pick(INSTRUCTIONS) : null,
        deliveryZoneId: delivery ? zoneDocs[ZONES.indexOf(zone)].id : null,
        deliveryZoneName: delivery ? zone.name : null,
        itemsSubtotal: totals.itemsSubtotal,
        customisationTotal: totals.customisationTotal,
        productDiscount: totals.productDiscount,
        subtotal: totals.subtotal,
        couponCode: coupon?.code ?? null,
        couponId: coupon?.id ?? null,
        couponDiscount: totals.couponDiscount,
        deliveryFee: totals.deliveryFee,
        taxRateBps: totals.taxRateBps,
        taxInclusive: totals.taxInclusive,
        tax: totals.tax,
        total: totals.total,
        paymentMethod: method,
        paymentStatus,
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: rzpPaymentId,
        paidAt: paidOnline ? opts.createdAt : codCollected ? updatedAt : null,
        codCollected,
        codAmountCollected: codCollected ? totals.total : null,
        codCollectedAt: codCollected ? updatedAt : null,
        status: opts.status,
        timeline: timeline.map((t) => ({ status: t.status, at: t.at.toISOString() })),
        estimatedPrepMinutes: prep,
        estimatedReadyAt: new Date(opts.createdAt.getTime() + (prep + 5) * 60_000),
        estimatedDeliveryAt: delivery ? new Date(opts.createdAt.getTime() + (prep + 5 + zone.eta) * 60_000) : null,
        customerNotes: rand() < 0.15 ? "Please pack the sauces separately" : null,
        rejectionReason: opts.status === "REJECTED" ? "Item out of stock" : null,
        cancellationReason: opts.status === "CANCELLED" ? "Customer requested cancellation by phone" : null,
        outForDeliveryAt: delivery && (delivered || opts.status === "OUT_FOR_DELIVERY") ? (timeline[4]?.at ?? null) : null,
        deliveredAt: delivered && delivery ? updatedAt : null,
        trackingTokenHash: sha256(deriveTrackingToken(orderNumber)),
        createdAt: opts.createdAt,
        updatedAt,
      })
      .returning();
    const itemRows = await db
      .insert(orderItems)
      .values(
        lines.map((l, position) => ({
          orderId: order.id,
          position,
          productId: l.productId,
          categoryId: l.categoryId,
          categoryName: l.categoryName,
          name: l.name,
          slug: l.slug,
          imageUrl: l.imageUrl ?? null,
          isVeg: l.isVeg,
          basePrice: l.basePrice,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
          lineTotal: l.lineTotal,
          selections: l.selections,
          notes: l.notes,
          estimatedUnitCost: Math.round(l.basePrice * 0.4) + 2000,
        })),
      )
      .returning({ id: orderItems.id });
    await db.insert(orderStatusHistory).values(timeline.map((t, i) => ({ orderId: order.id, orderNumber, from: i === 0 ? null : timeline[i - 1].status, to: t.status, actorType: (i === 0 ? "CUSTOMER" : "ADMIN") as "CUSTOMER" | "ADMIN", note: i === 0 ? "Order created" : undefined, createdAt: t.at })));
    await db.insert(payments).values({
      orderId: order.id,
      orderNumber,
      method,
      status: paymentStatus,
      amount: totals.total,
      razorpayOrderId: rzpOrderId,
      razorpayPaymentId: rzpPaymentId,
      amountCollected: codCollected ? totals.total : null,
      collectedAt: codCollected ? updatedAt : null,
      events: [{ type: "created", at: opts.createdAt.toISOString() }],
      createdAt: opts.createdAt,
      updatedAt,
    });
    if (coupon) {
      await db.insert(couponRedemptions).values({ couponId: coupon.id, code: coupon.code, orderId: order.id, userId: c.id ?? null, customerKey: `phone:${c.phone}`, discount: couponDiscount, released: failed, createdAt: opts.createdAt });
      if (!failed) await db.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.id, coupon.id));
    }
    ordersPerCustomer.set(c.phone, (ordersPerCustomer.get(c.phone) ?? 0) + 1);
    void itemRows;
    return { ...order, timelineAt: timeline };
  }

  // History: last 30 days
  for (let daysAgo = 30; daysAgo >= 1; daysAgo--) {
    const weekend = [0, 6].includes(new Date(Date.now() - daysAgo * 86_400_000).getUTCDay());
    const count = between(weekend ? 6 : 3, weekend ? 11 : 8);
    const times = Array.from({ length: count }, () => [pickHour(), between(0, 59)] as const).sort((a, b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]));
    for (const [h, m] of times) {
      const r = rand();
      const status: OrderStatus = r < 0.06 ? "CANCELLED" : r < 0.09 ? "REJECTED" : "DELIVERED";
      const ci = rand() < 0.55 ? between(0, 13) : between(14, 39);
      const firstOrder = !ordersPerCustomer.has(customers[ci].phone);
      await makeOrder({
        createdAt: istDate(daysAgo, h, m),
        status,
        customerIndex: ci,
        fulfilment: rand() < 0.85 ? "DELIVERY" : "PICKUP",
        couponId: firstOrder && rand() < 0.4 ? welcome.id : rand() < 0.12 ? flat50.id : undefined,
      });
    }
  }

  // Today: a busy live board in every operational column.
  const now = Date.now();
  const todayPlan: [number, OrderStatus, "DELIVERY" | "PICKUP"][] = [
    [190, "DELIVERED", "DELIVERY"],
    [160, "DELIVERED", "PICKUP"],
    [130, "DELIVERED", "DELIVERY"],
    [95, "CANCELLED", "DELIVERY"],
    [62, "OUT_FOR_DELIVERY", "DELIVERY"],
    [48, "READY", "DELIVERY"],
    [41, "READY", "PICKUP"],
    [33, "PREPARING", "DELIVERY"],
    [55, "PREPARING", "DELIVERY"], // running late → delayed highlight
    [19, "CONFIRMED", "DELIVERY"],
    [7, "PLACED", "DELIVERY"],
    [3, "PLACED", "PICKUP"],
  ];
  for (const [minsAgo, status, fulfilment] of todayPlan) {
    const order = await makeOrder({ createdAt: new Date(now - minsAgo * 60_000), status, customerIndex: between(0, 39), fulfilment });
    // Compress the timeline so active orders look "in progress right now".
    const n = order.timelineAt.length;
    const steps = order.timelineAt.map((t, i) => ({ status: t.status, at: new Date(now - minsAgo * 60_000 + Math.min(minsAgo - 1, i * Math.max(1, Math.floor(minsAgo / (n + 1)))) * 60_000) }));
    await db.update(orders).set({ timeline: steps.map((s) => ({ status: s.status, at: s.at.toISOString() })), updatedAt: steps[steps.length - 1].at }).where(eq(orders.id, order.id));
  }
  // Riya (demo customer) has an active order to track.
  const riyaLive = await makeOrder({ createdAt: new Date(now - 14 * 60_000), status: "PREPARING", customerIndex: 0, fulfilment: "DELIVERY" });
  await db.update(orders).set({ updatedAt: new Date(now - 2 * 60_000) }).where(eq(orders.id, riyaLive.id));

  // Keep today's order counter in sync so new orders continue the sequence.
  for (const [day, seq] of daySeq) await db.insert(counters).values({ key: `order:${day}`, seq }).onConflictDoUpdate({ target: counters.key, set: { seq } });

  // ── Reviews, testimonials, notifications, expenses ────────────────────────
  const deliveredRegistered = await db.select().from(orders).where(and(eq(orders.status, "DELIVERED"), sql`${orders.userId} is not null`)).orderBy(asc(orders.createdAt)).limit(18);
  const comments = [
    "Chicken 65 was crispy and perfectly spicy. Will order again!",
    "Momos were juicy and the chutney is fantastic.",
    "Pizza arrived hot. Generous toppings for the price.",
    "Great portion size, loved the combo.",
    "Tasty, but could be a little less oily.",
    "Fast delivery and well packed.",
    "The fried rice combo is the best value in the area.",
    "Fries were fresh and the peri peri add-on is a must.",
  ];
  for (const [i, o] of deliveredRegistered.entries()) {
    const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id)).orderBy(asc(orderItems.position)).limit(1);
    await db.insert(reviews).values({ orderId: o.id, orderItemId: item.id, productId: item.productId, productName: item.name, userId: o.userId!, customerName: o.customerName, rating: i % 5 === 4 ? 4 : 5 - (i % 7 === 6 ? 2 : 0), comment: comments[i % comments.length], status: i < 13 ? "APPROVED" : "PENDING", createdAt: o.updatedAt, updatedAt: o.updatedAt });
  }
  const ratings = await db
    .select({ productId: reviews.productId, avg: sql<number>`avg(${reviews.rating})::float8`, n: sql<number>`count(*)::int` })
    .from(reviews)
    .where(eq(reviews.status, "APPROVED"))
    .groupBy(reviews.productId);
  for (const r of ratings) await db.update(products).set({ ratingAverage: Math.round(r.avg * 10) / 10, ratingCount: r.n }).where(eq(products.id, r.productId));

  await db.insert(testimonials).values([
    { name: "Ananya G.", location: "Ballygunge", quote: "Our go-to for Friday nights. The Chinese combos taste like the real deal.", rating: 5, displayOrder: 0 },
    { name: "Sourav B.", location: "Park Street", quote: "Hot, fresh and on time every single time. The Chicken 65 is unreal.", rating: 5, displayOrder: 1 },
    { name: "Ishita R.", location: "Bhowanipore", quote: "Love that they deliver themselves — always polite and quick.", rating: 5, displayOrder: 2 },
  ]);

  const recent = await db.select().from(orders).where(gte(orders.createdAt, new Date(now - 3 * 3600_000))).orderBy(desc(orders.createdAt)).limit(8);
  await db.insert(notifications).values(
    recent.map((o, i) => ({
      audience: "ADMIN" as const,
      type: (o.status === "CANCELLED" ? "ORDER_CANCELLED" : "NEW_ORDER") as "ORDER_CANCELLED" | "NEW_ORDER",
      title: o.status === "CANCELLED" ? `Order ${o.orderNumber} cancelled` : `New order ${o.orderNumber}`,
      body: `${o.customerName} · ₹${o.total / 100}`,
      orderId: o.id,
      orderNumber: o.orderNumber,
      href: `/admin/orders/${o.id}`,
      readAt: i > 2 ? new Date() : null,
      createdAt: o.createdAt,
    })),
  );
  await db.insert(notifications).values({ audience: "CUSTOMER", userId: riya.id!, orderId: riyaLive.id, orderNumber: riyaLive.orderNumber, type: "ORDER_STATUS", title: `Order ${riyaLive.orderNumber}: Preparing`, body: "Our chefs are cooking your food right now.", href: `/account/orders/${riyaLive.id}` });

  const expenseRows: [(typeof expenses.$inferInsert)["category"], number, string][] = [
    ["RAW_MATERIALS", 1850000, "Weekly chicken & vegetables"],
    ["RAW_MATERIALS", 920000, "Flour, cheese, sauces"],
    ["PACKAGING", 340000, "Boxes, containers, bags"],
    ["GAS", 210000, "LPG cylinders"],
    ["ELECTRICITY", 480000, "Monthly electricity bill"],
    ["DELIVERY", 260000, "Petrol for deliveries"],
    ["MARKETING", 150000, "Flyers and Instagram promotion"],
    ["MISCELLANEOUS", 75000, "Cleaning supplies"],
  ];
  const expenseValues: (typeof expenses.$inferInsert)[] = [];
  for (const [w, [category, amount, description]] of expenseRows.entries()) {
    for (const weeksAgo of category === "ELECTRICITY" || category === "MARKETING" ? [1] : [0, 1, 2, 3]) {
      expenseValues.push({ category, amount: Math.round(amount * (category === "RAW_MATERIALS" || category === "PACKAGING" || category === "GAS" || category === "DELIVERY" ? 0.25 : 1)), description, vendor: pick(["Local supplier", "Wholesale market", "Gas agency", "CESC", "Petrol pump"]), incurredOn: new Date(now - (weeksAgo * 7 + w) * 86_400_000), paymentMode: pick(["CASH", "UPI", "UPI", "BANK"] as const) });
    }
  }
  await db.insert(expenses).values(expenseValues);

  const [{ n: orderCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(orders);
  const [{ n: customerCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.role, "CUSTOMER"));
  return {
    orders: orderCount,
    customers: customerCount,
    riyaTracking: { orderNumber: riyaLive.orderNumber, token: deriveTrackingToken(riyaLive.orderNumber) },
  };
}

/** Places a realistic new order through the real checkout service every so often. */
export async function simulateIncomingOrder() {
  const { createOrder } = await import("@/services/order.service");
  const db = await getDb();
  const rows = await db
    .select({ id: products.id })
    .from(products)
    // Delivery needs ≥ ₹149 (the demo's minimum order), so only offer items that reach it on their own.
    .where(and(eq(products.isActive, true), eq(products.isAvailable, true), sql`coalesce(${products.discountedPrice}, ${products.price}) >= 14900`, sql`not exists (select 1 from ${productCustomisationGroups} pcg where pcg.product_id = ${products.id})`));
  const p = pick(rows);
  const zone = pick(ZONES);
  const name = `${pick(FIRST)} ${pick(LAST)}`;
  return createOrder({
    idempotencyKey: `sim-${Date.now()}-${Math.floor(rand() * 1e6)}`,
    items: [{ productId: p.id, quantity: between(1, 2), selections: [] }],
    customer: { name, phone: `9831${String(between(100000, 999999))}` },
    fulfilment: "DELIVERY",
    address: { houseNumber: `${between(1, 99)}`, street: pick(zone.streets), landmark: "", city: "Kolkata", pincode: zone.pincodes[0], instructions: "" },
    paymentMethod: "COD",
  });
}

export async function createDemoAdmin(given?: Db) {
  const db = given ?? (await getDb());
  await db.insert(users).values({ name: "Demo Admin", email: DEMO_ADMIN.email, passwordHash: await hashPassword(DEMO_ADMIN.password), role: "ADMIN", isBootstrapAdmin: true });
}
