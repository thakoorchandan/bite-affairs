import { and, count, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb, isUniqueViolation, isUuid, schema, withTransaction, type DbOrTx, type Tx } from "@/db";
import { AppError, notFound } from "@/lib/utilities/errors";
import { hmacSha256Hex, safeEqual, sha256 } from "@/lib/security/tokens";
import { getZonedParts } from "@/lib/utilities/time";
import { checkoutSchema, type CheckoutInput } from "@/lib/validations/checkout";
import type { FulfilmentType, OrderStatus, PaymentStatus } from "@/constants/domain";
import { buildQuote } from "./quote.service";
import { consumeCoupon, releaseCouponForOrder } from "./coupon.service";
import { getBusinessHours, getBusinessSettings, toHoursConfig, toKitchenConfig } from "./settings.service";
import { computeKitchenStatus, validatePreorderTime } from "./kitchen-status";
import { validateTransition } from "./order-state";
import { notifyAdmins, notifyCustomerOrderStatus, type NotifiableOrder } from "./notification.service";
import { createRazorpayOrder, getRazorpayConfig } from "@/lib/payments/razorpay";

const { orders, orderItems, orderStatusHistory, payments, couponRedemptions, counters, addresses, carts, productCosts } = schema;
type OrderRow = typeof orders.$inferSelect;

export interface OrderActor {
  type: "ADMIN" | "CUSTOMER" | "SYSTEM";
  id?: string;
  name?: string;
}

function trackingSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET must be set");
  return secret;
}

/**
 * The tracking token is an HMAC of the order number with the server secret: unguessable
 * without the secret, yet re-derivable so idempotent checkout retries can return it again.
 * Only its SHA-256 hash is stored in the database.
 */
export function deriveTrackingToken(orderNumber: string): string {
  return hmacSha256Hex(trackingSecret(), `track:${orderNumber}`).slice(0, 40);
}

export function verifyTrackingToken(orderNumber: string, token: string | null | undefined): boolean {
  if (!token || token.length < 20 || token.length > 100) return false;
  return safeEqual(deriveTrackingToken(orderNumber), token);
}

/** Atomic per-day sequence: `BA<yymmdd>-<seq>` (day in the business timezone). */
async function nextOrderNumber(tx: Tx, timeZone: string, now: Date): Promise<string> {
  const p = getZonedParts(now, timeZone);
  const day = `${String(p.year).slice(2)}${String(p.month).padStart(2, "0")}${String(p.day).padStart(2, "0")}`;
  const [counter] = await tx
    .insert(counters)
    .values({ key: `order:${day}`, seq: 1 })
    .onConflictDoUpdate({ target: counters.key, set: { seq: sql`${counters.seq} + 1` } })
    .returning({ seq: counters.seq });
  return `BA${day}-${String(counter.seq).padStart(3, "0")}`;
}

export interface CreateOrderResult {
  orderId: string;
  orderNumber: string;
  trackingToken: string;
  status: OrderStatus;
  total: number;
  paymentMethod: "COD" | "RAZORPAY";
  duplicate: boolean;
  razorpay?: { keyId: string; razorpayOrderId: string; amount: number };
}

const toNotifiable = (o: OrderRow): NotifiableOrder => ({
  id: o.id,
  orderNumber: o.orderNumber,
  userId: o.userId,
  customer: { name: o.customerName, phone: o.customerPhone, email: o.customerEmail },
  status: o.status,
});

