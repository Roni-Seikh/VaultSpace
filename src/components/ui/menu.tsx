"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MenuItem { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean; hidden?: boolean }

export function Menu({ label, items, className }: { label: string; items: MenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl">
          {items.filter((i) => !i.hidden).map((i) => (
            <button
              key={i.label} role="menuitem" type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false); i.onClick(); }}
              className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-2", i.danger && "text-danger")}
            >
              {i.icon}{i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
