import { useEffect, useState } from "react";
import {
  Activity,
  Zap,
  Sparkles,
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
  /** Optional click handlers for the right-side risk dock. When provided, the
   *  corresponding stat renders as a button that deep-links into /dashboard. */
  onActiveClick?: () => void;
  onUrgentClick?: () => void;
  onOverdueClick?: () => void;
}

/**
 * TaskHealthHero
 * -------------------------------------------------------------------------
 * Compact at-a-glance health banner. Single horizontal strip:
 *   on-time radial · throughput · risk dock
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
  onActiveClick,
  onUrgentClick,
  onOverdueClick,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

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

          {/* ── Block 2: Risk dock ── */}
          {/* The procedural Headline block was removed because the dock
              tiles below already show the same numbers (Active / Urgent /
              Overdue) — repeating them as narrative cluttered the hero. */}
          <div className="flex flex-1 shrink-0 items-stretch justify-end gap-2 lg:pl-6">
            <DockStat
              icon={<Activity className="h-3.5 w-3.5" />}
              label="Active"
              value={activePipeline}
              hint={`${wipPerDesigner}/dev`}
              tone="primary"
              onClick={onActiveClick}
            />
            <DockStat
              icon={<Zap className="h-3.5 w-3.5" />}
              label="Urgent"
              value={urgentCount}
              tone={urgentCount > 0 ? "destructive" : "muted"}
              pulse={urgentCount > 0}
              onClick={onUrgentClick}
            />
            <DockStat
              icon={<Flame className="h-3.5 w-3.5" />}
              label="Overdue"
              value={overdueCount}
              tone={overdueCount > 0 ? "warning" : "muted"}
              pulse={overdueCount > 3}
              onClick={onOverdueClick}
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
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  tone: "primary" | "destructive" | "warning" | "muted";
  pulse?: boolean;
  onClick?: () => void;
}) {
  const toneClass: Record<typeof tone, string> = {
    primary: "border-primary/20 text-primary bg-primary/[0.05]",
    destructive: "border-destructive/25 text-destructive bg-destructive/[0.06]",
    warning: "border-warning/25 text-warning bg-warning/[0.06]",
    muted: "border-border text-muted-foreground bg-secondary/40",
  };

  // Promote to <button> when a click handler is provided so the cell is
  // keyboard-navigable and announces its role. The visual stays identical.
  const Tag = (onClick ? "button" : "div") as "button" | "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex min-w-[72px] flex-col items-center justify-center rounded-xl border px-3 py-2",
        toneClass[tone],
        pulse && "animate-urgent-pulse",
        onClick && "cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-sm"
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
    </Tag>
  );
}

