import { useEffect, useState } from "react";
import {
  Lightbulb,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  FileText,
  Download,
  PackageCheck,
  Hourglass,
  PlayCircle,
  Pause,
  Sparkles,
  Calendar,
  Palette,
  Layers,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAnalytics, type Period } from "@/hooks/useAnalytics";
import { useConcepts } from "@/hooks/useConcepts";
import { KpiCard } from "@/components/analytics/KpiCard";
import { TextileHeroWrapper } from "@/components/analytics/TextileHeroWrapper";
import { VolumeChart } from "@/components/analytics/VolumeChart";
import { PipelineHealth } from "@/components/analytics/PipelineHealth";
import { DesignerLeaderboard } from "@/components/analytics/DesignerLeaderboard";
import { MdReviewPanel } from "@/components/analytics/MdReviewPanel";
import { DesignerConceptMatrix } from "@/components/analytics/DesignerConceptMatrix";
import { TeamTargetHero } from "@/components/analytics/TeamTargetHero";
import { DesignerConceptDashboard } from "@/components/concepts/ConceptDashboard";
import { useNavigate } from "react-router-dom";
import { isAdmin as isAdminCheck } from "@/lib/permissions";
import {
  Card,
  CardContent,
  Button,
  Badge,
  SkeletonCard,
  SkeletonTable,
} from "@/components/ui";
import { exportToCSV, type CsvColumn } from "@/lib/exportCSV";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { isAdminOrCoordinator } from "@/lib/permissions";
import type { UserRole } from "@/types/database";

const PERIODS: { value: Period; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
];

/**
 * AnalyticsView — Concept Dashboard. Also rendered as a tab inside
 * TaskDashboardView when the user hits `?tab=concepts`. Pass
 * `embedded={true}` from that parent so the giant icon + H1 + sub-label
 * header is skipped — the parent's tab strip already names the section.
 */
export interface AnalyticsViewControls {
  period: Period;
  setPeriod: (p: Period) => void;
  periodLabel: string;
  onExport: (() => void) | null;
}

