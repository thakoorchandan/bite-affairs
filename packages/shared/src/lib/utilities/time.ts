/**
 * Timezone helpers built on Intl so they work in Node and edge runtimes without extra
 * dependencies. Business hours are stored as "HH:mm" in the business timezone.
 */
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

const weekdayIndex: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: weekdayIndex[parts.weekday as string],
  };
}

/** Convert a wall-clock time in `timeZone` to a UTC Date. */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let result = guess;
  // Two iterations settle the offset, including around DST changes.
  for (let i = 0; i < 2; i++) {
    const p = getZonedParts(new Date(result), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    result = result - (asUtc - guess);
  }
  return new Date(result);
}

export function parseHHmm(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error(`Invalid time: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function toDateKey(p: Pick<ZonedParts, "year" | "month" | "day">): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function addDaysToDateKey(dateKey: string, days: number): { year: number; month: number; day: number; weekday: number } {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: date.getUTCDay() };
}

export function formatInZone(date: Date | string, timeZone = DEFAULT_TIMEZONE, options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }) {
  return new Intl.DateTimeFormat("en-IN", { timeZone, ...options }).format(new Date(date));
}

/** Start/end of a calendar day in the business timezone, as UTC Dates. */
export function zonedDayRange(dateKey: string, timeZone: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const start = zonedTimeToUtc(y, m, d, 0, 0, timeZone);
  const next = addDaysToDateKey(dateKey, 1);
  const end = zonedTimeToUtc(next.year, next.month, next.day, 0, 0, timeZone);
  return { start, end };
}
