import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// ----------------------------------------------------------------------------
// SectionCard — standardised wrapper for every chart, table, leaderboard,
// or matrix on a dashboard. Replaces the ad-hoc `<Card><CardContent>` +
// inline header pattern that's been duplicated across analytics views.
//
// Visual contract (semantic tokens only — theme-safe):
//   • Outer: rounded-2xl, `bg-card`, `border-border/50`
//   • Header strip: title + optional count badge + optional headerRight slot
//   • Body padding default 16-20px, can be disabled for tables that paint
//     their own gutter
// ----------------------------------------------------------------------------

export function SectionCard({
  title,
  count,
  headerRight,
  children,
  className,
  noPadding,
}: {
  title: string;
  count?: number | string;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Set when the body owns its own padding (e.g. wide table that needs
   *  flush-edge overflow). Default is 4–5 of body inset. */
  noPadding?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden border border-border/50 bg-card",
        "rounded-xl sm:rounded-2xl",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/50 px-3 py-2.5 sm:px-5 sm:py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-xs font-semibold text-foreground sm:text-sm">
            {title}
          </h3>
          {count != null && (
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:px-2 sm:text-[11px]">
              {count}
            </span>
          )}
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>
      <div className={cn(!noPadding && "p-3 sm:p-5")}>{children}</div>
    </div>
  );
}
