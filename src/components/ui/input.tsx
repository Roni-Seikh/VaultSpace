import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export const Field = forwardRef<HTMLInputElement, Props>(function Field({ label, hint, error, className, id, ...rest }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium">{label}</label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "h-11 w-full rounded-xl border bg-surface px-3.5 text-sm placeholder:text-muted/70 transition-colors",
          error ? "border-danger" : "border-border hover:border-muted/50",
          className,
        )}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-err`} role="alert" className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
});
