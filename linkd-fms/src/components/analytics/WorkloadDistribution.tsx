import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Card,
  CardContent,
  Badge,
  getInitials,
} from "@/components/ui";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DesignerTaskStat } from "@/hooks/useTaskAnalytics";

interface Props {
  data: DesignerTaskStat[];
  /** When provided, designer names become clickable buttons that fire this. */
  onDesignerClick?: (designerId: string) => void;
}

/**
 * WorkloadDistribution
 * -------------------------------------------------------------------------
 * Stacked horizontal bars showing how each designer is loaded. Splits the
 * bar by completed/in-progress/remaining so it doubles as a progress
 * indicator. Sorted by total assigned, descending.
 */
export function WorkloadDistribution({ data, onDesignerClick }: Props) {
  const filtered = data.filter((d) => d.assigned > 0);
  const max = Math.max(1, ...filtered.map((d) => d.assigned));
  const teamAvg =
    filtered.length > 0
      ? Math.round(
          (filtered.reduce((s, d) => s + d.assigned, 0) / filtered.length) * 10
        ) / 10
      : 0;

  if (filtered.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          No designer activity in this period yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Workload Distribution
            </h3>
          </div>
          <Badge variant="secondary" className="text-[10px]">
            Avg {teamAvg}/designer
          </Badge>
        </div>

        <div className="space-y-3">
          {filtered.map((d, i) => {
            const remaining = Math.max(0, d.assigned - d.completed - d.inProgress);
            const widthPct = (d.assigned / max) * 100;

            const completePct =
              d.assigned > 0 ? (d.completed / d.assigned) * 100 : 0;
            const progressPct =
              d.assigned > 0 ? (d.inProgress / d.assigned) * 100 : 0;
            const remainingPct =
              d.assigned > 0 ? (remaining / d.assigned) * 100 : 0;

            const overload =
              teamAvg > 0 && d.assigned > teamAvg * 1.5 ? "over" :
              teamAvg > 0 && d.assigned < teamAvg * 0.5 && d.assigned > 0 ? "under" : null;

            return (
              <div key={d.id} className="flex items-center gap-3">
                {/* Avatar block */}
                <button
                  type="button"
                  onClick={() => onDesignerClick?.(d.id)}
                  disabled={!onDesignerClick}
                  className={cn(
                    "flex w-[150px] shrink-0 items-center gap-2 rounded-md text-left",
                    onDesignerClick && "cursor-pointer hover:opacity-80"
                  )}
                  title={onDesignerClick ? "View scorecard" : undefined}
                >
                  <Avatar className="h-7 w-7">
                    {d.avatar_url ? <AvatarImage src={d.avatar_url} /> : null}
                    <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                      {getInitials(d.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-xs font-medium text-foreground",
                        onDesignerClick && "hover:text-primary hover:underline"
                      )}
                    >
                      {d.full_name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {d.designerCode} · {d.assigned} task{d.assigned !== 1 ? "s" : ""}
                    </p>
                  </div>
                </button>

                {/* Stacked bar */}
                <div className="relative flex-1">
                  <div
                    className="flex h-6 overflow-hidden rounded-md border border-border bg-secondary/40 transition-[width] duration-[700ms] ease-out"
                    style={{
                      width: `${Math.max(8, widthPct)}%`,
                      transitionDelay: `${i * 60}ms`,
                    }}
                  >
                    <div
                      className="h-full bg-success transition-all"
                      style={{ width: `${completePct}%` }}
                      title={`${d.completed} completed`}
                    />
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${progressPct}%` }}
                      title={`${d.inProgress} in progress`}
                    />
                    <div
                      className="h-full bg-warning/40"
                      style={{ width: `${remainingPct}%` }}
                      title={`${remaining} remaining`}
                    />
                  </div>
                </div>

                {/* Overload pill */}
                <div className="w-20 shrink-0 text-right">
                  {overload === "over" ? (
                    <Badge className="bg-destructive/10 text-destructive border border-destructive/25 text-[9px]">
                      Overloaded
                    </Badge>
                  ) : overload === "under" ? (
                    <Badge className="bg-muted/30 text-muted-foreground border border-border text-[9px]">
                      Light
                    </Badge>
                  ) : (
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {d.completed}✓ {d.inProgress}↻ {remaining}○
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          <LegendDot color="bg-success" label="Completed" />
          <LegendDot color="bg-primary" label="In progress" />
          <LegendDot color="bg-warning/40" label="Remaining" />
        </div>
      </CardContent>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-sm", color)} />
      {label}
    </span>
  );
}
