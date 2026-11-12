import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-border bg-surface p-5", className)} {...rest} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-lg", className)} />;
}

export function Badge({ tone = "neutral", className, children }: { tone?: "neutral" | "ok" | "warn" | "danger" | "brand"; className?: string; children: ReactNode }) {
  const tones = {
    neutral: "bg-surface-2 text-muted",
    ok: "bg-ok/15 text-ok",
    warn: "bg-warn/15 text-warn",
    danger: "bg-danger/15 text-danger",
    brand: "bg-brand/15 text-brand",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export function Progress({ value, label, tone }: { value: number; label: string; tone?: "auto" | "brand" }) {
  const v = Math.min(100, Math.max(0, value));
  const color = tone === "brand" ? "bg-brand" : v >= 95 ? "bg-danger" : v >= 80 ? "bg-warn" : "bg-brand";
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-muted">{icon}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      {children && <p className="max-w-sm text-sm text-muted">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-danger/40 bg-danger/5 px-6 py-10 text-center">
      <p className="text-sm font-medium text-danger">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium hover:bg-border">Try again</button>
      )}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
