import { useState } from "react";
import {
  CheckCircle2, Clock, Timer, PlusCircle, AlertTriangle,
  LayoutGrid, Trophy, ChevronUp, ChevronDown,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import { useTaskAnalytics, type Period, type DesignerTaskStat } from "@/hooks/useTaskAnalytics";
import { KpiCard } from "@/components/analytics/KpiCard";
import { TaskHealthHero } from "@/components/analytics/TaskHealthHero";
import { WorkloadDistribution } from "@/components/analytics/WorkloadDistribution";
import { AtRiskTasks } from "@/components/analytics/AtRiskTasks";
import { DesignerScorecardDrawer } from "@/components/analytics/DesignerScorecardDrawer";
import {
  Card, CardContent, Badge, Button, SkeletonCard, SkeletonTable,
  Avatar, AvatarFallback, AvatarImage, getInitials, DeadlineCell,
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
  todo: "bg-warning",
  in_progress: "bg-primary",
  full_kitting: "bg-[#7C5CFC]",
  done: "bg-success",
};

export function TaskDashboardView() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const role = profile?.role ?? "designer";
  const isAdmin = isAdminOrCoordinator(role);
  const isDesigner = role === "designer";

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

  if (a.error) {
    return (
      <div className="mx-auto max-w-lg py-20">
        <Card><CardContent className="flex flex-col items-center gap-3 py-8">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <p className="text-sm text-destructive">{a.error}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
        </CardContent></Card>
      </div>
    );
  }

  if (a.isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-secondary" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2"><SkeletonCard /></div>
          <SkeletonCard />
        </div>
        <SkeletonTable rows={6} cols={7} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <LayoutGrid className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {isDesigner ? "My Task Performance" : "Task Dashboard"}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{a.periodLabel}</p>
          </div>
        </div>
        <div className="inline-flex rounded-lg bg-secondary p-1">
          {PERIODS.map((p) => (
            <button key={p.value} type="button" onClick={() => setPeriod(p.value)}
              className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                period === p.value ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
              )}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Designer personal view */}
      {isDesigner && myStats ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard icon={<CheckCircle2 className="h-4 w-4 text-success" />} label="Completed" value={myStats.completed} metric={{ current: myStats.completed, previous: 0, trend: 0 }} tintClass="bg-success/10" />
            <KpiCard icon={<Clock className="h-4 w-4 text-primary" />} label="On-Time Rate" value={myStats.assigned > 0 ? `${Math.round((myStats.onTime / myStats.assigned) * 100)}%` : "—"} metric={{ current: 0, previous: 0, trend: 0 }} tintClass="bg-primary/10" />
            <KpiCard icon={<Timer className="h-4 w-4 text-primary" />} label="Avg Days" value={myStats.completed > 0 ? `${myStats.avgDays}d` : "—"} metric={{ current: 0, previous: 0, trend: 0 }} tintClass="bg-primary/10" />
            <KpiCard icon={<LayoutGrid className="h-4 w-4 text-warning" />} label="In Progress" value={myStats.inProgress} metric={{ current: 0, previous: 0, trend: 0 }} tintClass="bg-warning/10" />
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

          {/* My pipeline snapshot */}
          <Card>
            <CardContent className="py-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">My Pipeline</h3>
              <div className="space-y-2">
                {(["todo", "in_progress", "full_kitting", "done"] as const).map((s) => {
                  const myCount = tasks.filter((t) => t.assigned_to === profile?.id && t.status === s).length;
                  const label = STATUS_LABELS[s] ?? s;
                  const barColor = s === "todo" ? "bg-warning" : s === "in_progress" ? "bg-primary" : s === "full_kitting" ? "bg-[#7C5CFC]" : "bg-success";
                  const maxBar = Math.max(1, ...["todo", "in_progress", "full_kitting", "done"].map((st) =>
                    tasks.filter((t) => t.assigned_to === profile?.id && t.status === st).length
                  ));
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
          {/* Hero: at-a-glance health */}
          <TaskHealthHero
            completed={a.kpis.totalCompleted}
            onTimeRate={a.kpis.onTimeRate}
            urgentCount={a.kpis.urgentCount}
            overdueCount={a.kpis.overdueCount}
            activePipeline={a.kpis.activePipeline}
            totalDesigners={a.designerStats.length}
          />

          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard icon={<CheckCircle2 className="h-4 w-4 text-success" />} label="Tasks Completed" value={a.kpis.totalCompleted.current} metric={a.kpis.totalCompleted} tintClass="bg-success/10" animateValue sparklineData={a.sparklines.completed} />
            <KpiCard icon={<Clock className="h-4 w-4 text-primary" />} label="On-Time Delivery" value={`${a.kpis.onTimeRate.current}%`} metric={a.kpis.onTimeRate} tintClass="bg-primary/10"
              valueColor={a.kpis.onTimeRate.current > 85 ? "text-success" : a.kpis.onTimeRate.current < 70 ? "text-destructive" : "text-warning"} sparklineData={a.sparklines.onTime} />
            <KpiCard icon={<Timer className="h-4 w-4 text-primary" />} label="Avg Completion" value={`${a.kpis.avgCompletionDays.current}d`} metric={a.kpis.avgCompletionDays} tintClass="bg-primary/10" invertTrend />
            <KpiCard icon={<PlusCircle className="h-4 w-4 text-primary" />} label="Tasks Created" value={a.kpis.totalCreated.current} metric={a.kpis.totalCreated} tintClass="bg-primary/10" animateValue sparklineData={a.sparklines.created} />
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-3">
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

            {/* Pipeline health */}
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">Pipeline</h3>
                  <Badge variant="secondary" className="text-[10px]">{a.pipeline.reduce((s, p) => s + p.count, 0)} total</Badge>
                </div>
                <div className="space-y-2">
                  {a.pipeline.map((item) => {
                    const maxCount = Math.max(1, ...a.pipeline.map((p) => p.count));
                    const pct = Math.max(8, (item.count / maxCount) * 100);
                    const label = STATUS_LABELS[item.status as keyof typeof STATUS_LABELS] ?? item.status;
                    const barColor = PIPELINE_BAR_COLOR[item.status] ?? "bg-muted";
                    return (
                      <button key={item.status} type="button" onClick={() => navigate(`/dashboard`)}
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
          <div className="grid gap-4 lg:grid-cols-5">
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
