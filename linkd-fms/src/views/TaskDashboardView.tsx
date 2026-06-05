import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, Clock, Timer, PlusCircle, AlertTriangle,
  LayoutGrid, Trophy, ChevronUp, ChevronDown, ChevronRight,
  Package, Flame, Zap, Building2, Lightbulb, Activity,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnalyticsView, type AnalyticsViewControls } from "@/views/AnalyticsView";
import { Download, Calendar } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import { useClients } from "@/hooks/useClients";
import {
  useTaskAnalytics,
  type Period,
  type DesignerTaskStat,
  type KittingMix,
  type PriorityMix,
  type CycleTimeBucket,
  type TopClient,
  type PipelineItem,
} from "@/hooks/useTaskAnalytics";
import { KpiCard } from "@/components/analytics/KpiCard";
import { WorkloadDistribution } from "@/components/analytics/WorkloadDistribution";
import { AtRiskTasks } from "@/components/analytics/AtRiskTasks";
import { DesignerScorecardDrawer } from "@/components/analytics/DesignerScorecardDrawer";
import {
  Card, CardContent, Badge, Button, SkeletonCard, SkeletonTable,
  Avatar, AvatarFallback, AvatarImage, getInitials, DeadlineCell,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  SearchInput, Sparkline,
} from "@/components/ui";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { KpiMetric } from "@/hooks/useAnalytics";
import { STATUS_LABELS } from "@/lib/constants";
import { useChartAnimation } from "@/lib/chartConfig";
import { exportTaskDashboardExcel } from "@/lib/exportExcel";
import { PriorityDonut, CycleTimeChart } from "@/components/analytics/DashboardCharts";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { cn } from "@/lib/utils";
import { isAdminOrCoordinator } from "@/lib/permissions";
import { DateRangePicker } from "@/components/ui/DateRangePicker";

const PERIODS: { value: Period; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
];

// Gradient fills + soft status-tinted glow — mirrors PipelineHealth so both
// pipeline widgets read as lit data, not flat blocks.
const PIPELINE_BAR_COLOR: Record<string, string> = {
  pool: "bg-gradient-to-r from-muted/60 to-muted",
  in_progress: "bg-gradient-to-r from-primary/60 to-primary shadow-[0_0_12px_-2px_rgb(var(--primary)/0.55)]",
  done: "bg-gradient-to-r from-success/60 to-success shadow-[0_0_12px_-2px_rgb(var(--success)/0.55)]",
};

// Matches the per-status accent on the left border of each Pipeline row —
// mirrors the styling used by PipelineHealth (Concept Status) so the two
// widgets feel like one component.
const PIPELINE_BORDER: Record<string, string> = {
  pool: "border-l-muted",
  in_progress: "border-l-primary",
  done: "border-l-success",
};

// Two faces of this page — Tasks (default) and Concepts (the former
// /analytics view, now embedded here). State stored in the URL via the
// `tab` search param so a) deep-links work, b) the browser back button
// switches tabs, c) it survives a refresh.
type DashTab = "tasks" | "concepts";

