import { describe, expect, it } from "vitest";
import { computeKitchenStatus, validatePreorderTime, type HoursConfig, type KitchenConfig } from "@/services/kitchen-status";

const hours: HoursConfig = {
  timezone: "Asia/Kolkata",
  weekly: Array.from({ length: 7 }, (_, day) => ({ day, isOpen: day !== 1, slots: [{ open: "11:00", close: "23:00" }] })), // closed Mondays
  specialDates: [{ date: "2026-12-25", isClosed: true, slots: [] }],
};
const kitchen: KitchenConfig = { mode: "AUTO", preordersEnabled: false, preorderMaxDaysAhead: 2 };
// 2026-11-01 is a Sunday. 12:00 IST = 06:30 UTC.
const sundayNoon = new Date("2026-11-01T06:30:00Z");
const sundayLate = new Date("2026-11-01T18:00:00Z"); // 23:30 IST

describe("kitchen status", () => {
  it("is open within business hours in the business timezone", () => {
    const s = computeKitchenStatus(kitchen, hours, sundayNoon);
    expect(s.state).toBe("OPEN");
    expect(s.canOrderNow).toBe(true);
    expect(s.closesAt).toBe("2026-11-01T17:30:00.000Z");
  });
  it("is closed after hours and skips the closed weekday for next opening", () => {
    const s = computeKitchenStatus(kitchen, hours, sundayLate);
    expect(s.state).toBe("CLOSED");
    expect(s.canOrderNow).toBe(false);
    // Monday closed → next opening Tuesday 11:00 IST = 05:30 UTC
    expect(s.nextOpenAt).toBe("2026-11-03T05:30:00.000Z");
  });
  it("manual override takes precedence over hours", () => {
    expect(computeKitchenStatus({ ...kitchen, mode: "CLOSED" }, hours, sundayNoon).canOrderNow).toBe(false);
    expect(computeKitchenStatus({ ...kitchen, mode: "OPEN" }, hours, sundayLate).canOrderNow).toBe(true);
    expect(computeKitchenStatus({ ...kitchen, mode: "PAUSED" }, hours, sundayNoon).state).toBe("PAUSED");
  });
  it("pause expires automatically", () => {
    const s = computeKitchenStatus({ ...kitchen, mode: "PAUSED", pausedUntil: new Date("2026-11-01T06:00:00Z") }, hours, sundayNoon);
    expect(s.state).toBe("OPEN");
  });
  it("temporary closure and holidays", () => {
    const t = computeKitchenStatus({ ...kitchen, mode: "OPEN", temporaryClosure: { active: true, message: "Renovation" } }, hours, sundayNoon);
    expect(t.state).toBe("UNAVAILABLE");
    expect(t.message).toBe("Renovation");
    const xmas = computeKitchenStatus(kitchen, hours, new Date("2026-12-25T08:00:00Z"));
    expect(xmas.state).toBe("CLOSED");
  });
  it("supports pre-orders when closed", () => {
    const s = computeKitchenStatus({ ...kitchen, preordersEnabled: true }, hours, sundayLate);
    expect(s.state).toBe("PREORDER");
    expect(s.canPreorder).toBe(true);
    expect(validatePreorderTime({ ...kitchen, preordersEnabled: true }, hours, new Date("2026-11-03T07:00:00Z"), sundayLate)).toBeNull();
    expect(validatePreorderTime({ ...kitchen, preordersEnabled: true }, hours, new Date("2026-11-02T07:00:00Z"), sundayLate)).toMatch(/opening hours/);
  });
  it("handles slots that run past midnight", () => {
    const late: HoursConfig = { ...hours, weekly: Array.from({ length: 7 }, (_, day) => ({ day, isOpen: true, slots: [{ open: "18:00", close: "02:00" }] })) };
    expect(computeKitchenStatus(kitchen, late, new Date("2026-11-01T19:30:00Z")).state).toBe("OPEN"); // 01:00 IST
  });
});
