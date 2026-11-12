import type { ReactNode } from "react";
import { Card } from "@/components/ui/misc";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="w-full max-w-md">
      <Card className="space-y-6 p-6 shadow-xl shadow-brand/5 sm:p-8">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {children}
      </Card>
      {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}

export function FormMessage({ tone, children }: { tone: "error" | "ok" | "info"; children: ReactNode }) {
  const cls = { error: "border-danger/40 bg-danger/10 text-danger", ok: "border-ok/40 bg-ok/10 text-ok", info: "border-brand/30 bg-brand/10 text-fg" }[tone];
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-3.5 py-2.5 text-sm ${cls}`}>{children}</div>;
}
