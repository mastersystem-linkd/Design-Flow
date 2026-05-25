import { CheckCircle2, XCircle, RotateCcw, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { MdReviewStats } from "@/hooks/useAnalytics";

export function MdReviewPanel({ stats }: { stats: MdReviewStats }) {
  const hours = stats.avgHours;
  const timeColor = hours === 0 ? "text-muted-foreground" : hours < 24 ? "text-success" : hours < 48 ? "text-warning" : "text-destructive";
  const borderColor = hours === 0 ? "border-muted" : hours < 24 ? "border-success" : hours < 48 ? "border-warning" : "border-destructive";
  const display = hours === 0 ? "—" : hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;

  return (
    <Card>
      <CardContent className="py-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">MD Review Performance</h3>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          {/* Left: review speed */}
          <div className="flex items-center gap-4">
            <div className={cn("flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4", borderColor)}>
              <span className={cn("text-2xl font-bold tabular-nums", timeColor)}>{display}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Avg Review Time</p>
              <p className="text-xs text-muted-foreground">Target: &lt; 24 hours</p>
              {stats.pendingCount > 0 && stats.oldestPendingDays > 1 && (
                <p className="mt-1 text-xs text-destructive">
                  {stats.pendingCount} pending · oldest {stats.oldestPendingDays}d ago
                </p>
              )}
            </div>
          </div>

          {/* Right: breakdown grid */}
          <div className="grid grid-cols-2 gap-3 flex-1">
            <Stat icon={<CheckCircle2 className="h-4 w-4 text-success" />} label="Approved" value={stats.approvedCount} />
            <Stat icon={<XCircle className="h-4 w-4 text-destructive" />} label="Rejected" value={stats.rejectedCount} />
            <Stat icon={<RotateCcw className="h-4 w-4 text-warning" />} label="Revision" value={stats.revisionCount} />
            <Stat
              icon={<Clock className={cn("h-4 w-4", stats.pendingCount > 0 ? "text-warning animate-pulse" : "text-muted-foreground")} />}
              label="Pending"
              value={stats.pendingCount}
            />
          </div>
        </div>

        {/* Velocity */}
        <p className="mt-4 text-xs text-muted-foreground">
          Velocity: <span className="font-semibold text-foreground">{stats.reviewsPerWeek}</span> reviews/week
        </p>
      </CardContent>
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2.5">
      {icon}
      <div>
        <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
