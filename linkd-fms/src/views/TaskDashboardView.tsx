import { useMemo, useState } from "react";
import {
  CheckCircle2, Clock, Timer, PlusCircle, AlertTriangle,
  LayoutGrid, Trophy, ChevronUp, ChevronDown, ChevronRight,
  Package, Flame, Zap, Building2, Lightbulb,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnalyticsView } from "@/views/AnalyticsView";
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
} from "@/hooks/useTaskAnalytics";
import { KpiCard } from "@/components/analytics/KpiCard";
import { TaskHealthHero } from "@/components/analytics/TaskHealthHero";
import { WorkloadDistribution } from "@/components/analytics/WorkloadDistribution";
import { AtRiskTasks } from "@/components/analytics/AtRiskTasks";
import { DesignerScorecardDrawer } from "@/components/analytics/DesignerScorecardDrawer";
import {
  Card, CardContent, Badge, Button, SkeletonCard, SkeletonTable,
  Avatar, AvatarFallback, AvatarImage, getInitials, DeadlineCell,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  SearchInput,
} from "@/components/ui";
import { STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { isAdminOrCoordinator } from "@/lib/permissions";

const PERIODS: { value: Period; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
];

const PIPELINE_BAR_COLOR: Record<string, string> = {
  pool: "bg-muted",
  in_progress: "bg-primary",
  done: "bg-success",
};

// Two faces of this page — Tasks (default) and Concepts (the former
// /analytics view, now embedded here). State stored in the URL via the
// `tab` search param so a) deep-links work, b) the browser back button
// switches tabs, c) it survives a refresh.
type DashTab = "tasks" | "concepts";

export function TaskDashboardView() {
  const { profile } = useAuth();
  const navigate = useNavigate();
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
  const a = useTaskAnalytics(period);
  const { tasks } = useTasks();

  // Scorecard drawer state (admin-only opens; for designer self-view this
  // would still pop, but coordinators see nothing because the drawer
  // gates render on isAdmin).
  const [scorecardDesignerId, setScorecardDesignerId] = useState<string | null>(null);
  const canOpenScorecard = role === "admin";

  const myStats = isDesigner
    ? a.designerStats.find((d) => d.id === profile?.id) ?? null
    : null;

  // Reusable period-pill cluster. Rendered inside the tab row so it sits on
  // the same baseline as "Task Dashboard / Concept Dashboard" pills — saves
  // the extra caption row that used to live below.
  const taskPeriodPills = (
    <div className="inline-flex shrink-0 rounded-lg bg-secondary p-1">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => setPeriod(p.value)}
          className={cn(
            // Touch-friendly on mobile (px-3 py-1.5) — keeps the 36-44px
            // target the spec calls for, then shrinks slightly on sm+.
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:py-1",
            period === p.value
              ? "bg-primary text-white"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );

  // Tab strip rendered above both bodies. The right slot carries the active
  // tab's period selector so the user sees their date scope at the same eye
  // level as the tab they're standing on.
  const tabsRow = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
      <div className="-mb-px flex items-center gap-1 overflow-x-auto">
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
      {/* Right slot — task tab uses the inline pills here; concept tab keeps
          its own (Analytics owns that state) so it stays below the strip in
          AnalyticsView's embedded layout. */}
      {tab === "tasks" && <div className="pb-2">{taskPeriodPills}</div>}
    </div>
  );

  // ── Concept Dashboard tab ──
  // Short-circuit BEFORE the task-data error / loading checks so the concept
  // tab is reachable even when the task dataset has problems. AnalyticsView
  // brings its own header + period filter + loading + error states, so we
  // just mount it under our tab strip. Conditional mount (not display: none)
  // means recharts initialises with real dimensions — no resize hacks needed.
  if (tab === "concepts") {
    return (
      <div className="space-y-4">
        {tabsRow}
        <AnalyticsView embedded />
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
    <div className="space-y-3 sm:space-y-4">
      {tabsRow}
      {/* Inter-section spacing: tighter on mobile (space-y-4) since each
           section already has its own internal padding; roomier on sm+. */}
      <div className="space-y-4 sm:space-y-6">

      {/* Designer personal view */}
      {isDesigner && myStats ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <KpiCard
              icon={<CheckCircle2 className="h-4 w-4 text-success" />}
              label="Completed"
              value={myStats.completed}
              metric={{ current: myStats.completed, previous: 0, trend: 0 }}
              tintClass="bg-success/10"
              to={dashLink({ filter: "mine", status: "done", from: periodFrom, to: periodTo })}
            />
            <KpiCard
              icon={<Clock className="h-4 w-4 text-primary" />}
              label="On-Time Rate"
              value={myStats.assigned > 0 ? `${Math.round((myStats.onTime / myStats.assigned) * 100)}%` : "—"}
              metric={{ current: 0, previous: 0, trend: 0 }}
              tintClass="bg-primary/10"
              to={dashLink({ filter: "mine", status: "done", from: periodFrom, to: periodTo })}
            />
            <KpiCard
              icon={<Timer className="h-4 w-4 text-primary" />}
              label="Avg Days"
              value={myStats.completed > 0 ? `${myStats.avgDays}d` : "—"}
              metric={{ current: 0, previous: 0, trend: 0 }}
              tintClass="bg-primary/10"
              to={dashLink({ filter: "mine", status: "done", from: periodFrom, to: periodTo })}
            />
            <KpiCard
              icon={<LayoutGrid className="h-4 w-4 text-warning" />}
              label="In Progress"
              value={myStats.inProgress}
              metric={{ current: 0, previous: 0, trend: 0 }}
              tintClass="bg-warning/10"
              to={dashLink({ filter: "mine", status: "in_progress" })}
            />
          </div>
          {/* Score card */}
          <Card>
            <CardContent className="flex flex-col items-center py-6">
              <p className={cn("text-5xl font-bold tabular-nums", myStats.score >= 90 ? "text-success" : myStats.score >= 75 ? "text-warning" : "text-destructive")}>{myStats.score}</p>
              <div className="mt-3 h-2.5 w-48 overflow-hidden rounded-full bg-secondary">
                <div className={cn("h-full rounded-full transition-[width] duration-[800ms]", myStats.score >= 90 ? "bg-success" : myStats.score >= 75 ? "bg-warning" : "bg-destructive")} style={{ width: `${myStats.score}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Performance score this {period}</p>
            </CardContent>
          </Card>

          {/* My active tasks */}
          <MyTasksTable tasks={tasks} userId={profile?.id ?? ""} />

          {/* My pipeline snapshot — simplified 3-stage (Pool → In Progress → Done).
              Legacy todo/full_kitting/approved/sampling rows roll up into In Progress. */}
          <Card>
            <CardContent className="py-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">My Pipeline</h3>
              <div className="space-y-2">
                {(["pool", "in_progress", "done"] as const).map((s) => {
                  const mine = tasks.filter((t) => t.assigned_to === profile?.id);
                  const myCount =
                    s === "in_progress"
                      ? mine.filter(
                          (t) =>
                            t.status === "in_progress" ||
                            t.status === "todo" ||
                            t.status === "full_kitting" ||
                            t.status === "approved" ||
                            t.status === "sampling"
                        ).length
                      : mine.filter((t) => t.status === s).length;
                  const label = STATUS_LABELS[s] ?? s;
                  const barColor =
                    s === "pool"
                      ? "bg-muted"
                      : s === "in_progress"
                        ? "bg-primary"
                        : "bg-success";
                  const maxBar = Math.max(
                    1,
                    mine.filter((t) => t.status === "pool").length,
                    mine.filter(
                      (t) =>
                        t.status === "in_progress" ||
                        t.status === "todo" ||
                        t.status === "full_kitting" ||
                        t.status === "approved" ||
                        t.status === "sampling"
                    ).length,
                    mine.filter((t) => t.status === "done").length
                  );
                  return (
                    <div key={s} className="flex items-center gap-3">
                      <span className="w-[90px] shrink-0 text-xs text-foreground">{label}</span>
                      <div className="flex-1 overflow-hidden rounded-md bg-secondary/60">
                        <div className={cn("h-6 rounded-md transition-[width] duration-500", barColor)}
                          style={{ width: `${Math.max(myCount > 0 ? 8 : 4, (myCount / maxBar) * 100)}%` }} />
                      </div>
                      <span className="w-6 text-right text-sm font-semibold tabular-nums text-foreground">{myCount}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        /* Admin / Coordinator view */
        <>
          {/* Hero: at-a-glance health. Risk-dock stats deep-link into a
              filtered /dashboard so the MD can drill into the same cohort. */}
          <TaskHealthHero
            completed={a.kpis.totalCompleted}
            onTimeRate={a.kpis.onTimeRate}
            urgentCount={a.kpis.urgentCount}
            overdueCount={a.kpis.overdueCount}
            activePipeline={a.kpis.activePipeline}
            totalDesigners={a.designerStats.length}
            onActiveClick={() => navigate(dashLink({ status: "in_progress" }))}
            onUrgentClick={() => navigate(dashLink({ filter: "urgent" }))}
            onOverdueClick={() => navigate(dashLink({ overdue: "1" }))}
          />

          {/* KPIs — each card deep-links into /dashboard with the period
              date-range baked into the URL so the destination shows the same
              cohort the card counted. */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <KpiCard
              icon={<CheckCircle2 className="h-4 w-4 text-success" />}
              label="Tasks Completed"
              value={a.kpis.totalCompleted.current}
              metric={a.kpis.totalCompleted}
              tintClass="bg-success/10"
              animateValue
              sparklineData={a.sparklines.completed}
              to={dashLink({ status: "done", from: periodFrom, to: periodTo })}
              sub={`${periodFrom} → ${periodTo}`}
            />
            <KpiCard
              icon={<Clock className="h-4 w-4 text-primary" />}
              label="On-Time Delivery"
              value={`${a.kpis.onTimeRate.current}%`}
              metric={a.kpis.onTimeRate}
              tintClass="bg-primary/10"
              valueColor={a.kpis.onTimeRate.current > 85 ? "text-success" : a.kpis.onTimeRate.current < 70 ? "text-destructive" : "text-warning"}
              sparklineData={a.sparklines.onTime}
              to={dashLink({ status: "done", from: periodFrom, to: periodTo })}
              sub={`${a.kpis.lateCompletions.current} late this period`}
            />
            <KpiCard
              icon={<Timer className="h-4 w-4 text-primary" />}
              label="Avg Completion"
              value={`${a.kpis.avgCompletionDays.current}d`}
              metric={a.kpis.avgCompletionDays}
              tintClass="bg-primary/10"
              invertTrend
              to={dashLink({ status: "done", from: periodFrom, to: periodTo })}
              sparklineData={a.sparklines.avgDelay}
              sub={
                a.kpis.avgCycleDays.current > 0
                  ? `Cycle: ${a.kpis.avgCycleDays.current}d`
                  : undefined
              }
            />
            <KpiCard
              icon={<PlusCircle className="h-4 w-4 text-primary" />}
              label="Tasks Created"
              value={a.kpis.totalCreated.current}
              metric={a.kpis.totalCreated}
              tintClass="bg-primary/10"
              animateValue
              sparklineData={a.sparklines.created}
              to={dashLink({ filter: "all", from: periodFrom, to: periodTo })}
              sub={`${periodFrom} → ${periodTo}`}
            />
          </div>

          {/* Charts */}
          <div className="grid gap-3 lg:grid-cols-3">
            {/* Volume chart */}
            <Card className="lg:col-span-2">
              <CardContent className="py-4">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    {period === "week" ? "Daily Tasks" : period === "quarter" ? "Monthly Tasks" : "Weekly Tasks"}
                  </h3>
                  <p className="text-xs text-muted-foreground">Created vs Completed</p>
                </div>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={a.volumeData} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "rgb(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fill: "rgb(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                      <Tooltip contentStyle={{ backgroundColor: "rgb(var(--card))", border: "1px solid rgb(var(--border))", borderRadius: 8, fontSize: 12, color: "rgb(var(--foreground))" }} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                      <Bar dataKey="created" name="Created" fill="rgb(var(--muted))" opacity={0.4} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="completed" name="Completed" fill="rgb(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Pipeline health — flex column so the bar list centers
                vertically when the sibling VolumeChart stretches this card
                taller than its natural content height. */}
            <Card className="h-full">
              <CardContent className="flex h-full flex-col py-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Pipeline</h3>
                  <Badge variant="secondary" className="text-[10px]">{a.pipeline.reduce((s, p) => s + p.count, 0)} total</Badge>
                </div>
                <div className="flex flex-1 flex-col justify-center space-y-2 py-3">
                  {a.pipeline.map((item) => {
                    const maxCount = Math.max(1, ...a.pipeline.map((p) => p.count));
                    const pct = Math.max(8, (item.count / maxCount) * 100);
                    const label = STATUS_LABELS[item.status as keyof typeof STATUS_LABELS] ?? item.status;
                    const barColor = PIPELINE_BAR_COLOR[item.status] ?? "bg-muted";
                    return (
                      <button key={item.status} type="button" onClick={() => navigate(dashLink({ status: item.status }))}
                        className="group flex w-full items-center gap-3 rounded-md px-1 py-0.5 text-left transition-all hover:ring-2 hover:ring-primary/30">
                        <span className="w-[80px] shrink-0 text-xs text-foreground">{label}</span>
                        <div className="flex-1">
                          <div className={cn("h-7 rounded-md transition-[width] duration-[600ms] ease-[cubic-bezier(0.4,0,0.2,1)]", barColor)} style={{ width: `${pct}%`, minWidth: 24 }} />
                        </div>
                        <span className="w-8 text-right text-sm font-semibold tabular-nums text-foreground">{item.count}</span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Workload + At-risk */}
          <div className="grid gap-3 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <WorkloadDistribution
                data={a.designerStats}
                onDesignerClick={canOpenScorecard ? setScorecardDesignerId : undefined}
              />
            </div>
            <div className="lg:col-span-2">
              <AtRiskTasks tasks={tasks} />
            </div>
          </div>

          {/* Detail row — Kitting mix · Priority · Cycle time · Top clients.
              These rollups were missing from the original dashboard. They
              cover the FK staffing question, the priority load, the actual
              effort distribution, and the demand-by-client view. */}
          <div className="grid items-stretch gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <KittingMixCard data={a.kittingMix} />
            <PriorityMixCard data={a.priorityMix} />
            <CycleTimeCard data={a.cycleTimeDist} />
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

function MyTasksTable({
  tasks,
  userId,
}: {
  tasks: { id: string; task_code: string; concept: string; status: string; priority: string; planned_deadline: string | null; client?: { party_name: string } | null; assigned_to: string | null; completed_at?: string | null; delay_days?: number | null }[];
  userId: string;
}) {
  const myTasks = tasks
    .filter((t) => t.assigned_to === userId && t.status !== "done")
    .sort((a, b) => {
      const ad = a.planned_deadline ? new Date(a.planned_deadline).getTime() : Infinity;
      const bd = b.planned_deadline ? new Date(b.planned_deadline).getTime() : Infinity;
      return ad - bd;
    });

  const recentDone = tasks
    .filter((t) => t.assigned_to === userId && t.status === "done")
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
          <h3 className="text-lg font-semibold text-foreground">Designer Task Performance</h3>
        </div>
        <div className="overflow-x-auto">
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
                      onDesignerClick && "cursor-pointer"
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
                      <div className="relative h-6 w-full overflow-hidden rounded-full bg-secondary">
                        <div className={cn("h-full rounded-full transition-[width] duration-[800ms] ease-[cubic-bezier(0.4,0,0.2,1)]", scoreColor)} style={{ width: `${d.score}%`, transitionDelay: `${i * 80}ms` }} />
                        <span className={cn("absolute top-1/2 -translate-y-1/2 text-xs font-bold tabular-nums", d.score >= 20 ? "left-2 text-white" : "right-2 text-foreground")}>{d.score}</span>
                      </div>
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
  // Two-segment donut — with / without. Small, since the legend tells most
  // of the story; the ring is a glanceable summary.
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = total > 0 ? (data.withKitting / total) * c : 0;
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col py-4">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Package className="h-3 w-3" />
          Full kitting
        </div>
        <h3 className="text-sm font-semibold text-foreground">FK requirement mix</h3>

        {total === 0 ? (
          <p className="mt-4 rounded-lg bg-secondary/40 p-3 text-center text-xs italic text-muted-foreground">
            No tasks created in this period.
          </p>
        ) : (
          <div className="mt-3 flex items-center gap-4">
            <div className="relative h-[88px] w-[88px] shrink-0">
              <svg viewBox="0 0 88 88" className="-rotate-90 h-full w-full" aria-hidden>
                <circle
                  cx="44"
                  cy="44"
                  r={r}
                  fill="none"
                  stroke="rgb(var(--secondary))"
                  strokeWidth={10}
                />
                <circle
                  cx="44"
                  cy="44"
                  r={r}
                  fill="none"
                  stroke="rgb(var(--primary))"
                  strokeWidth={10}
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${c - dash}`}
                  style={{ transition: "stroke-dasharray 700ms cubic-bezier(0.4,0,0.2,1)" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-xl font-bold leading-none tabular-nums text-foreground">
                  {data.pct}%
                </p>
                <p className="text-[8px] uppercase tracking-wider text-muted-foreground">
                  need FK
                </p>
              </div>
            </div>
            <div className="flex-1 space-y-1.5 text-xs">
              <LegendRow
                dot="bg-primary"
                label="With knitting"
                value={data.withKitting}
              />
              <LegendRow
                dot="bg-muted-foreground/40"
                label="Without"
                value={data.withoutKitting}
              />
            </div>
          </div>
        )}

        {/* Submission progress — only meaningful when some FK tasks exist. */}
        {data.withKitting > 0 && (
          <div className="mt-auto pt-3">
            <div className="mb-1 flex items-center justify-between text-[10px]">
              <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                FK form submissions
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {data.kittingSubmitted}/{data.withKitting}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-700",
                  data.kittingPending === 0 ? "bg-success" : "bg-primary"
                )}
                style={{
                  width: `${
                    data.withKitting > 0
                      ? Math.round((data.kittingSubmitted / data.withKitting) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
            {data.kittingPending > 0 && (
              <p className="mt-1 text-[10px] text-warning">
                {data.kittingPending} pending submission{data.kittingPending !== 1 ? "s" : ""}
              </p>
            )}
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
    <Card className="h-full">
      <CardContent className="flex h-full flex-col py-4">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Zap className="h-3 w-3" />
          Priority
        </div>
        <h3 className="text-sm font-semibold text-foreground">Active queue priority mix</h3>

        {total === 0 ? (
          <p className="mt-4 rounded-lg bg-secondary/40 p-3 text-center text-xs italic text-muted-foreground">
            No active tasks right now.
          </p>
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
            <ul className="mt-3 space-y-1.5 text-xs">
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
    <Card className="h-full">
      <CardContent className="flex h-full flex-col py-4">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Flame className="h-3 w-3" />
          Effort
        </div>
        <h3 className="text-sm font-semibold text-foreground">Time to complete</h3>

        {total === 0 ? (
          <p className="mt-4 rounded-lg bg-secondary/40 p-3 text-center text-xs italic text-muted-foreground">
            No completions yet — cycle time will populate as tasks ship.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-xs">
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
    <Card className="h-full">
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
          <p className="mt-4 rounded-lg bg-secondary/40 p-3 text-center text-xs italic text-muted-foreground">
            No client activity in this period.
          </p>
        ) : (
          <>
            <ul className="mt-3 space-y-2 text-xs">
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
