import { ORDER_STATUS_LABELS, type OrderStatus } from "@/constants/domain";
import { cn } from "@/lib/utils";

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: "bg-muted text-muted-foreground border-border",
  PLACED: "bg-gold/15 text-gold border-gold/30",
  CONFIRMED: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  PREPARING: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  READY: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  OUT_FOR_DELIVERY: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  DELIVERED: "bg-green-600/15 text-green-300 border-green-600/30",
  CANCELLED: "bg-red-500/10 text-red-300 border-red-500/25",
  REJECTED: "bg-red-500/10 text-red-300 border-red-500/25",
  REFUND_INITIATED: "bg-amber-500/10 text-amber-300 border-amber-500/25",
  REFUNDED: "bg-zinc-500/15 text-zinc-300 border-zinc-500/25",
};

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", ORDER_STATUS_STYLES[status], className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
