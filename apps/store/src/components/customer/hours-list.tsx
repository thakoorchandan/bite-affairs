import type { HoursConfig } from "@/services/kitchen-status";
import { cn } from "@/lib/utils";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatHHmm(value: string) {
  const [h, m] = value.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""} ${suffix}`;
}

/** Weekly opening hours, Monday first, today highlighted when `today` is given (0 = Sunday). */
export function HoursList({ hours, today, className }: { hours: HoursConfig; today?: number; className?: string }) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <dl className={cn("grid gap-1.5 text-sm", className)}>
      {order.map((day) => {
        const entry = hours.weekly.find((w) => w.day === day);
        const open = entry?.isOpen && entry.slots.length > 0;
        return (
          <div key={day} className={cn("flex justify-between gap-4 rounded-md px-2 py-1", today === day && "bg-gold/10 text-gold")}>
            <dt className="font-medium">{DAYS[day]}</dt>
            <dd className={cn("tabular-nums", !open && "text-muted-foreground")}>{open ? entry!.slots.map((s) => `${formatHHmm(s.open)} – ${formatHHmm(s.close)}`).join(", ") : "Closed"}</dd>
          </div>
        );
      })}
    </dl>
  );
}
