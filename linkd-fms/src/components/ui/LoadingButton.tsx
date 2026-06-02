import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface LoadingButtonProps extends ButtonProps {
  loading?: boolean;
  /** Text to show while loading. Default: "…" (ellipsis only, keeps width stable-ish). */
  loadingText?: string;
}

/**
 * Wraps the brand <Button> with an inline spinner + auto-disable while loading.
 * Use anywhere you want a submit button that can't be double-clicked.
 *
 *   <LoadingButton loading={submitting} onClick={save}>Save</LoadingButton>
 */
export const LoadingButton = forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ loading, loadingText, disabled, children, className, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        disabled={loading || disabled}
        aria-busy={loading || undefined}
        className={cn("gap-2", className)}
        {...props}
      >
        {loading && (
          <Loader2 className="h-4 w-4 animate-spin [animation-duration:0.8s]" aria-hidden />
        )}
        {loading ? (loadingText ?? "…") : children}
      </Button>
    );
  }
);
LoadingButton.displayName = "LoadingButton";
