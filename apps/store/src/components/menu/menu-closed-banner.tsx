import { getLiveKitchenStatus } from "@/features/business-settings/queries";
import { formatInZone } from "@/lib/utilities/time";
import { Clock } from "lucide-react";

/** Shown on menu pages when immediate ordering is unavailable. */
export async function MenuClosedBanner() {
  const status = await getLiveKitchenStatus();
  if (status.canOrderNow) return null;
  return (
    <div role="status" className="mb-6 flex items-start gap-3 rounded-2xl border border-gold/30 bg-gold/10 p-4 text-sm">
      <Clock className="mt-0.5 size-5 shrink-0 text-gold" />
      <div>
        <p className="font-bold text-gold">{status.message}</p>
        <p className="text-muted-foreground">
          {status.nextOpenAt ? `We open again ${formatInZone(status.nextOpenAt, status.timezone, { weekday: "long", hour: "numeric", minute: "2-digit" })}. ` : ""}
          {status.canPreorder ? "You can still place a pre-order for later." : "You can browse the menu and add items to your cart."}
        </p>
      </div>
    </div>
  );
}
