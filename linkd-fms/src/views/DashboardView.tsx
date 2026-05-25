import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, getHours } from "date-fns";
import {
  LayoutGrid,
  Plus,
  Lightbulb,
  Factory,
  Users,
  ArrowRight,
  RefreshCw,
  Inbox,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import { useConcepts } from "@/hooks/useConcepts";
import { useProfiles } from "@/hooks/useProfiles";
import { Card, CardContent, Skeleton } from "@/components/ui";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { isAdminOrCoordinator, isDesigner as isDesignerCheck } from "@/lib/permissions";
import { DashboardKpiCards } from "@/components/dashboard/DashboardKpiCards";
import { DashboardAlerts } from "@/components/dashboard/DashboardAlerts";
import { DashboardTimeline } from "@/components/dashboard/DashboardTimeline";
import { DashboardPipeline } from "@/components/dashboard/DashboardPipeline";
import type { TaskStatus, UserRole } from "@/types/database";

// ============================================================================
// Greeting helpers
// ============================================================================

function getGreeting(name: string): string {
  const h = getHours(new Date());
  if (h < 12) return `Good morning, ${name}`;
  if (h < 17) return `Good afternoon, ${name}`;
  return `Good evening, ${name}`;
}

// ============================================================================
// Dashboard
// ============================================================================

export function DashboardView() {
  const { profile, user } = useAuth();
  const { tasks, isLoading, refetch: refetchTasks } = useTasks();
  const { concepts, refetch: refetchConcepts } = useConcepts();
  const { profiles, refetch: refetchProfiles } = useProfiles();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([refetchTasks(), refetchConcepts(), refetchProfiles()]);
    setRefreshing(false);
  }

  const role: UserRole = profile?.role ?? "designer";
  const isAdmin = isAdminOrCoordinator(role);
  const isDesigner = isDesignerCheck(role);
  const userId = user?.id;
  const firstName = profile?.full_name?.split(" ")[0] ?? "there";

  // ── Compute stats ──
  const stats = useMemo(() => {
    const myTasks = userId ? tasks.filter((t) => t.assigned_to === userId) : [];
    const relevantTasks = isAdmin ? tasks : myTasks;

    const pool = tasks.filter((t) => t.status === "pool").length;
    const todo = tasks.filter((t) => t.status === "todo").length;
    const inProgress = relevantTasks.filter((t) => t.status === "in_progress").length;
    const fullKitting = relevantTasks.filter((t) => t.status === "full_kitting").length;
    const done = relevantTasks.filter((t) => t.status === "done").length;
    const sampling = relevantTasks.filter((t) => t.status === "sampling").length;
    const approved = relevantTasks.filter((t) => t.status === "approved").length;
    const urgent = relevantTasks.filter((t) => t.priority === "urgent" && t.status !== "done").length;
    const total = relevantTasks.length;
    const active = total - done;

    const overdue = relevantTasks.filter((t) => {
      if (!t.planned_deadline || t.status === "done") return false;
      return new Date(t.planned_deadline) < new Date();
    }).length;

    const pendingConcepts = concepts.filter((c) => c.md_status === "pending").length;
    const designerCount = profiles.filter((p) => p.role === "designer").length;

    // Completed today
    const todayStr = new Date().toISOString().slice(0, 10);
    const completedToday = relevantTasks.filter(
      (t) => t.completed_at && t.completed_at.slice(0, 10) === todayStr
    ).length;

    // Visual pipeline (Pool → In Progress → Done). Legacy buckets
    // (todo / full_kitting / approved / sampling) fold into in_progress so
    // historical rows still register on the dashboard chart.
    const inProgressVisual =
      inProgress + todo + fullKitting + approved + sampling;
    const counts: Record<TaskStatus, number> = {
      pool,
      todo: 0,
      in_progress: inProgressVisual,
      full_kitting: 0,
      approved: 0,
      sampling: 0,
      done,
    };

    return {
      pool, todo, inProgress, fullKitting, done, sampling, approved,
      urgent, total, active, overdue, pendingConcepts, designerCount,
      completedToday, counts,
    };
  }, [tasks, concepts, profiles, userId, isAdmin]);

  // Designer's concept count this month
  const myConceptsThisMonth = useMemo(() => {
    if (!userId) return 0;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    return concepts.filter((c) => c.submitted_by === userId && c.created_at >= monthStart).length;
  }, [concepts, userId]);

  // ── Dynamic subtitle ──
  const subtitle = useMemo(() => {
    if (stats.urgent > 0)
      return { text: `You have ${stats.urgent} urgent task${stats.urgent !== 1 ? "s" : ""} needing attention`, color: "text-destructive" };
    if (stats.overdue > 0)
      return { text: `${stats.overdue} task${stats.overdue !== 1 ? "s are" : " is"} past deadline`, color: "text-warning" };
    if (stats.pendingConcepts > 0 && isAdmin)
      return { text: `${stats.pendingConcepts} concept${stats.pendingConcepts !== 1 ? "s" : ""} awaiting your review`, color: "text-primary" };
    if (stats.completedToday > 0)
      return { text: `${stats.completedToday} task${stats.completedToday !== 1 ? "s" : ""} completed today — nice momentum!`, color: "text-success" };
    return { text: "Here's what's happening across your pipeline", color: "text-muted-foreground" };
  }, [stats, isAdmin]);

  if (isLoading && tasks.length === 0) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* ═══ Section 1: Greeting ═══ */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {getGreeting(firstName)}
          </h1>
          <p className={cn("mt-1 text-sm", subtitle.color)}>
            {subtitle.text}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
          title="Refresh data"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* ═══ Section 2: KPI Cards ═══ */}
      <DashboardKpiCards
        tasks={tasks}
        concepts={concepts}
        stats={stats}
        role={role}
        userId={userId}
        isAdmin={isAdmin}
      />

      {/* ═══ Section 3: Alert Banners ═══ */}
      <DashboardAlerts
        stats={stats}
        tasks={tasks}
        role={role}
        isAdmin={isAdmin}
        myConceptsThisMonth={myConceptsThisMonth}
      />

      {/* ═══ Main grid: Timeline + Actions/Pipeline ═══ */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* ═══ Section 4: Timeline ═══ */}
        <div className="lg:col-span-2">
          <DashboardTimeline tasks={tasks} role={role} userId={userId} />
        </div>

        {/* ═══ Sidebar: Quick Actions + Pipeline ═══ */}
        <div className="space-y-4">
          {/* ═══ Section 6: Quick Actions ═══ */}
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Quick Actions
            </h2>
            <div className="mt-3 space-y-2">
              {/* Contextual urgency: most actionable first */}
              {isAdmin && stats.pendingConcepts > 0 && (
                <QuickAction
                  to={ROUTES.concepts}
                  icon={Lightbulb}
                  label={`Review ${stats.pendingConcepts} Concept${stats.pendingConcepts !== 1 ? "s" : ""}`}
                  description="Awaiting your approval"
                  accent="warning"
                  pulse
                />
              )}
              {isAdmin && stats.pool > 5 && (
                <QuickAction
                  to={ROUTES.dashboard}
                  icon={Inbox}
                  label={`Clear Pool (${stats.pool} waiting)`}
                  description="Assign tasks to designers"
                  accent="warning"
                />
              )}
              {isDesigner && stats.inProgress === 0 && stats.pool > 0 && (
                <QuickAction
                  to={ROUTES.dashboard}
                  icon={LayoutGrid}
                  label="Claim a task from the Pool"
                  description={`${stats.pool} task${stats.pool !== 1 ? "s" : ""} available`}
                  accent="primary"
                />
              )}
              {isAdmin && (
                <QuickAction
                  to={ROUTES.briefNew}
                  icon={Plus}
                  label="Create New Brief"
                  description="Start a new design task"
                  accent="primary"
                />
              )}
              <QuickAction
                to={ROUTES.dashboard}
                icon={LayoutGrid}
                label={isAdmin ? "All Tasks" : "My Board"}
                description="View task pipeline"
                accent="foreground"
              />
              {(role === "admin" || role === "designer") && (
                <QuickAction
                  to={ROUTES.concepts}
                  icon={Lightbulb}
                  label="Concepts"
                  description={isAdmin ? "Review submissions" : "Submit designs"}
                  accent="primary"
                />
              )}
              {isAdmin && (
                <QuickAction
                  to={ROUTES.sampling}
                  icon={Factory}
                  label="Sampling Queue"
                  description={`${stats.sampling} task${stats.sampling !== 1 ? "s" : ""} in queue`}
                  accent="warning"
                />
              )}
            </div>
          </div>

          {/* ═══ Section 5: Pipeline ═══ */}
          <DashboardPipeline counts={stats.counts} total={stats.total} />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Quick Action
// ============================================================================

function QuickAction({
  to,
  icon: Icon,
  label,
  description,
  accent,
  pulse,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  accent: string;
  pulse?: boolean;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 transition-all hover:border-primary/30 hover:bg-secondary/50"
    >
      <div
        className={cn(
          "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          accent === "primary"
            ? "bg-primary/10 text-primary"
            : accent === "warning"
            ? "bg-warning/10 text-warning"
            : "bg-secondary text-muted-foreground"
        )}
      >
        <Icon className="h-4 w-4" />
        {pulse && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-destructive animate-pulse" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}

// ============================================================================
// Skeleton
// ============================================================================

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-28 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
