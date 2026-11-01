"use client";

import { useState } from "react";
import { Check, ChevronRight, Loader2, MoreHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ORDER_STATUS_LABELS, type FulfilmentType, type OrderStatus } from "@/constants/domain";
import { nextPrimaryStatus } from "@/services/order-state";
import { useOrderStatus } from "./use-order-status";
import { ReasonDialog } from "./reason-dialog";
import { cn } from "@/lib/utils";

const PRIMARY_LABEL: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: "Accept",
  PREPARING: "Start preparing",
  READY: "Mark ready",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Mark delivered",
};

export const REJECT_REASONS = ["Item out of stock", "Kitchen too busy", "Address not serviceable", "Customer unreachable"];
export const CANCEL_REASONS = ["Customer requested cancellation", "Customer unreachable", "Item out of stock", "Delivery not possible"];

export interface StatusOrder {
  id: string;
  orderNumber: string;
  status: string;
  fulfilment?: string | null;
}

/** Primary next-step button + reject / cancel menu for an order. */
export function OrderStatusActions({ order, size = "sm", className, showSecondary = true }: { order: StatusOrder; size?: "sm" | "default" | "lg"; className?: string; showSecondary?: boolean }) {
  const { run, pendingId } = useOrderStatus();
  const [dialog, setDialog] = useState<null | "REJECTED" | "CANCELLED">(null);
  const status = order.status as OrderStatus;
  const next = nextPrimaryStatus(status, (order.fulfilment ?? "DELIVERY") as FulfilmentType);
  const busy = pendingId === order.id;
  const canReject = status === "PLACED";
  const canCancel = ["PLACED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"].includes(status);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {next && (
        <Button size={size} disabled={busy} onClick={() => run(order, next)} className="flex-1 sm:flex-none">
          {busy ? <Loader2 className="size-4 animate-spin" /> : status === "PLACED" ? <Check className="size-4" /> : <ChevronRight className="size-4" />}
          {PRIMARY_LABEL[next] ?? ORDER_STATUS_LABELS[next]}
        </Button>
      )}
      {showSecondary && canReject && (
        <Button size={size} variant="destructive" disabled={busy} onClick={() => setDialog("REJECTED")}>
          <X className="size-4" /> Reject
        </Button>
      )}
      {showSecondary && canCancel && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size={size === "lg" ? "icon-lg" : "icon-sm"} variant="ghost" aria-label="More actions" disabled={busy} />}>
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onClick={() => setDialog("CANCELLED")}>
              Cancel order
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ReasonDialog
        open={dialog !== null}
        onOpenChange={(v) => !v && setDialog(null)}
        title={dialog === "REJECTED" ? `Reject ${order.orderNumber}?` : `Cancel ${order.orderNumber}?`}
        description={dialog === "REJECTED" ? "The customer will see that the order couldn't be accepted. Any coupon use is returned." : "This stops the order. Any coupon use is returned. This cannot be undone."}
        confirmLabel={dialog === "REJECTED" ? "Reject order" : "Cancel order"}
        destructive
        suggestions={dialog === "REJECTED" ? REJECT_REASONS : CANCEL_REASONS}
        onConfirm={(reason) => run(order, dialog!, { reason })}
      />
    </div>
  );
}
