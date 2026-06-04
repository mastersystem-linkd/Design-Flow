/**
 * Role-specific concept dashboard sections rendered above the main concepts
 * table. Contains: Designer target tracker + workflow stepper + nudges,
 * Coordinator team overview + at-risk alerts, Admin pending-review queue + urgency.
 */
import { useMemo } from "react";
import {
  Target,
  AlertTriangle,
  AlertOctagon,
  TrendingUp,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  Lightbulb,
} from "lucide-react";
import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Card, CardContent, Badge, Button } from "@/components/ui";
import { ConceptWorkflowStage } from "@/components/concepts/ConceptWorkflowStage";
import { cn, formatDate } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
} from "@/components/ui/avatar";
import { CONCEPT_STATUS_LABELS, CONCEPT_STATUS_COLORS, WORK_STATUS_LABELS, WORK_STATUS_COLORS } from "@/lib/constants";
import { ConceptImage } from "@/components/ui/ConceptImage";
import type { ConceptWithRelations, UserRole, Profile } from "@/types/database";

// ============================================================================
// Shared helpers
// ============================================================================

const MONTHLY_TARGET = 2;

function getCurrentMonth(): { month: number; year: number; label: string } {
  const now = new Date();
  return {
    month: now.getMonth(),
    year: now.getFullYear(),
    label: now.toLocaleString("en-IN", { month: "long", year: "numeric" }),
  };
}

function getDayOfMonth(): number {
  return new Date().getDate();
}

function getDaysRemainingInMonth(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate();
}

