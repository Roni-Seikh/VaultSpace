const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** i;
  return `${i === 0 ? value : value.toFixed(value >= 100 ? 0 : digits)} ${UNITS[i]}`;
}

export function formatDate(iso: string | Date, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", ...opts });
}

export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function timeAgo(iso: string | Date, now: Date = new Date()): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 45) return "just now";
  const units: [number, string][] = [[60, "minute"], [3600, "hour"], [86400, "day"], [2592000, "month"], [31536000, "year"]];
  let label = "minute";
  let value = Math.max(1, Math.round(s / 60));
  for (const [secs, name] of units) {
    if (s >= secs) {
      label = name;
      value = Math.round(s / secs);
    }
  }
  return `${value} ${label}${value === 1 ? "" : "s"} ago`;
}

export function percent(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0;
  return Math.min(100, Math.max(0, (part / whole) * 100));
}
