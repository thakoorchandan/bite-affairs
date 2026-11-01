import { openingWindows, type HoursConfig } from "@/services/kitchen-status";
import { formatInZone } from "@/lib/utilities/time";

/** 30-minute pre-order slots inside opening windows, at least 45 minutes from now. */
export function buildPreorderSlots(hours: HoursConfig, maxDaysAhead: number, now = new Date()) {
  const earliest = now.getTime() + 45 * 60_000;
  const latest = now.getTime() + Math.max(1, maxDaysAhead) * 86_400_000;
  const step = 30 * 60_000;
  const slots: { value: string; label: string; day: string }[] = [];
  for (const w of openingWindows(hours, now, Math.max(1, maxDaysAhead) + 1)) {
    let t = Math.ceil(Math.max(w.start.getTime(), earliest) / step) * step;
    while (t <= w.end.getTime() - 15 * 60_000 && t <= latest) {
      const d = new Date(t);
      slots.push({
        value: d.toISOString(),
        label: formatInZone(d, hours.timezone, { hour: "numeric", minute: "2-digit" }),
        day: formatInZone(d, hours.timezone, { weekday: "long", day: "numeric", month: "short" }),
      });
      t += step;
    }
  }
  return slots.slice(0, 200);
}
