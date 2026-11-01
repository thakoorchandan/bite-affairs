import { DEFAULT_TIMEZONE, getZonedParts } from "@/lib/utilities/time";

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO date → value for <input type="datetime-local"> in the business timezone. */
export function toLocalDateTimeInput(iso: string | Date | null | undefined, timeZone = DEFAULT_TIMEZONE): string {
  if (!iso) return "";
  const p = getZonedParts(new Date(iso), timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function todayKey(timeZone = DEFAULT_TIMEZONE): string {
  const p = getZonedParts(new Date(), timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
