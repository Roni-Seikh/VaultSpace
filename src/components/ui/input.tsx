"use client";
import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

/**
 * Labelled text input. Every `type="password"` field automatically gets a show/hide (eye) toggle,
 * so no password box anywhere in the app can be missing it.
 */
export const Field = forwardRef<HTMLInputElement, Props>(function Field({ label, hint, error, className, id, type, ...rest }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium">{label}</label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={isPassword && visible ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "h-11 w-full rounded-xl border bg-surface px-3.5 text-sm placeholder:text-muted/70 transition-colors",
            isPassword && "pr-11",
            error ? "border-danger" : "border-border hover:border-muted/50",
            className,
          )}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-muted transition-colors hover:text-fg focus-visible:text-fg"
          >
            {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${inputId}-err`} role="alert" className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
});
