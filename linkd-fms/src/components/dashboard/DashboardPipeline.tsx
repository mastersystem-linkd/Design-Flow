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
  completed: "bg-success",
};

const BORDER_COLORS: Record<TaskStatus, string> = {
  pool: "border-l-muted",
  todo: "border-l-foreground/30",
  in_progress: "border-l-primary",
  full_kitting: "border-l-primary",
  approved: "border-l-primary",
  sampling: "border-l-warning",
  done: "border-l-success",
  completed: "border-l-success",
};

// Simplified visual pipeline (matches Kanban tabs): Pool → In Progress → Done.
// Legacy statuses (todo, full_kitting, approved, sampling) are not surfaced
// in dashboards; any historical rows in those buckets fold into In Progress.
const PIPELINE_STATUSES: TaskStatus[] = ["pool", "in_progress", "done"];

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
              className={cn(
                "group flex items-center gap-2 rounded-lg border-l-[3px] px-1.5 py-1.5 transition-all sm:gap-3 sm:px-2",
                "cursor-pointer hover:bg-secondary/40 hover:ring-1 hover:ring-primary/20",
                BORDER_COLORS[status]
              )}
            >
              <span className="w-[72px] shrink-0 truncate text-left text-xs font-medium text-foreground sm:w-[90px]">
                {STATUS_LABELS[status]}
              </span>

              <div className="flex-1 overflow-hidden rounded-md bg-secondary/60">
                <div
                  className={cn(
                    "flex h-5 items-center justify-end rounded-md",
                    BAR_COLORS[status]
                  )}
                  style={{
                    width: mounted ? `${Math.max(barPct, count > 0 ? 8 : 0)}%` : "0%",
                    transition: `width 500ms ease-out`,
                    transitionDelay: `${i * 60}ms`,
                  }}
                >
                  {status === "in_progress" && count > 0 && (
                    <span className="shuttle-dot mr-1.5 text-white" />
                  )}
                </div>
              </div>

              <div className="flex w-14 shrink-0 items-center justify-end gap-0.5 sm:w-16 sm:gap-1">
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