export function TaskDashboardView() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const chartAnimate = useChartAnimation();
  const [urlParams, setUrlParams] = useSearchParams();
  const role = profile?.role ?? "designer";
  const isAdmin = isAdminOrCoordinator(role);
  const isDesigner = role === "designer";

  // URL-bound tab state. `?tab=concepts` mounts the Concept Dashboard body
  // (the AnalyticsView component); anything else (including missing) falls
  // back to "tasks". setTabAndUrl keeps the URL in sync as the user clicks.
  const rawTab = urlParams.get("tab");
  const tab: DashTab = rawTab === "concepts" ? "concepts" : "tasks";
  function setTab(next: DashTab) {
    // Preserve any other params; only replace `tab`.
    const params = new URLSearchParams(urlParams);
    if (next === "tasks") params.delete("tab");
    else params.set("tab", next);
    setUrlParams(params, { replace: true });
  }

  const [period, setPeriod] = useState<Period>("month");
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const a = useTaskAnalytics(period, customRange);
  const { tasks } = useTasks();

  // Scorecard drawer state (admin-only opens; for designer self-view this
  // would still pop, but coordinators see nothing because the drawer
  // gates render on isAdmin).
  const [scorecardDesignerId, setScorecardDesignerId] = useState<string | null>(null);
  const canOpenScorecard = isAdminOrCoordinator(role);

  // Concept dashboard controls — pushed up from AnalyticsView so they
  // render in the tab row alongside the tab pills.
  const [conceptControls, setConceptControls] = useState<AnalyticsViewControls | null>(null);

  const myStats = isDesigner
    ? a.designerStats.find((d) => d.id === profile?.id) ?? null
    : null;

  // Excel export of the whole task dashboard (admins/coordinators only).
  function handleExportTasks() {
    if (!a.designerStats.length) return;
    void exportTaskDashboardExcel(
      a.designerStats,
      {
        periodLabel: a.periodLabel,
        totalCompleted: a.kpis.totalCompleted.current,
        totalCreated: a.kpis.totalCreated.current,
        onTimeRate: a.kpis.onTimeRate.current,
        avgCycleDays: a.kpis.avgCycleDays.current,
        avgDelayDays: a.kpis.avgCompletionDays.current,
        lateCompletions: a.kpis.lateCompletions.current,
        activePipeline: a.kpis.activePipeline,
        urgentCount: a.kpis.urgentCount,
        overdueCount: a.kpis.overdueCount,
        pipeline: a.pipeline.map((p) => ({
          status: p.status.charAt(0).toUpperCase() + p.status.slice(1).replace(/_/g, " "),
          count: p.count,
          percentage: p.percentage,
        })),
        priorityMix: {
          urgent: a.priorityMix.urgent,
          high: a.priorityMix.high,
          normal: a.priorityMix.normal,
          low: a.priorityMix.low,
        },
        kittingMix: {
          withKitting: a.kittingMix.withKitting,
          withoutKitting: a.kittingMix.withoutKitting,
          pct: a.kittingMix.pct,
        },
        volume: a.volumeData.map((v) => ({ label: v.label, created: v.created, completed: v.completed })),
      },
      `linkd-task-dashboard-${period}-${a.periodLabel.replace(/[^a-zA-Z0-9]+/g, "-")}`
    );
  }

  // Reusable period-pill cluster. Rendered inside the tab row so it sits on
  // the same baseline as "Task Dashboard / Concept Dashboard" pills — saves
  // the extra caption row that used to live below.
  const taskPeriodPills = (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <DateRangePicker
        from={a.periodStart.toISOString().slice(0, 10)}
        to={a.periodEnd.toISOString().slice(0, 10)}
        onChange={(f, t) => {
          setCustomRange({ from: new Date(f + "T00:00:00"), to: new Date(t + "T23:59:59") });
        }}
      />
      <div className="inline-flex rounded-lg bg-secondary p-1">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => { setPeriod(p.value); setCustomRange(null); }}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:py-1",
              !customRange && period === p.value
                ? "bg-primary text-white"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );

  const conceptPeriodPills = conceptControls ? (
    <div className="inline-flex shrink-0 rounded-lg bg-secondary p-1">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => conceptControls.setPeriod(p.value as Period)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:py-1",
            conceptControls.period === p.value
              ? "bg-primary text-white"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  ) : null;

  const tabsRow = (
    <div className="flex flex-col gap-2 border-b border-border sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
      <div className="-mb-px flex items-center gap-1 overflow-x-auto no-scrollbar">
        <DashboardTabButton
          active={tab === "tasks"}
          onClick={() => setTab("tasks")}
          icon={<LayoutGrid className="h-3.5 w-3.5" />}
          label="Task Dashboard"
        />
        <DashboardTabButton
          active={tab === "concepts"}
          onClick={() => setTab("concepts")}
          icon={<Lightbulb className="h-3.5 w-3.5" />}
          label="Concept Dashboard"
        />
      </div>
      <div className="flex items-center gap-1.5 pb-2">
        {tab === "tasks" ? (
          <>
            {taskPeriodPills}
            {isAdmin && (
              <Button variant="outline" size="icon" onClick={handleExportTasks} className="h-7 w-7 shrink-0" title="Export">
                <Download className="h-3.5 w-3.5" />
              </Button>
            )}
          </>
        ) : (
          <>
            {conceptPeriodPills}
            {conceptControls?.onExport && (
              <Button variant="outline" size="icon" onClick={conceptControls.onExport} className="h-7 w-7 shrink-0" title="Export">
                <Download className="h-3.5 w-3.5" />
              </Button>
            )}
            {conceptControls?.periodLabel && (
              <span className="hidden items-center gap-1.5 text-[10px] text-muted-foreground sm:flex">
                <Calendar className="h-3 w-3" />
                {conceptControls.periodLabel}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );

  if (tab === "concepts") {
    return (
      <div className="space-y-4">
        {tabsRow}
        <AnalyticsView embedded onControlsReady={setConceptControls} />
      </div>
    );
  }

  if (a.error) {
    return (
      <div className="space-y-4">
        {tabsRow}
        <div className="mx-auto max-w-lg py-20">
          <Card><CardContent className="flex flex-col items-center gap-3 py-8">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <p className="text-sm text-destructive">{a.error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
          </CardContent></Card>
        </div>
      </div>
    );
  }

  // Build a deep-link URL to /dashboard with the period's date range
  // baked in, so a card click lands on a list filtered to "what the KPI
  // counted". Extra params (status / filter / overdue) layer on top.
  const periodFrom = a.periodStart.toISOString().slice(0, 10);
  const periodTo = a.periodEnd.toISOString().slice(0, 10);
  function dashLink(params: Record<string, string | undefined>): string {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) q.set(k, v);
    }
    const s = q.toString();
    return s ? `/dashboard?${s}` : "/dashboard";
  }

  // Designer header chips are personal (their own overdue + in-flight), not the
  // team-wide a.kpis numbers — those read as "meaningless" on a personal view.
  const myOverdue =
    isDesigner && profile
      ? tasks.filter(
          (t) =>
            t.assigned_to === profile.id &&
            t.status !== "completed" &&
            t.status !== "done" &&
            t.planned_deadline &&
            new Date(t.planned_deadline) < new Date()
        ).length
      : 0;
  const myInFlight = myStats?.inProgress ?? 0;

  if (a.isLoading) {
    return (
      <div className="space-y-4">
        {tabsRow}
        <div className="space-y-4">
          <div className="h-8 w-48 animate-pulse rounded bg-secondary" />
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="lg:col-span-2"><SkeletonCard /></div>
            <SkeletonCard />
          </div>
          <SkeletonTable rows={6} cols={7} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {tabsRow}
      <div className="animate-fade-in space-y-6">

      {/* ── Page header — display title + accessible status chips ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border bg-card px-3 py-2.5 shadow-card sm:px-4 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-inset ring-primary/25 sm:h-9 sm:w-9">
            <LayoutGrid className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
          </span>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate font-display text-base font-bold tracking-[-0.02em] text-foreground sm:text-xl md:text-2xl">
              {isDesigner ? "My Work" : "Production Studio"}
            </h1>
            <p className="truncate text-[10px] font-medium text-muted-foreground sm:text-[11px]">{a.periodLabel}</p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5 sm:gap-2">
          {isDesigner ? (
            <>
              {myOverdue > 0 && (
                <StatusChip
                  tone="warning"
                  icon={Flame}
                  count={myOverdue}
                  label="overdue"
                  onClick={() => navigate(dashLink({ filter: "mine", overdue: "1" }))}
                />
              )}
              {myInFlight > 0 && (
                <StatusChip
                  tone="primary"
                  icon={Activity}
                  count={myInFlight}
                  label="in flight"
                  onClick={() => navigate(dashLink({ filter: "mine", status: "in_progress" }))}
                />
              )}
            </>
          ) : (
            <>
              {a.kpis.overdueCount > 0 && (
                <StatusChip
                  tone={a.kpis.overdueCount > 3 ? "destructive" : "warning"}
                  icon={Flame}
                  count={a.kpis.overdueCount}
                  label="overdue"
                  pulse={a.kpis.overdueCount > 3}
                  onClick={() => navigate(dashLink({ overdue: "1", filter: "all" }))}
                />
              )}
              {a.kpis.urgentCount > 0 && (
                <StatusChip
                  tone="destructive"
                  icon={Zap}
                  count={a.kpis.urgentCount}
                  label="urgent"
                  onClick={() => navigate(dashLink({ status: "in_progress" }))}
                />
              )}
              {a.kpis.activePipeline > 0 && (
                <StatusChip
                  tone="primary"
                  icon={Activity}
                  count={a.kpis.activePipeline}
                  label="in flight"
                  onClick={() => navigate(dashLink({ status: "in_progress" }))}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Designer personal view */}
      {isDesigner && myStats ? (
        <>
          {/* KPI cards — same MetricCard as admin view */}
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
            <MetricCard
              icon={CheckCircle2}
              label="Completed"
              tone="success"
              value={myStats.completed}
              onClick={() => navigate(dashLink({ filter: "mine", status: "done", from: periodFrom, to: periodTo }))}
            />
            <MetricCard
              icon={Clock}
              label="On-Time Rate"
              tone="primary"
              value={myStats.assigned > 0 ? `${Math.round((myStats.onTime / myStats.assigned) * 100)}%` : "—"}
              sub={myStats.assigned > 0 ? `${myStats.onTime} of ${myStats.assigned}` : undefined}
            />
            <MetricCard
              icon={Timer}
              label="Avg Days"
              tone="muted"
              value={myStats.completed > 0 ? `${myStats.avgDays}d` : "—"}
              invertTrend
            />
            <MetricCard
              icon={LayoutGrid}
              label="In Progress"
              tone="warning"
              value={myStats.inProgress}
              onClick={() => navigate(dashLink({ filter: "mine", status: "in_progress" }))}
            />
          </div>

          {/* Score + Pipeline side by side */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {/* Performance score */}
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", myStats.score >= 80 ? "bg-success/10" : myStats.score >= 60 ? "bg-warning/10" : "bg-destructive/10")}>
                <span className={cn("text-xl font-bold tabular-nums", myStats.score >= 80 ? "text-success" : myStats.score >= 60 ? "text-warning" : "text-destructive")}>{myStats.score}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">Performance Score</p>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div className={cn("h-full rounded-full transition-[width] duration-700", myStats.score >= 80 ? "bg-success" : myStats.score >= 60 ? "bg-warning" : "bg-destructive")} style={{ width: `${myStats.score}%` }} />
                </div>
              </div>
            </div>

            {/* Pipeline mini */}
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="mb-2 text-xs font-semibold text-foreground">My Pipeline</p>
              {(() => {
                const mine = tasks.filter((t) => t.assigned_to === profile?.id);
                const counts = {
                  pool: mine.filter((t) => t.status === "pool").length,
                  active: mine.filter((t) => t.status === "in_progress" || t.status === "todo" || t.status === "full_kitting").length,
                  done: mine.filter((t) => t.status === "done" || t.status === "completed").length,
                };
                const max = Math.max(1, counts.pool, counts.active, counts.done);
                return (
                  <div className="space-y-1.5">
                    {([["Pool", counts.pool, "bg-muted"], ["In Progress", counts.active, "bg-primary"], ["Done", counts.done, "bg-success"]] as const).map(([label, count, color]) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="w-[72px] shrink-0 text-[11px] text-muted-foreground sm:w-[80px]">{label}</span>
                        <div className="h-4 flex-1 overflow-hidden rounded bg-secondary/60">
                          <div className={cn("h-full rounded transition-[width] duration-500", color)} style={{ width: `${Math.max(count > 0 ? 8 : 0, (count / max) * 100)}%` }} />
                        </div>
                        <span className="w-5 text-right text-xs font-semibold tabular-nums text-foreground">{count}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Workload summary — scalable, not a full task list */}
          <DesignerWorkloadSummary tasks={tasks} userId={profile?.id ?? ""} />
        </>
      ) : (
        /* Admin / Coordinator view */
        <>
          {/* ── Hero metrics ──────────────────────────────────────────
              Linear / Vercel / Stripe idiom: clean individual metric cards
              with crisp HIGH-CONTRAST numerals (no dim gradient clip),
              1px borders, generous internal air, and a quiet sparkline.
              Hierarchy comes from grouping + contrast, not chrome — the
              four throughput metrics sit above a row of three live-status
              tiles. No decorative wrapper. */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
              <MetricCard
                icon={CheckCircle2}
                label="Delivered"
                tone="success"
                value={a.kpis.totalCompleted.current}
                trend={a.kpis.totalCompleted}
                sparklineData={a.sparklines.completed}
                onClick={() =>
                  navigate(dashLink({ status: "done", from: periodFrom, to: periodTo }))
                }
              />
              <MetricCard
                icon={Clock}
                label="On-Time"
                tone={
                  a.kpis.totalCompleted.current === 0
                    ? "muted"
                    : a.kpis.onTimeRate.current >= 70
                    ? "success"
                    : a.kpis.onTimeRate.current >= 50
                      ? "warning"
                      : "destructive"
                }
                value={
                  a.kpis.totalCompleted.current === 0
                    ? "—"
                    : a.kpis.totalCompleted.current < 10
                    ? `${a.kpis.totalCompleted.current - a.kpis.lateCompletions.current} of ${a.kpis.totalCompleted.current}`
                    : `${a.kpis.onTimeRate.current}%`
                }
                trend={a.kpis.totalCompleted.current === 0 ? undefined : a.kpis.onTimeRate}
                sparklineData={a.kpis.totalCompleted.current === 0 ? undefined : a.sparklines.onTime}
                sub={
                  a.kpis.totalCompleted.current === 0
                    ? undefined
                    : a.kpis.lateCompletions.current > 0
                    ? `${a.kpis.lateCompletions.current} late`
                    : "all on time"
                }
                onClick={() =>
                  navigate(dashLink({ status: "done", from: periodFrom, to: periodTo }))
                }
              />
              <MetricCard
                icon={Timer}
                label="Avg Cycle"
                tone={
                  a.kpis.avgCycleDays.current === 0
                    ? "muted"
                    : a.kpis.avgCycleDays.current <= 3
                    ? "success"
                    : a.kpis.avgCycleDays.current <= 5
                      ? "warning"
                      : "destructive"
                }
                value={a.kpis.avgCycleDays.current > 0 ? `${a.kpis.avgCycleDays.current}d` : "—"}
                trend={a.kpis.avgCycleDays.current > 0 ? a.kpis.avgCycleDays : undefined}
                invertTrend
                sparklineData={a.kpis.totalCompleted.current >= 3 ? a.sparklines.avgDelay : undefined}
                sub={
                  a.kpis.avgCycleDays.current > 0 && a.kpis.avgCompletionDays.current > 0
                    ? `${a.kpis.avgCompletionDays.current}d late avg`
                    : a.kpis.avgCycleDays.current > 0
                      ? "on schedule"
                      : undefined
                }
                onClick={() =>
                  navigate(dashLink({ status: "done", from: periodFrom, to: periodTo }))
                }
              />
              <MetricCard
                icon={PlusCircle}
                label="Created"
                tone="primary"
                value={a.kpis.totalCreated.current}
                trend={a.kpis.totalCreated}
                sparklineData={a.sparklines.created}
                onClick={() =>
                  navigate(dashLink({ filter: "all", from: periodFrom, to: periodTo }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
              {/* Active is hidden on mobile (kept on sm+) so the hero shows a
                  clean 6 tiles on phones — it's the least actionable of the
                  three and already surfaced as the "in flight" header chip. */}
              <div className="hidden sm:contents">
                <StatusTile
                  icon={Activity}
                  label="Active"
                  tone="primary"
                  value={a.kpis.activePipeline}
                  sub={
                    a.designerStats.length > 0
                      ? `${(
                          Math.round((a.kpis.activePipeline / a.designerStats.length) * 10) /
                          10
                        ).toFixed(1)} / designer`
                      : "in flight"
                  }
                  onClick={() => navigate(dashLink({ status: "in_progress" }))}
                />
              </div>
              <StatusTile
                icon={Zap}
                label="Urgent"
                tone={a.kpis.urgentCount > 0 ? "destructive" : "muted"}
                value={a.kpis.urgentCount}
                pulse={a.kpis.urgentCount > 0}
                sub={a.kpis.urgentCount > 0 ? "needs attention" : "all clear"}
                onClick={() => navigate(dashLink({ filter: "urgent" }))}
              />
              <StatusTile
                icon={Flame}
                label="Overdue"
                tone={a.kpis.overdueCount > 0 ? "warning" : "muted"}
                value={a.kpis.overdueCount}
                pulse={a.kpis.overdueCount > 3}
                sub={a.kpis.overdueCount > 0 ? "past deadline" : "on schedule"}
                onClick={() => navigate(dashLink({ overdue: "1", filter: "all" }))}
              />
            </div>
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Volume chart */}
            <Card className={cn(CARD, "lg:col-span-2")}>
              <CardContent className="p-5">
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-inset ring-primary/25">
                      <Activity className="h-[18px] w-[18px]" />
                    </span>
                    <div className="leading-tight">
                      <h3 className={SECTION_TITLE}>
                        {period === "week" ? "Daily Throughput" : period === "quarter" ? "Monthly Throughput" : "Weekly Throughput"}
                      </h3>
                      <p className="text-[11px] font-medium text-muted-foreground">Created vs Completed · {a.periodLabel}</p>
                    </div>
                  </div>
                  <div className="hidden items-center gap-4 sm:flex">
                    <ChartTotal dot="bg-muted-foreground/40" label="Created" value={a.volumeData.reduce((s, d) => s + d.created, 0)} />
                    <ChartTotal dot="bg-primary" label="Completed" value={a.volumeData.reduce((s, d) => s + d.completed, 0)} />
                  </div>
                </div>
                <div className="h-[240px] sm:h-[300px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
                    <BarChart data={a.volumeData} barGap={4} barCategoryGap="26%" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="taskCompletedGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgb(var(--primary))" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="rgb(var(--primary))" stopOpacity={0.6} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" strokeOpacity={0.6} vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "rgb(var(--muted-foreground))", fontSize: 11, fontFamily: '"JetBrains Mono", ui-monospace, monospace' }} axisLine={false} tickLine={false} dy={4} />
                      <YAxis allowDecimals={false} tick={{ fill: "rgb(var(--muted-foreground))", fontSize: 11, fontFamily: '"JetBrains Mono", ui-monospace, monospace' }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip
                        cursor={{ fill: "rgb(var(--secondary))", opacity: 0.5, radius: 6 }}
                        contentStyle={{ backgroundColor: "rgb(var(--card))", border: "1px solid rgb(var(--border))", borderRadius: 10, fontSize: 12, color: "rgb(var(--foreground))", boxShadow: "var(--shadow-dropdown)", padding: "8px 10px" }}
                        labelStyle={{ fontWeight: 600, marginBottom: 2 }}
                      />
                      <ReferenceLine
                        y={a.volumeData.length ? Math.round(a.volumeData.reduce((s, d) => s + d.completed, 0) / a.volumeData.length) : 0}
                        stroke="rgb(var(--primary))"
                        strokeDasharray="4 4"
                        strokeOpacity={0.5}
                      />
                      <Bar dataKey="created" name="Created" fill="rgb(var(--secondary))" radius={[6, 6, 0, 0]} maxBarSize={52} animationDuration={700} isAnimationActive={chartAnimate} />
                      <Bar dataKey="completed" name="Completed" fill="url(#taskCompletedGrad)" radius={[6, 6, 0, 0]} maxBarSize={52} animationDuration={900} isAnimationActive={chartAnimate} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Pipeline — same row pattern as Concept Status
                (PipelineHealth): per-status border accent on the left, a
                long horizontal track with a filled coloured bar, count +
                percentage on the right. Each row deep-links to the
                filtered All Tasks view. */}
            <PipelineWidget pipeline={a.pipeline} navigate={navigate} dashLink={dashLink} />
          </div>

          {/* Workload + At-risk */}
          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            <WorkloadDistribution
              data={a.designerStats}
              onDesignerClick={canOpenScorecard ? setScorecardDesignerId : undefined}
            />
            <AtRiskTasks tasks={tasks} />
          </div>

          {/* Visual charts — priority donut (pie) + cycle-time column chart.
              Replaces the old compact priority/cycle rollups with real charts
              so the effort + priority load reads at a glance. */}
          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            <PriorityDonut data={a.priorityMix} />
            <CycleTimeChart data={a.cycleTimeDist} />
          </div>

          {/* Compact rollups — FK staffing mix + demand-by-client. */}
          <div className="grid items-stretch gap-4 grid-cols-1 sm:grid-cols-2">
            <KittingMixCard data={a.kittingMix} />
            <TopClientsCard data={a.topClients} />
          </div>

          {/* Leaderboard */}
          <TaskLeaderboard
            data={a.designerStats}
            onDesignerClick={canOpenScorecard ? setScorecardDesignerId : undefined}
          />
        </>
      )}

      <DesignerScorecardDrawer
        designerId={scorecardDesignerId}
        onClose={() => setScorecardDesignerId(null)}
      />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Shared "LinkD Premium" surface tokens — uniform card elevation, section
// titles, and focus rings so every widget on this screen reads as one system.
// ----------------------------------------------------------------------------
const CARD =
  "h-full border-border bg-card shadow-card transition-shadow duration-200 hover:shadow-card-hover";
const CARD_BODY = "flex h-full flex-col p-5";
const SECTION_TITLE =
  "font-display text-[17px] font-semibold leading-tight tracking-[-0.01em] text-foreground";
const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const FOCUS_RING_INSET =
  "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40";

// Header status chip — lucide icon + count + label, tone-tinted, accessible.
// Replaces the old <Badge> washes; no emoji.
function StatusChip({
  icon: Icon,
  count,
  label,
  tone,
  pulse,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  label: string;
  tone: "primary" | "warning" | "destructive";
  pulse?: boolean;
  onClick: () => void;
}) {
  const map = {
    primary: "bg-primary/10 text-primary ring-primary/25 hover:bg-primary/15",
    warning: "bg-warning/10 text-warning ring-warning/25 hover:bg-warning/15",
    destructive:
      "bg-destructive/10 text-destructive ring-destructive/25 hover:bg-destructive/15",
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold tabular-nums ring-1 ring-inset transition-colors",
        FOCUS_RING,
        map[tone],
        pulse && "animate-urgent-pulse"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {count}
      <span className="font-medium opacity-80">{label}</span>
    </button>
  );
}

// Chart total — a value + dotted label pair that replaces the recharts Legend
// with a crisper, typographic readout.
function ChartTotal({
  dot,
  label,
  value,
}: {
  dot: string;
  label: string;
  value: number;
}) {
  return (
    <div className="text-right">
      <p className="font-mono-data text-lg font-bold leading-none tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] font-medium text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {label}
      </p>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Hero metric primitives — the Task Dashboard's KPI vocabulary, rebuilt in the
// Linear / Vercel / Stripe idiom: crisp HIGH-CONTRAST numerals (no dim gradient
// clip), 1px borders, restrained accent colour, quiet sparklines.
//   • MetricCard — primary throughput KPI (trend pill + sparkline)
//   • StatusTile — compact live-status count (Active / Urgent / Overdue)
// ----------------------------------------------------------------------------

type HeroTone = "primary" | "success" | "warning" | "destructive" | "muted";

const TONE_ICON: Record<HeroTone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  muted: "bg-secondary text-muted-foreground",
};
const TONE_SPARK: Record<HeroTone, string> = {
  primary: "rgb(var(--primary))",
  success: "rgb(var(--success))",
  warning: "rgb(var(--warning))",
  destructive: "rgb(var(--destructive))",
  muted: "rgb(var(--muted-foreground))",
};
const TONE_DOT: Record<HeroTone, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  muted: "bg-muted-foreground/50",
};

// Trend pill — direction-aware (green up / red down); honours invertTrend so
// "Avg Cycle 5d ↓20%" reads green even on a primary-toned card.
export function DeltaBadge({ metric, invertTrend }: { metric?: KpiMetric; invertTrend?: boolean }) {
  if (!metric) return null;
  const diff = metric.current - metric.previous;
  // No prior-period baseline → the "delta" is just the current value restated
  // (e.g. "Created 7" showing "+7"), which reads as noise. Only show a trend
  // once there's real history to compare against.
  if (metric.previous === 0) return null;
  if (diff === 0) {
    return (
      <span className="text-[10px] font-medium tabular-nums text-muted-foreground">no change</span>
    );
  }
  if (diff === 0) {
    return (
      <span className="text-[10px] font-medium tabular-nums text-muted-foreground">no change</span>
    );
  }
  const positive = invertTrend ? diff < 0 : diff > 0;
  const sign = diff > 0 ? "+" : "";
  const label = metric.trend !== 0 && metric.previous > 0
    ? `${sign}${Math.min(Math.abs(metric.trend), 200)}%`
    : `${sign}${diff}`;
  return (
    <span
      className={cn(
        "text-[10px] font-semibold tabular-nums",
        positive ? "text-success" : "text-destructive"
      )}
    >
      {label}
    </span>
  );
}

export { type HeroTone };
export function MetricCard({
  icon: Icon,
  label,
  value,
  trend,
  sub,
  sparklineData,
  tone,
  invertTrend,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  trend?: KpiMetric;
  sub?: string;
  sparklineData?: number[];
  tone: HeroTone;
  /** When true, a downward trend is positive (e.g. average cycle time). */
  invertTrend?: boolean;
  onClick?: () => void;
}) {
  const numericValue = typeof value === "number" ? value : 0;
  const animated = useAnimatedNumber(numericValue);
  const displayValue = typeof value === "number" ? animated : value;

  const isEmpty = displayValue === "—" || displayValue === 0;
  const hasSparkline = sparklineData && sparklineData.length >= 3;

  const body = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <span className={cn("flex h-5 w-5 items-center justify-center rounded-md sm:h-6 sm:w-6", TONE_ICON[tone])}>
          <Icon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
        </span>
        <DeltaBadge metric={trend} invertTrend={invertTrend} />
      </div>
      <span className="mt-1.5 text-lg font-bold leading-none tracking-tight tabular-nums text-foreground sm:text-2xl">
        {displayValue}
      </span>
      <span className="mt-0.5 text-[9px] font-medium text-muted-foreground sm:text-[10px]">
        {label}
      </span>
      {!isEmpty && sub && (
        <p className="hidden text-[9px] text-muted-foreground/70 sm:block">{sub}</p>
      )}
      {hasSparkline && (
        <div className="mt-auto hidden w-full pt-1 sm:block" role="img" aria-label={`${label} trend`}>
          <Sparkline data={sparklineData} color={TONE_SPARK[tone]} height={16} />
        </div>
      )}
    </div>
  );

  const base =
    "group relative flex h-full flex-col rounded-lg border border-border bg-card px-2 py-2 shadow-sm transition-all duration-200 sm:rounded-xl sm:px-3 sm:py-2.5";
  if (!onClick) return <div className={base}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        base,
        "outline-none hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-primary/40"
      )}
    >
      {body}
    </button>
  );
}

function StatusTile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  pulse,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  tone: HeroTone;
  pulse?: boolean;
  onClick?: () => void;
}) {
  const numericValue = typeof value === "number" ? value : 0;
  const animated = useAnimatedNumber(numericValue);
  const displayValue = typeof value === "number" ? animated : value;

  const body = (
    <>
      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9", TONE_ICON[tone])}>
        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </span>
      <div className="min-w-0 text-center sm:text-left">
        <div className="flex items-center justify-center gap-1.5 sm:justify-start">
          <span className="text-base font-semibold leading-none tabular-nums text-foreground sm:text-2xl">{displayValue}</span>
          {pulse && <span className={cn("h-1.5 w-1.5 rounded-full animate-urgent-pulse", TONE_DOT[tone])} />}
        </div>
        <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.04em] text-muted-foreground sm:truncate sm:text-[11px] sm:tracking-[0.06em]">
          {label}
        </span>
      </div>
      {sub && (
        <span className="ml-auto hidden shrink-0 text-right text-[11px] font-medium text-muted-foreground sm:block">
          {sub}
        </span>
      )}
    </>
  );

  const base =
    "group flex flex-col items-center gap-1 rounded-xl border border-border bg-card px-2.5 py-2 text-center shadow-card transition-all duration-200 sm:flex-row sm:gap-3 sm:px-4 sm:py-3 sm:text-left";
  if (!onClick) return <div className={base}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(base, "outline-none hover:border-primary/40 hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-primary/40")}
    >
      {body}
    </button>
  );
}

// ----------------------------------------------------------------------------
// PipelineWidget — three-row task pipeline (Pool / In Progress / Done).
// Visually mirrors the PipelineHealth (Concept Status) widget so the Task
// and Concept dashboards share one row style: left border accent per
// status, long horizontal bar with filled portion, count + percentage on
// the right. Each row deep-links to the filtered All Tasks view.
// ----------------------------------------------------------------------------

function PipelineWidget({
  pipeline,
  navigate,
  dashLink,
}: {
  pipeline: PipelineItem[];
  navigate: ReturnType<typeof useNavigate>;
  dashLink: (params: Record<string, string>) => string;
}) {
  const maxCount = Math.max(1, ...pipeline.map((d) => d.count));
  const total = pipeline.reduce((s, d) => s + d.count, 0);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <Card className={CARD}>
      <CardContent className={CARD_BODY}>
        <div className="flex items-center justify-between">
          <h3 className={SECTION_TITLE}>Pipeline</h3>
          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
            {total} total
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-center space-y-3 py-3">
          {pipeline.map((item, i) => {
            const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
            const barPct = Math.max(item.count > 0 ? 8 : 4, (item.count / maxCount) * 100);
            const label =
              STATUS_LABELS[item.status as keyof typeof STATUS_LABELS] ?? item.status;
            const barColor = PIPELINE_BAR_COLOR[item.status] ?? "bg-muted";
            const borderColor = PIPELINE_BORDER[item.status] ?? "border-l-muted";

            return (
              <button
                key={item.status}
                type="button"
                onClick={() => navigate(dashLink({ status: item.status }))}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border-l-[3px] px-1.5 py-2 transition-all sm:gap-3 sm:px-2",
                  "cursor-pointer hover:bg-secondary/40 hover:ring-1 hover:ring-primary/20",
                  FOCUS_RING_INSET,
                  borderColor
                )}
              >
                <span className="w-[72px] shrink-0 truncate text-left text-[13px] font-semibold text-foreground sm:w-[90px]">
                  {label}
                </span>
                <div className="flex-1 overflow-hidden rounded-md bg-secondary/60">
                  <div
                    className={cn("flex h-6 items-center justify-end rounded-md", barColor)}
                    style={{
                      width: mounted ? `${barPct}%` : "0%",
                      transition: "width 600ms cubic-bezier(0.4,0,0.2,1)",
                      transitionDelay: `${i * 80}ms`,
                      minWidth: 4,
                    }}
                  >
                    {item.status === "in_progress" && item.count > 0 && (
                      <span className="shuttle-dot mr-1.5 text-white" />
                    )}
                  </div>
                </div>
                <div className="flex w-14 shrink-0 items-center justify-end gap-0.5 sm:w-16 sm:gap-1">
                  <span className="text-base font-bold tabular-nums text-foreground">
                    {item.count}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    ({pct}%)
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// DashboardTabButton — pill in the top tab strip
// ----------------------------------------------------------------------------

function DashboardTabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        // -mb-px aligns the active bottom border with the parent border-b
        // Mobile: tighter horizontal padding + smaller label so both tabs
        // fit side-by-side on narrow screens without horizontal scroll.
        "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors sm:px-4 sm:text-sm",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ============================================================================
// Task Leaderboard
// ============================================================================

type SortKey = "score" | "completed" | "onTime" | "avgDays" | "assigned";
const RANK_EMOJI: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

// ============================================================================
// Designer's personal task list
// ============================================================================

function DesignerWorkloadSummary({
  tasks,
  userId,
}: {
  tasks: { id: string; task_code: string; concept: string; status: string; priority: string; planned_deadline: string | null; client?: { party_name: string } | null; assigned_to: string | null; completed_at?: string | null; delay_days?: number | null }[];
  userId: string;
}) {
  const mine = tasks.filter((t) => t.assigned_to === userId);
  const active = mine.filter((t) => t.status !== "done" && t.status !== "completed");
  const done = mine.filter((t) => t.status === "done" || t.status === "completed");
  const now = Date.now();

  const overdue = active.filter((t) => t.planned_deadline && new Date(t.planned_deadline).getTime() < now);
  const dueToday = active.filter((t) => {
    if (!t.planned_deadline) return false;
    const d = new Date(t.planned_deadline);
    const today = new Date();
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  });
  const upcoming = active
    .filter((t) => t.planned_deadline && new Date(t.planned_deadline).getTime() >= now)
    .sort((a, b) => new Date(a.planned_deadline!).getTime() - new Date(b.planned_deadline!).getTime())
    .slice(0, 3);
  const urgent = active.filter((t) => t.priority === "urgent");

  const recentDone = done
    .sort((a, b) => new Date(b.completed_at ?? 0).getTime() - new Date(a.completed_at ?? 0).getTime())
    .slice(0, 3);

  const onTimeCount = done.filter((t) => t.delay_days == null || t.delay_days <= 1).length;
  const lateCount = done.filter((t) => t.delay_days != null && t.delay_days > 1).length;

  return (
    <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
      {/* Left: Workload overview */}
      <Card>
        <CardContent className="py-3">
          <h4 className="mb-2.5 text-xs font-semibold text-foreground">Workload Overview</h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <WorkloadStat label="Active" value={active.length} color="text-primary" icon={Activity} />
            <WorkloadStat label="Overdue" value={overdue.length} color={overdue.length > 0 ? "text-destructive" : "text-muted-foreground"} icon={AlertTriangle} />
            <WorkloadStat label="Due Today" value={dueToday.length} color={dueToday.length > 0 ? "text-warning" : "text-muted-foreground"} icon={Clock} />
            <WorkloadStat label="Urgent" value={urgent.length} color={urgent.length > 0 ? "text-destructive" : "text-muted-foreground"} icon={Flame} />
          </div>

          {upcoming.length > 0 && (
            <div className="mt-3 border-t border-border pt-2.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Upcoming Deadlines</p>
              <div className="space-y-1">
                {upcoming.map((t) => {
                  const dl = t.planned_deadline ? new Date(t.planned_deadline) : null;
                  const daysLeft = dl ? Math.ceil((dl.getTime() - now) / 86400000) : null;
                  return (
                    <div key={t.id} className="flex items-center gap-2 text-[11px]">
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", daysLeft != null && daysLeft <= 1 ? "bg-destructive" : daysLeft != null && daysLeft <= 3 ? "bg-warning" : "bg-success")} />
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{t.concept}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {daysLeft != null ? (daysLeft === 0 ? "Today" : daysLeft === 1 ? "Tomorrow" : `${daysLeft}d`) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {active.length === 0 && (
            <p className="mt-2 text-center text-xs text-muted-foreground">No active tasks — check the Pool to claim one!</p>
          )}
        </CardContent>
      </Card>

      {/* Right: Completion history */}
      <Card>
        <CardContent className="py-3">
          <h4 className="mb-2.5 text-xs font-semibold text-foreground">Completion History</h4>
          <div className="mb-3 flex gap-3">
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="h-2 w-2 rounded-full bg-success" />
              <span className="text-muted-foreground">On time</span>
              <span className="font-semibold tabular-nums text-success">{onTimeCount}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="h-2 w-2 rounded-full bg-destructive" />
              <span className="text-muted-foreground">Late</span>
              <span className="font-semibold tabular-nums text-destructive">{lateCount}</span>
            </div>
            <div className="ml-auto text-[11px] text-muted-foreground">
              {done.length} total
            </div>
          </div>

          {done.length > 0 && (
            <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-success transition-[width] duration-500" style={{ width: `${(onTimeCount / Math.max(1, done.length)) * 100}%` }} />
              <div className="h-full bg-destructive transition-[width] duration-500" style={{ width: `${(lateCount / Math.max(1, done.length)) * 100}%` }} />
            </div>
          )}

          {recentDone.length > 0 ? (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recent</p>
              <div className="space-y-1">
                {recentDone.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-[11px]">
                    <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{t.concept}</span>
                    {t.delay_days != null && t.delay_days <= 1 ? (
                      <span className="shrink-0 text-success">On time</span>
                    ) : t.delay_days != null ? (
                      <span className="shrink-0 text-destructive">+{t.delay_days}d</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-xs text-muted-foreground">No completed tasks yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WorkloadStat({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-card px-2 py-2 text-center">
      <Icon className={cn("h-3.5 w-3.5", color)} />
      <span className={cn("mt-0.5 text-lg font-bold tabular-nums leading-none", color)}>{value}</span>
      <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

function MyTasksTable({
  tasks,
  userId,
}: {
  tasks: { id: string; task_code: string; concept: string; status: string; priority: string; planned_deadline: string | null; client?: { party_name: string } | null; assigned_to: string | null; completed_at?: string | null; delay_days?: number | null }[];
  userId: string;
}) {
  const myTasks = tasks
    .filter(
      (t) =>
        t.assigned_to === userId &&
        t.status !== "done" &&
        t.status !== "completed"
    )
    .sort((a, b) => {
      const ad = a.planned_deadline ? new Date(a.planned_deadline).getTime() : Infinity;
      const bd = b.planned_deadline ? new Date(b.planned_deadline).getTime() : Infinity;
      return ad - bd;
    });

  const recentDone = tasks
    .filter(
      (t) =>
        t.assigned_to === userId &&
        (t.status === "done" || t.status === "completed")
    )
    .sort((a, b) => new Date(b.completed_at ?? b.planned_deadline ?? 0).getTime() - new Date(a.completed_at ?? a.planned_deadline ?? 0).getTime())
    .slice(0, 5);

  if (myTasks.length === 0 && recentDone.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No tasks assigned to you right now. Check the Pool to claim one!
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          My Active Tasks
          {myTasks.length > 0 && (
            <Badge variant="secondary" className="ml-2 text-[10px]">{myTasks.length}</Badge>
          )}
        </h3>

        {myTasks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Concept</th>
                  <th className="px-3 py-2 text-left font-medium">Client</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Deadline</th>
                  <th className="px-3 py-2 text-left font-medium">Priority</th>
                </tr>
              </thead>
              <tbody>
                {myTasks.map((t) => (
                  <tr key={t.id} className="border-b border-border/40 hover:bg-primary/[0.02]">
                    <td className="px-3 py-2.5 font-medium text-foreground">{t.concept}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{t.client?.party_name ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <Badge className={cn("text-[10px]",
                        t.status === "in_progress" ? "bg-primary/20 text-primary border border-primary/30" :
                        t.status === "todo" ? "bg-card text-foreground border border-border" :
                        "bg-secondary text-muted-foreground border border-border"
                      )}>
                        {STATUS_LABELS[t.status as keyof typeof STATUS_LABELS] ?? t.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5"><DeadlineCell deadline={t.planned_deadline} /></td>
                    <td className="px-3 py-2.5 text-xs capitalize text-muted-foreground">
                      {t.priority === "urgent" ? (
                        <Badge className="bg-destructive text-white text-[9px]">Urgent</Badge>
                      ) : t.priority}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No active tasks — all caught up! 🎉</p>
        )}

        {recentDone.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recently Completed
            </h4>
            <div className="space-y-1.5">
              {recentDone.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-xs">
                  <span className="text-foreground">{t.concept}</span>
                  <div className="flex items-center gap-2">
                    {t.delay_days != null && t.delay_days <= 1 ? (
                      <span className="text-success">✓ On time</span>
                    ) : t.delay_days != null ? (
                      <span className="text-destructive">+{t.delay_days}d late</span>
                    ) : null}
                    <Badge className="bg-success/20 text-success border border-success/30 text-[9px]">Done</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TaskLeaderboard({
  data,
  onDesignerClick,
}: {
  data: DesignerTaskStat[];
  onDesignerClick?: (id: string) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "score", dir: "desc" });

  const sorted = [...data].sort((a, b) => {
    const m = sort.dir === "asc" ? 1 : -1;
    return m * ((a[sort.key] ?? 0) - (b[sort.key] ?? 0));
  });

  function toggle(key: SortKey) {
    setSort((prev) => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sort.key !== col) return <ChevronUp className="h-3 w-3 opacity-30" />;
    return sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  }

  return (
    <Card>
      <CardContent className="py-4">
        <div className="mb-4 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-warning" />
          <h3 className="text-sm font-semibold text-foreground sm:text-lg">Designer Task Performance</h3>
        </div>

        {/* Mobile card view */}
        <div className="space-y-2 sm:hidden">
          {sorted.map((d, i) => {
            const rank = i + 1;
            const emoji = RANK_EMOJI[rank];
            const otRatio = d.assigned > 0 ? d.onTime / d.assigned : 0;
            const scoreColor = d.score >= 90 ? "bg-success" : d.score >= 75 ? "bg-warning" : "bg-destructive";
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onDesignerClick?.(d.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors active:scale-[0.99]",
                  onDesignerClick && "hover:bg-secondary/50"
                )}
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="text-lg">{emoji ?? <span className="text-sm text-muted-foreground">#{rank}</span>}</span>
                  <Avatar className="h-8 w-8">
                    {d.avatar_url ? <AvatarImage src={d.avatar_url} /> : null}
                    <AvatarFallback className="bg-primary/10 text-primary text-[10px]">{getInitials(d.full_name)}</AvatarFallback>
                  </Avatar>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{d.full_name}</p>
                  <div className="mt-1.5 grid grid-cols-3 gap-x-2 gap-y-1 text-[11px]">
                    <div><span className="text-muted-foreground">Done </span><span className="font-semibold text-success">{d.completed}</span></div>
                    <div><span className="text-muted-foreground">OT </span><span className={cn("font-semibold", d.assigned === 0 ? "text-muted-foreground" : otRatio > 0.85 ? "text-success" : "text-warning")}>{d.assigned > 0 ? `${d.onTime}/${d.assigned}` : "—"}</span></div>
                    <div><span className="text-muted-foreground">Avg </span><span className="font-semibold">{d.completed > 0 ? `${d.avgDays}d` : "—"}</span></div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div className={cn("h-full rounded-full", scoreColor)} style={{ width: `${d.score}%` }} />
                      <span className={cn("absolute top-1/2 -translate-y-1/2 text-[10px] font-bold tabular-nums", d.score >= 20 ? "left-1.5 text-white" : "right-1.5 text-foreground")}>{d.score}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Desktop table view */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[650px] text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="w-12 px-4 py-3 text-center font-medium">#</th>
                <th className="px-4 py-3 text-left font-medium">Designer</th>
                <ThBtn label="Assigned" col="assigned" sort={sort} toggle={toggle} Icon={SortIcon} />
                <ThBtn label="Completed" col="completed" sort={sort} toggle={toggle} Icon={SortIcon} />
                <ThBtn label="On Time" col="onTime" sort={sort} toggle={toggle} Icon={SortIcon} />
                <ThBtn label="Avg Days" col="avgDays" sort={sort} toggle={toggle} Icon={SortIcon} />
                <ThBtn label="Score" col="score" sort={sort} toggle={toggle} Icon={SortIcon} className="w-[140px]" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((d, i) => {
                const rank = i + 1;
                const emoji = RANK_EMOJI[rank];
                const otRatio = d.assigned > 0 ? d.onTime / d.assigned : 0;
                const scoreColor = d.score >= 90 ? "bg-success" : d.score >= 75 ? "bg-warning" : "bg-destructive";

                return (
                  <tr
                    key={d.id}
                    onClick={() => onDesignerClick?.(d.id)}
                    className={cn(
                      "border-b border-border transition-colors hover:bg-primary/[0.03]",
                      onDesignerClick && "cursor-pointer",
                      d.score === 0 && "opacity-50"
                    )}
                  >
                    <td className={cn("px-4 py-3 text-center", rank === 1 && "bg-warning/10", rank === 2 && "bg-muted/20", rank === 3 && "bg-warning/5")}>
                      {emoji ?? <span className="text-muted-foreground">{rank}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          {d.avatar_url ? <AvatarImage src={d.avatar_url} /> : null}
                          <AvatarFallback className="bg-primary/10 text-primary text-[10px]">{getInitials(d.full_name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className={cn("font-medium leading-tight", onDesignerClick ? "text-primary hover:underline" : "text-foreground")}>{d.full_name}</p>
                          <Badge variant="outline" className="mt-0.5 text-[9px] px-1">{d.designerCode}</Badge>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center font-semibold tabular-nums">{d.assigned || <span className="text-muted-foreground">0</span>}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-success">{d.completed || <span className="text-muted-foreground">0</span>}</td>
                    <td className={cn("px-4 py-3 text-center tabular-nums", d.assigned === 0 ? "text-muted-foreground" : otRatio > 0.85 ? "text-success" : otRatio >= 0.7 ? "text-warning" : "text-destructive")}>
                      {d.assigned > 0 ? `${d.onTime}/${d.assigned}` : "—"}
                    </td>
                    <td className={cn("px-4 py-3 text-center tabular-nums", d.completed === 0 ? "text-muted-foreground" : d.avgDays < 3 ? "text-success" : d.avgDays <= 5 ? "text-warning" : "text-destructive")}>
                      {d.completed > 0 ? `${d.avgDays}d` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {onDesignerClick ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDesignerClick(d.id); }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold tabular-nums text-primary transition-all hover:border-primary hover:bg-primary/15 hover:shadow"
                        >
                          {d.score}/100
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                            <div className={cn("h-full rounded-full", scoreColor)} style={{ width: `${d.score}%` }} />
                          </div>
                          <span className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums",
                            d.score >= 90 ? "bg-success/10 text-success" : d.score >= 75 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"
                          )}>
                            {d.score}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ThBtn({ label, col, sort, toggle, Icon, className }: {
  label: string; col: SortKey; sort: { key: SortKey; dir: "asc" | "desc" }; toggle: (k: SortKey) => void; Icon: React.ComponentType<{ col: SortKey }>; className?: string;
}) {
  return (
    <th className={cn("px-4 py-3 text-center font-medium", className)}>
      <button type="button" onClick={() => toggle(col)} className={cn("inline-flex items-center gap-1", sort.key === col ? "text-foreground" : "hover:text-foreground")}>
        {label}<Icon col={col} />
      </button>
    </th>
  );
}

// ============================================================================
// Detail-row cards — Kitting mix · Priority · Cycle time · Top clients
// ============================================================================
//
// These four cards live in their own equal-height row beneath Workload + At
// Risk. Each answers a specific operational question the original dashboard
// never surfaced:
//   • Kitting mix     — staffing question (how much of the queue needs FK?)
//   • Priority mix    — load shape (how aggressive is the queue right now?)
//   • Cycle time      — where the team actually spends its time per task
//   • Top clients     — demand by customer in the period

function KittingMixCard({ data }: { data: KittingMix }) {
  const total = data.withKitting + data.withoutKitting;
  const withPct = total > 0 ? Math.round((data.withKitting / total) * 100) : 0;
  const submitPct = data.withKitting > 0 ? Math.round((data.kittingSubmitted / data.withKitting) * 100) : 0;
  const allSubmitted = data.withKitting > 0 && data.kittingPending === 0;

  return (
    <Card className="h-full min-h-[270px] transition-shadow duration-300 hover:shadow-md">
      <CardContent className="flex h-full flex-col py-4">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Package className="h-3 w-3" />
          Full kitting
        </div>
        <h3 className="text-sm font-semibold text-foreground">FK requirement mix</h3>

        {total === 0 ? (
          <p className="mt-4 flex-1 rounded-lg bg-secondary/40 p-3 text-center text-xs italic text-muted-foreground">
            No tasks created in this period.
          </p>
        ) : (
          <div className="mt-4 flex flex-1 flex-col gap-4">
            {/* Hero readout — big % + caption */}
            <div className="flex items-end gap-3">
              <span className="text-[40px] font-bold leading-none tracking-tight tabular-nums text-primary">
                {data.pct}%
              </span>
              <span className="pb-1 text-xs font-medium leading-snug text-muted-foreground">
                of {total} task{total === 1 ? "" : "s"}
                <br />need full kitting
              </span>
            </div>

            {/* Proportion bar — one glanceable split of With vs Without FK */}
            <div>
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-secondary ring-1 ring-inset ring-border">
                <div
                  className="h-full bg-gradient-to-r from-primary to-primary/80 transition-[width] duration-700"
                  style={{ width: `${withPct}%` }}
                  title={`${data.withKitting} with full kitting`}
                />
              </div>
              <div className="mt-2.5 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
                  With FK
                  <b className="tabular-nums text-foreground">{data.withKitting}</b>
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/30" />
                  Without
                  <b className="tabular-nums text-foreground">{data.withoutKitting}</b>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Submission progress — only meaningful when some FK tasks exist. */}
        {data.withKitting > 0 && (
          <div className="mt-auto pt-3">
            <div className="mb-1.5 flex items-center justify-between text-[10px]">
              <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                FK form submissions
              </span>
              <span className={cn("flex items-center gap-1 font-semibold tabular-nums", allSubmitted ? "text-success" : "text-foreground")}>
                {allSubmitted && <CheckCircle2 className="h-3 w-3" />}
                {data.kittingSubmitted}/{data.withKitting}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-700",
                  allSubmitted ? "bg-success" : "bg-primary"
                )}
                style={{ width: `${submitPct}%` }}
              />
            </div>
            <p className={cn("mt-1 text-[10px]", data.kittingPending > 0 ? "text-warning" : "text-success")}>
              {data.kittingPending > 0
                ? `${data.kittingPending} pending submission${data.kittingPending !== 1 ? "s" : ""}`
                : "All FK forms submitted"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PriorityMixCard({ data }: { data: PriorityMix }) {
  const total = data.urgent + data.high + data.normal + data.low;
  const rows: Array<{ label: string; value: number; bar: string; dot: string }> = [
    { label: "Urgent", value: data.urgent, bar: "bg-destructive", dot: "bg-destructive" },
    { label: "High", value: data.high, bar: "bg-warning", dot: "bg-warning" },
    { label: "Normal", value: data.normal, bar: "bg-primary", dot: "bg-primary" },
    { label: "Low", value: data.low, bar: "bg-muted-foreground/40", dot: "bg-muted-foreground/60" },
  ];
  return (
    <Card className="h-full min-h-[270px] transition-shadow duration-300 hover:shadow-md">
      <CardContent className="flex h-full flex-col py-4">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Zap className="h-3 w-3" />
          Priority
        </div>
        <h3 className="text-sm font-semibold text-foreground">Active queue priority mix</h3>

        {total === 0 ? (
          <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-1">
            <p className="text-4xl font-bold tabular-nums text-muted-foreground">0</p>
            <p className="text-xs text-muted-foreground">No active tasks right now</p>
          </div>
        ) : total <= 3 ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {rows.filter((r) => r.value > 0).map((r) => (
                <div key={r.label} className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-2.5 py-2">
                  <span className={cn("h-2.5 w-2.5 rounded-full", r.dot)} />
                  <span className="text-xs font-medium text-foreground">{r.label}</span>
                  <span className="ml-auto text-sm font-bold tabular-nums text-foreground">{r.value}</span>
                </div>
              ))}
            </div>
            <p className="mt-auto pt-2 text-[10px] text-muted-foreground">
              {total} active task{total !== 1 ? "s" : ""} in pipeline
            </p>
          </>
        ) : (
          <>
            {/* Stacked segment bar */}
            <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-secondary">
              {rows.map((r) => {
                const pct = (r.value / total) * 100;
                if (pct === 0) return null;
                return (
                  <div
                    key={r.label}
                    className={cn("h-full", r.bar)}
                    style={{ width: `${pct}%`, transition: "width 700ms" }}
                    title={`${r.label}: ${r.value}`}
                  />
                );
              })}
            </div>
            <ul className="mt-3 flex-1 space-y-1.5 text-xs">
              {rows.map((r) => {
                const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
                return (
                  <li key={r.label} className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cn("h-2 w-2 rounded-full", r.dot)} />
                      {r.label}
                    </span>
                    <span className="tabular-nums text-foreground">
                      {r.value}
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({pct}%)
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-auto pt-2 text-[10px] text-muted-foreground">
              {total} active task{total !== 1 ? "s" : ""} in pipeline
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CycleTimeCard({ data }: { data: CycleTimeBucket[] }) {
  const total = data.reduce((s, b) => s + b.count, 0);
  const max = Math.max(1, ...data.map((b) => b.count));
  return (
    <Card className="h-full min-h-[270px] transition-shadow duration-300 hover:shadow-md">
      <CardContent className="flex h-full flex-col py-4">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Flame className="h-3 w-3" />
          Effort
        </div>
        <h3 className="text-sm font-semibold text-foreground">Time to complete</h3>

        {total === 0 ? (
          <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-1">
            <p className="text-4xl font-bold tabular-nums text-muted-foreground">0</p>
            <p className="text-xs text-muted-foreground">No completions yet</p>
          </div>
        ) : total <= 2 ? (
          <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-2">
            <p className="text-3xl font-bold tabular-nums text-foreground">{total}</p>
            <p className="text-xs text-muted-foreground">completion{total !== 1 ? "s" : ""} this period</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {data.filter((b) => b.count > 0).map((b) => (
                <span key={b.label} className="rounded-full border border-border bg-secondary/40 px-2 py-0.5 text-[10px] font-medium text-foreground">
                  {b.label}: {b.count}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <ul className="mt-3 flex-1 space-y-1.5 text-xs">
            {data.map((b) => {
              const pct = (b.count / max) * 100;
              return (
                <li key={b.label} className="flex items-center gap-2">
                  <span className="w-[70px] shrink-0 text-muted-foreground">
                    {b.label}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-[11px] font-semibold tabular-nums text-foreground">
                    {b.count}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {total > 0 && (
          <p className="mt-auto pt-2 text-[10px] text-muted-foreground">
            Based on {total} completion{total !== 1 ? "s" : ""} in this period
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TopClientsCard({ data }: { data: TopClient[] }) {
  // Card preview shows the top 5; the rest goes into the "View all" dialog.
  // `data` arrives pre-sorted by total DESC from useTaskAnalytics.
  const preview = data.slice(0, 5);
  const max = Math.max(1, ...preview.map((c) => c.total));
  const [allOpen, setAllOpen] = useState(false);
  // The dialog also exposes EVERY client in the system (including those with
  // zero tasks this period) so the admin can see the whole roster — fetch
  // the full client list lazily here and pass into the dialog.
  const { clients: allClients } = useClients();

  return (
    <Card className="h-full min-h-[270px] transition-shadow duration-300 hover:shadow-md">
      <CardContent className="flex h-full flex-col py-4">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Building2 className="h-3 w-3" />
          Demand
        </div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Top clients</h3>
          {/* Expand affordance — always visible. The dialog shows more than
              just the rows you'd find by paging the preview: it can also
              flip into "All clients" mode to surface zero-activity ones. */}
          <button
            type="button"
            onClick={() => setAllOpen(true)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/10"
            title="View all clients"
          >
            View all
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        {data.length === 0 ? (
          <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-1">
            <p className="text-4xl font-bold tabular-nums text-muted-foreground">0</p>
            <p className="text-xs text-muted-foreground">No client activity this period</p>
          </div>
        ) : (
          <>
            <ul className="mt-3 flex-1 space-y-2 text-xs">
              {preview.map((c, i) => {
                const pct = Math.max(8, (c.total / max) * 100);
                return (
                  <li
                    key={c.client_id}
                    className="flex items-center gap-2"
                    title={`${c.party_name} · ${c.active} active · ${c.completed} done`}
                  >
                    <span className="w-4 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                      #{i + 1}
                    </span>
                    <span className="w-24 shrink-0 truncate font-medium text-foreground">
                      {c.party_name}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right font-semibold tabular-nums text-foreground">
                      {c.total}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-auto pt-2 text-[10px] text-muted-foreground">
              Showing top {preview.length} of {data.length} active ·{" "}
              <button
                type="button"
                onClick={() => setAllOpen(true)}
                className="font-medium text-primary hover:underline"
              >
                see all clients
              </button>
            </p>
          </>
        )}
      </CardContent>

      <AllClientsDialog
        open={allOpen}
        onOpenChange={setAllOpen}
        data={data}
        allClients={allClients}
      />
    </Card>
  );
}

// ----------------------------------------------------------------------------
// AllClientsDialog — full sorted list with search, opened from TopClientsCard
// ----------------------------------------------------------------------------

// A row that's safe for both modes — `total/active/completed` are zero for
// clients with no activity this period, and we tag where the row came from.
interface ClientRow {
  client_id: string;
  party_name: string;
  active: number;
  completed: number;
  total: number;
}

function AllClientsDialog({
  open,
  onOpenChange,
  data,
  allClients,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: TopClient[];
  allClients: { id: string; party_name: string }[];
}) {
  const [query, setQuery] = useState("");
  // Mode toggle. "active" = only clients with at least one in-window task
  // (matches the card preview). "all" = the entire `clients` table, with
  // zero-activity rows shown in muted style at the bottom.
  const [mode, setMode] = useState<"active" | "all">("active");

  // Build a lookup of per-client counts so we can layer them onto the full
  // client list when the user flips to "all" mode.
  const countsById = useMemo(() => {
    const m = new Map<string, TopClient>();
    for (const c of data) m.set(c.client_id, c);
    return m;
  }, [data]);

  // Active mode rows are already sorted; all-mode rows place active clients
  // first (sorted by total DESC), then zero-task clients alphabetically.
  const rows: ClientRow[] = useMemo(() => {
    if (mode === "active") return data;
    const seen = new Set<string>();
    const out: ClientRow[] = [];
    // 1. All clients that have activity, in TopClient sort order.
    for (const c of data) {
      out.push(c);
      seen.add(c.client_id);
    }
    // 2. Remaining clients alphabetically with zero counts.
    const inactive = allClients
      .filter((c) => !seen.has(c.id))
      .sort((a, b) => a.party_name.localeCompare(b.party_name))
      .map<ClientRow>((c) => ({
        client_id: c.id,
        party_name: c.party_name,
        active: 0,
        completed: 0,
        total: 0,
      }));
    out.push(...inactive);
    return out;
  }, [mode, data, allClients]);

  // Filter happens on each keystroke — the list is small (~hundreds of
  // clients in practice) so no debounce needed. Sort stays locked in `rows`.
  const filtered = query.trim()
    ? rows.filter((c) =>
        c.party_name.toLowerCase().includes(query.trim().toLowerCase())
      )
    : rows;

  const max = Math.max(1, ...data.map((c) => c.total));
  const activeCount = data.length;
  const allCount = allClients.length;
  const inactiveCount = Math.max(0, allCount - activeCount);
  // Counts ignoring search since they describe the underlying mode, not the
  // current keystroke filter.
  void countsById;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-3 p-0">
        <DialogHeader className="border-b border-border px-5 pb-3 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            All clients by demand
          </DialogTitle>
          <DialogDescription>
            Sorted by task volume for this period. Switch to{" "}
            <span className="font-medium text-foreground">All clients</span> to
            also see customers with no activity in the window.
          </DialogDescription>
        </DialogHeader>

        {/* Mode toggle + search */}
        <div className="space-y-2 px-5">
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            <ModeChip
              active={mode === "active"}
              onClick={() => setMode("active")}
              label="In this period"
              count={activeCount}
            />
            <ModeChip
              active={mode === "all"}
              onClick={() => setMode("all")}
              label="All clients"
              count={allCount}
            />
          </div>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search clients…"
          />
          <p className="text-[11px] text-muted-foreground">
            {mode === "active"
              ? `${activeCount} client${activeCount !== 1 ? "s" : ""} with activity this period`
              : `${activeCount} active · ${inactiveCount} with no tasks this period · ${allCount} total`}
            {query && (
              <>
                {" · "}
                <span className="font-medium text-foreground">
                  {filtered.length} match{filtered.length !== 1 ? "es" : ""}
                </span>
              </>
            )}
          </p>
        </div>

        {/* Scrollable table — sticky header so the rank column stays
            visible as the user scrolls a long list. */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {filtered.length === 0 ? (
            <p className="rounded-lg bg-secondary/40 p-4 text-center text-xs italic text-muted-foreground">
              {query
                ? `No clients match "${query}".`
                : mode === "active"
                ? "No client activity in this period yet."
                : "No clients in the system yet."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="w-[48px] px-2 py-2 text-right font-medium">#</th>
                  <th className="px-2 py-2 font-medium">Client</th>
                  <th className="w-[80px] px-2 py-2 text-right font-medium">
                    Active
                  </th>
                  <th className="w-[80px] px-2 py-2 text-right font-medium">
                    Done
                  </th>
                  <th className="w-[60px] px-2 py-2 text-right font-medium">
                    Total
                  </th>
                  <th className="w-[160px] px-2 py-2 font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const isInactive = c.total === 0;
                  // Rank logic: only "active" rows get a rank pill — they're
                  // the ones with a meaningful position in the demand sort.
                  // Inactive rows show a dash so the column reads cleanly.
                  const activeRank = !isInactive
                    ? data.findIndex((x) => x.client_id === c.client_id) + 1
                    : null;
                  const pct = !isInactive ? Math.max(2, (c.total / max) * 100) : 0;
                  return (
                    <tr
                      key={c.client_id}
                      className={cn(
                        "border-b border-border/60 transition-colors hover:bg-secondary/30",
                        isInactive && "opacity-60"
                      )}
                    >
                      <td className="px-2 py-2 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                        {activeRank ? `#${activeRank}` : "—"}
                      </td>
                      <td className="px-2 py-2 font-medium text-foreground">
                        {c.party_name}
                        {isInactive && (
                          <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                            No tasks
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {c.active > 0 ? (
                          <span className="text-warning">{c.active}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {c.completed > 0 ? (
                          <span className="text-success">{c.completed}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right text-sm font-semibold tabular-nums text-foreground">
                        {c.total}
                      </td>
                      <td className="px-2 py-2">
                        {isInactive ? (
                          <div className="h-2 rounded-full bg-secondary" />
                        ) : (
                          <div className="h-2 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// ModeChip — toggle pill used in the AllClients dialog
// ----------------------------------------------------------------------------

function ModeChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-white shadow-sm"
          : "text-muted-foreground hover:bg-secondary"
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 py-0 text-[10px] tabular-nums",
          active ? "bg-white/25" : "bg-secondary text-foreground"
        )}
      >
        {count}
      </span>
    </button>
  );
}

function LegendRow({
  dot,
  label,
  value,
}: {
  dot: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <span className={cn("h-2 w-2 rounded-full", dot)} />
        {label}
      </span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

// Inline variant of LegendRow used under centered donut charts (KittingMix).
// Renders as: ● Label · 3  — fits multiple side-by-side in a single line.
function LegendInline({
  dot,
  label,
  value,
}: {
  dot: string;
  label: string;
  value: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className={cn("h-2 w-2 rounded-full", dot)} />
      <span>{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </span>
  );
}
