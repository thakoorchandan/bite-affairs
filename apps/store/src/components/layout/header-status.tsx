import { getLiveKitchenStatus } from "@/features/business-settings/queries";
import { KitchenStatusPill } from "@/components/shared/kitchen-status-pill";

export async function HeaderKitchenStatus() {
  const status = await getLiveKitchenStatus();
  return <KitchenStatusPill status={status} />;
}