export function AnalyticsView({
  embedded = false,
  externalPeriod,
  onControlsReady,
}: {
  embedded?: boolean;
  externalPeriod?: Period;
  onControlsReady?: (c: AnalyticsViewControls) => void;
} = {}) {
  const { profile } = useAuth();
  const role: UserRole = profile?.role ?? "designer";
  const isDesigner = role === "designer";

  const [internalPeriod, setInternalPeriod] = useState<Period>("month");
  const period = externalPeriod ?? internalPeriod;
  const setPeriod = (p: Period) => setInternalPeriod(p);
  const a = useAnalytics(period);
  const { concepts } = useConcepts();
  const navigate = useNavigate();
  const canExport = isAdminOrCoordinator(role);
  const userId = profile?.id;

  function handleExportReport() {
    if (!a.designerStats.length) return;
    const cols: CsvColumn<(typeof a.designerStats)[0]>[] = [
      { key: "full_name", label: "Designer" },
      { key: "submitted", label: "Submitted", transform: (v) => String(v ?? 0) },
      { key: "approved", label: "Approved", transform: (v) => String(v ?? 0) },
      { key: "rejected", label: "Rejected", transform: (v) => String(v ?? 0) },
      { key: "revisions", label: "Revisions", transform: (v) => String(v ?? 0) },
      { key: "target", label: "Target", transform: (v) => String(v ?? 0) },
      { key: "score", label: "Score", transform: (v) => String(v ?? 0) },
    ];
    exportToCSV(
      a.designerStats as unknown as Record<string, unknown>[],
      `linkd-analytics-${period}`,
      cols as unknown as CsvColumn<Record<string, unknown>>[]
    );
  }

  useEffect(() => {
    if (onControlsReady) {
      onControlsReady({
        period,
        setPeriod,
        periodLabel: a.periodLabel,
        onExport: canExport && a.designerStats.length > 0 ? handleExportReport : null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, a.periodLabel, canExport, a.designerStats.length]);

  if (a.error) {
    return (
      <div className="mx-auto max-w-lg py-20">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <p className="text-sm text-destructive">{a.error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (a.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-secondary" />
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2"><SkeletonCard /></div>
          <SkeletonCard />
        </div>
        <SkeletonTable rows={6} cols={8} />
      </div>
    );
  }

  // Designer personal stats
  const myStats = isDesigner
    ? a.designerStats.find((d) => d.id === profile?.id) ?? null
    : null;

  return (
    <div className="space-y-4">
      {/* ── Header ──
          When `embedded`, the parent (TaskDashboardView) already shows a
          tab strip naming this section, so we drop the giant icon + h1
          and just render the controls + sub-label inline. */}
      {embedded ? null : (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Lightbulb className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {isDesigner ? "My Concept Performance" : "Concept Dashboard"}
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{a.periodLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canExport && a.designerStats.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportReport}
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            )}
            <div className="inline-flex rounded-lg bg-secondary p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPeriod(p.value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    period === p.value
                      ? "bg-primary text-white"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Designer concept dashboard (radial + KPI cards + Concept Progress
          bars). Only rendered for designers — admin/coordinator get the
          richer matrix + target hero below, which already covers the same
          ground without the duplication. */}
      {isDesigner && userId && (
        <DesignerConceptDashboard
          concepts={concepts}
          userId={userId}
          onSubmit={() => navigate(ROUTES.concepts)}
          onConceptSelect={() => navigate(ROUTES.concepts)}
        />
      )}

      {/* ── DESIGNER PERSONAL VIEW ──
          DesignerConceptDashboard (above) already shows the monthly target
          radial + KPI cards + Concept Progress bars + nudges. Here we just
          add ONE compact performance card so the designer sees their score
          and revisions without the radial / KPI duplication of the old layout. */}
      {isDesigner && myStats ? (
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* Score column */}
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-xl",
                    myStats.score >= 90
                      ? "bg-success/10"
                      : myStats.score >= 75
                        ? "bg-warning/10"
                        : "bg-destructive/10"
                  )}
                >
                  <span
                    className={cn(
                      "text-2xl font-bold tabular-nums",
                      myStats.score >= 90
                        ? "text-success"
                        : myStats.score >= 75
                          ? "text-warning"
                          : "text-destructive"
                    )}
                  >
                    {myStats.score}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Performance Score
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Your concept score this {period}
                  </p>
                </div>
              </div>

              {/* Stat chips on the right */}
              <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-warning">
                  <RotateCcw className="h-3 w-3" />
                  {myStats.revisions} revision{myStats.revisions === 1 ? "" : "s"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-destructive">
                  {myStats.rejected} rejected
                </span>
              </div>
            </div>

            {/* Score bar */}
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-[800ms]",
                  myStats.score >= 90
                    ? "bg-success"
                    : myStats.score >= 75
                      ? "bg-warning"
                      : "bg-destructive"
                )}
                style={{ width: `${myStats.score}%` }}
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        /* ── ADMIN / COORDINATOR VIEW ── */
        <>
          {/* ── Design Studio Banner — textile-inspired accent ── */}
          <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-r from-primary/5 via-card to-card">
            <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary via-success to-warning" />
            <svg
              className="absolute right-0 top-0 h-full w-40 opacity-[0.03]"
              viewBox="0 0 160 80"
              aria-hidden="true"
            >
              {Array.from({ length: 20 }).map((_, i) => (
                <line
                  key={`h${i}`}
                  x1="0"
                  y1={i * 4}
                  x2="160"
                  y2={i * 4}
                  stroke="currentColor"
                  strokeWidth="1"
                />
              ))}
              {Array.from({ length: 40 }).map((_, i) => (
                <line
                  key={`v${i}`}
                  x1={i * 4}
                  y1="0"
                  x2={i * 4}
                  y2="80"
                  stroke="currentColor"
                  strokeWidth="0.5"
                />
              ))}
            </svg>
            <div className="relative flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Palette className="h-[18px] w-[18px] text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Design Studio</p>
                  <p className="text-[11px] text-muted-foreground">
                    Digital print concept pipeline · {a.periodLabel}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden items-center gap-1 sm:flex" title="Print color palette">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-sm" />
                  <span className="h-2.5 w-2.5 rounded-full bg-success shadow-sm" />
                  <span className="h-2.5 w-2.5 rounded-full bg-warning shadow-sm" />
                  <span className="h-2.5 w-2.5 rounded-full bg-destructive shadow-sm" />
                </div>
                {a.kpis.pendingReview > 0 && (
                  <Badge
                    className={cn(
                      "cursor-pointer border transition-colors",
                      a.kpis.pendingReview > 2
                        ? "bg-destructive/10 text-destructive border-destructive/20 animate-pulse"
                        : "bg-warning/10 text-warning border-warning/20"
                    )}
                    onClick={() => navigate(`${ROUTES.concepts}?tab=pending`)}
                  >
                    {a.kpis.pendingReview} awaiting review
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* KPI cards — wrapped in the shared TextileHeroWrapper so the
              Concept Dashboard reads as part of the same visual system
              as Task / Sampling / Salvedge / Scorecards. */}
          <TextileHeroWrapper className="p-0 sm:p-0">
            <div className="grid grid-cols-2 divide-x divide-y divide-border/40 sm:divide-y-0 lg:grid-cols-4">
            <KpiCard
              flat
              icon={<FileText className="h-4 w-4 text-primary" />}
              label="Concepts Submitted"
              value={a.kpis.totalSubmitted.current}
              metric={a.kpis.totalSubmitted}
              tintClass="bg-primary/10"
              to={`${ROUTES.concepts}?tab=all`}
              animateValue
              sparklineData={a.sparklines.submitted}
              sub={`by ${a.designerStats.filter(d => d.submitted > 0).length} designer${a.designerStats.filter(d => d.submitted > 0).length !== 1 ? "s" : ""}`}
            />
            <KpiCard
              flat
              icon={<CheckCircle2 className="h-4 w-4 text-success" />}
              label="Approved"
              value={a.kpis.totalApproved.current}
              metric={a.kpis.totalApproved}
              tintClass="bg-success/10"
              to={`${ROUTES.concepts}?tab=approved`}
              animateValue
              sparklineData={a.sparklines.approved}
              valueColor={
                a.kpis.approvalRate.current > 80 ? "text-success" : a.kpis.approvalRate.current < 50 ? "text-destructive" : undefined
              }
              sub={`${a.kpis.approvalRate.current}% rate · ${a.kpis.totalApproved.current + (a.statusDistribution.find(s => s.status === "rejected")?.count ?? 0)} reviewed`}
            />
            <KpiCard
              flat
              icon={<PackageCheck className="h-4 w-4 text-success" />}
              label="Completed"
              value={a.kpis.totalCompleted.current}
              metric={a.kpis.totalCompleted}
              tintClass="bg-success/10"
              to={`${ROUTES.concepts}?tab=completed`}
              animateValue
              sparklineData={a.sparklines.completed}
              valueColor={
                a.kpis.completionRate.current >= 70 ? "text-success" :
                a.kpis.completionRate.current >= 40 ? "text-warning" : undefined
              }
              sub={
                a.kpis.totalApproved.current > 0
                  ? `${a.kpis.completionRate.current}% of approved shipped`
                  : "No approved concepts yet"
              }
            />
            <KpiCard
              flat
              icon={<RotateCcw className="h-4 w-4 text-warning" />}
              label="Avg Review Time"
              value={a.kpis.avgApprovalHours.current > 0 ? `${a.kpis.avgApprovalHours.current}h` : "—"}
              metric={a.kpis.avgApprovalHours}
              tintClass="bg-warning/10"
              invertTrend
              sparklineData={a.sparklines.avgReviewHours}
              valueColor={
                a.kpis.avgApprovalHours.current === 0 ? undefined :
                a.kpis.avgApprovalHours.current < 24 ? "text-success" :
                a.kpis.avgApprovalHours.current < 48 ? "text-warning" : "text-destructive"
              }
              to={`${ROUTES.concepts}?tab=pending`}
              sub="Target: < 24 hours"
            />
            </div>
          </TextileHeroWrapper>

          {/* ── Print Production Pipeline — post-approval lifecycle ── */}
          <Card>
            <CardContent className="p-4">
              <header className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Layers className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Print Production Pipeline
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Post-approval lifecycle — what's moving, what's stuck
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {a.conversionRates.reviewedToApproved > 0 && (
                    <span className="hidden text-[10px] font-medium text-muted-foreground sm:inline">
                      {a.conversionRates.reviewedToApproved}% approval rate
                    </span>
                  )}
                  <Badge className="bg-primary/10 text-primary border border-primary/20">
                    {a.workStatus.inFlight} in flight
                  </Badge>
                </div>
              </header>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                <WorkPill
                  icon={<PlayCircle className="h-3.5 w-3.5" />}
                  label="In Progress"
                  value={a.workStatus.inFlight - a.workStatus.onHold - a.workStatus.inRevision}
                  tone="primary"
                  href={`${ROUTES.concepts}?tab=approved`}
                />
                <WorkPill
                  icon={<Pause className="h-3.5 w-3.5" />}
                  label="On Hold"
                  value={a.workStatus.onHold}
                  tone="warning"
                  href={`${ROUTES.concepts}?tab=approved`}
                />
                <WorkPill
                  icon={<Hourglass className="h-3.5 w-3.5" />}
                  label="In Revision"
                  value={a.workStatus.inRevision}
                  tone="destructive"
                  href={`${ROUTES.concepts}?tab=approved`}
                />
                <WorkPill
                  icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                  label="Completed"
                  value={a.workStatus.completed}
                  tone="success"
                  href={`${ROUTES.concepts}?tab=completed`}
                />
                <WorkPill
                  icon={<AlertTriangle className="h-3.5 w-3.5" />}
                  label="Rejected"
                  value={a.workStatus.rejected}
                  tone="destructive"
                  href={`${ROUTES.concepts}?tab=rejected`}
                />
              </div>

              {/* Concept flow summary — inline funnel replacing separate ConceptFunnel */}
              {a.funnel.submitted > 0 && (
                <div className="mt-3 flex items-center gap-1.5 overflow-x-auto rounded-lg border border-border bg-secondary/20 px-3 py-2 text-[10px] font-medium">
                  <span className="whitespace-nowrap text-foreground">{a.funnel.submitted}</span>
                  <span className="text-muted-foreground">submitted</span>
                  <span className="text-muted-foreground/60">→</span>
                  <span className="whitespace-nowrap text-primary">{a.funnel.approved}</span>
                  <span className="text-muted-foreground">approved</span>
                  <span className="text-muted-foreground/60">→</span>
                  <span className="whitespace-nowrap text-warning">{a.funnel.finalization}</span>
                  <span className="text-muted-foreground">finalizing</span>
                  <span className="text-muted-foreground/60">→</span>
                  <span className="whitespace-nowrap text-success">{a.funnel.completed}</span>
                  <span className="text-muted-foreground">completed</span>
                  {a.funnel.rejected > 0 && (
                    <>
                      <span className="mx-1 text-border">|</span>
                      <span className="whitespace-nowrap text-destructive">{a.funnel.rejected} rejected</span>
                    </>
                  )}
                </div>
              )}

              {/* Quality KPIs */}
              {(a.workStatus.firstPassRate !== null ||
                a.workStatus.avgRevisionRounds !== null ||
                a.workStatus.avgDesignDays !== null ||
                a.workStatus.holdRate !== null ||
                a.workStatus.avgTimeToStartHours !== null ||
                a.workStatus.avgReviewTurnaroundHours !== null) && (
                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-3 xl:grid-cols-6">
                  <QualityKpi
                    icon={<Sparkles className="h-3.5 w-3.5 text-success" />}
                    label="First-Pass Approval"
                    value={
                      a.workStatus.firstPassRate !== null
                        ? `${a.workStatus.firstPassRate}%`
                        : "—"
                    }
                    sub="Approved on first review"
                    accentClass={
                      a.workStatus.firstPassRate === null
                        ? undefined
                        : a.workStatus.firstPassRate >= 80
                          ? "text-success"
                          : a.workStatus.firstPassRate >= 60
                            ? "text-warning"
                            : "text-destructive"
                    }
                  />
                  <QualityKpi
                    icon={<RotateCcw className="h-3.5 w-3.5 text-primary" />}
                    label="Avg Revision Rounds"
                    value={
                      a.workStatus.avgRevisionRounds !== null
                        ? a.workStatus.avgRevisionRounds.toFixed(1)
                        : "—"
                    }
                    sub="1 = first try, 2+ = rework"
                  />
                  <QualityKpi
                    icon={<Calendar className="h-3.5 w-3.5 text-primary" />}
                    label="Avg Design Days"
                    value={
                      a.workStatus.avgDesignDays !== null
                        ? `${a.workStatus.avgDesignDays}d`
                        : "—"
                    }
                    sub="Hold-time excluded"
                  />
                  <QualityKpi
                    icon={<Pause className="h-3.5 w-3.5 text-warning" />}
                    label="Hold Frequency"
                    value={
                      a.workStatus.holdRate !== null
                        ? `${a.workStatus.holdRate}%`
                        : "—"
                    }
                    sub={`${a.workStatus.totalHolds} total holds`}
                    accentClass={
                      a.workStatus.holdRate === null
                        ? undefined
                        : a.workStatus.holdRate <= 20
                          ? "text-success"
                          : a.workStatus.holdRate <= 50
                            ? "text-warning"
                            : "text-destructive"
                    }
                  />
                  <QualityKpi
                    icon={<PlayCircle className="h-3.5 w-3.5 text-primary" />}
                    label="Time to Start"
                    value={
                      a.workStatus.avgTimeToStartHours !== null
                        ? formatHoursShort(a.workStatus.avgTimeToStartHours)
                        : "—"
                    }
                    sub="Approval → designer pickup"
                    accentClass={
                      a.workStatus.avgTimeToStartHours === null
                        ? undefined
                        : a.workStatus.avgTimeToStartHours <= 24
                          ? "text-success"
                          : a.workStatus.avgTimeToStartHours <= 72
                            ? "text-warning"
                            : "text-destructive"
                    }
                  />
                  <QualityKpi
                    icon={<Hourglass className="h-3.5 w-3.5 text-destructive" />}
                    label="Review Turnaround"
                    value={
                      a.workStatus.avgReviewTurnaroundHours !== null
                        ? formatHoursShort(a.workStatus.avgReviewTurnaroundHours)
                        : "—"
                    }
                    sub="Done → Ma'am's verdict"
                    accentClass={
                      a.workStatus.avgReviewTurnaroundHours === null
                        ? undefined
                        : a.workStatus.avgReviewTurnaroundHours <= 24
                          ? "text-success"
                          : a.workStatus.avgReviewTurnaroundHours <= 48
                            ? "text-warning"
                            : "text-destructive"
                    }
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Hero row: Designer matrix + Monthly target. Default `items-stretch`
              so both cards match height; the TargetHero distributes its own
              content via flex so it doesn't leave an empty band. */}
          <div className="grid gap-3 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <DesignerConceptMatrix />
            </div>
            <div className="xl:col-span-2">
              <TeamTargetHero
                data={a.targetRace}
                periodStart={a.periodStart}
                periodEnd={a.periodEnd}
              />
            </div>
          </div>

          {/* Charts row */}
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <VolumeChart
                data={a.volumeData}
                title={period === "week" ? "Daily Concepts" : period === "quarter" ? "Monthly Concepts" : "Weekly Concepts"}
              />
            </div>
            <PipelineHealth data={a.statusDistribution} />
          </div>

          {/* MD Review Performance — admin only */}
          {isAdminCheck(role) && (
            <MdReviewPanel stats={a.mdReview} />
          )}

          {/* Designer Leaderboard */}
          <DesignerLeaderboard data={a.designerStats} concepts={concepts} />
        </>
      )}
    </div>
  );
}

function PersonalTargetRing({ approved, target }: { approved: number; target: number }) {
  const pct = Math.min(100, (approved / target) * 100);
  const r = 54;
  const c = 2 * Math.PI * r;
  const color =
    approved >= target ? "stroke-success" : approved >= 1 ? "stroke-warning" : "stroke-destructive";

  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 130 130" className="-rotate-90 h-full w-full" aria-hidden>
        <circle
          cx="65"
          cy="65"
          r={r}
          className="fill-none stroke-secondary"
          strokeWidth={10}
        />
        <circle
          cx="65"
          cy="65"
          r={r}
          className={cn("fill-none", color)}
          strokeWidth={10}
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.4,0,0.2,1)" }}
        />
        {/* Milestone ticks */}
        {[1, 2, 3].map((m) => {
          const angle = (m / target) * 2 * Math.PI;
          const x = 65 + r * Math.cos(angle);
          const y = 65 + r * Math.sin(angle);
          return (
            <circle
              key={m}
              cx={x}
              cy={y}
              r={3}
              className={cn(
                "fill-card stroke-2",
                approved >= m ? "stroke-success" : "stroke-border"
              )}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-3xl font-bold tabular-nums text-foreground">
          {approved}
          <span className="text-lg text-muted-foreground">/{target}</span>
        </p>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          approved
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Work-status pipeline mini components
// ============================================================================

/**
 * Compact pipeline counter. Each tone maps to a token-backed background so
 * the pill adapts to light/dark theme without a per-mode override.
 */
function WorkPill({
  icon,
  label,
  value,
  tone,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "muted" | "primary" | "warning" | "destructive" | "success";
  href: string;
}) {
  const navigate = useNavigate();
  const toneClass = {
    muted:       "bg-muted/20 text-muted-foreground border-border border-l-muted-foreground",
    primary:     "bg-primary/10 text-primary border-primary/30 border-l-primary",
    warning:     "bg-warning/10 text-warning border-warning/30 border-l-warning",
    destructive: "bg-destructive/10 text-destructive border-destructive/30 border-l-destructive",
    success:     "bg-success/10 text-success border-success/30 border-l-success",
  }[tone];

  return (
    <button
      type="button"
      onClick={() => navigate(href)}
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border border-l-[3px] px-3 py-2 text-left transition-all hover:scale-[1.02] hover:shadow-card-soft active:scale-[0.98]",
        toneClass
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0">{icon}</span>
        <span className="truncate text-[10px] font-medium uppercase tracking-wider opacity-80">
          {label}
        </span>
      </div>
      <span className="shrink-0 text-base font-bold tabular-nums">{value}</span>
    </button>
  );
}

/**
 * Hours → compact label. < 1h shows minutes, < 48h shows "12h", 48h+ shows
 * "3.2d" so the KPI tile stays readable regardless of magnitude.
 */
function formatHoursShort(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
  const days = hours / 24;
  return `${days.toFixed(days < 10 ? 1 : 0)}d`;
}

/** Compact quality KPI tile. Sub line stays muted so the value pops. */
function QualityKpi({
  icon,
  label,
  value,
  sub,
  accentClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accentClass?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border border-l-[3px] bg-secondary/30 px-3 py-2.5", accentClass ? accentClass.replace("text-", "border-l-") : "border-l-primary")}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <p
        className={cn(
          "mt-1 text-xl font-bold tabular-nums text-foreground",
          accentClass
        )}
      >
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}
