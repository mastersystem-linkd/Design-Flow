import { CheckCircle2, XCircle, RotateCcw, Clock, Gauge } from "lucide-react";
import { Card, CardContent } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { MdReviewStats } from "@/hooks/useAnalytics";

export function MdReviewPanel({ stats }: { stats: MdReviewStats }) {
  const hours = stats.avgHours;
  const timeColor = hours === 0 ? "text-muted-foreground" : hours < 24 ? "text-success" : hours < 48 ? "text-warning" : "text-destructive";
  const display = hours === 0 ? "—" : hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">MD Review</h3>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {stats.reviewsPerWeek} reviews/week
          </span>
        </div>

        {/* Stats row — all 5 metrics in one horizontal strip */}
        <div className="grid grid-cols-5 gap-2">
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
            icon={<Clock className={cn("h-3 w-3", stats.pendingCount > 0 ? "text-warning animate-pulse" : "text-muted-foreground")} />}
            value={stats.pendingCount}
            label="Pending"
            valueClass={stats.pendingCount > 0 ? "text-warning" : "text-foreground"}
            sub={stats.pendingCount > 0 && stats.oldestPendingDays > 1 ? `${stats.oldestPendingDays}d oldest` : undefined}
            subClass="text-destructive"
          />
        </div>
      </CardContent>
    </Card>
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
    <div className="rounded-lg border border-border/60 bg-secondary/30 px-2 py-2 text-center">
      {icon && <div className="mb-1 flex justify-center">{icon}</div>}
      <p className={cn("text-xl font-bold tabular-nums leading-none", valueClass || "text-foreground")}>{value}</p>
      <p className="mt-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      {sub && <p className={cn("mt-0.5 text-[8px]", subClass || "text-muted-foreground")}>{sub}</p>}
    </div>
  );
}
