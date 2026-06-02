import * as React from "react";
import { cn } from "@/lib/utils";

export interface FloatingInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Optional helper text shown below the input. */
  helper?: string;
  /** Error string — when set, the input border + label turn destructive. */
  error?: string | null;
}

/**
 * Material-style floating-label input. The label sits inside the field when
 * empty and animates to the top-left when focused or filled. Uses Tailwind's
 * `peer-placeholder-shown` to detect emptiness — the real placeholder is a
 * single space (transparent).
 */
export const FloatingInput = React.forwardRef<HTMLInputElement, FloatingInputProps>(
  ({ id, label, className, helper, error, ...props }, ref) => {
    const errored = !!error;
    return (
      <div className="space-y-1">
        <div className="relative">
          <input
            ref={ref}
            id={id}
            placeholder=" "
            className={cn(
              "peer h-14 w-full rounded-md border bg-card px-3.5 pb-1.5 pt-5 text-sm text-ink placeholder-transparent transition-[border-color,box-shadow,background-color] duration-normal ease-spring",
              "focus:outline-none",
              errored
                ? "border-destructive focus:border-destructive focus:shadow-[0_0_0_3px_rgb(var(--destructive)/0.1)]"
                : "border-border focus:border-ring focus:shadow-input-focus",
              "disabled:cursor-not-allowed disabled:opacity-50",
              className
            )}
            {...props}
          />
          <label
            htmlFor={id}
            className={cn(
              "pointer-events-none absolute left-3.5 top-1.5 text-xs font-medium transition-all duration-normal ease-spring",
              "peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-normal",
              "peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:font-medium",
              errored
                ? "text-destructive peer-focus:text-destructive"
                : "text-muted-foreground peer-focus:text-ink"
            )}
          >
            {label}
          </label>
        </div>
        {(helper || error) && (
          <p
            className={cn(
              "px-1 text-xs",
              errored ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {error || helper}
          </p>
        )}
      </div>
    );
  }
);
FloatingInput.displayName = "FloatingInput";
