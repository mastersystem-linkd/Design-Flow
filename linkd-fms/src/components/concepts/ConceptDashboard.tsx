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
import type { ConceptWithRelations, UserRole, Profile } from "@/types/database";

// ============================================================================
// Shared helpers
// ============================================================================

const MONTHLY_TARGET = 3;

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

export function DesignerConceptDashboard({
  concepts,
  userId,
  onSubmit,
  onConceptSelect,
}: {
  concepts: ConceptWithRelations[];
  userId: string;
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
    progress >= 3
      ? "rgb(var(--success))"
      : progress >= 1
        ? "rgb(var(--warning))"
        : "rgb(var(--destructive))";

  const showDay7Warning = dayOfMonth >= 7 && stats.submitted === 0;
  const showDay24Warning = dayOfMonth >= 24 && stats.approved < 3;

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

  return (
    <div className="space-y-4">
      {/* Warning banners */}
      {showDay7Warning && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              No concepts submitted this month yet
            </p>
            <p className="text-xs text-muted-foreground">
              The month is already {dayOfMonth} days in. Submit your first concept to
              stay on track for the monthly target of {MONTHLY_TARGET}.
            </p>
          </div>
          <Button size="sm" onClick={onSubmit}>Submit Now</Button>
        </div>
      )}
      {showDay24Warning && !showDay7Warning && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3">
          <AlertOctagon className="h-5 w-5 shrink-0 text-destructive" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Only {stats.approved} of {MONTHLY_TARGET} concepts approved — {daysLeft} days left
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onSubmit}>Submit Concept</Button>
        </div>
      )}

      {/* Stats + Progress ring */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="md:col-span-1">
          <CardContent className="flex flex-col items-center justify-center py-5">
            <div className="relative h-28 w-28">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" startAngle={90} endAngle={-270} data={chartData} barSize={10}>
                  <RadialBar dataKey="value" cornerRadius={5} background={{ fill: "rgb(var(--border))" }} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold tabular-nums text-foreground">{progress}</span>
                <span className="text-[10px] text-muted-foreground">/ {MONTHLY_TARGET}</span>
              </div>
            </div>
            <p className="mt-2 text-xs font-medium text-muted-foreground">{monthLabel}</p>
            <div className="mt-2 flex gap-1.5">
              {Array.from({ length: MONTHLY_TARGET }).map((_, i) => (
                <span key={i} className={cn("h-2.5 w-2.5 rounded-full border-2", i < stats.approved ? "border-success bg-success" : i < stats.submitted ? "border-primary bg-primary/20" : "border-border bg-transparent")} />
              ))}
            </div>
            <p className="mt-1.5 text-[10px] tabular-nums text-muted-foreground">{daysLeft} days remaining</p>
          </CardContent>
        </Card>
        <StatCard icon={<TrendingUp className="h-5 w-5 text-primary" />} label="Submitted This Month" value={stats.submitted} />
        <StatCard icon={<CheckCircle2 className="h-5 w-5 text-success" />} label="Approved This Month" value={stats.approved} />
        <StatCard icon={<Target className="h-5 w-5 text-muted-foreground" />} label="Total All Time" value={allTimeCount} />
      </div>

      {/* Workflow steppers */}
      {myConcepts.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-2">Concept Progress</h4>
          <div className="space-y-1.5">
            {myConcepts.slice(0, 5).map((c) => (
              <ConceptWorkflowStage
                key={c.id}
                concept={c}
                onClick={() => onConceptSelect?.(c)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Smart nudges (max 2) */}
      <NudgeSection
        allTargetMet={allTargetMet}
        revisionStale={revisionStale}
        approvedNotFinalized={approvedNotFinalized}
        dayOfMonth={dayOfMonth}
        submitted={stats.submitted}
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
    if (dayOfMonth >= 24 && d.approved < 3) return true;
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
                const barColor = d.approved >= 3 ? "bg-success" : d.approved >= 1 ? "bg-warning" : "bg-destructive";
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

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex items-center gap-3 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">{icon}</div>
        <div>
          <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
