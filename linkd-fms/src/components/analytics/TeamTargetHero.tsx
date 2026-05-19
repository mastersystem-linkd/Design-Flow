import { useEffect, useState } from "react";
import { Target, Trophy, Flame, Calendar } from "lucide-react";
import {
  Card,
  CardContent,
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import type { TargetRaceEntry } from "@/hooks/useAnalytics";

const TARGET = 3;

interface Props {
  data: TargetRaceEntry[];
  periodStart: Date;
  periodEnd: Date;
}

/**
 * TeamTargetHero
 * -------------------------------------------------------------------------
 * Vertical-friendly hero. Designed to fit a narrow column (e.g. xl:col-span-2
 * of a 5-col grid). Layout:
 *   Row 1 — radial dial + headline (side by side)
 *   Row 2 — inline stat line (days left · pace · not started)
 *   Row 3 — designer dock (wrapping pips)
 */
export function TeamTargetHero({ data, periodStart, periodEnd }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  const totalDesigners = data.length || 1;
  const onTarget = data.filter((d) => d.isOnTarget).length;
  const teamRate = Math.round((onTarget / totalDesigners) * 100);

  const totalApproved = data.reduce((s, d) => s + d.approvedCount, 0);
  const teamTarget = TARGET * totalDesigners;

  const now = new Date();
  const monthDays = Math.max(
    1,
    Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000) + 1
  );
  const elapsedDays = Math.max(
    0,
    Math.min(
      monthDays,
      Math.round((now.getTime() - periodStart.getTime()) / 86400000) + 1
    )
  );
  const daysLeft = Math.max(0, monthDays - elapsedDays);
  const monthProgress = Math.round((elapsedDays / monthDays) * 100);
  const onPace = teamRate >= monthProgress - 10;
  const notStartedCount = data.filter((d) => d.approvedCount === 0).length;
  const champion = [...data].sort((a, b) => b.approvedCount - a.approvedCount)[0];

  const radialColor =
    teamRate >= 80
      ? "stroke-success"
      : teamRate >= 50
      ? "stroke-warning"
      : "stroke-destructive";

  // SVG ring math (r=48, c=2πr ≈ 301)
  const r = 48;
  const c = 2 * Math.PI * r;
  const dash = mounted ? (teamRate / 100) * c : 0;

  return (
    <Card className="h-full overflow-hidden">
      <CardContent className="py-5">
        {/* Header label */}
        <div className="mb-3 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-warning" />
          <h3 className="text-sm font-semibold text-foreground">
            Monthly Concept Target
          </h3>
        </div>

        {/* Row 1: Radial + numbers */}
        <div className="flex items-center gap-4">
          <div className="relative h-[120px] w-[120px] shrink-0">
            <svg viewBox="0 0 120 120" className="-rotate-90 h-full w-full" aria-hidden>
              <circle
                cx="60"
                cy="60"
                r={r}
                className="fill-none stroke-secondary"
                strokeWidth={9}
              />
              <circle
                cx="60"
                cy="60"
                r={r}
                className={cn("fill-none", radialColor)}
                strokeWidth={9}
                strokeDasharray={c}
                strokeDashoffset={c - dash}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.4,0,0.2,1)" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Target className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="mt-0.5 text-2xl font-bold tabular-nums text-foreground">
                {teamRate}
                <span className="text-sm text-muted-foreground">%</span>
              </p>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                on target
              </p>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-2xl font-bold tabular-nums leading-tight text-foreground">
              {onTarget}
              <span className="text-base font-normal text-muted-foreground">
                {" "}/ {totalDesigners}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              designers hit <b className="text-foreground">{TARGET}</b> approved
            </p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {totalApproved}/{teamTarget} concepts approved this month
            </p>
            {champion && champion.approvedCount > 0 && (
              <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                🏆 {champion.name.split(" ")[0]} · {champion.approvedCount}
              </p>
            )}
          </div>
        </div>

        {/* Row 2: Inline stat strip (no boxes, just label · value · separator) */}
        <div className="mt-4 flex items-center gap-1 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-[11px]">
          <Calendar className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">Days left:</span>
          <span className="font-semibold tabular-nums text-foreground">{daysLeft}</span>
          <Divider />
          <Flame
            className={cn(
              "h-3 w-3",
              onPace ? "text-success" : "text-warning"
            )}
          />
          <span className={cn(
            "font-semibold",
            onPace ? "text-success" : "text-warning"
          )}>
            {onPace ? "On pace" : "Behind pace"}
          </span>
          <Divider />
          <span className="text-muted-foreground">Not started:</span>
          <span
            className={cn(
              "font-semibold tabular-nums",
              notStartedCount === 0 ? "text-success" : "text-warning"
            )}
          >
            {notStartedCount}
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {monthProgress}% through
          </span>
        </div>

        {/* Row 3: Designer dock */}
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Designers this period
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.map((d) => (
              <DesignerPip key={d.id} entry={d} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function Divider() {
  return <span className="mx-1.5 h-3 w-px shrink-0 bg-border" />;
}

function DesignerPip({ entry }: { entry: TargetRaceEntry }) {
  const pct = Math.min(100, (entry.approvedCount / TARGET) * 100);
  const ringColor = entry.isOnTarget
    ? "rgb(var(--success))"
    : entry.approvedCount > 0
    ? "rgb(var(--warning))"
    : "rgb(var(--muted))";

  return (
    <div
      className="group flex items-center gap-1.5 rounded-full border border-border bg-card/70 py-0.5 pr-2 pl-0.5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
      title={`${entry.name} — ${entry.approvedCount}/${TARGET} approved`}
    >
      <div className="relative h-6 w-6 shrink-0">
        <svg
          viewBox="0 0 28 28"
          className="-rotate-90 absolute inset-0 h-full w-full"
          aria-hidden
        >
          <circle
            cx="14"
            cy="14"
            r="12"
            fill="none"
            stroke="rgb(var(--border))"
            strokeWidth="2"
          />
          <circle
            cx="14"
            cy="14"
            r="12"
            fill="none"
            stroke={ringColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 12}
            strokeDashoffset={2 * Math.PI * 12 * (1 - pct / 100)}
            style={{ transition: "stroke-dashoffset 700ms ease-out" }}
          />
        </svg>
        <Avatar className="absolute inset-[3px] h-[18px] w-[18px]">
          {entry.avatarUrl ? <AvatarImage src={entry.avatarUrl} /> : null}
          <AvatarFallback className="text-[7px] bg-primary/10 text-primary">
            {getInitials(entry.name)}
          </AvatarFallback>
        </Avatar>
      </div>
      <span className="text-[10px] font-medium text-foreground">
        {entry.name.split(" ")[0]}
      </span>
      <span
        className={cn(
          "text-[9px] font-semibold tabular-nums",
          entry.isOnTarget
            ? "text-success"
            : entry.approvedCount > 0
            ? "text-warning"
            : "text-muted-foreground"
        )}
      >
        {entry.approvedCount}/{TARGET}
      </span>
    </div>
  );
}
