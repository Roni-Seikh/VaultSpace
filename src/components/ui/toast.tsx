"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "error" | "info";
interface Toast { id: number; tone: Tone; message: string }
interface Api { success: (m: string) => void; error: (m: string) => void; info: (m: string) => void }

const Ctx = createContext<Api | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback((tone: Tone, message: string) => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l.slice(-3), { id, tone, message }]);
    setTimeout(() => dismiss(id), tone === "error" ? 8000 : 4500);
  }, [dismiss]);
  const api = useMemo<Api>(() => ({
    success: (m) => push("success", m), error: (m) => push("error", m), info: (m) => push("info", m),
  }), [push]);

  const icon = { success: CheckCircle2, error: AlertCircle, info: Info };
  const color = { success: "text-ok", error: "text-danger", info: "text-brand" };
  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6">
        {items.map((t) => {
          const Icon = icon[t.tone];
          return (
            <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border bg-surface p-3 shadow-lg">
              <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", color[t.tone])} aria-hidden />
              <p className="flex-1 text-sm">{t.message}</p>
              <button aria-label="Dismiss notification" onClick={() => dismiss(t.id)} className="text-muted hover:text-fg"><X className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): Api {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast must be used inside <ToastProvider>");
  return c;
}
