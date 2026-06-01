import { Link } from "react-router-dom";
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  Inbox,
  Factory,
  Timer,
  Lightbulb,
  ArrowRight,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { Card, CardContent } from "@/components/ui";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { TaskWithRelations, UserRole, ConceptWithRelations } from "@/types/database";

// ============================================================================
// Types
// ============================================================================

interface SparkPoint {
  v: number;
}

interface KpiDef {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  accent: "primary" | "success" | "warning" | "muted";
  sub: string;
  to: string;
  trend?: number | null; // percentage change, null = no data
  spark?: SparkPoint[];
  valueColor?: string;
}

// ============================================================================
// Helpers — compute 7-day sparklines from task data
// ============================================================================

function last7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function completedPerDay(tasks: TaskWithRelations[]): SparkPoint[] {
  const days = last7Days();
  return days.map((day) => ({
    v: tasks.filter(
      (t) => t.completed_at && t.completed_at.slice(0, 10) === day
    ).length,
  }));
}

function createdPerDay(tasks: TaskWithRelations[]): SparkPoint[] {
  const days = last7Days();
  return days.map((day) => ({
    v: tasks.filter((t) => t.created_at.slice(0, 10) === day).length,
  }));
}

function flatSpark(value: number): SparkPoint[] {
  return Array.from({ length: 7 }, () => ({ v: value }));
}

function computeAvgDelay(tasks: TaskWithRelations[]): number | null {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const completed = tasks.filter(
    (t) =>
      (t.status === "done" || t.status === "completed") &&
      t.completed_at &&
      new Date(t.completed_at) >= monthStart &&
      t.delay_days != null
  );
  if (completed.length === 0) return null;
  const sum = completed.reduce((s, t) => s + (t.delay_days ?? 0), 0);
  return Math.round((sum / completed.length) * 10) / 10;
}

// ============================================================================
// Component
// ============================================================================

export function DashboardKpiCards({
  tasks,
  concepts,
  stats,
  role,
  userId,
  isAdmin,
}: {
  tasks: TaskWithRelations[];
  concepts: ConceptWithRelations[];
  stats: {
    active: number;
    inProgress: number;
    fullKitting: number;
    done: number;
    pool: number;
    sampling: number;
    total: number;
    designerCount: number;
  };
  role: UserRole;
  userId: string | undefined;
  isAdmin: boolean;
}) {
  const completedSpark = completedPerDay(tasks);
  const createdSpark = createdPerDay(tasks);
  const avgDelay = computeAvgDelay(tasks);

  // Concept count for designer's monthly target
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const myConceptsThisMonth = userId
    ? concepts.filter(
        (c) => c.submitted_by === userId && c.created_at >= monthStart
      ).length
    : 0;

  const cards: KpiDef[] = [
    {
      label: "Active Tasks",
      value: stats.active,
      icon: ClipboardList,
      accent: "primary",
      sub: `${stats.total} total`,
      to: ROUTES.dashboard,
      spark: createdSpark,
    },
    {
      label: "In Progress",
      value: stats.inProgress,
      icon: Clock,
      accent: "warning",
      sub: `${stats.fullKitting} in review`,
      to: ROUTES.dashboard,
      spark: flatSpark(stats.inProgress),
    },
    {
      label: "Completed",
      value: stats.done,
      icon: CheckCircle2,
      accent: "success",
      sub:
        stats.total > 0
          ? `${Math.round((stats.done / stats.total) * 100)}% done`
          : "—",
      to: ROUTES.dashboard,
      spark: completedSpark,
    },
    // Card 4 — role-specific
    isAdmin
      ? {
          label: "Open Pool",
          value: stats.pool,
          icon: Inbox,
          accent: "muted" as const,
          sub: `${stats.designerCount} designers`,
          to: ROUTES.dashboard,
          spark: flatSpark(stats.pool),
        }
      : {
          label: "Sampling",
          value: stats.sampling,
          icon: Factory,
          accent: "muted" as const,
          sub: "awaiting completion",
          to: ROUTES.sampling,
          spark: flatSpark(stats.sampling),
        },
    // Card 5 — admin: avg completion, designer: my concepts
    isAdmin
      ? {
          label: "Avg Completion",
          value: avgDelay != null ? `${avgDelay}d` : "—",
          icon: Timer,
          accent: "primary" as const,
          sub: "this month",
          to: ROUTES.analytics,
          valueColor:
            avgDelay == null
              ? undefined
              : avgDelay < 3
              ? "text-success"
              : avgDelay <= 5
              ? "text-warning"
              : "text-destructive",
        }
      : {
          label: "My Concepts",
          value: `${myConceptsThisMonth}/2`,
          icon: Lightbulb,
          accent: "primary" as const,
          sub: "monthly target",
          to: ROUTES.concepts,
          valueColor:
            myConceptsThisMonth >= 3
              ? "text-success"
              : myConceptsThisMonth >= 1
              ? "text-warning"
              : "text-destructive",
        },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <KpiCard key={c.label} {...c} />
      ))}
    </div>
  );
}

// ============================================================================
// Single KPI Card
// ============================================================================

const ACCENT_BG: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  muted: "bg-secondary text-muted-foreground",
};

const SPARK_COLOR: Record<string, string> = {
  primary: "rgb(var(--primary))",
  success: "rgb(var(--success))",
  warning: "rgb(var(--warning))",
  muted: "rgb(var(--muted))",
};

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
  sub,
  to,
  trend,
  spark,
  valueColor,
}: KpiDef) {
  const numericValue = typeof value === "number" ? value : 0;
  const animated = useAnimatedNumber(numericValue);
  const displayValue = typeof value === "number" ? animated : value;

  return (
    <Link to={to} className="group">
      <Card className="swatch-edge swatch-edge-actionable transition-all duration-200 hover:border-primary/30 hover:shadow-md">
        <CardContent className="p-4">
          {/* Header: icon + trend */}
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            {trend != null && trend !== 0 && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  trend > 0
                    ? "bg-success/10 text-success"
                    : "bg-destructive/10 text-destructive"
                )}
              >
                {trend > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {Math.abs(trend)}%
              </span>
            )}
          </div>

          {/* Value */}
          <p
            className={cn(
              "mt-2 font-mono-data text-3xl tracking-tight",
              valueColor ?? "text-foreground"
            )}
          >
            {displayValue}
          </p>
          <p className="text-sm text-muted-foreground">{label}</p>
          {sub && (
            <p className="text-[11px] text-muted-foreground/70">{sub}</p>
          )}

          {/* Sparkline */}
          {spark && spark.length > 0 && (
            <div className="mt-2 -mx-1">
              <ResponsiveContainer width="100%" height={28}>
                <AreaChart data={spark}>
                  <defs>
                    <linearGradient
                      id={`spark-${label.replace(/\s/g, "")}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={SPARK_COLOR[accent]}
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="100%"
                        stopColor={SPARK_COLOR[accent]}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={SPARK_COLOR[accent]}
                    strokeWidth={1.5}
                    fill={`url(#spark-${label.replace(/\s/g, "")})`}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
