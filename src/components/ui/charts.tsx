import { cn } from "@/lib/utils";

export interface Slice { label: string; value: number; color: string }

/** Accessible SVG donut: values are also listed as text beside it. */
export function Donut({ slices, centerLabel, centerValue }: { slices: Slice[]; centerLabel: string; centerValue: string }) {
  const total = slices.reduce((n, s) => n + s.value, 0);
  const r = 42; const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 100 100" className="h-36 w-36 shrink-0 -rotate-90" role="img" aria-label={`${centerLabel}: ${centerValue}`}>
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="14" className="stroke-surface-2" />
        {total > 0 && slices.filter((s) => s.value > 0).map((s) => {
          const len = (s.value / total) * c;
          const el = <circle key={s.label} cx="50" cy="50" r={r} fill="none" strokeWidth="14" stroke={s.color} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />;
          offset += len;
          return el;
        })}
        <g className="rotate-90 origin-center">
          <text x="50" y="49" textAnchor="middle" className="fill-fg text-[11px] font-semibold">{centerValue}</text>
          <text x="50" y="61" textAnchor="middle" className="fill-muted text-[6px]">{centerLabel}</text>
        </g>
      </svg>
      <ul className="min-w-[8rem] flex-1 space-y-1.5 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
            <span className="flex-1">{s.label}</span><span className="text-muted tabular-nums">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BarChart({ data, label, className }: { data: { label: string; value: number }[]; label: string; className?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className={cn("flex h-40 items-end gap-1.5", className)} role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}>
      {data.map((d) => (
        <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1" title={`${d.label}: ${d.value}`}>
          <div className="w-full rounded-t-md bg-gradient-to-t from-brand to-brand-2" style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 4 : 0 }} />
          <span className="truncate text-center text-[10px] text-muted">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export const CATEGORY_COLORS: Record<string, string> = {
  image: "#ec4899", video: "#a855f7", document: "#3b82f6", spreadsheet: "#10b981", presentation: "#f97316", text: "#64748b", archive: "#f59e0b",
};
