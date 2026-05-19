import { useEffect, useState } from "react";
import {
  Activity,
  Zap,
  AlertOctagon,
  Sparkles,
  CheckCircle2,
  Flame,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui";
import { cn } from "@/lib/utils";

interface KpiMetric {
  current: number;
  previous: number;
  trend: number;
}

interface Props {
  completed: KpiMetric;
  onTimeRate: KpiMetric;
  urgentCount: number;
  overdueCount: number;
  activePipeline: number;
  totalDesigners: number;
}

/**
 * TaskHealthHero
 * -------------------------------------------------------------------------
 * Compact at-a-glance health banner. Single horizontal strip:
 *   on-time radial · throughput · headline insight · risk dock
 * Dividers keep each block visually distinct; the entire card reads as one
 * unit instead of three floating tiles.
 */
export function TaskHealthHero({
  completed,
  onTimeRate,
  urgentCount,
  overdueCount,
  activePipeline,
  totalDesigners,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  const insight = buildInsight({
    completed: completed.current,
    completedTrend: completed.trend,
    onTimeRate: onTimeRate.current,
    overdueCount,
    urgentCount,
    activePipeline,
  });

  // SVG ring (r=34, c≈213)
  const r = 34;
  const c = 2 * Math.PI * r;
  const hasOnTimeData = completed.current > 0;
  const dash = mounted && hasOnTimeData ? (onTimeRate.current / 100) * c : 0;
  const ringColor =
    !hasOnTimeData
      ? "stroke-muted/50"
      : onTimeRate.current >= 85
      ? "stroke-success"
      : onTimeRate.current >= 70
      ? "stroke-warning"
      : "stroke-destructive";

  const wipPerDesigner =
    totalDesigners > 0
      ? Math.round((activePipeline / totalDesigners) * 10) / 10
      : 0;

  const trend = formatTrend(completed.trend, completed.previous);

  return (
    <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/[0.04] via-card to-card">
      <CardContent className="py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-0">
          {/* ── Block 1: Throughput + On-time ── */}
          <div className="flex flex-1 items-center gap-4 lg:pr-6">
            {/* Throughput */}
            <div className="min-w-[120px]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Delivered
              </p>
              <p className="mt-0.5 flex items-baseline gap-1 text-3xl font-bold tabular-nums text-foreground">
                {completed.current}
                <span className="text-xs font-normal text-muted-foreground">
                  task{completed.current !== 1 ? "s" : ""}
                </span>
              </p>
              <TrendPill trend={trend} />
            </div>

            {/* On-time ring */}
            <div className="ml-auto flex items-center gap-3 lg:ml-0">
              <div className="relative h-[88px] w-[88px] shrink-0">
                <svg viewBox="0 0 80 80" className="-rotate-90 h-full w-full" aria-hidden>
                  <circle
                    cx="40"
                    cy="40"
                    r={r}
                    className="fill-none stroke-secondary"
                    strokeWidth={8}
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r={r}
                    className={cn("fill-none", ringColor)}
                    strokeWidth={8}
                    strokeDasharray={c}
                    strokeDashoffset={c - dash}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.4,0,0.2,1)" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p
                    className={cn(
                      "text-xl font-bold tabular-nums",
                      hasOnTimeData ? "text-foreground" : "text-muted-foreground/60"
                    )}
                  >
                    {hasOnTimeData ? `${onTimeRate.current}%` : "—"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  On-time
                </p>
                <p className="text-xs text-muted-foreground">
                  {hasOnTimeData
                    ? onTimeRate.current >= 85
                      ? "On target"
                      : onTimeRate.current >= 70
                      ? "Watch closely"
                      : "Slipping"
                    : "No completions yet"}
                </p>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden w-px self-stretch bg-border lg:block" />

          {/* ── Block 2: Headline insight ── */}
          <div className="flex flex-1 items-center gap-3 lg:px-6">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                insight.iconBg
              )}
            >
              {insight.icon}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Headline
              </p>
              <p className="truncate text-sm font-semibold text-foreground">
                {insight.title}
              </p>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {insight.detail}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden w-px self-stretch bg-border lg:block" />

          {/* ── Block 3: Risk dock ── */}
          <div className="flex shrink-0 items-stretch gap-2 lg:pl-6">
            <DockStat
              icon={<Activity className="h-3.5 w-3.5" />}
              label="Active"
              value={activePipeline}
              hint={`${wipPerDesigner}/dev`}
              tone="primary"
            />
            <DockStat
              icon={<Zap className="h-3.5 w-3.5" />}
              label="Urgent"
              value={urgentCount}
              tone={urgentCount > 0 ? "destructive" : "muted"}
              pulse={urgentCount > 0}
            />
            <DockStat
              icon={<Flame className="h-3.5 w-3.5" />}
              label="Overdue"
              value={overdueCount}
              tone={overdueCount > 0 ? "warning" : "muted"}
              pulse={overdueCount > 3}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

interface TrendInfo {
  kind: "new" | "flat" | "up" | "down";
  label: string;
}

function formatTrend(trend: number, previous: number): TrendInfo {
  if (previous === 0 && trend !== 0) return { kind: "new", label: "new activity" };
  if (trend === 0) return { kind: "flat", label: "vs last period" };
  // Clamp display so 999 sentinel never leaks
  const capped = Math.min(Math.abs(trend), 200);
  const arrow = trend > 0 ? "up" : "down";
  return {
    kind: arrow,
    label: `${capped}% ${trend > 0 ? "↑" : "↓"} vs last period`,
  };
}

function TrendPill({ trend }: { trend: TrendInfo }) {
  if (trend.kind === "new") {
    return (
      <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
        <Sparkles className="h-3 w-3" />
        new activity
      </span>
    );
  }
  if (trend.kind === "flat") {
    return (
      <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        no change
      </span>
    );
  }
  const isUp = trend.kind === "up";
  return (
    <span
      className={cn(
        "mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        isUp
          ? "bg-success/10 text-success"
          : "bg-destructive/10 text-destructive"
      )}
    >
      {isUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {trend.label.replace("↑ ", "").replace("↓ ", "")}
    </span>
  );
}

function DockStat({
  icon,
  label,
  value,
  hint,
  tone,
  pulse,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  tone: "primary" | "destructive" | "warning" | "muted";
  pulse?: boolean;
}) {
  const toneClass: Record<typeof tone, string> = {
    primary: "border-primary/20 text-primary bg-primary/[0.05]",
    destructive: "border-destructive/25 text-destructive bg-destructive/[0.06]",
    warning: "border-warning/25 text-warning bg-warning/[0.06]",
    muted: "border-border text-muted-foreground bg-secondary/40",
  };

  return (
    <div
      className={cn(
        "flex min-w-[72px] flex-col items-center justify-center rounded-xl border px-3 py-2",
        toneClass[tone],
        pulse && "animate-pulse"
      )}
    >
      <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider opacity-80">
        {icon}
        {label}
      </div>
      <p className="text-lg font-bold tabular-nums leading-tight">{value}</p>
      {hint && (
        <p className="text-[9px] text-muted-foreground leading-none">{hint}</p>
      )}
    </div>
  );
}

function buildInsight(d: {
  completed: number;
  completedTrend: number;
  onTimeRate: number;
  overdueCount: number;
  urgentCount: number;
  activePipeline: number;
}): {
  title: string;
  detail: string;
  icon: React.ReactNode;
  iconBg: string;
} {
  // "Trend = 999" means previous was zero. Treat as "first signal of activity"
  // rather than as a 999% spike.
  const isFirstActivity = d.completedTrend === 999;

  if (d.overdueCount >= 5) {
    return {
      title: "Schedule is slipping",
      detail: `${d.overdueCount} tasks past their planned deadline.`,
      icon: <AlertOctagon className="h-4 w-4 text-destructive" />,
      iconBg: "bg-destructive/10",
    };
  }
  if (d.urgentCount >= 3) {
    return {
      title: "High-urgency backlog",
      detail: `${d.urgentCount} urgent tasks still in motion — escalate or fast-track.`,
      icon: <Zap className="h-4 w-4 text-destructive" />,
      iconBg: "bg-destructive/10",
    };
  }
  if (d.onTimeRate >= 90 && d.completed > 0) {
    return {
      title: "Excellent delivery cadence",
      detail: `${d.onTimeRate}% on-time on ${d.completed} task${d.completed > 1 ? "s" : ""}. Keep priorities clear.`,
      icon: <Sparkles className="h-4 w-4 text-success" />,
      iconBg: "bg-success/10",
    };
  }
  if (d.completed === 0 && d.activePipeline > 0) {
    return {
      title: "Pipeline is running",
      detail: `${d.activePipeline} active task${d.activePipeline > 1 ? "s" : ""}, nothing completed in this period yet.`,
      icon: <Activity className="h-4 w-4 text-primary" />,
      iconBg: "bg-primary/10",
    };
  }
  if (isFirstActivity && d.completed > 0) {
    return {
      title: "First completions landed",
      detail: `${d.completed} task${d.completed > 1 ? "s" : ""} delivered this period after a quiet stretch.`,
      icon: <CheckCircle2 className="h-4 w-4 text-success" />,
      iconBg: "bg-success/10",
    };
  }
  if (d.completedTrend > 30 && d.completedTrend < 999) {
    return {
      title: "Velocity is climbing",
      detail: `Completion volume up ${d.completedTrend}% vs last period.`,
      icon: <Activity className="h-4 w-4 text-success" />,
      iconBg: "bg-success/10",
    };
  }
  if (d.completedTrend < -30) {
    return {
      title: "Velocity dropped",
      detail: `Completed volume down ${Math.abs(d.completedTrend)}% vs last period.`,
      icon: <Activity className="h-4 w-4 text-warning" />,
      iconBg: "bg-warning/10",
    };
  }
  if (d.activePipeline > 20) {
    return {
      title: "Pipeline is loaded",
      detail: `${d.activePipeline} active tasks. Watch for bottlenecks before adding briefs.`,
      icon: <Activity className="h-4 w-4 text-warning" />,
      iconBg: "bg-warning/10",
    };
  }
  if (d.completed === 0 && d.activePipeline === 0) {
    return {
      title: "Quiet period",
      detail: "No active tasks and no completions yet — good time to plan new briefs.",
      icon: <Activity className="h-4 w-4 text-muted-foreground" />,
      iconBg: "bg-secondary",
    };
  }
  return {
    title: "Steady run",
    detail: "Healthy on-time rate and no major risk signals.",
    icon: <Activity className="h-4 w-4 text-primary" />,
    iconBg: "bg-primary/10",
  };
}
