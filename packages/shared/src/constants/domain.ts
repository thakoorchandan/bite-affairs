export const ROLES = ["CUSTOMER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_STATUSES = [
  "AWAITING_PAYMENT",
  "PLACED",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "REJECTED",
  "REFUND_INITIATED",
  "REFUNDED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: "Awaiting Payment",
  PLACED: "Order Placed",
  CONFIRMED: "Order Confirmed",
  PREPARING: "Preparing",
  READY: "Food Ready",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
  REFUND_INITIATED: "Refund Initiated",
  REFUNDED: "Refunded",
};

/** The happy-path lifecycle shown on the customer tracking timeline. */
export const ORDER_LIFECYCLE: OrderStatus[] = ["PLACED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED"];
export const PICKUP_LIFECYCLE: OrderStatus[] = ["PLACED", "CONFIRMED", "PREPARING", "READY", "DELIVERED"];

export const TERMINAL_STATUSES: OrderStatus[] = ["DELIVERED", "CANCELLED", "REJECTED", "REFUNDED"];
export const ACTIVE_KITCHEN_STATUSES: OrderStatus[] = ["PLACED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"];

export const PAYMENT_METHODS = ["COD", "RAZORPAY"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED", "REFUND_INITIATED", "REFUNDED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const FULFILMENT_TYPES = ["DELIVERY", "PICKUP"] as const;
export type FulfilmentType = (typeof FULFILMENT_TYPES)[number];

export const KITCHEN_MODES = ["AUTO", "OPEN", "CLOSED", "PAUSED"] as const;
export type KitchenMode = (typeof KITCHEN_MODES)[number];

export const KITCHEN_STATES = ["OPEN", "CLOSED", "PAUSED", "UNAVAILABLE", "PREORDER"] as const;
export type KitchenState = (typeof KITCHEN_STATES)[number];

export const COUPON_TYPES = ["PERCENT", "FLAT"] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export const EXPENSE_CATEGORIES = [
  "RAW_MATERIALS",
  "PACKAGING",
  "ELECTRICITY",
  "GAS",
  "DELIVERY",
  "MARKETING",
  "RENT",
  "SALARIES",
  "MISCELLANEOUS",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  RAW_MATERIALS: "Raw materials",
  PACKAGING: "Packaging",
  ELECTRICITY: "Electricity",
  GAS: "Gas",
  DELIVERY: "Delivery expenses",
  MARKETING: "Marketing",
  RENT: "Rent",
  SALARIES: "Salaries",
  MISCELLANEOUS: "Miscellaneous",
};

export const NOTIFICATION_TYPES = [
  "NEW_ORDER",
  "ORDER_CANCELLED",
  "PAYMENT_RECEIVED",
  "PAYMENT_FAILED",
  "ORDER_READY",
  "ORDER_DELAYED",
  "ORDER_STATUS",
  "SYSTEM",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const MEDIA_KINDS = ["image", "video"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const REVIEW_STATUSES = ["PENDING", "APPROVED", "HIDDEN"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const BRAND = {
  name: "Bite Affairs",
  tagline: "Real Chinese. Real Flavours. Everyday.",
  secondaryTagline: "Good Food. Good Mood.",
  city: "Kolkata",
  currency: "INR",
} as const;
