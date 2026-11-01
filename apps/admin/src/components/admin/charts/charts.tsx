import { formatINR } from "@/lib/utilities/money";
import { cn } from "@/lib/utils";

/**
 * Lightweight, dependency-free SVG charts. Server-renderable; native <title> elements
 * provide hover tooltips and screen-reader text.
 */
const shortDay = (key: string) => {
  const [, m, d] = key.split("-").map(Number);
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`;
};

export function RevenueTrendChart({ data, height = 220 }: { data: { day: string; revenue: number; orders: number }[]; height?: number }) {
  if (!data.length || data.every((d) => d.revenue === 0)) {
    return <div className="grid place-items-center text-sm text-muted-foreground" style={{ height }}>No sales in this period yet.</div>;
  }
  const W = 720;
  const H = height;
  const pad = { l: 8, r: 8, t: 16, b: 26 };
  const max = Math.max(...data.map((d) => d.revenue), 1);
  const bw = (W - pad.l - pad.r) / data.length;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const points = data.map((d, i) => `${pad.l + bw * i + bw / 2},${y(d.revenue)}`).join(" ");
  const labelEvery = Math.ceil(data.length / 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Revenue by day">
      <defs>
        <linearGradient id="revFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--brand-gold)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--brand-gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" className="text-border" strokeDasharray="3 5" />
      ))}
      {data.length > 1 && <polygon points={`${pad.l + bw / 2},${H - pad.b} ${points} ${pad.l + bw * (data.length - 1) + bw / 2},${H - pad.b}`} fill="url(#revFill)" />}
      {data.map((d, i) => (
        <g key={d.day}>
          <rect x={pad.l + bw * i + bw * 0.2} width={bw * 0.6} y={y(d.revenue)} height={Math.max(0, H - pad.b - y(d.revenue))} rx={Math.min(6, bw * 0.15)} fill="var(--brand-gold)" opacity={data.length > 1 ? 0.18 : 0.8}>
            <title>{`${shortDay(d.day)}: ${formatINR(d.revenue)} · ${d.orders} order${d.orders === 1 ? "" : "s"}`}</title>
          </rect>
          {(i % labelEvery === 0 || i === data.length - 1) && (
            <text x={pad.l + bw * i + bw / 2} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
              {shortDay(d.day)}
            </text>
          )}
        </g>
      ))}
      {data.length > 1 && <polyline points={points} fill="none" stroke="var(--brand-gold)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
      {data.map((d, i) => (
        <circle key={d.day} cx={pad.l + bw * i + bw / 2} cy={y(d.revenue)} r={data.length > 40 ? 0 : 3.5} fill="var(--background)" stroke="var(--brand-gold)" strokeWidth={2}>
          <title>{`${shortDay(d.day)}: ${formatINR(d.revenue)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

export function HorizontalBars({ rows, format = "money", emptyText = "No data yet." }: { rows: { label: string; value: number; sub?: string }[]; format?: "money" | "number"; emptyText?: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">{r.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {format === "money" ? formatINR(r.value) : r.value}
              {r.sub && <span className="ml-1.5 text-xs">· {r.sub}</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-to-r from-gold-deep to-gold" style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function HourHeatmap({ matrix }: { matrix: number[][] }) {
  const max = Math.max(...matrix.flat(), 0);
  if (!max) return <p className="py-6 text-center text-sm text-muted-foreground">No orders in this period yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-[3px] text-[10px]">
        <thead>
          <tr>
            <th className="w-10" />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="font-normal text-muted-foreground">
                {h % 3 === 0 ? `${h}` : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, d) => (
            <tr key={d}>
              <th className="pr-1 text-left font-medium text-muted-foreground">{DAYS[d]}</th>
              {row.map((v, h) => (
                <td key={h} className="h-6 rounded-[4px]" style={{ background: v ? `color-mix(in oklch, var(--brand-gold) ${Math.round(15 + (v / max) * 85)}%, transparent)` : "var(--muted)" }} title={`${DAYS[d]} ${h}:00–${h + 1}:00 · ${v} order${v === 1 ? "" : "s"}`}>
                  <span className="sr-only">{v}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">Order volume by weekday and hour (business timezone). Darker = busier.</p>
    </div>
  );
}

export function SplitBar({ parts, format = "number" }: { parts: { label: string; value: number; className?: string }[]; format?: "money" | "number" }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <p className="py-4 text-center text-sm text-muted-foreground">No data yet.</p>;
  const colors = ["bg-gold", "bg-sky-400", "bg-emerald-400", "bg-orange-400", "bg-violet-400"];
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={parts.map((p) => `${p.label} ${Math.round((p.value / total) * 100)}%`).join(", ")}>
        {parts.map((p, i) => (
          <div key={p.label} className={cn(p.className ?? colors[i % colors.length])} style={{ width: `${(p.value / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className={cn("size-2.5 rounded-full", p.className ?? colors[i % colors.length])} />
              {p.label}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {format === "money" ? formatINR(p.value) : p.value} · {Math.round((p.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
