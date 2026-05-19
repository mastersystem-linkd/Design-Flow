import { useMemo, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui";
import {
  STATUS_LABELS,
  COLUMN_DOT,
  STATUS_ORDER,
} from "@/lib/constants";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/types/database";

// ============================================================================
// Color mapping for bar fill (CSS class → inline-safe)
// ============================================================================

const BAR_COLORS: Record<TaskStatus, string> = {
  pool: "bg-muted",
  todo: "bg-foreground/30",
  in_progress: "bg-primary",
  full_kitting: "bg-primary/70",
  approved: "bg-primary/50",
  sampling: "bg-warning",
  done: "bg-success",
};

const PIPELINE_STATUSES: TaskStatus[] = [
  "pool",
  "todo",
  "in_progress",
  "full_kitting",
  "sampling",
  "done",
];

// ============================================================================
// Component
// ============================================================================

export function DashboardPipeline({
  counts,
  total,
}: {
  counts: Record<TaskStatus, number>;
  total: number;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const maxCount = Math.max(...PIPELINE_STATUSES.map((s) => counts[s] ?? 0), 1);

  // Bottleneck detection (highest non-done count)
  const bottleneck = useMemo(() => {
    const nonDone = PIPELINE_STATUSES.filter((s) => s !== "done");
    let maxStatus: TaskStatus = "pool";
    let maxVal = 0;
    for (const s of nonDone) {
      if ((counts[s] ?? 0) > maxVal) {
        maxVal = counts[s] ?? 0;
        maxStatus = s;
      }
    }
    const pct = total > 0 ? (maxVal / total) * 100 : 0;
    return { status: maxStatus, count: maxVal, pct };
  }, [counts, total]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">
          Pipeline Overview
        </h2>
        <Badge variant="secondary" className="text-[10px] tabular-nums">
          {total} total
        </Badge>
      </div>

      <div className="mt-3 rounded-xl border border-border bg-card p-4 space-y-2.5">
        {PIPELINE_STATUSES.map((status, i) => {
          const count = counts[status] ?? 0;
          const pct = total > 0 ? (count / total) * 100 : 0;
          const barPct = maxCount > 0 ? (count / maxCount) * 100 : 0;

          return (
            <Link
              key={status}
              to={status === "sampling" ? ROUTES.sampling : ROUTES.dashboard}
              className="group flex items-center gap-3 rounded-lg px-1 py-1 -mx-1 transition-all hover:bg-secondary/40 hover:ring-1 hover:ring-primary/20 cursor-pointer"
            >
              {/* Status dot + label */}
              <div className="flex w-24 shrink-0 items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    COLUMN_DOT[status]
                  )}
                />
                <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  {STATUS_LABELS[status]}
                </span>
              </div>

              {/* Bar */}
              <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-secondary/60">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-md",
                    BAR_COLORS[status]
                  )}
                  style={{
                    width: mounted ? `${Math.max(barPct, count > 0 ? 8 : 0)}%` : "0%",
                    transition: `width 500ms ease-out`,
                    transitionDelay: `${i * 60}ms`,
                  }}
                />
              </div>

              {/* Count + percentage */}
              <div className="flex w-16 shrink-0 items-center justify-end gap-1.5">
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {count}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  ({Math.round(pct)}%)
                </span>
              </div>
            </Link>
          );
        })}

        {/* Bottleneck summary */}
        <div className="mt-1 border-t border-border/50 pt-2">
          {bottleneck.pct > 30 && bottleneck.count > 0 ? (
            <p className="text-xs text-warning">
              Bottleneck: <span className="font-medium">{STATUS_LABELS[bottleneck.status]}</span>{" "}
              ({bottleneck.count} tasks, {Math.round(bottleneck.pct)}%)
            </p>
          ) : total > 0 ? (
            <p className="text-xs text-success">Pipeline is balanced</p>
          ) : (
            <p className="text-xs text-muted-foreground">No tasks yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
