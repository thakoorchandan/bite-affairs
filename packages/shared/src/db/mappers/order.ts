import type { orderItems, orders } from "../schema";
import type { OrderStatus } from "@/constants/domain";

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;

/**
 * Nested "document" view of an order. This is the shape every UI component and service consumed when the
 * data lived in MongoDB (`order.pricing.total`, `order.customer.name`, …), now with `id` instead of `_id`
 * and string uuids instead of ObjectIds. Flat Postgres columns are folded into it by `toOrderDoc`.
 */
export interface OrderDoc {
  id: string;
  orderNumber: string;
  idempotencyKey: string;
  userId: string | null;
  isGuest: boolean;
  customer: { name: string; phone: string; email: string | null };
  fulfilment: "DELIVERY" | "PICKUP";
  /** null for pickup orders. */
  address: { houseNumber: string | null; street: string | null; landmark: string | null; city: string | null; pincode: string | null; instructions: string | null } | null;
  deliveryZoneId: string | null;
  deliveryZoneName: string | null;
  items: OrderItemDoc[];
  pricing: {
    itemsSubtotal: number;
    customisationTotal: number;
    productDiscount: number;
    subtotal: number;
    couponCode: string | null;
    couponId: string | null;
    couponDiscount: number;
    deliveryFee: number;
    taxRateBps: number;
    taxInclusive: boolean;
    tax: number;
    total: number;
  };
  payment: {
    method: OrderRow["paymentMethod"];
    status: OrderRow["paymentStatus"];
    razorpayOrderId: string | null;
    razorpayPaymentId: string | null;
    paidAt: Date | null;
    cod: { collected: boolean; amountCollected: number | null; collectedAt: Date | null; collectedBy: string | null; note: string | null };
  };
  status: OrderStatus;
  timeline: { status: OrderStatus; at: Date }[];
  isPreorder: boolean;
  scheduledFor: Date | null;
  estimatedPrepMinutes: number | null;
  estimatedReadyAt: Date | null;
  estimatedDeliveryAt: Date | null;
  customerNotes: string | null;
  internalNotes: { text: string; by: string | null; at: Date }[];
  rejectionReason: string | null;
  cancellationReason: string | null;
  delivery: {
    assignedTo: string | null;
    assignedAt: Date | null;
    outForDeliveryAt: Date | null;
    deliveredAt: Date | null;
    notes: string | null;
    proofImageUrl: string | null;
  };
  delayAlertedAt: Date | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItemDoc {
  id: string;
  productId: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  slug: string | null;
  imageUrl: string | null;
  isVeg: boolean | null;
  basePrice: number;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  selections: OrderItemRow["selections"];
  notes: string | null;
  estimatedUnitCost: number | null;
}

export function toOrderItemDoc(i: OrderItemRow): OrderItemDoc {
  return {
    id: i.id,
    productId: i.productId,
    categoryId: i.categoryId,
    categoryName: i.categoryName,
    name: i.name,
    slug: i.slug,
    imageUrl: i.imageUrl,
    isVeg: i.isVeg,
    basePrice: i.basePrice,
    unitPrice: i.unitPrice,
    quantity: i.quantity,
    lineTotal: i.lineTotal,
    selections: i.selections ?? [],
    notes: i.notes,
    estimatedUnitCost: i.estimatedUnitCost,
  };
}

/** Fold a flat `orders` row (+ its `order_items` rows, already sorted by position) into the nested OrderDoc. */
export function toOrderDoc(row: OrderRow, items: OrderItemRow[] = []): OrderDoc {
  const hasAddress = row.fulfilment === "DELIVERY";
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    idempotencyKey: row.idempotencyKey,
    userId: row.userId,
    isGuest: row.isGuest,
    customer: { name: row.customerName, phone: row.customerPhone, email: row.customerEmail },
    fulfilment: row.fulfilment,
    address: hasAddress
      ? { houseNumber: row.addressHouseNumber, street: row.addressStreet, landmark: row.addressLandmark, city: row.addressCity, pincode: row.addressPincode, instructions: row.addressInstructions }
      : null,
    deliveryZoneId: row.deliveryZoneId,
    deliveryZoneName: row.deliveryZoneName,
    items: items.map(toOrderItemDoc),
    pricing: {
      itemsSubtotal: row.itemsSubtotal,
      customisationTotal: row.customisationTotal,
      productDiscount: row.productDiscount,
      subtotal: row.subtotal,
      couponCode: row.couponCode,
      couponId: row.couponId,
      couponDiscount: row.couponDiscount,
      deliveryFee: row.deliveryFee,
      taxRateBps: row.taxRateBps,
      taxInclusive: row.taxInclusive,
      tax: row.tax,
      total: row.total,
    },
    payment: {
      method: row.paymentMethod,
      status: row.paymentStatus,
      razorpayOrderId: row.razorpayOrderId,
      razorpayPaymentId: row.razorpayPaymentId,
      paidAt: row.paidAt,
      cod: { collected: row.codCollected, amountCollected: row.codAmountCollected, collectedAt: row.codCollectedAt, collectedBy: row.codCollectedBy, note: row.codNote },
    },
    status: row.status,
    timeline: (row.timeline ?? []).map((t) => ({ status: t.status, at: new Date(t.at) })),
    isPreorder: row.isPreorder,
    scheduledFor: row.scheduledFor,
    estimatedPrepMinutes: row.estimatedPrepMinutes,
    estimatedReadyAt: row.estimatedReadyAt,
    estimatedDeliveryAt: row.estimatedDeliveryAt,
    customerNotes: row.customerNotes,
    internalNotes: (row.internalNotes ?? []).map((n) => ({ text: n.text, by: n.by ?? null, at: new Date(n.at) })),
    rejectionReason: row.rejectionReason,
    cancellationReason: row.cancellationReason,
    delivery: {
      assignedTo: row.deliveryAssignedTo,
      assignedAt: row.deliveryAssignedAt,
      outForDeliveryAt: row.outForDeliveryAt,
      deliveredAt: row.deliveredAt,
      notes: row.deliveryNotes,
      proofImageUrl: row.deliveryProofImageUrl,
    },
    delayAlertedAt: row.delayAlertedAt,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Group item rows by order id (rows must already be ordered by position). */
export function groupItemsByOrder(rows: OrderItemRow[]): Map<string, OrderItemRow[]> {
  const map = new Map<string, OrderItemRow[]>();
  for (const r of rows) {
    const list = map.get(r.orderId);
    if (list) list.push(r);
    else map.set(r.orderId, [r]);
  }
  return map;
}
