import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { CouponType, FulfilmentType, OrderStatus, PaymentMethod, PaymentStatus } from "@/constants/domain";
import { createdAt, pk, ts, updatedAt } from "./_columns";
import { users } from "./identity";

export const deliveryZones = pgTable(
  "delivery_zones",
  {
    id: pk(),
    name: text("name").notNull(),
    pincodes: text("pincodes").array().notNull().default(sql`'{}'::text[]`),
    areas: text("areas").array().notNull().default(sql`'{}'::text[]`),
    deliveryFee: integer("delivery_fee").notNull().default(0),
    minOrderAmount: integer("min_order_amount"),
    estimatedMinutes: integer("estimated_minutes"),
    isActive: boolean("is_active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("delivery_zones_active_idx").on(t.isActive, t.displayOrder)],
);

export const coupons = pgTable(
  "coupons",
  {
    id: pk(),
    code: text("code").notNull(),
    description: text("description"),
    type: text("type").$type<CouponType>().notNull(),
    /** PERCENT: basis points (1000 = 10%). FLAT: integer paise. */
    value: integer("value").notNull(),
    maxDiscount: integer("max_discount"),
    minOrderAmount: integer("min_order_amount").default(0),
    startsAt: ts("starts_at"),
    endsAt: ts("ends_at"),
    /** null / 0 = unlimited. */
    usageLimit: integer("usage_limit"),
    usedCount: integer("used_count").notNull().default(0),
    perCustomerLimit: integer("per_customer_limit").default(1),
    firstOrderOnly: boolean("first_order_only").notNull().default(false),
    applicableProductIds: uuid("applicable_product_ids").array().notNull().default(sql`'{}'::uuid[]`),
    applicableCategoryIds: uuid("applicable_category_ids").array().notNull().default(sql`'{}'::uuid[]`),
    isActive: boolean("is_active").notNull().default(true),
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("coupons_code_uq").on(t.code),
    index("coupons_active_ends_idx").on(t.isActive, t.endsAt),
    check("coupons_type_chk", sql`${t.type} in ('PERCENT','FLAT')`),
    check("coupons_value_chk", sql`${t.value} > 0 and ${t.usedCount} >= 0`),
  ],
);

export type OrderTimelineEntry = { status: OrderStatus; at: string };
export type OrderInternalNote = { text: string; by?: string | null; at: string };

export const orders = pgTable(
  "orders",
  {
    id: pk(),
    orderNumber: text("order_number").notNull(),
    /** Client-generated key that makes checkout submission idempotent. */
    idempotencyKey: text("idempotency_key").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    isGuest: boolean("is_guest").notNull(),

    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email"),

    fulfilment: text("fulfilment").$type<FulfilmentType>().notNull().default("DELIVERY"),
    addressHouseNumber: text("address_house_number"),
    addressStreet: text("address_street"),
    addressLandmark: text("address_landmark"),
    addressCity: text("address_city"),
    addressPincode: text("address_pincode"),
    addressInstructions: text("address_instructions"),
    deliveryZoneId: uuid("delivery_zone_id").references(() => deliveryZones.id, { onDelete: "set null" }),
    deliveryZoneName: text("delivery_zone_name"),

    // Pricing (integer paise)
    itemsSubtotal: integer("items_subtotal").notNull(),
    customisationTotal: integer("customisation_total").notNull().default(0),
    productDiscount: integer("product_discount").notNull().default(0),
    subtotal: integer("subtotal").notNull(),
    couponCode: text("coupon_code"),
    couponId: uuid("coupon_id").references(() => coupons.id, { onDelete: "set null" }),
    couponDiscount: integer("coupon_discount").notNull().default(0),
    deliveryFee: integer("delivery_fee").notNull().default(0),
    taxRateBps: integer("tax_rate_bps").notNull().default(0),
    taxInclusive: boolean("tax_inclusive").notNull().default(true),
    tax: integer("tax").notNull().default(0),
    total: integer("total").notNull(),

    // Payment
    paymentMethod: text("payment_method").$type<PaymentMethod>().notNull(),
    paymentStatus: text("payment_status").$type<PaymentStatus>().notNull().default("PENDING"),
    razorpayOrderId: text("razorpay_order_id"),
    razorpayPaymentId: text("razorpay_payment_id"),
    paidAt: ts("paid_at"),
    codCollected: boolean("cod_collected").notNull().default(false),
    codAmountCollected: integer("cod_amount_collected"),
    codCollectedAt: ts("cod_collected_at"),
    codCollectedBy: uuid("cod_collected_by").references(() => users.id, { onDelete: "set null" }),
    codNote: text("cod_note"),

    status: text("status").$type<OrderStatus>().notNull(),
    timeline: jsonb("timeline").$type<OrderTimelineEntry[]>().notNull().default(sql`'[]'::jsonb`),
    isPreorder: boolean("is_preorder").notNull().default(false),
    scheduledFor: ts("scheduled_for"),
    estimatedPrepMinutes: integer("estimated_prep_minutes"),
    estimatedReadyAt: ts("estimated_ready_at"),
    estimatedDeliveryAt: ts("estimated_delivery_at"),
    customerNotes: text("customer_notes"),
    internalNotes: jsonb("internal_notes").$type<OrderInternalNote[]>().notNull().default(sql`'[]'::jsonb`),
    rejectionReason: text("rejection_reason"),
    cancellationReason: text("cancellation_reason"),

    // Personal delivery
    deliveryAssignedTo: uuid("delivery_assigned_to").references(() => users.id, { onDelete: "set null" }),
    deliveryAssignedAt: ts("delivery_assigned_at"),
    outForDeliveryAt: ts("out_for_delivery_at"),
    deliveredAt: ts("delivered_at"),
    deliveryNotes: text("delivery_notes"),
    deliveryProofImageUrl: text("delivery_proof_image_url"),

    /** SHA-256 of the secret tracking token. The raw token is only ever shown to the customer. */
    trackingTokenHash: text("tracking_token_hash").notNull(),
    delayAlertedAt: ts("delay_alerted_at"),
    source: text("source").notNull().default("WEB"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_number_uq").on(t.orderNumber),
    uniqueIndex("orders_idempotency_uq").on(t.idempotencyKey),
    index("orders_user_created_idx").on(t.userId, t.createdAt),
    index("orders_status_created_idx").on(t.status, t.createdAt),
    index("orders_created_idx").on(t.createdAt),
    index("orders_updated_idx").on(t.updatedAt),
    index("orders_phone_created_idx").on(t.customerPhone, t.createdAt),
    index("orders_razorpay_order_idx").on(t.razorpayOrderId).where(sql`${t.razorpayOrderId} is not null`),
    index("orders_payment_idx").on(t.paymentMethod, t.paymentStatus, t.createdAt),
    check("orders_amounts_chk", sql`${t.total} >= 0 and ${t.subtotal} >= 0 and ${t.deliveryFee} >= 0`),
  ],
);

export type OrderItemSelection = { groupId: string; groupName: string; options: { optionId: string; name: string; priceDelta: number }[] };

/** Immutable snapshot of an ordered item: survives later menu edits. */
export const orderItems = pgTable(
  "order_items",
  {
    id: pk(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    /** Plain uuid (no FK): the product may be deleted later; the snapshot stays. */
    productId: uuid("product_id").notNull(),
    categoryId: uuid("category_id"),
    categoryName: text("category_name"),
    name: text("name").notNull(),
    slug: text("slug"),
    imageUrl: text("image_url"),
    isVeg: boolean("is_veg"),
    basePrice: integer("base_price").notNull(),
    unitPrice: integer("unit_price").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotal: integer("line_total").notNull(),
    selections: jsonb("selections").$type<OrderItemSelection[]>().notNull().default(sql`'[]'::jsonb`),
    notes: text("notes"),
    /** Estimated unit cost captured at order time for profit reporting (paise). */
    estimatedUnitCost: integer("estimated_unit_cost"),
  },
  (t) => [index("order_items_order_idx").on(t.orderId, t.position), index("order_items_product_idx").on(t.productId), check("order_items_qty_chk", sql`${t.quantity} >= 1`)],
);

/** Append-only audit trail of every order status change (a trigger blocks UPDATE/DELETE). */
export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: pk(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    orderNumber: text("order_number").notNull(),
    from: text("from_status").$type<OrderStatus | null>(),
    to: text("to_status").$type<OrderStatus>().notNull(),
    actorType: text("actor_type").$type<"ADMIN" | "CUSTOMER" | "SYSTEM">().notNull(),
    actorId: uuid("actor_id"),
    note: text("note"),
    isOverride: boolean("is_override").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("order_status_history_order_idx").on(t.orderId, t.createdAt)],
);

export const payments = pgTable(
  "payments",
  {
    id: pk(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    orderNumber: text("order_number").notNull(),
    method: text("method").$type<PaymentMethod>().notNull(),
    status: text("status").$type<PaymentStatus>().notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("INR"),
    razorpayOrderId: text("razorpay_order_id"),
    razorpayPaymentId: text("razorpay_payment_id"),
    /** Cash actually collected (COD), tracked separately from delivery. */
    amountCollected: integer("amount_collected"),
    collectedAt: ts("collected_at"),
    collectedBy: uuid("collected_by").references(() => users.id, { onDelete: "set null" }),
    refundAmount: integer("refund_amount"),
    refundReference: text("refund_reference"),
    failureReason: text("failure_reason"),
    events: jsonb("events").$type<{ type: string; at: string; data?: unknown }[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("payments_order_uq").on(t.orderId),
    uniqueIndex("payments_razorpay_order_uq").on(t.razorpayOrderId).where(sql`${t.razorpayOrderId} is not null`),
    uniqueIndex("payments_razorpay_payment_uq").on(t.razorpayPaymentId).where(sql`${t.razorpayPaymentId} is not null`),
    index("payments_status_idx").on(t.status, t.createdAt),
    index("payments_method_idx").on(t.method, t.createdAt),
  ],
);

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: pk(),
    couponId: uuid("coupon_id").notNull().references(() => coupons.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Identity used for per-customer limits (`phone:<10 digits>`). */
    customerKey: text("customer_key").notNull(),
    discount: integer("discount").notNull(),
    /** Released redemptions (rejected / cancelled orders) no longer count towards limits. */
    released: boolean("released").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("coupon_redemptions_order_uq").on(t.orderId), index("coupon_redemptions_lookup_idx").on(t.couponId, t.customerKey, t.released)],
);
