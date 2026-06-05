import { CheckCircle2, XCircle, RotateCcw, Clock, Gauge } from "lucide-react";
import { Card, CardContent } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { MdReviewStats } from "@/hooks/useAnalytics";

export function MdReviewPanel({ stats }: { stats: MdReviewStats }) {
  const hours = stats.avgHours;
  const timeColor = hours === 0 ? "text-muted-foreground" : hours < 24 ? "text-success" : hours < 48 ? "text-warning" : "text-destructive";
  const display = hours === 0 ? "—" : hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;

  return (
    <Card className="lg:h-full">
      <CardContent className="flex flex-col p-3 sm:p-4 lg:h-full">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">MD Review</h3>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {stats.reviewsPerWeek} reviews/week
          </span>
        </div>

        {/* Stats row — all 5 metrics in one horizontal strip. flex-1 + stretched
            tiles so they grow to fill the card height when it sits beside the
            taller Monthly Concept Target card (keeps the row balanced). */}
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2 lg:flex-1">
          <StatTile
            value={display}
            label="Avg Time"
            valueClass={timeColor}
            sub={hours > 0 && hours < 24 ? "On target" : hours >= 24 ? "Over 24h" : undefined}
            subClass={hours < 24 ? "text-success" : "text-destructive"}
          />
          <StatTile
            icon={<CheckCircle2 className="h-3 w-3 text-success" />}
            value={stats.approvedCount}
            label="Approved"
            valueClass="text-success"
          />
          <StatTile
            icon={<XCircle className="h-3 w-3 text-destructive" />}
            value={stats.rejectedCount}
            label="Rejected"
            valueClass={stats.rejectedCount > 0 ? "text-destructive" : "text-foreground"}
          />
          <StatTile
            icon={<RotateCcw className="h-3 w-3 text-warning" />}
            value={stats.revisionCount}
            label="Revision"
            valueClass={stats.revisionCount > 0 ? "text-warning" : "text-foreground"}
          />
          <StatTile
            icon={<Clock className={cn("h-3 w-3", stats.pendingCount > 0 ? "text-warning" : "text-muted-foreground")} />}
            value={stats.pendingCount}
            label="Pending"
            valueClass={stats.pendingCount > 0 ? "text-warning" : "text-foreground"}
            sub={stats.pendingCount > 0 && stats.oldestPendingDays > 1 ? `${stats.oldestPendingDays}d oldest` : undefined}
            subClass="text-destructive"
          />
        </div>

        {/* Decision mix — proportional bar of the MD's calls. Fills the panel
            and shows review performance at a glance instead of bare counters. */}
        {(() => {
          const decided = stats.approvedCount + stats.rejectedCount + stats.revisionCount;
          const pct = (n: number) => (decided > 0 ? Math.round((n / decided) * 100) : 0);
          return (
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Decision Mix
                </span>
                {decided > 0 && (
                  <span className="text-[11px] font-semibold text-success">
                    {pct(stats.approvedCount)}% approved
                  </span>
                )}
              </div>
              {decided === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-secondary/20 px-3 py-4 text-center text-[11px] text-muted-foreground">
                  No MD decisions recorded this period yet.
                </div>
              ) : (
                <>
                  <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-secondary ring-1 ring-inset ring-border">
                    {stats.approvedCount > 0 && (
                      <div className="bg-success transition-[width] duration-500" style={{ width: `${pct(stats.approvedCount)}%` }} title={`Approved ${stats.approvedCount}`} />
                    )}
                    {stats.revisionCount > 0 && (
                      <div className="bg-warning transition-[width] duration-500" style={{ width: `${pct(stats.revisionCount)}%` }} title={`Revision ${stats.revisionCount}`} />
                    )}
                    {stats.rejectedCount > 0 && (
                      <div className="bg-destructive transition-[width] duration-500" style={{ width: `${pct(stats.rejectedCount)}%` }} title={`Rejected ${stats.rejectedCount}`} />
                    )}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
                    <LegendDot color="bg-success" label="Approved" value={stats.approvedCount} pct={pct(stats.approvedCount)} />
                    <LegendDot color="bg-warning" label="Revision" value={stats.revisionCount} pct={pct(stats.revisionCount)} />
                    <LegendDot color="bg-destructive" label="Rejected" value={stats.rejectedCount} pct={pct(stats.rejectedCount)} />
                  </div>
                  {stats.pendingCount > 0 && (
                    <p className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-warning/10 px-2.5 py-1.5 text-[11px] font-medium text-warning">
                      <Clock className="h-3 w-3" />
                      {stats.pendingCount} still awaiting a decision
                      {stats.oldestPendingDays > 1 ? ` · oldest ${stats.oldestPendingDays}d` : ""}
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}

function LegendDot({
  color,
  label,
  value,
  pct,
}: {
  color: string;
  label: string;
  value: number;
  pct: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
      {label}
      <b className="tabular-nums text-foreground">{value}</b>
      <span className="text-muted-foreground/70">({pct}%)</span>
    </span>
  );
}

function StatTile({
  icon,
  value,
  label,
  valueClass,
  sub,
  subClass,
}: {
  icon?: React.ReactNode;
  value: string | number;
  label: string;
  valueClass?: string;
  sub?: string;
  subClass?: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-lg border border-border/60 bg-secondary/30 px-1.5 py-2.5 text-center sm:px-2 sm:py-3">
      {icon && <div className="mb-1 flex justify-center sm:mb-1.5">{icon}</div>}
      <p className={cn("text-lg font-bold tabular-nums leading-none sm:text-2xl", valueClass || "text-foreground")}>{value}</p>
      <p className="mt-1 text-[8px] font-medium uppercase tracking-wide text-muted-foreground sm:mt-1.5 sm:text-[9px] sm:tracking-wider">{label}</p>
      {sub && <p className={cn("mt-1 text-[8px]", subClass || "text-muted-foreground")}>{sub}</p>}
    </div>
  );
}
