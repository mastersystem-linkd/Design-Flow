import { AlertTriangle, AlertCircle, Info, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ----------------------------------------------------------------------------
// AlertBanner — single attention banner shared across all dashboards.
// Used when a dashboard has an actionable problem (overdue tasks, below
// monthly concept target, stale pending review, etc.) that should surface
// above the fold without dominating the page.
//
// Variants:
//   • danger  — destructive tint (overdue, needs-support, blockers)
//   • warning — warning tint (below pace, pending pile-up)
//   • info    — primary tint (informational call-out)
//
// All colours come from `bg-{token}/5`, `bg-{token}/10`, `border-{token}/15`
// — they produce the right surface in both light and dark mode.
// ----------------------------------------------------------------------------

const variants = {
  danger: {
    container: "bg-destructive/5 border-destructive/15",
    icon: "bg-destructive/10 text-destructive",
    badge: "bg-destructive/10 text-destructive",
    Icon: AlertTriangle,
  },
  warning: {
    container: "bg-warning/5 border-warning/15",
    icon: "bg-warning/10 text-warning",
    badge: "bg-warning/10 text-warning",
    Icon: AlertCircle,
  },
  info: {
    container: "bg-primary/5 border-primary/15",
    icon: "bg-primary/10 text-primary",
    badge: "bg-primary/10 text-primary",
    Icon: Info,
  },
} as const;

export type AlertVariant = keyof typeof variants;

export function AlertBanner({
  variant,
  title,
  count,
  description,
  actionLabel,
  onAction,
}: {
  variant: AlertVariant;
  title: string;
  count?: number;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const v = variants[variant];
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 border sm:gap-3",
        "rounded-xl p-3 sm:rounded-2xl sm:p-4",
        v.container
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-9 sm:w-9",
          v.icon
        )}
      >
        <v.Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground sm:gap-2 sm:text-sm">
          <span className="truncate">{title}</span>
          {count != null && (
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium sm:px-2 sm:text-[11px]",
                v.badge
              )}
            >
              {count}
            </span>
          )}
        </p>
        {description && (
          <p className="mt-0.5 hidden truncate text-[11px] text-muted-foreground sm:block sm:text-xs">
            {description}
          </p>
        )}
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          aria-label={actionLabel}
          className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-primary transition-colors hover:text-primary/80"
        >
          {/* Label shows on tablet+, mobile gets just the chevron — keeps
              the banner single-line at narrow widths. */}
          <span className="hidden sm:inline">{actionLabel}</span>
          <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
        </button>
      )}
    </div>
  );
}
