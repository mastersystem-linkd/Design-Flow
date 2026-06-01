import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Card,
  CardContent,
  Badge,
  getInitials,
} from "@/components/ui";
import { Users, CheckCircle2, Loader2, Circle } from "lucide-react";
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
  const active = data.filter((d) => d.assigned > 0);
  const inactive = data.filter((d) => d.assigned === 0);
  const sorted = [...active, ...inactive];
  const max = Math.max(1, ...active.map((d) => d.assigned));
  const teamAvg =
    active.length > 0
      ? Math.round(
          (active.reduce((s, d) => s + d.assigned, 0) / active.length) * 10
        ) / 10
      : 0;

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          No designers found.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full shadow-card transition-shadow duration-200 hover:shadow-card-hover">
      <CardContent className="flex h-full flex-col p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-y-1">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-inset ring-primary/25">
              <Users className="h-[18px] w-[18px]" />
            </span>
            <h3 className="font-display text-[17px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
              Workload Distribution
            </h3>
          </div>
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">
            Avg {teamAvg}/designer
          </span>
        </div>

        <div className="space-y-3">
          {sorted.map((d, i) => {
            const isIdle = d.assigned === 0;
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
              <div key={d.id} className={cn("flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3", isIdle && "opacity-50")}>
                {/* Avatar block */}
                <button
                  type="button"
                  onClick={() => onDesignerClick?.(d.id)}
                  disabled={!onDesignerClick}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md text-left outline-none sm:w-[150px] sm:shrink-0",
                    onDesignerClick && "cursor-pointer hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary/40"
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
                        "truncate text-[13px] font-semibold text-foreground",
                        onDesignerClick && "hover:text-primary"
                      )}
                    >
                      {d.full_name}
                    </p>
                    <p className="text-[11px] font-medium text-muted-foreground">
                      {d.designerCode} · {d.assigned} task{d.assigned !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {/* Overload pill — visible on mobile inline */}
                  <div className="shrink-0 text-right sm:hidden">
                    {isIdle ? (
                      <Badge className="bg-muted/30 text-muted-foreground border border-border text-[9px]">
                        Idle
                      </Badge>
                    ) : overload === "over" ? (
                      <Badge className="bg-destructive/10 text-destructive border border-destructive/25 text-[9px]">
                        Overloaded
                      </Badge>
                    ) : overload === "under" ? (
                      <Badge className="bg-muted/30 text-muted-foreground border border-border text-[9px]">
                        Light
                      </Badge>
                    ) : null}
                  </div>
                </button>

                {/* Stacked bar */}
                <div className="relative flex-1">
                  <div
                    className="flex h-5 overflow-hidden rounded-md border border-border bg-secondary/40 transition-[width] duration-[700ms] ease-out sm:h-6"
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

                {/* Overload pill — desktop only */}
                <div className="hidden w-20 shrink-0 text-right sm:block">
                  {isIdle ? (
                    <Badge className="bg-muted/30 text-muted-foreground border border-border text-[9px]">
                      Idle
                    </Badge>
                  ) : overload === "over" ? (
                    <Badge className="bg-destructive/10 text-destructive border border-destructive/25 text-[9px]">
                      Overloaded
                    </Badge>
                  ) : overload === "under" ? (
                    <Badge className="bg-muted/30 text-muted-foreground border border-border text-[9px]">
                      Light
                    </Badge>
                  ) : (
                    <span className="inline-flex items-center justify-end gap-2 text-[11px] font-medium tabular-nums text-muted-foreground">
                      <span className="flex items-center gap-0.5 text-success"><CheckCircle2 className="h-3 w-3" />{d.completed}</span>
                      <span className="flex items-center gap-0.5 text-primary"><Loader2 className="h-3 w-3" />{d.inProgress}</span>
                      <span className="flex items-center gap-0.5"><Circle className="h-3 w-3" />{remaining}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-4 text-[11px] font-medium text-muted-foreground">
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
      <span className={cn("h-2.5 w-2.5 rounded-sm", color)} />
      {label}
    </span>
  );
}
