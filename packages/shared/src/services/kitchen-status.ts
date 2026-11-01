import type { KitchenMode, KitchenState } from "@/constants/domain";
import { addDaysToDateKey, getZonedParts, parseHHmm, toDateKey, zonedTimeToUtc } from "@/lib/utilities/time";

export interface HoursSlot {
  open: string;
  close: string;
}
export interface HoursConfig {
  timezone: string;
  weekly: { day: number; isOpen: boolean; slots: HoursSlot[] }[];
  specialDates: { date: string; isClosed: boolean; slots: HoursSlot[]; note?: string | null }[];
}
export interface KitchenConfig {
  mode: KitchenMode;
  preordersEnabled: boolean;
  preorderMaxDaysAhead: number;
  closedMessage?: string | null;
  pausedMessage?: string | null;
  pausedUntil?: Date | string | null;
  temporaryClosure?: { active?: boolean | null; from?: Date | string | null; until?: Date | string | null; message?: string | null } | null;
}

export interface KitchenStatus {
  state: KitchenState;
  /** Immediate (ASAP) orders accepted. */
  canOrderNow: boolean;
  /** Scheduled orders accepted for a future opening window. */
  canPreorder: boolean;
  message: string;
  nextOpenAt: string | null;
  closesAt: string | null;
  timezone: string;
}

interface Window {
  start: Date;
  end: Date;
}

/** Opening windows that intersect a given local calendar day (handles slots past midnight). */
function windowsForDate(dateKey: string, hours: HoursConfig): Window[] {
  const { year, month, day, weekday } = addDaysToDateKey(dateKey, 0);
  const special = hours.specialDates.find((s) => s.date === dateKey);
  let slots: HoursSlot[];
  if (special) slots = special.isClosed ? [] : special.slots;
  else {
    const weekly = hours.weekly.find((w) => w.day === weekday);
    slots = weekly && weekly.isOpen ? weekly.slots : [];
  }
  return slots.map((slot) => {
    const openMin = parseHHmm(slot.open);
    const closeMin = parseHHmm(slot.close);
    const start = zonedTimeToUtc(year, month, day, Math.floor(openMin / 60), openMin % 60, hours.timezone);
    let end: Date;
    if (closeMin > openMin) end = zonedTimeToUtc(year, month, day, Math.floor(closeMin / 60), closeMin % 60, hours.timezone);
    else {
      const next = addDaysToDateKey(dateKey, 1);
      end = zonedTimeToUtc(next.year, next.month, next.day, Math.floor(closeMin / 60), closeMin % 60, hours.timezone);
    }
    return { start, end };
  });
}

/** All opening windows from yesterday through `daysAhead` days from now, sorted. */
export function openingWindows(hours: HoursConfig, now: Date, daysAhead = 7): Window[] {
  const todayKey = toDateKey(getZonedParts(now, hours.timezone));
  const windows: Window[] = [];
  for (let offset = -1; offset <= daysAhead; offset++) {
    const d = addDaysToDateKey(todayKey, offset);
    windows.push(...windowsForDate(toDateKey(d), hours));
  }
  return windows.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function isWithinOpeningHours(hours: HoursConfig, at: Date): boolean {
  return openingWindows(hours, at, 1).some((w) => at >= w.start && at < w.end);
}

function nextOpeningAfter(windows: Window[], after: Date): string | null {
  const w = windows.find((x) => x.end > after);
  if (!w) return null;
  return (w.start > after ? w.start : after).toISOString();
}

export function computeKitchenStatus(kitchen: KitchenConfig, hours: HoursConfig, now: Date = new Date()): KitchenStatus {
  const windows = openingWindows(hours, now, 8);
  const current = windows.find((w) => now >= w.start && now < w.end);
  const nextWindow = windows.find((w) => w.start > now);
  const base = { timezone: hours.timezone, nextOpenAt: nextWindow?.start.toISOString() ?? null, closesAt: current?.end.toISOString() ?? null };
  const preorderPossible = kitchen.preordersEnabled && !!nextWindow;

  const closure = kitchen.temporaryClosure;
  if (closure?.active) {
    const from = closure.from ? new Date(closure.from) : null;
    const until = closure.until ? new Date(closure.until) : null;
    if ((!from || now >= from) && (!until || now < until)) {
      return {
        ...base,
        state: "UNAVAILABLE",
        canOrderNow: false,
        canPreorder: false,
        message: closure.message || "We're temporarily unavailable.",
        nextOpenAt: until ? nextOpeningAfter(windows, until) : base.nextOpenAt,
        closesAt: null,
      };
    }
  }

  if (kitchen.mode === "PAUSED") {
    const until = kitchen.pausedUntil ? new Date(kitchen.pausedUntil) : null;
    if (!until || now < until) {
      return {
        ...base,
        state: "PAUSED",
        canOrderNow: false,
        canPreorder: preorderPossible,
        message: kitchen.pausedMessage || "We're paused right now.",
        nextOpenAt: until ? until.toISOString() : base.nextOpenAt,
      };
    }
  }

  if (kitchen.mode === "OPEN") {
    return { ...base, state: "OPEN", canOrderNow: true, canPreorder: false, message: "We're open and cooking!", closesAt: current?.end.toISOString() ?? null };
  }

  if (kitchen.mode === "CLOSED") {
    return {
      ...base,
      state: preorderPossible ? "PREORDER" : "CLOSED",
      canOrderNow: false,
      canPreorder: preorderPossible,
      message: kitchen.closedMessage || "We're closed right now.",
    };
  }

  // AUTO (and PAUSED whose pause expired): follow business hours.
  if (current) return { ...base, state: "OPEN", canOrderNow: true, canPreorder: false, message: "We're open and cooking!" };
  return {
    ...base,
    state: preorderPossible ? "PREORDER" : "CLOSED",
    canOrderNow: false,
    canPreorder: preorderPossible,
    message: kitchen.closedMessage || "We're closed right now.",
  };
}

/** Validate a requested pre-order time: inside an opening window, in the future, within the allowed horizon. */
export function validatePreorderTime(kitchen: KitchenConfig, hours: HoursConfig, scheduledFor: Date, now: Date = new Date(), minLeadMinutes = 30): string | null {
  if (scheduledFor.getTime() < now.getTime() + minLeadMinutes * 60_000) return `Pre-orders must be at least ${minLeadMinutes} minutes from now.`;
  if (scheduledFor.getTime() > now.getTime() + (kitchen.preorderMaxDaysAhead || 1) * 86_400_000) return "That time is too far ahead for a pre-order.";
  const windows = openingWindows(hours, now, (kitchen.preorderMaxDaysAhead || 1) + 1);
  if (!windows.some((w) => scheduledFor >= w.start && scheduledFor < w.end)) return "Please choose a time within our opening hours.";
  return null;
}