function isCurrentMonth(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

interface MonthlyStats {
  submitted: number;
  approved: number;
  rejected: number;
  revision: number;
  total: number;
}

function computeMonthlyStats(
  concepts: ConceptWithRelations[],
  userId?: string
): MonthlyStats {
  const filtered = concepts.filter((c) => {
    if (!isCurrentMonth(c.created_at)) return false;
    if (userId && c.submitted_by !== userId) return false;
    return true;
  });
  return {
    submitted: filtered.length,
    approved: filtered.filter((c) => c.md_status === "approved").length,
    rejected: filtered.filter((c) => c.md_status === "rejected").length,
    revision: filtered.filter((c) => c.md_status === "revision_requested").length,
    total: filtered.length,
  };
}

// ============================================================================
// DESIGNER SECTION
// ============================================================================

type Period = "week" | "month" | "quarter";

export function DesignerConceptDashboard({
  concepts,
  userId,
  period = "month",
  onSubmit,
  onConceptSelect,
}: {
  concepts: ConceptWithRelations[];
  userId: string;
  period?: Period;
  onSubmit: () => void;
  onConceptSelect?: (concept: ConceptWithRelations) => void;
}) {
  const stats = useMemo(
    () => computeMonthlyStats(concepts, userId),
    [concepts, userId]
  );
  const allTimeCount = concepts.filter((c) => c.submitted_by === userId).length;

  const myConcepts = useMemo(
    () => concepts.filter((c) => c.submitted_by === userId && isCurrentMonth(c.created_at)),
    [concepts, userId]
  );

  const { label: monthLabel } = getCurrentMonth();
  const daysLeft = getDaysRemainingInMonth();
  const dayOfMonth = getDayOfMonth();
  const progress = Math.min(stats.approved, MONTHLY_TARGET);
  const progressPct = (progress / MONTHLY_TARGET) * 100;

  const progressColor =
    progress >= MONTHLY_TARGET
      ? "rgb(var(--success))"
      : progress >= 1
        ? "rgb(var(--warning))"
        : "rgb(var(--destructive))";

  const showDay7Warning = dayOfMonth >= 8 && stats.submitted === 0;
  const showDay24Warning = dayOfMonth >= 20 && stats.approved < MONTHLY_TARGET;

  const chartData = [{ name: "progress", value: progressPct, fill: progressColor }];

  // Nudge calculations
  const revisionStale = myConcepts.filter((c) => {
    if (c.md_status !== "revision_requested") return false;
    const reviewed = c.md_reviewed_at ?? c.md_actual_date;
    if (!reviewed) return false;
    const daysSince = Math.floor((Date.now() - new Date(reviewed).getTime()) / 86400000);
    return daysSince > 2;
  });

  const approvedNotFinalized = myConcepts.filter((c) => {
    if (c.md_status !== "approved" || c.designer_actual_date) return false;
    const approvedAt = c.md_reviewed_at ?? c.md_actual_date;
    if (!approvedAt) return false;
    const daysSince = Math.floor((Date.now() - new Date(approvedAt).getTime()) / 86400000);
    return daysSince > 2;
  });

  const allTargetMet = stats.approved >= MONTHLY_TARGET;

  const allMyConcepts = useMemo(
    () => concepts.filter((c) => c.submitted_by === userId),
    [concepts, userId]
  );
  const approvalRate = allMyConcepts.length > 0
    ? Math.round((allMyConcepts.filter((c) => c.md_status === "approved").length / allMyConcepts.length) * 100)
    : 0;
  const avgDaysToApproval = useMemo(() => {
    const approved = allMyConcepts.filter((c) => c.md_status === "approved" && c.md_reviewed_at);
    if (approved.length === 0) return null;
    const total = approved.reduce((sum, c) => {
      const days = Math.max(0, Math.floor((new Date(c.md_reviewed_at!).getTime() - new Date(c.created_at).getTime()) / 86400000));
      return sum + days;
    }, 0);
    return Math.round(total / approved.length);
  }, [allMyConcepts]);

  const activeConcepts = useMemo(
    () => allMyConcepts.filter((c) => !c.final_approved_at && c.md_status !== "rejected").slice(0, 4),
    [allMyConcepts]
  );

  return (
    <div className="space-y-4">
      {/* Warning banners */}
      {showDay7Warning && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">No concepts submitted this month yet</p>
            <p className="text-xs text-muted-foreground">Day {dayOfMonth} — submit to stay on track for the target of {MONTHLY_TARGET}.</p>
          </div>
          <Button size="sm" onClick={onSubmit}>Submit Now</Button>
        </div>
      )}
      {showDay24Warning && !showDay7Warning && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3">
          <AlertOctagon className="h-5 w-5 shrink-0 text-destructive" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Only {stats.approved} of {MONTHLY_TARGET} approved — {daysLeft} days left</p>
          </div>
          <Button size="sm" variant="outline" onClick={onSubmit}>Submit Concept</Button>
        </div>
      )}

      {/* Row 1: Target ring + Stats grid */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-5">
        {/* Target ring */}
        <Card className="col-span-2 md:col-span-1">
          <CardContent className="flex flex-col items-center justify-center py-4">
            <TargetRing progress={progress} target={MONTHLY_TARGET} color={progressColor} />
            <p className="mt-2 text-[10px] font-medium text-muted-foreground">{monthLabel}</p>
            <div className="mt-1 flex gap-1.5">
              {Array.from({ length: MONTHLY_TARGET }).map((_, i) => (
                <span key={i} className={cn("h-2 w-2 rounded-full", i < stats.approved ? "bg-success" : i < stats.submitted ? "bg-primary/40" : "bg-border")} />
              ))}
            </div>
            <p className="mt-1 text-[9px] tabular-nums text-muted-foreground">{daysLeft}d remaining</p>
          </CardContent>
        </Card>

        {/* 4 stat tiles */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:col-span-4">
          <MiniStat label="Submitted" value={stats.submitted} sub={`Target ${MONTHLY_TARGET}`} color="text-primary" />
          <MiniStat label="Approved" value={stats.approved} sub={stats.submitted > 0 ? `${Math.round((stats.approved / stats.submitted) * 100)}%` : "—"} color="text-success" />
          <MiniStat label="Approval Rate" value={`${approvalRate}%`} sub="All time" color="text-primary" />
          <MiniStat label="Avg Review Time" value={avgDaysToApproval !== null ? `${avgDaysToApproval}d` : "—"} sub="Days to approval" color="text-muted-foreground" />
        </div>
      </div>

      {/* Row 2: Active Concepts + Status Breakdown side by side */}
      <div className="grid grid-cols-1 gap-2 sm:gap-3 lg:grid-cols-5">
        {/* Active concepts — compact pipeline rows (max 4) */}
        <Card className="lg:col-span-3">
          <CardContent className="py-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold text-foreground">Active Concepts</h4>
              <span className="text-[10px] text-muted-foreground">{activeConcepts.length} in progress</span>
            </div>
            {activeConcepts.length > 0 ? (
              <div className="space-y-1">
                {activeConcepts.map((c) => (
                  <ActiveConceptRow key={c.id} concept={c} onClick={() => onConceptSelect?.(c)} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Lightbulb className="h-6 w-6 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">No active concepts</p>
                <Button size="sm" variant="outline" onClick={onSubmit} className="gap-1">Submit New</Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status breakdown + lifetime stats */}
        <Card className="lg:col-span-2">
          <CardContent className="py-3">
            <h4 className="mb-2 text-xs font-semibold text-foreground">Lifetime Overview</h4>
            <div className="space-y-2">
              <OverviewRow label="Total Concepts" value={allTimeCount} />
              <OverviewRow label="Approved" value={allMyConcepts.filter((c) => c.md_status === "approved").length} color="text-success" />
              <OverviewRow label="Pending Review" value={allMyConcepts.filter((c) => c.md_status === "pending").length} color="text-warning" />
              <OverviewRow label="Revision Requested" value={allMyConcepts.filter((c) => c.md_status === "revision_requested").length} color="text-orange-500" />
              <OverviewRow label="Completed" value={allMyConcepts.filter((c) => !!c.final_approved_at).length} color="text-success" />
              <OverviewRow label="Rejected" value={allMyConcepts.filter((c) => c.md_status === "rejected").length} color="text-destructive" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Monthly trend + Recent activity */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <MonthlyTrend concepts={allMyConcepts} period={period} />
        <RecentActivity concepts={allMyConcepts} onConceptSelect={onConceptSelect} />
      </div>

      {/* Row 4: Action items */}
      <DesignerActionItems
        concepts={myConcepts}
        allTargetMet={allTargetMet}
        onSubmit={onSubmit}
        onConceptSelect={onConceptSelect}
      />
    </div>
  );
}

// ── Nudges ──

function NudgeSection({
  allTargetMet, revisionStale, approvedNotFinalized, dayOfMonth, submitted, onSubmit, onConceptSelect,
}: {
  allTargetMet: boolean;
  revisionStale: ConceptWithRelations[];
  approvedNotFinalized: ConceptWithRelations[];
  dayOfMonth: number;
  submitted: number;
  onSubmit: () => void;
  onConceptSelect?: (c: ConceptWithRelations) => void;
}) {
  const nudges: React.ReactNode[] = [];

  if (allTargetMet) {
    nudges.push(
      <div key="target-met" className="flex items-center gap-3 rounded-xl border border-success/20 bg-success/10 p-3">
        <span className="text-xl">🏆</span>
        <p className="text-sm font-medium text-success">Target achieved! All 3 concepts done this month.</p>
      </div>
    );
  }

  // The "Time to start" nudge used to fire here, but it duplicated the
  // top-of-card "No concepts submitted this month yet" warning. Suppressed
  // so the dashboard doesn't show two CTAs with the same ask.

  for (const c of revisionStale.slice(0, 1)) {
    nudges.push(
      <div key={`rev-${c.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-secondary/50 p-3">
        <RotateCcw className="h-5 w-5 shrink-0 text-warning" />
        <p className="flex-1 text-sm text-muted-foreground truncate">
          <span className="font-medium text-foreground">{c.title}</span> needs changes — review feedback
        </p>
        <Button size="sm" variant="outline" onClick={() => onConceptSelect?.(c)}>View</Button>
      </div>
    );
  }

  for (const c of approvedNotFinalized.slice(0, 1)) {
    const approvedAt = c.md_reviewed_at ?? c.md_actual_date;
    const days = approvedAt ? Math.floor((Date.now() - new Date(approvedAt).getTime()) / 86400000) : 0;
    nudges.push(
      <div key={`fin-${c.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-secondary/50 p-3">
        <Clock className="h-5 w-5 shrink-0 text-warning" />
        <p className="flex-1 text-sm text-muted-foreground truncate">
          <span className="font-medium text-foreground">{c.title}</span> approved {days}d ago — finalize before deadline
        </p>
        <Button size="sm" variant="outline" onClick={() => onConceptSelect?.(c)}>Finalize</Button>
      </div>
    );
  }

  if (nudges.length === 0) return null;
  return <div className="space-y-2">{nudges.slice(0, 2)}</div>;
}

// ============================================================================
// COORDINATOR SECTION
// ============================================================================

export function CoordinatorConceptDashboard({
  concepts,
  designers,
  onDesignerFilter,
}: {
  concepts: ConceptWithRelations[];
  designers: Profile[];
  onDesignerFilter: (userId: string | null) => void;
}) {
  const dayOfMonth = getDayOfMonth();

  const designerStats = useMemo(() => {
    return designers.map((d) => {
      const stats = computeMonthlyStats(concepts, d.id);
      return { ...d, ...stats };
    });
  }, [concepts, designers]);

  const teamTotals = useMemo(() => {
    return designerStats.reduce(
      (acc, d) => ({
        submitted: acc.submitted + d.submitted,
        approved: acc.approved + d.approved,
        revision: acc.revision + d.revision,
        onTrack: acc.onTrack + (d.approved >= 2 ? 1 : 0),
      }),
      { submitted: 0, approved: 0, revision: 0, onTrack: 0 }
    );
  }, [designerStats]);

  const atRiskDesigners = designerStats.filter((d) => {
    if (dayOfMonth >= 20 && d.approved < MONTHLY_TARGET) return true;
    if (dayOfMonth >= 7 && d.submitted === 0) return true;
    return false;
  });

  // Escalated alerts
  const noSubmissions = dayOfMonth > 10 ? designerStats.filter((d) => d.submitted === 0) : [];
  const behindTarget = dayOfMonth > 20 ? designerStats.filter((d) => d.approved < 2) : [];

  return (
    <div className="space-y-4">
      {/* Escalated alerts */}
      {noSubmissions.length > 0 && (
        <div className="rounded-xl border-l-4 border-l-warning border border-border bg-warning/5 p-3">
          <p className="text-sm text-warning">
            ⚠ No submissions: {noSubmissions.map((d) => d.full_name).join(", ")}
          </p>
        </div>
      )}
      {behindTarget.length > 0 && (
        <div className="rounded-xl border-l-4 border-l-destructive border border-border bg-destructive/5 p-3">
          <p className="text-sm text-destructive">
            🚨 Behind target: {behindTarget.map((d) => d.full_name).join(", ")}
          </p>
        </div>
      )}

      {/* At-risk details */}
      {atRiskDesigners.length > 0 && noSubmissions.length === 0 && behindTarget.length === 0 && (
        <div className="rounded-xl border-l-4 border-l-warning border border-border bg-card p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-warning" />
            At Risk — {atRiskDesigners.length} designer{atRiskDesigners.length > 1 ? "s" : ""}
          </h3>
          <ul className="mt-2 space-y-1">
            {atRiskDesigners.map((d) => (
              <li key={d.id} className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{d.full_name}</span>
                <Badge className={cn("text-[9px]", d.submitted === 0 ? "bg-destructive/10 text-destructive border border-destructive/20" : "bg-warning/10 text-warning border border-warning/20")}>
                  {d.submitted === 0 ? "0 submitted" : `${d.approved}/${MONTHLY_TARGET} approved`}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Team summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={<TrendingUp className="h-5 w-5 text-primary" />} label="Submitted" value={teamTotals.submitted} />
        <StatCard icon={<CheckCircle2 className="h-5 w-5 text-success" />} label="Approved" value={teamTotals.approved} />
        <StatCard icon={<RotateCcw className="h-5 w-5 text-warning" />} label="In Revision" value={teamTotals.revision} />
        <StatCard icon={<Users className="h-5 w-5 text-success" />} label="On Track (≥2)" value={teamTotals.onTrack} />
      </div>

      {/* Designer progress table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border bg-card/50 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-foreground">Designer Progress — {getCurrentMonth().label}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card/30 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-medium">Designer</th>
                <th className="px-3 py-2 font-medium text-center">Submitted</th>
                <th className="px-3 py-2 font-medium text-center">Approved</th>
                <th className="px-3 py-2 font-medium text-center">Rejected</th>
                <th className="px-3 py-2 font-medium text-center">Revision</th>
                <th className="w-[160px] px-3 py-2 font-medium">Progress</th>
              </tr>
            </thead>
            <tbody>
              {designerStats.map((d) => {
                const pct = Math.min(100, (d.approved / MONTHLY_TARGET) * 100);
                const barColor = d.approved >= MONTHLY_TARGET ? "bg-success" : d.approved >= 1 ? "bg-warning" : "bg-destructive";
                return (
                  <tr key={d.id} className="cursor-pointer border-b border-border/60 transition-colors hover:bg-card/60" onClick={() => onDesignerFilter(d.id)}>
                    <td className="px-3 py-2.5 font-medium text-foreground">{d.full_name}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{d.submitted}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-success">{d.approved}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-destructive">{d.rejected}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-warning">{d.revision}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-border">
                          <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
                          <span className={cn("absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums", pct > 30 ? "text-white" : "text-foreground")}>
                            {d.approved}/{MONTHLY_TARGET}
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ADMIN SECTION
// ============================================================================

export function AdminConceptDashboard({
  concepts,
  designers,
}: {
  concepts: ConceptWithRelations[];
  designers: Profile[];
}) {
  const pending = concepts.filter((c) => c.md_status === "pending");
  const pendingThisMonth = pending.filter((c) => isCurrentMonth(c.created_at)).length;

  // Urgency: pending > 24h
  const now = Date.now();
  const pendingOver24h = pending.filter((c) => {
    const hrs = (now - new Date(c.created_at).getTime()) / 3600000;
    return hrs > 24;
  });
  const pendingOver48h = pending.filter((c) => {
    const hrs = (now - new Date(c.created_at).getTime()) / 3600000;
    return hrs > 48;
  });

  const oldestPendingDays = pending.length > 0
    ? Math.floor(Math.max(...pending.map((c) => (now - new Date(c.created_at).getTime()) / 86400000)))
    : 0;

  // Design Review queue — designers marked done, waiting for Ma'am's final
  // verdict. Ordered oldest-first so stale rows surface naturally.
  const designReviewQueue = concepts
    .filter((c) => c.work_status === "in_revision")
    .sort(
      (a, b) =>
        new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
    );

  return (
    <div className="space-y-4">
      {/* Urgency alerts */}
      {pendingOver48h.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3">
          <AlertOctagon className="h-5 w-5 shrink-0 text-destructive" />
          <p className="text-sm font-medium text-destructive">
            {pendingOver48h.length} concept{pendingOver48h.length !== 1 ? "s" : ""} overdue — oldest submitted {oldestPendingDays} day{oldestPendingDays !== 1 ? "s" : ""} ago
          </p>
        </div>
      )}
      {pendingOver24h.length > 0 && pendingOver48h.length === 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
          <Clock className="h-5 w-5 shrink-0 text-warning" />
          <p className="text-sm font-medium text-warning">
            ⏰ {pendingOver24h.length} concept{pendingOver24h.length !== 1 ? "s" : ""} waiting &gt; 24 hours for your review
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={<Clock className="h-5 w-5 text-warning" />} label="Pending Review" value={pendingThisMonth} />
        <StatCard icon={<CheckCircle2 className="h-5 w-5 text-success" />} label="Approved This Month" value={concepts.filter((c) => c.md_status === "approved" && isCurrentMonth(c.created_at)).length} />
        <StatCard icon={<XCircle className="h-5 w-5 text-destructive" />} label="Rejected" value={concepts.filter((c) => c.md_status === "rejected" && isCurrentMonth(c.created_at)).length} />
        <StatCard icon={<TrendingUp className="h-5 w-5 text-primary" />} label="Total This Month" value={concepts.filter((c) => isCurrentMonth(c.created_at)).length} />
      </div>

      {/* Design Review queue — concepts where the designer marked done and
          the lifecycle is waiting on Ma'am's verdict. Distinct from "Pending
          Review" above (which is the initial idea-approval step). */}
      {designReviewQueue.length > 0 && (
        <DesignReviewQueueCard items={designReviewQueue} />
      )}
    </div>
  );
}

// ============================================================================
// Design Review queue — admin/coordinator's "designer marked done" inbox.
// Renders a compact list with concept code, designer, revision round, time
// since submitted. Clicking a row opens the standard ConceptDetailDrawer
// (handled by ConceptsView's selection state — these cards don't own that).
// For now the rows are read-only summaries; the verdict happens in the
// drawer's WorkStatusActionPanel.
// ============================================================================

function DesignReviewQueueCard({
  items,
}: {
  items: ConceptWithRelations[];
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <header className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
              <Lightbulb className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Design Review
              </p>
              <p className="text-[11px] text-muted-foreground">
                Designers marked done — your verdict closes the loop.
              </p>
            </div>
          </div>
          <Badge className="bg-destructive/15 text-destructive border border-destructive/30">
            {items.length} waiting
          </Badge>
        </header>

        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {items.slice(0, 6).map((c) => {
            const designer = c.designer ?? c.submitter ?? null;
            const updatedRel = c.updated_at
              ? formatDistanceToNowStrict(new Date(c.updated_at), {
                  addSuffix: true,
                })
              : "—";
            return (
              <li
                key={c.id}
                className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-secondary/50"
              >
                <Avatar className="h-7 w-7 shrink-0">
                  {designer?.avatar_url ? (
                    <AvatarImage src={designer.avatar_url} />
                  ) : null}
                  <AvatarFallback className="text-[9px]">
                    {getInitials(designer?.full_name ?? "?")}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {c.title}
                    </p>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {c.concept_code}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {designer?.full_name ?? "—"} · round{" "}
                    {Math.max(1, c.revision_count ?? 1)} · {updatedRel}
                  </p>
                </div>
                {(c.revision_count ?? 0) > 1 && (
                  <Badge className="bg-warning/15 text-warning border border-warning/30 text-[10px]">
                    revision
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
        {items.length > 6 && (
          <p className="mt-2 text-right text-[11px] text-muted-foreground">
            +{items.length - 6} more — open the In-Revision filter below
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Shared stat card
// ============================================================================

function TargetRing({ progress, target, color }: { progress: number; target: number; color: string }) {
  const size = 80;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(progress / target, 1);
  const offset = circumference * (1 - pct);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgb(var(--border))" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold tabular-nums leading-none text-foreground">{progress}</span>
        <span className="text-[9px] text-muted-foreground">/ {target}</span>
      </div>
    </div>
  );
}

function MiniStat({ label, value, sub, color = "text-foreground" }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="py-3 px-4">
        <p className={cn("text-2xl font-bold tabular-nums leading-none", color)}>{value}</p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        {sub && <p className="mt-0.5 text-[10px] text-muted-foreground/70">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function ActiveConceptRow({ concept: c, onClick }: { concept: ConceptWithRelations; onClick: () => void }) {
  const stages = [
    { done: true },
    { done: c.md_status === "approved" },
    { done: !!c.designer_actual_date },
    { done: !!c.final_approved_at },
  ];
  const statusLabel =
    c.md_status === "pending" ? "Awaiting Review"
      : c.md_status === "revision_requested" ? "Needs Revision"
      : c.work_status === "on_hold" ? "On Hold"
      : c.work_status === "changes_requested" ? "Changes Needed"
      : c.designer_actual_date ? "Under Final Review"
      : "In Progress";
  const statusColor =
    c.md_status === "revision_requested" || c.work_status === "changes_requested" ? "text-warning"
      : c.work_status === "on_hold" ? "text-destructive"
      : c.md_status === "pending" ? "text-muted-foreground"
      : "text-primary";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary/50"
    >
      <div className="flex gap-0.5">
        {stages.map((s, i) => (
          <div key={i} className={cn("h-1.5 w-5 rounded-full", s.done ? "bg-primary" : "bg-border")} />
        ))}
      </div>
      <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{c.title}</p>
      <span className={cn("shrink-0 text-[10px] font-medium", statusColor)}>{statusLabel}</span>
    </button>
  );
}

function OverviewRow({ label, value, color }: { label: string; value: number; color?: string }) {
  if (value === 0) return null;
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", color ?? "text-foreground")}>{value}</span>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub?: string }) {
  return (
    <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex h-full items-center gap-3.5 py-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary ring-1 ring-inset ring-border/60">{icon}</div>
        <div className="min-w-0">
          <p className="text-[26px] font-bold leading-none tabular-nums text-foreground">{value}</p>
          <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">{label}</p>
          {sub && <p className="mt-0.5 text-[11px] font-medium text-muted-foreground/70">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// ============================================================================
// MonthlyTrend — last 6 months submissions vs approvals
// ============================================================================

function MonthlyTrend({ concepts, period = "month" }: { concepts: ConceptWithRelations[]; period?: Period }) {
  const data = useMemo(() => {
    const now = new Date();
    const result: { label: string; submitted: number; approved: number }[] = [];

    if (period === "week") {
      for (let i = 7; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (i * 7));
        const weekEnd = new Date(d.getTime() + 7 * 86400000);
        const label = `W${Math.ceil(d.getDate() / 7)}`;
        const submitted = concepts.filter((c) => { const cd = new Date(c.created_at); return cd >= d && cd < weekEnd; }).length;
        const approved = concepts.filter((c) => { if (c.md_status !== "approved") return false; const cd = new Date(c.created_at); return cd >= d && cd < weekEnd; }).length;
        result.push({ label, submitted, approved });
      }
    } else if (period === "quarter") {
      for (let i = 3; i >= 0; i--) {
        const qMonth = now.getMonth() - (i * 3);
        const d = new Date(now.getFullYear(), qMonth, 1);
        const label = `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear().toString().slice(2)}`;
        const qStart = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
        const qEnd = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3, 1);
        const submitted = concepts.filter((c) => { const cd = new Date(c.created_at); return cd >= qStart && cd < qEnd; }).length;
        const approved = concepts.filter((c) => { if (c.md_status !== "approved") return false; const cd = new Date(c.created_at); return cd >= qStart && cd < qEnd; }).length;
        result.push({ label, submitted, approved });
      }
    } else {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const m = d.getMonth();
        const y = d.getFullYear();
        const label = d.toLocaleString("en-IN", { month: "short" });
        const submitted = concepts.filter((c) => { const cd = new Date(c.created_at); return cd.getMonth() === m && cd.getFullYear() === y; }).length;
        const approved = concepts.filter((c) => { if (c.md_status !== "approved") return false; const cd = new Date(c.created_at); return cd.getMonth() === m && cd.getFullYear() === y; }).length;
        result.push({ label, submitted, approved });
      }
    }
    return result;
  }, [concepts, period]);

  const periodLabel = period === "week" ? "Weekly" : period === "quarter" ? "Quarterly" : "Monthly";

  return (
    <Card>
      <CardContent className="py-3">
        <div className="mb-1 flex items-center justify-between">
          <h4 className="text-xs font-semibold text-foreground">{periodLabel} Trend</h4>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />Submitted</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" />Approved</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data} barGap={2} barSize={14}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgb(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "rgb(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={20} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid rgb(var(--border))", background: "rgb(var(--card))" }}
              cursor={{ fill: "rgb(var(--secondary))", opacity: 0.5 }}
            />
            <Bar dataKey="submitted" name="Submitted" fill="rgb(var(--primary))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="approved" name="Approved" fill="rgb(var(--success))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// RecentActivity — last few concept events
// ============================================================================

const ACTIVITY_ICONS: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  approved: { icon: CheckCircle2, color: "text-success bg-success/10" },
  pending: { icon: Clock, color: "text-warning bg-warning/10" },
  revision_requested: { icon: RotateCcw, color: "text-orange-500 bg-orange-500/10" },
  rejected: { icon: XCircle, color: "text-destructive bg-destructive/10" },
  submitted: { icon: TrendingUp, color: "text-primary bg-primary/10" },
};

function RecentActivity({ concepts, onConceptSelect }: { concepts: ConceptWithRelations[]; onConceptSelect?: (c: ConceptWithRelations) => void }) {
  const events = useMemo(() => {
    const items: { concept: ConceptWithRelations; label: string; type: string; date: string }[] = [];
    for (const c of concepts) {
      items.push({ concept: c, label: `Submitted "${c.title}"`, type: "submitted", date: c.created_at });
      if (c.md_reviewed_at && c.md_status === "approved") {
        items.push({ concept: c, label: `"${c.title}" approved`, type: "approved", date: c.md_reviewed_at });
      }
      if (c.md_reviewed_at && c.md_status === "revision_requested") {
        items.push({ concept: c, label: `Revision requested on "${c.title}"`, type: "revision_requested", date: c.md_reviewed_at });
      }
      if (c.md_reviewed_at && c.md_status === "rejected") {
        items.push({ concept: c, label: `"${c.title}" rejected`, type: "rejected", date: c.md_reviewed_at });
      }
      if (c.final_approved_at) {
        items.push({ concept: c, label: `"${c.title}" completed`, type: "approved", date: c.final_approved_at });
      }
    }
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items.slice(0, 5);
  }, [concepts]);

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Clock className="h-6 w-6 text-muted-foreground/30" />
          <p className="mt-2 text-xs text-muted-foreground">No activity yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-3">
        <h4 className="mb-2 text-xs font-semibold text-foreground">Recent Activity</h4>
        <div className="space-y-1">
          {events.map((ev, i) => {
            const cfg = ACTIVITY_ICONS[ev.type] ?? ACTIVITY_ICONS.submitted;
            const Icon = cfg.icon;
            const timeAgo = (() => {
              try { return formatDistanceToNowStrict(new Date(ev.date), { addSuffix: true }); } catch { return ""; }
            })();
            return (
              <button
                key={`${ev.concept.id}-${ev.type}-${i}`}
                type="button"
                onClick={() => onConceptSelect?.(ev.concept)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-secondary/50"
              >
                <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full", cfg.color)}>
                  <Icon className="h-3 w-3" />
                </div>
                <p className="min-w-0 flex-1 truncate text-[11px] text-foreground">{ev.label}</p>
                <span className="shrink-0 text-[9px] text-muted-foreground">{timeAgo}</span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// DesignerStatusBar — compact distribution of concept statuses
// ============================================================================

const STATUS_ROWS: {
  key: string;
  label: string;
  filter: (c: ConceptWithRelations) => boolean;
  color: string;
  barColor: string;
}[] = [
  { key: "pending", label: "Pending Review", filter: (c) => c.md_status === "pending", color: "text-warning", barColor: "bg-warning" },
  { key: "revision", label: "Needs Revision", filter: (c) => c.md_status === "revision_requested", color: "text-orange-500", barColor: "bg-orange-400" },
  { key: "in_progress", label: "In Progress", filter: (c) => c.md_status === "approved" && !c.final_approved_at && !c.designer_actual_date, color: "text-primary", barColor: "bg-primary" },
  { key: "done", label: "Submitted for Review", filter: (c) => c.md_status === "approved" && !!c.designer_actual_date && !c.final_approved_at, color: "text-success", barColor: "bg-success" },
  { key: "completed", label: "Completed", filter: (c) => !!c.final_approved_at, color: "text-success", barColor: "bg-success/60" },
  { key: "rejected", label: "Rejected", filter: (c) => c.md_status === "rejected", color: "text-destructive", barColor: "bg-destructive" },
];

function DesignerStatusBar({ concepts, onConceptSelect }: { concepts: ConceptWithRelations[]; onConceptSelect?: (c: ConceptWithRelations) => void }) {
  if (concepts.length === 0) return null;
  const total = concepts.length;
  const rows = STATUS_ROWS.map((r) => ({ ...r, count: concepts.filter(r.filter).length })).filter((r) => r.count > 0);

  return (
    <Card>
      <CardContent className="py-3">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold text-foreground">Status Breakdown</h4>
          <span className="text-[10px] tabular-nums text-muted-foreground">{total} this month</span>
        </div>
        <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-secondary">
          {rows.map((r) => (
            <div key={r.key} className={cn("h-full transition-[width] duration-500", r.barColor)} style={{ width: `${(r.count / total) * 100}%` }} title={`${r.label}: ${r.count}`} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-2 text-[11px]">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", r.barColor)} />
              <span className="text-muted-foreground">{r.label}</span>
              <span className={cn("ml-auto font-semibold tabular-nums", r.color)}>{r.count}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// DesignerActionItems — only concepts needing the designer's attention
// ============================================================================

function DesignerActionItems({
  concepts,
  allTargetMet,
  onSubmit,
  onConceptSelect,
}: {
  concepts: ConceptWithRelations[];
  allTargetMet: boolean;
  onSubmit: () => void;
  onConceptSelect?: (c: ConceptWithRelations) => void;
}) {
  const actions: { concept: ConceptWithRelations; label: string; urgency: "warning" | "destructive" | "primary"; action: string }[] = [];

  for (const c of concepts) {
    if (c.md_status === "revision_requested") {
      actions.push({ concept: c, label: "Revision requested — update and resubmit", urgency: "warning", action: "Revise" });
    } else if (c.md_status === "approved" && !c.designer_actual_date && c.work_status === "not_started") {
      actions.push({ concept: c, label: "Approved — start working on it", urgency: "primary", action: "Start" });
    } else if (c.md_status === "approved" && c.work_status === "changes_requested") {
      actions.push({ concept: c, label: "Changes requested — revise and resubmit", urgency: "warning", action: "View" });
    } else if (c.md_status === "approved" && !c.designer_actual_date && c.work_status === "on_hold") {
      const heldAt = c.work_held_at ? Math.floor((Date.now() - new Date(c.work_held_at).getTime()) / 86400000) : 0;
      if (heldAt > 3) {
        actions.push({ concept: c, label: `On hold for ${heldAt} days — resume work`, urgency: "destructive", action: "Resume" });
      }
    }
  }

  if (actions.length === 0 && allTargetMet) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-success/20 bg-success/5 p-3">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
        <p className="text-sm font-medium text-success">All caught up! Monthly target met, no pending actions.</p>
      </div>
    );
  }

  if (actions.length === 0) return null;

  const URGENCY_STYLE = {
    warning: { border: "border-warning/20", bg: "bg-warning/5", icon: "text-warning", btn: "" },
    destructive: { border: "border-destructive/20", bg: "bg-destructive/5", icon: "text-destructive", btn: "text-destructive hover:bg-destructive/10" },
    primary: { border: "border-primary/20", bg: "bg-primary/5", icon: "text-primary", btn: "" },
  };

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-foreground">Needs Your Attention</h4>
      {actions.slice(0, 3).map(({ concept: c, label, urgency, action }) => {
        const s = URGENCY_STYLE[urgency];
        return (
          <div key={c.id} className={cn("flex items-center gap-3 rounded-lg border p-2.5", s.border, s.bg)}>
            <AlertTriangle className={cn("h-4 w-4 shrink-0", s.icon)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{c.title}</p>
              <p className="truncate text-[10px] text-muted-foreground">{label}</p>
            </div>
            <Button size="sm" variant="outline" className={cn("h-7 shrink-0 text-[11px]", s.btn)} onClick={() => onConceptSelect?.(c)}>
              {action}
            </Button>
          </div>
        );
      })}
      {actions.length > 3 && (
        <p className="text-center text-[10px] text-muted-foreground">+{actions.length - 3} more items in your Concepts list</p>
      )}
    </div>
  );
}

function ConceptCard({ concept: c, onClick }: { concept: ConceptWithRelations; onClick: () => void }) {
  const hasImage = !!c.image_url && /\.(jpe?g|png|gif|webp|svg)$/i.test(c.image_url);
  const partyName = c.client?.party_name ?? "—";
  const date = c.created_at ? formatDate(c.created_at) : "—";
  const filesCount = Array.isArray(c.files) ? c.files.length : c.image_url ? 1 : 0;
  const showWorkStatus = c.md_status === "approved" && !c.final_approved_at;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:border-primary/30 hover:shadow-md"
    >
      {hasImage ? (
        <div className="h-32 w-full overflow-hidden bg-secondary">
          <ConceptImage
            src={c.image_url!}
            alt={c.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="flex h-24 w-full items-center justify-center bg-secondary/50">
          <Lightbulb className="h-8 w-8 text-muted-foreground/30" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <h5 className="text-sm font-semibold leading-tight text-foreground line-clamp-1">
            {c.title}
          </h5>
          <Badge className={cn("shrink-0 text-[9px]", CONCEPT_STATUS_COLORS[c.md_status])}>
            {CONCEPT_STATUS_LABELS[c.md_status]}
          </Badge>
        </div>
        {showWorkStatus && (
          <Badge className={cn("w-fit text-[9px]", WORK_STATUS_COLORS[c.work_status])}>
            {WORK_STATUS_LABELS[c.work_status]}
          </Badge>
        )}
        <div className="mt-auto flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="truncate">{partyName}</span>
          <span className="text-border">·</span>
          <span className="shrink-0">{date}</span>
          {filesCount > 0 && (
            <>
              <span className="text-border">·</span>
              <span className="shrink-0">{filesCount} file{filesCount > 1 ? "s" : ""}</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}
