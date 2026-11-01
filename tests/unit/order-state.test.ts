import { describe, expect, it } from "vitest";
import { allowedTransitions, validateTransition } from "@/services/order-state";

const delivery = { fulfilment: "DELIVERY" as const, paymentStatus: "PENDING" as const };

describe("order state machine", () => {
  it("follows the delivery lifecycle", () => {
    expect(validateTransition("PLACED", "CONFIRMED", delivery)).toBeNull();
    expect(validateTransition("READY", "OUT_FOR_DELIVERY", delivery)).toBeNull();
    expect(validateTransition("OUT_FOR_DELIVERY", "DELIVERED", delivery)).toBeNull();
  });
  it("blocks skipping Out for Delivery unless overridden with a reason", () => {
    expect(validateTransition("READY", "DELIVERED", delivery)).toMatch(/Cannot/);
    expect(validateTransition("PREPARING", "DELIVERED", delivery, { enabled: true })).toMatch(/reason/);
    expect(validateTransition("PREPARING", "DELIVERED", delivery, { enabled: true, reason: "Customer collected in person" })).toBeNull();
  });
  it("allows pickup orders to be delivered from ready", () => {
    expect(validateTransition("READY", "DELIVERED", { fulfilment: "PICKUP", paymentStatus: "PENDING" })).toBeNull();
  });
  it("only offers refunds for paid orders", () => {
    expect(allowedTransitions("CANCELLED", delivery)).toEqual([]);
    expect(allowedTransitions("CANCELLED", { ...delivery, paymentStatus: "PAID" })).toEqual(["REFUND_INITIATED"]);
  });
  it("rejects no-op transitions", () => {
    expect(validateTransition("PLACED", "PLACED", delivery)).toMatch(/already/);
  });
});