export async function createOrder(rawInput: CheckoutInput, ctx: { userId?: string | null; now?: Date } = {}): Promise<CreateOrderResult> {
  const input = checkoutSchema.parse(rawInput);
  const now = ctx.now ?? new Date();
  const db = await getDb();

  // Idempotency: a retried submission returns the order created by the first attempt.
  const [existing] = await db.select().from(orders).where(eq(orders.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existing) return duplicateResult(existing, input.customer.phone);

  const [settings, hours] = await Promise.all([getBusinessSettings(), getBusinessHours()]);
  const kitchenConfig = toKitchenConfig(settings);
  const hoursConfig = toHoursConfig(hours);
  const kitchen = computeKitchenStatus(kitchenConfig, hoursConfig, now);

  let scheduledFor: Date | undefined;
  if (input.scheduledFor) {
    if (!kitchenConfig.preordersEnabled) throw new AppError("Pre-orders aren't available right now.", "PREORDER_DISABLED");
    if (kitchen.state === "UNAVAILABLE") throw new AppError(kitchen.message, "KITCHEN_UNAVAILABLE");
    scheduledFor = new Date(input.scheduledFor);
    const err = validatePreorderTime(kitchenConfig, hoursConfig, scheduledFor, now);
    if (err) throw new AppError(err, "INVALID_SCHEDULE");
  } else if (!kitchen.canOrderNow) {
    throw new AppError(kitchen.canPreorder ? `${kitchen.message} You can schedule a pre-order instead.` : kitchen.message, "KITCHEN_CLOSED");
  }

  // Payment method availability
  const razorpayCfg = getRazorpayConfig();
  if (input.paymentMethod === "COD") {
    if (settings.payments?.codEnabled === false) throw new AppError("Cash on Delivery isn't available right now.", "COD_DISABLED");
  } else if (!razorpayCfg || !settings.payments?.razorpayEnabled) {
    throw new AppError("Online payment isn't available right now. Please choose Cash on Delivery.", "ONLINE_PAYMENT_DISABLED");
  }

  // Resolve delivery address (saved addresses must belong to the signed-in user).
  let address = input.address;
  if (input.fulfilment === "DELIVERY" && input.savedAddressId) {
    if (!ctx.userId) throw new AppError("Please sign in to use a saved address.", "UNAUTHORIZED", 401);
    if (!isUuid(input.savedAddressId)) throw notFound("Address");
    const [saved] = await db.select().from(addresses).where(and(eq(addresses.id, input.savedAddressId), eq(addresses.userId, ctx.userId))).limit(1);
    if (!saved) throw notFound("Address");
    address = { houseNumber: saved.houseNumber, street: saved.street, landmark: saved.landmark ?? "", city: saved.city, pincode: saved.pincode, instructions: input.address?.instructions || saved.instructions || "" };
  }
  if (input.fulfilment === "DELIVERY" && !address) throw new AppError("Delivery address is required.", "VALIDATION");

  const userId = ctx.userId ?? null;
  const phone = input.customer.phone;

  let created: { order: OrderRow };
  try {
    created = await withTransaction(async (tx) => {
      const quote = await buildQuote(
        { items: input.items, fulfilment: input.fulfilment, pincode: address?.pincode, couponCode: input.couponCode, userId, phone },
        { tx, settings, now },
      );
      if (quote.blockingReasons.length) throw new AppError(quote.blockingReasons[0], "CART_INVALID", 400, { reasons: quote.blockingReasons });
      if (input.couponCode && !quote.coupon?.applied) throw new AppError(quote.coupon?.message ?? "Coupon is not valid.", "COUPON_INVALID");
      const codCap = settings.payments?.codMaxOrderAmount ?? 0;
      if (input.paymentMethod === "COD" && codCap > 0 && quote.totals.total > codCap) {
        throw new AppError(`Cash on Delivery is available for orders up to ₹${codCap / 100}.`, "COD_LIMIT");
      }

      const coupon = quote.couponDoc;
      if (coupon) {
        // The conditional UPDATE inside consumeCoupon row-locks the coupon until commit, so concurrent
        // checkouts serialise here and `usedCount` can never exceed `usageLimit`.
        const ok = await consumeCoupon(coupon.id, tx);
        if (!ok) throw new AppError("This coupon has just been fully redeemed.", "COUPON_EXHAUSTED");
        // Per-customer limit re-checked after taking the lock, so two parallel orders from one customer can't both pass.
        const limit = coupon.perCustomerLimit ?? 0;
        if (limit > 0) {
          const identity = [eq(couponRedemptions.customerKey, `phone:${phone}`), ...(userId ? [eq(couponRedemptions.userId, userId)] : [])];
          const [{ n }] = await tx
            .select({ n: count() })
            .from(couponRedemptions)
            .where(and(eq(couponRedemptions.couponId, coupon.id), eq(couponRedemptions.released, false), or(...identity)));
          if (Number(n) >= limit) throw new AppError("You've already used this coupon.", "COUPON_INVALID");
        }
      }

      const productIds = quote.lines.map((l) => l.productId);
      const costs = productIds.length ? await tx.select().from(productCosts).where(inArray(productCosts.productId, productIds)) : [];
      const costByProduct = new Map(costs.map((c) => [c.productId, c.ingredientCost + c.packagingCost + c.preparationCost + c.otherCost]));

      const orderNumber = await nextOrderNumber(tx, hoursConfig.timezone, now);
      const trackingToken = deriveTrackingToken(orderNumber);
      const status: OrderStatus = input.paymentMethod === "RAZORPAY" ? "AWAITING_PAYMENT" : "PLACED";
      const readyBase = scheduledFor ?? now;
      const estimatedReadyAt = new Date(readyBase.getTime() + quote.estimatedPrepMinutes * 60_000);
      const estimatedDeliveryAt = input.fulfilment === "DELIVERY" ? new Date(estimatedReadyAt.getTime() + quote.estimatedDeliveryMinutes * 60_000) : null;
      const delivery = input.fulfilment === "DELIVERY" ? address : undefined;

      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber,
          idempotencyKey: input.idempotencyKey,
          userId,
          isGuest: !userId,
          customerName: input.customer.name,
          customerPhone: input.customer.phone,
          customerEmail: input.customer.email ?? null,
          fulfilment: input.fulfilment,
          addressHouseNumber: delivery?.houseNumber ?? null,
          addressStreet: delivery?.street ?? null,
          addressLandmark: delivery?.landmark || null,
          addressCity: delivery?.city ?? null,
          addressPincode: delivery?.pincode ?? null,
          addressInstructions: delivery?.instructions || null,
          deliveryZoneId: quote.delivery?.zoneId ?? null,
          deliveryZoneName: quote.delivery?.zoneName ?? null,
          itemsSubtotal: quote.totals.itemsSubtotal,
          customisationTotal: quote.totals.customisationTotal,
          productDiscount: quote.totals.productDiscount,
          subtotal: quote.totals.subtotal,
          couponCode: quote.coupon?.applied ? quote.coupon.code : null,
          couponId: coupon?.id ?? null,
          couponDiscount: quote.totals.couponDiscount,
          deliveryFee: quote.totals.deliveryFee,
          taxRateBps: quote.totals.taxRateBps,
          taxInclusive: quote.totals.taxInclusive,
          tax: quote.totals.tax,
          total: quote.totals.total,
          paymentMethod: input.paymentMethod,
          paymentStatus: "PENDING",
          status,
          timeline: [{ status, at: now.toISOString() }],
          isPreorder: !!scheduledFor,
          scheduledFor: scheduledFor ?? null,
          estimatedPrepMinutes: quote.estimatedPrepMinutes,
          estimatedReadyAt,
          estimatedDeliveryAt,
          customerNotes: input.customerNotes ?? null,
          trackingTokenHash: sha256(trackingToken),
        })
        .returning();

      await tx.insert(orderItems).values(
        quote.lines.map((l, position) => ({
          orderId: order.id,
          position,
          productId: l.productId,
          categoryId: l.categoryId,
          categoryName: l.categoryName ?? null,
          name: l.name,
          slug: l.slug,
          imageUrl: l.imageUrl ?? null,
          isVeg: l.isVeg,
          basePrice: l.basePrice,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
          lineTotal: l.lineTotal,
          selections: l.selections,
          notes: l.notes ?? null,
          estimatedUnitCost: costByProduct.get(l.productId) ?? null,
        })),
      );
      await tx.insert(orderStatusHistory).values({ orderId: order.id, orderNumber, from: null, to: status, actorType: userId ? "CUSTOMER" : "SYSTEM", actorId: userId, note: "Order created" });
      await tx.insert(payments).values({ orderId: order.id, orderNumber, method: input.paymentMethod, status: "PENDING", amount: quote.totals.total, events: [{ type: "created", at: now.toISOString() }] });
      if (coupon) {
        await tx.insert(couponRedemptions).values({ couponId: coupon.id, code: coupon.code, orderId: order.id, userId, customerKey: `phone:${phone}`, discount: quote.totals.couponDiscount });
      }
      return { order };
    });
  } catch (error) {
    // A concurrent submission with the same idempotency key won the race: return its order.
    if (isUniqueViolation(error, "orders_idempotency_uq")) {
      const [winner] = await db.select().from(orders).where(eq(orders.idempotencyKey, input.idempotencyKey)).limit(1);
      if (winner) return duplicateResult(winner, input.customer.phone);
    }
    throw error;
  }

  const { order } = created;
  const trackingToken = deriveTrackingToken(order.orderNumber);

  // Post-commit side effects. Failures here must not undo a successfully placed order.
  if (userId) {
    await db.update(carts).set({ items: [] }).where(eq(carts.userId, userId)).catch(() => undefined);
    if (input.saveAddress && input.address && input.fulfilment === "DELIVERY") {
      try {
        const [{ n }] = await db.select({ n: count() }).from(addresses).where(eq(addresses.userId, userId));
        await db.insert(addresses).values({
          userId,
          recipientName: input.customer.name,
          phone,
          houseNumber: input.address.houseNumber,
          street: input.address.street,
          landmark: input.address.landmark || null,
          city: input.address.city,
          pincode: input.address.pincode,
          instructions: input.address.instructions || null,
          isDefault: Number(n) === 0,
        });
      } catch {
        /* saving the address is a convenience only */
      }
    }
  }

  let razorpay: CreateOrderResult["razorpay"];
  if (order.paymentMethod === "RAZORPAY" && razorpayCfg) {
    try {
      const rp = await createRazorpayOrder(razorpayCfg, { amount: order.total, receipt: order.orderNumber, notes: { orderId: order.id } });
      await db.update(orders).set({ razorpayOrderId: rp.id }).where(eq(orders.id, order.id));
      await db
        .update(payments)
        .set({ razorpayOrderId: rp.id, events: sql`${payments.events} || ${JSON.stringify([{ type: "razorpay_order_created", at: new Date().toISOString(), data: { id: rp.id } }])}::jsonb` })
        .where(eq(payments.orderId, order.id));
      razorpay = { keyId: razorpayCfg.keyId, razorpayOrderId: rp.id, amount: rp.amount };
    } catch (error) {
      console.error("[checkout] Razorpay order creation failed", error);
      await cancelUnpaidOrder(order.id, "Payment could not be initialised");
      throw new AppError("We couldn't start the online payment. Please try again or choose Cash on Delivery.", "PAYMENT_INIT_FAILED", 502);
    }
  } else {
    await notifyAdmins({
      type: "NEW_ORDER",
      title: `New order ${order.orderNumber}`,
      body: `${order.customerName} · ${await countItems(db, order.id)} item(s) · ₹${order.total / 100}${order.isPreorder ? " · Pre-order" : ""}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      href: `/orders/${order.id}`,
    }).catch((e) => console.error(e));
    await notifyCustomerOrderStatus(toNotifiable(order), { emailEnabled: settings.notifications?.emailEnabled ?? false, whatsappEnabled: settings.notifications?.whatsappEnabled ?? false });
  }

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    trackingToken,
    status: order.status,
    total: order.total,
    paymentMethod: order.paymentMethod,
    duplicate: false,
    razorpay,
  };
}

async function countItems(db: DbOrTx, orderId: string): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(orderItems).where(eq(orderItems.orderId, orderId));
  return Number(n);
}

function duplicateResult(existing: OrderRow, phone: string): CreateOrderResult {
  // Only the original customer (same phone) may receive the tracking token again.
  if (existing.customerPhone !== phone) throw new AppError("This checkout session was already used. Please refresh and try again.", "IDEMPOTENCY_CONFLICT", 409);
  const cfg = getRazorpayConfig();
  return {
    orderId: existing.id,
    orderNumber: existing.orderNumber,
    trackingToken: deriveTrackingToken(existing.orderNumber),
    status: existing.status,
    total: existing.total,
    paymentMethod: existing.paymentMethod,
    duplicate: true,
    razorpay:
      existing.paymentMethod === "RAZORPAY" && existing.status === "AWAITING_PAYMENT" && existing.razorpayOrderId && cfg
        ? { keyId: cfg.keyId, razorpayOrderId: existing.razorpayOrderId, amount: existing.total }
        : undefined,
  };
}

export async function cancelUnpaidOrder(orderId: string, reason: string) {
  if (!isUuid(orderId)) return;
  await withTransaction(async (tx) => {
    const now = new Date();
    const [order] = await tx
      .update(orders)
      .set({ status: "CANCELLED", cancellationReason: reason, paymentStatus: "FAILED", timeline: sql`${orders.timeline} || ${JSON.stringify([{ status: "CANCELLED", at: now.toISOString() }])}::jsonb` })
      .where(and(eq(orders.id, orderId), eq(orders.status, "AWAITING_PAYMENT")))
      .returning({ id: orders.id, orderNumber: orders.orderNumber });
    if (!order) return;
    await tx.insert(orderStatusHistory).values({ orderId, orderNumber: order.orderNumber, from: "AWAITING_PAYMENT", to: "CANCELLED", actorType: "SYSTEM", note: reason });
    await tx
      .update(payments)
      .set({ status: "FAILED", failureReason: reason, events: sql`${payments.events} || ${JSON.stringify([{ type: "failed", at: now.toISOString(), data: { reason } }])}::jsonb` })
      .where(eq(payments.orderId, orderId));
    await releaseCouponForOrder(orderId, tx);
  });
}

export interface TransitionInput {
  orderId: string;
  to: OrderStatus;
  /** Status the admin saw when clicking; prevents double-clicks from applying twice. */
  expectedFrom?: OrderStatus;
  note?: string;
  override?: boolean;
  reason?: string;
}

export async function transitionOrderStatus(input: TransitionInput, actor: OrderActor) {
  if (!isUuid(input.orderId)) throw notFound("Order");
  const now = new Date();
  const actorId = actor.id && isUuid(actor.id) ? actor.id : null;

  const updated = await withTransaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!order) throw notFound("Order");
    const from = order.status;
    if (input.expectedFrom && input.expectedFrom !== from) {
      throw new AppError(`This order was already updated to ${from.replaceAll("_", " ").toLowerCase()}.`, "STALE_STATUS", 409);
    }
    const ctx = { fulfilment: order.fulfilment as FulfilmentType, paymentStatus: order.paymentStatus as PaymentStatus };
    const error = validateTransition(from, input.to, ctx, { enabled: !!input.override && actor.type === "ADMIN", reason: input.reason });
    if (error) throw new AppError(error, "INVALID_TRANSITION", 409);
    if (input.to === "REJECTED" && !(input.reason || input.note)?.trim()) throw new AppError("Please give a reason for rejecting the order.", "REASON_REQUIRED");

    const set: Partial<typeof orders.$inferInsert> = { status: input.to };
    if (input.to === "REJECTED") set.rejectionReason = (input.reason || input.note)?.trim();
    if (input.to === "CANCELLED") set.cancellationReason = (input.reason || input.note)?.trim() || "Cancelled by kitchen";
    if (input.to === "OUT_FOR_DELIVERY") {
      set.outForDeliveryAt = now;
      if (!order.deliveryAssignedTo && actorId) {
        set.deliveryAssignedTo = actorId;
        set.deliveryAssignedAt = now;
      }
    }
    if (input.to === "DELIVERED") set.deliveredAt = now;
    if (input.to === "CONFIRMED" && !order.isPreorder) {
      const readyAt = new Date(now.getTime() + (order.estimatedPrepMinutes ?? 20) * 60_000);
      set.estimatedReadyAt = readyAt;
      if (order.fulfilment === "DELIVERY" && order.estimatedDeliveryAt && order.estimatedReadyAt) {
        const deliveryGap = order.estimatedDeliveryAt.getTime() - order.estimatedReadyAt.getTime();
        set.estimatedDeliveryAt = new Date(readyAt.getTime() + Math.max(0, deliveryGap));
      }
    }
    if (input.to === "REFUND_INITIATED") set.paymentStatus = "REFUND_INITIATED";
    if (input.to === "REFUNDED") set.paymentStatus = "REFUNDED";

    // Conditional on the current status: concurrent updates cannot both succeed.
    const entry = JSON.stringify([{ status: input.to, at: now.toISOString() }]);
    const res = await tx
      .update(orders)
      .set({ ...set, timeline: sql`${orders.timeline} || ${entry}::jsonb` })
      .where(and(eq(orders.id, order.id), eq(orders.status, from)))
      .returning({ id: orders.id });
    if (res.length !== 1) throw new AppError("This order was updated by someone else. Please refresh.", "STALE_STATUS", 409);

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      orderNumber: order.orderNumber,
      from,
      to: input.to,
      actorType: actor.type,
      actorId,
      note: [input.reason, input.note].filter(Boolean).join(" — ") || null,
      // Flag only transitions that were outside the normal lifecycle.
      isOverride: !!input.override && validateTransition(from, input.to, ctx) !== null,
    });

    if (input.to === "REJECTED" || input.to === "CANCELLED") {
      await releaseCouponForOrder(order.id, tx);
      if (order.paymentMethod === "COD") {
        const ev = JSON.stringify([{ type: input.to.toLowerCase(), at: now.toISOString() }]);
        await tx
          .update(payments)
          .set({ status: "FAILED", failureReason: `Order ${input.to.toLowerCase()}`, events: sql`${payments.events} || ${ev}::jsonb` })
          .where(and(eq(payments.orderId, order.id), eq(payments.status, "PENDING")));
        await tx.update(orders).set({ paymentStatus: "FAILED" }).where(and(eq(orders.id, order.id), eq(orders.paymentStatus, "PENDING")));
      }
    }
    if (input.to === "REFUND_INITIATED" || input.to === "REFUNDED") {
      const ev = JSON.stringify([{ type: input.to.toLowerCase(), at: now.toISOString(), data: { by: actor.id } }]);
      await tx.update(payments).set({ status: input.to === "REFUNDED" ? "REFUNDED" : "REFUND_INITIATED", events: sql`${payments.events} || ${ev}::jsonb` }).where(eq(payments.orderId, order.id));
    }
    return { ...order, status: input.to };
  });

  const settings = await getBusinessSettings();
  if (input.to === "CANCELLED") {
    await notifyAdmins({ type: "ORDER_CANCELLED", title: `Order ${updated.orderNumber} cancelled`, orderId: updated.id, orderNumber: updated.orderNumber, href: `/orders/${updated.id}` }).catch(() => undefined);
  }
  await notifyCustomerOrderStatus(toNotifiable(updated), {
    emailEnabled: settings.notifications?.emailEnabled ?? false,
    whatsappEnabled: settings.notifications?.whatsappEnabled ?? false,
  });
  return { id: updated.id, orderNumber: updated.orderNumber, status: updated.status };
}

/** Records cash collected for a COD order. Never happens automatically on delivery. */
export async function recordCodCollection(input: { orderId: string; amountCollected: number; note?: string }, actor: OrderActor) {
  if (!isUuid(input.orderId)) throw notFound("Order");
  if (!Number.isSafeInteger(input.amountCollected) || input.amountCollected < 0) throw new AppError("Enter a valid amount.");
  const actorId = actor.id && isUuid(actor.id) ? actor.id : null;
  return withTransaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!order) throw notFound("Order");
    if (order.paymentMethod !== "COD") throw new AppError("Only Cash on Delivery orders can record cash collection.");
    if (!["OUT_FOR_DELIVERY", "DELIVERED"].includes(order.status)) throw new AppError("Record collection once the order is out for delivery or delivered.");
    if (order.codCollected) throw new AppError("Cash collection was already recorded for this order.", "ALREADY_COLLECTED", 409);
    const now = new Date();
    const fullyPaid = input.amountCollected >= order.total;
    const res = await tx
      .update(orders)
      .set({
        codCollected: true,
        codAmountCollected: input.amountCollected,
        codCollectedAt: now,
        codCollectedBy: actorId,
        codNote: input.note ?? null,
        paymentStatus: fullyPaid ? "PAID" : "PENDING",
        ...(fullyPaid ? { paidAt: now } : {}),
      })
      .where(and(eq(orders.id, order.id), eq(orders.codCollected, false)))
      .returning({ id: orders.id });
    if (res.length !== 1) throw new AppError("Cash collection was already recorded for this order.", "ALREADY_COLLECTED", 409);
    const ev = JSON.stringify([{ type: "cod_collected", at: now.toISOString(), data: { amount: input.amountCollected, note: input.note, by: actor.id } }]);
    await tx
      .update(payments)
      .set({ status: fullyPaid ? "PAID" : "PENDING", amountCollected: input.amountCollected, collectedAt: now, collectedBy: actorId, events: sql`${payments.events} || ${ev}::jsonb` })
      .where(eq(payments.orderId, order.id));
    return { fullyPaid, shortBy: Math.max(0, order.total - input.amountCollected) };
  });
}

export async function addInternalNote(orderId: string, text: string, actor: OrderActor) {
  const clean = text.trim().slice(0, 500);
  if (!clean) throw new AppError("Note cannot be empty.");
  if (!isUuid(orderId)) throw notFound("Order");
  const db = await getDb();
  const note = JSON.stringify([{ text: clean, by: actor.id && isUuid(actor.id) ? actor.id : null, at: new Date().toISOString() }]);
  const res = await db.update(orders).set({ internalNotes: sql`${orders.internalNotes} || ${note}::jsonb` }).where(eq(orders.id, orderId)).returning({ id: orders.id });
  if (!res.length) throw notFound("Order");
}

export async function updateDeliveryDetails(orderId: string, patch: { assignToSelf?: boolean; notes?: string; proofImageUrl?: string }, actor: OrderActor) {
  if (!isUuid(orderId)) throw notFound("Delivery order");
  const db = await getDb();
  const set: Partial<typeof orders.$inferInsert> = {};
  if (patch.assignToSelf && actor.id && isUuid(actor.id)) {
    set.deliveryAssignedTo = actor.id;
    set.deliveryAssignedAt = new Date();
  }
  if (patch.notes !== undefined) set.deliveryNotes = patch.notes.trim().slice(0, 500);
  if (patch.proofImageUrl !== undefined) set.deliveryProofImageUrl = patch.proofImageUrl;
  if (!Object.keys(set).length) {
    const [row] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.id, orderId), eq(orders.fulfilment, "DELIVERY"))).limit(1);
    if (!row) throw notFound("Delivery order");
    return;
  }
  const res = await db.update(orders).set(set).where(and(eq(orders.id, orderId), eq(orders.fulfilment, "DELIVERY"))).returning({ id: orders.id });
  if (!res.length) throw notFound("Delivery order");
}

/** Guest-to-account linking: only orders whose secret tracking token the user presents are linked. */
export async function claimGuestOrders(userId: string, claims: { orderNumber: string; token: string }[]) {
  if (!isUuid(userId)) return 0;
  const db = await getDb();
  let claimed = 0;
  for (const claim of claims.slice(0, 20)) {
    if (!verifyTrackingToken(claim.orderNumber, claim.token)) continue;
    const res = await db
      .update(orders)
      .set({ userId, isGuest: false })
      .where(and(eq(orders.orderNumber, claim.orderNumber), eq(orders.isGuest, true), isNull(orders.userId)))
      .returning({ id: orders.id });
    claimed += res.length;
  }
  return claimed;
}
