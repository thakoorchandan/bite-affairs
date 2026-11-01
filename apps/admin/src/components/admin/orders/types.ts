import type { FulfilmentType, OrderStatus, PaymentMethod, PaymentStatus } from "@/constants/domain";

/** Loose view of a serialized OrderDoc (see db/mappers/order.ts) as listed on the admin boards. */
export interface OrderView {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  customer: { name: string; phone: string };
  fulfilment: FulfilmentType;
  isPreorder?: boolean | null;
  scheduledFor?: string | null;
  pricing: { total: number; deliveryFee?: number | null };
  payment: { method: PaymentMethod; status: PaymentStatus; cod?: { collected?: boolean | null } | null };
  items: { name: string; quantity: number; notes?: string | null; selections?: { groupName?: string | null; options?: { name?: string | null }[] | null }[] | null }[];
  customerNotes?: string | null;
  address?: { houseNumber?: string | null; street?: string | null; landmark?: string | null; city?: string | null; pincode?: string | null; instructions?: string | null } | null;
  estimatedReadyAt?: string | null;
  estimatedDeliveryAt?: string | null;
  delivery?: { assignedTo?: string | null; assignedAt?: string | null; outForDeliveryAt?: string | null; deliveredAt?: string | null; notes?: string | null; proofImageUrl?: string | null } | null;
}

export const asOrderViews = (rows: unknown[]) => rows as OrderView[];

export function optionSummary(item: OrderView["items"][number]): string {
  return (item.selections ?? []).flatMap((s) => (s.options ?? []).map((o) => o.name ?? "")).filter(Boolean).join(", ");
}

export function mapsUrl(a: OrderView["address"]): string | null {
  if (!a) return null;
  const q = [a.houseNumber, a.street, a.landmark, a.city, a.pincode].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export const telUrl = (phone: string) => `tel:+91${phone}`;
export const whatsappUrl = (phone: string, text?: string) => `https://wa.me/91${phone}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

export interface SelectionView {
  groupName?: string | null;
  options?: { name?: string | null; priceDelta?: number | null }[] | null;
}
export const selectionsOf = (item: { selections?: unknown }) => ((item.selections ?? []) as SelectionView[]);
