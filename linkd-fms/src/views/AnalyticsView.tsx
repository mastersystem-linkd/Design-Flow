import { useEffect, useRef, useState } from "react";
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
  Clock,
  Sparkles,
  Calendar,
  Palette,
  ArrowUpRight,
} from "lucide-react";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { useAuth } from "@/hooks/useAuth";
import { useAnalytics, type Period } from "@/hooks/useAnalytics";
import { useConcepts } from "@/hooks/useConcepts";
import { MetricCard, type HeroTone } from "@/views/TaskDashboardView";
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
import { exportConceptDashboardExcel } from "@/lib/exportExcel";
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

    void exportConceptDashboardExcel(
      a.designerStats,
      {
        periodLabel: a.periodLabel,
        totalSubmitted: a.kpis.totalSubmitted.current,
        totalApproved: a.kpis.totalApproved.current,
        totalRejected: a.statusDistribution.find((s) => s.status === "rejected")?.count ?? 0,
        totalCompleted: a.kpis.totalCompleted.current,
        approvalRate: a.kpis.approvalRate.current,
        completionRate: a.kpis.completionRate.current,
        avgReviewHours: a.kpis.avgApprovalHours.current,
        pipeline: a.statusDistribution.map((s) => ({
          status: s.status.charAt(0).toUpperCase() + s.status.slice(1).replace(/_/g, " "),
          count: s.count,
          percentage: s.percentage,
        })),
        conversionRates: a.conversionRates,
        workStatus: {
          firstPassRate: a.workStatus.firstPassRate,
          avgRevisionRounds: a.workStatus.avgRevisionRounds,
          avgDesignDays: a.workStatus.avgDesignDays,
          inFlight: a.workStatus.inFlight,
        },
      },
      `linkd-concept-analytics-${period}-${a.periodLabel.replace(/[^a-zA-Z0-9]+/g, "-")}`
    );
  }

  // Keep the latest export handler in a ref. `designerStats.length` never
  // changes once designers load (one row per designer, regardless of concept
  // counts), so the effect below fires only ONCE — while `concepts` is still
  // []. Handing the parent `handleExportReport` directly would freeze it over
  // that empty-data render and export all zeros. The stable wrapper delegates
  // to this ref, which is refreshed every render, so the click always runs
  // against the loaded analytics.
  const exportRef = useRef(handleExportReport);
  exportRef.current = handleExportReport;

  useEffect(() => {
    if (onControlsReady) {
      onControlsReady({
        period,
        setPeriod,
        periodLabel: a.periodLabel,
        onExport: canExport && a.designerStats.length > 0 ? () => exportRef.current() : null,
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
    <div className="space-y-3">
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
                size="icon"
                onClick={handleExportReport}
                className="h-8 w-8"
                title="Export"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            )}
            {/* Segmented control with a sliding pill that springs between
                positions (idea #7). Equal-width grid slots keep the pill
                aligned under each label; reduced-motion makes the slide instant. */}
            <div className="relative grid grid-cols-3 rounded-lg bg-secondary p-1">
              <span
                aria-hidden
                className="absolute inset-y-1 rounded-md bg-primary shadow-sm"
                style={{
                  width: "calc((100% - 0.5rem) / 3)",
                  left: "0.25rem",
                  transform: `translateX(${Math.max(0, PERIODS.findIndex((p) => p.value === period)) * 100}%)`,
                  transition: "transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                }}
              />
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPeriod(p.value)}
                  className={cn(
                    "relative z-10 rounded-md px-3 py-1.5 text-center text-xs font-medium transition-colors duration-200",
                    period === p.value
                      ? "text-white"
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
          period={period}
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
        /* ── ADMIN / COORDINATOR VIEW ──
           key={period} remounts the subtree on Week/Month/Quarter switch so the
           whole dashboard visibly re-staggers in each time. */
        <div key={period} className="space-y-3">
          {/* KPI cards — clean bordered grid (Linear/Vercel idiom), matching
              the rebuilt Task Dashboard hero: high-contrast numerals, trend
              pill, quiet sparkline, subtle hover lift. No divided-cell strip,
              no decorative wrapper — hierarchy from grouping + contrast. */}
          <div className="df-rise grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
            <MetricCard
              tilt
              icon={FileText}
              label="Concepts Submitted"
              tone="primary"
              value={a.kpis.totalSubmitted.current}
              trend={a.kpis.totalSubmitted}
              sparklineData={a.sparklines.submitted}
              sub={`by ${a.designerStats.filter(d => d.submitted > 0).length} designer${a.designerStats.filter(d => d.submitted > 0).length !== 1 ? "s" : ""}`}
              onClick={() => navigate(`${ROUTES.concepts}?tab=all`)}
            />
            <MetricCard
              tilt
              icon={CheckCircle2}
              label="Approved"
              tone={a.kpis.approvalRate.current > 80 ? "success" : a.kpis.approvalRate.current < 50 ? "destructive" : "success"}
              value={a.kpis.totalApproved.current}
              trend={a.kpis.totalApproved}
              sparklineData={a.sparklines.approved}
              sub={`${a.kpis.approvalRate.current}% rate · ${a.kpis.totalApproved.current + (a.statusDistribution.find(s => s.status === "rejected")?.count ?? 0)} reviewed`}
              onClick={() => navigate(`${ROUTES.concepts}?tab=approved`)}
            />
            <MetricCard
              tilt
              icon={PackageCheck}
              label="Completed"
              tone={a.kpis.completionRate.current >= 70 ? "success" : a.kpis.completionRate.current >= 40 ? "warning" : "muted"}
              value={a.kpis.totalCompleted.current}
              trend={a.kpis.totalCompleted}
              sparklineData={a.sparklines.completed}
              sub={a.kpis.totalApproved.current > 0 ? `${a.kpis.completionRate.current}% of approved shipped` : "No approved concepts yet"}
              onClick={() => navigate(`${ROUTES.concepts}?tab=completed`)}
            />
            <MetricCard
              tilt
              icon={RotateCcw}
              label="Avg Review Time"
              tone={a.kpis.avgApprovalHours.current === 0 ? "muted" : a.kpis.avgApprovalHours.current < 24 ? "success" : a.kpis.avgApprovalHours.current < 48 ? "warning" : "destructive"}
              value={a.kpis.avgApprovalHours.current > 0 ? `${a.kpis.avgApprovalHours.current}h` : "—"}
              trend={a.kpis.avgApprovalHours}
              invertTrend
              sparklineData={a.sparklines.avgReviewHours}
              sub="Target: < 24 hours"
              onClick={() => navigate(`${ROUTES.concepts}?tab=pending`)}
            />
          </div>

          {/* ── Concepts Pipeline — review → completion lifecycle ── */}
          <Card className="df-rise relative overflow-hidden" style={{ animationDelay: "90ms" }}>
            {/* faint high-tech grid wash behind the stage tiles */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.5]"
              style={{
                background:
                  "radial-gradient(120% 80% at 100% 0%, rgb(var(--primary)/0.05), transparent 60%)",
              }}
            />
            <CardContent className="relative p-3 sm:p-4">
              <header className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-transparent ring-1 ring-inset ring-primary/15 shadow-glow-soft">
                    <PipelineCube />
                  </span>
                  <div className="leading-tight">
                    <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Concepts Pipeline</h3>
                    <p className="text-[11px] font-medium text-muted-foreground">Review → completion lifecycle</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {a.conversionRates.reviewedToApproved > 0 && (
                    <span className="hidden text-[11px] font-medium text-muted-foreground sm:inline">
                      {a.conversionRates.reviewedToApproved}% approval rate
                    </span>
                  )}
                  <Badge className="bg-primary/10 text-primary border border-primary/20">
                    {a.workStatus.inFlight} in flight
                  </Badge>
                </div>
              </header>

              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 sm:gap-3 xl:grid-cols-6">
                {/* First-time MD review queue. Sits at the front of the strip
                    because nothing else in the pipeline moves until these
                    are decided. */}
                <WorkPill
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Pending Approval"
                  value={a.funnel.underReview}
                  tone="warning"
                  href={`${ROUTES.concepts}?tab=pending`}
                />
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
                <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-border pt-2.5 sm:grid-cols-3 sm:gap-2 xl:grid-cols-6">
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

          {/* Charts + Pipeline — compact 2-col row */}
          <div className="df-rise grid gap-2.5 lg:grid-cols-3" style={{ animationDelay: "180ms" }}>
            <div className="lg:col-span-2">
              <VolumeChart
                data={a.volumeData}
                title={period === "week" ? "Daily Concepts" : period === "quarter" ? "Monthly Concepts" : "Weekly Concepts"}
              />
            </div>
            <PipelineHealth data={a.statusDistribution} />
          </div>

          {/* MD Review + Monthly Concept Target — side by side, split 40/60
              (2:3 of a 5-col grid). MD Review stretches to match the taller
              Target card. When MD Review is hidden (designers), Target spans
              the full row. */}
          <div className="df-rise grid items-stretch gap-2.5 lg:grid-cols-5" style={{ animationDelay: "270ms" }}>
            {isAdminCheck(role) && (
              <div className="h-full lg:col-span-2">
                <MdReviewPanel stats={a.mdReview} />
              </div>
            )}
            <div className={isAdminCheck(role) ? "lg:col-span-3" : "lg:col-span-5"}>
              <TeamTargetHero
                data={a.targetRace}
                periodStart={a.periodStart}
                periodEnd={a.periodEnd}
              />
            </div>
          </div>

          {/* Designer Leaderboard — single source of per-designer performance */}
          <div className="df-rise" style={{ animationDelay: "360ms" }}>
            <DesignerLeaderboard data={a.designerStats} concepts={concepts} />
          </div>
        </div>
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
        {Array.from({ length: target }, (_, i) => i + 1).map((m) => {
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

// A small, always-on 3D cube (pure CSS 3D — no three.js) for the pipeline
// header. Continuously rotates for an elegant, minimal "high-tech" accent;
// freezes under prefers-reduced-motion. Scoped <style> keeps it self-contained.
function PipelineCube() {
  return (
    <div className="cp-cube-scene" aria-hidden>
      <style>{`
        .cp-cube-scene { width: 30px; height: 30px; perspective: 140px; }
        .cp-cube {
          position: relative; width: 30px; height: 30px;
          transform-style: preserve-3d;
          animation: cp-cube-spin 9s linear infinite;
          will-change: transform;
        }
        .cp-cube-face {
          position: absolute; inset: 0; border-radius: 5px;
          border: 1px solid rgb(var(--primary) / 0.55);
          background: linear-gradient(135deg, rgb(var(--primary) / 0.18), rgb(var(--primary) / 0.04));
          box-shadow: inset 0 0 8px rgb(var(--primary) / 0.18);
        }
        .cp-cf-front  { transform: translateZ(15px); }
        .cp-cf-back   { transform: rotateY(180deg) translateZ(15px); }
        .cp-cf-right  { transform: rotateY(90deg)  translateZ(15px); }
        .cp-cf-left   { transform: rotateY(-90deg) translateZ(15px); }
        .cp-cf-top    { transform: rotateX(90deg)  translateZ(15px); }
        .cp-cf-bottom { transform: rotateX(-90deg) translateZ(15px); }
        @keyframes cp-cube-spin {
          from { transform: rotateX(-22deg) rotateY(0deg); }
          to   { transform: rotateX(-22deg) rotateY(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .cp-cube { animation: none; transform: rotateX(-22deg) rotateY(-32deg); }
        }
      `}</style>
      <div className="cp-cube">
        <span className="cp-cube-face cp-cf-front" />
        <span className="cp-cube-face cp-cf-back" />
        <span className="cp-cube-face cp-cf-right" />
        <span className="cp-cube-face cp-cf-left" />
        <span className="cp-cube-face cp-cf-top" />
        <span className="cp-cube-face cp-cf-bottom" />
      </div>
    </div>
  );
}

// Pipeline stage tile — a minimalist "3D" card: it tilts toward the cursor
// (perspective + parallax depth on the inner layers) and lifts with a soft
// tone-tinted glow. Motion is cursor-driven and fully skipped under
// prefers-reduced-motion; the count-up self-disables there too.
const STAGE_TONES: Record<
  string,
  { text: string; ring: string; chip: string; glow: string; accent: string }
> = {
  muted: {
    text: "text-muted-foreground",
    ring: "ring-border",
    chip: "bg-muted/30 text-muted-foreground",
    glow: "rgb(var(--muted-foreground)/0.20)",
    accent: "from-muted-foreground/40 to-transparent",
  },
  primary: {
    text: "text-primary",
    ring: "ring-primary/25",
    chip: "bg-primary/10 text-primary",
    glow: "rgb(var(--primary)/0.30)",
    accent: "from-primary to-primary/20",
  },
  warning: {
    text: "text-warning",
    ring: "ring-warning/25",
    chip: "bg-warning/10 text-warning",
    glow: "rgb(var(--warning)/0.30)",
    accent: "from-warning to-warning/20",
  },
  destructive: {
    text: "text-destructive",
    ring: "ring-destructive/25",
    chip: "bg-destructive/10 text-destructive",
    glow: "rgb(var(--destructive)/0.30)",
    accent: "from-destructive to-destructive/20",
  },
  success: {
    text: "text-success",
    ring: "ring-success/25",
    chip: "bg-success/10 text-success",
    glow: "rgb(var(--success)/0.30)",
    accent: "from-success to-success/20",
  },
};

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
  const ref = useRef<HTMLButtonElement>(null);
  const animated = useAnimatedNumber(value);
  const t = STAGE_TONES[tone];

  const handleMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(620px) rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 7).toFixed(2)}deg) translateY(-3px)`;
  };
  const handleLeave = () => {
    if (ref.current) ref.current.style.transform = "";
  };

  return (
    <button
      ref={ref}
      type="button"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={() => navigate(href)}
      style={{
        transformStyle: "preserve-3d",
        transition: "transform 280ms cubic-bezier(.16,1,.3,1), box-shadow 280ms ease",
        ["--stage-glow" as string]: t.glow,
      }}
      className={cn(
        "group relative isolate flex flex-col gap-2 overflow-hidden rounded-xl border border-border bg-card px-3 py-2.5 text-left outline-none ring-1 ring-inset",
        "shadow-sm hover:shadow-[0_14px_34px_-16px_var(--stage-glow)] focus-visible:ring-2 focus-visible:ring-primary/40",
        t.ring
      )}
    >
      {/* top accent line */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r opacity-70",
          t.accent
        )}
      />
      {/* corner glow that lights up on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-7 -top-9 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: t.glow }}
      />
      {/* icon chip + label (lifted slightly in 3D space) */}
      <div className="relative flex items-center gap-2" style={{ transform: "translateZ(18px)" }}>
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset transition-transform duration-300 group-hover:scale-110",
            t.chip,
            t.ring
          )}
        >
          {icon}
        </span>
        <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      {/* value (lifted further forward for parallax depth) */}
      <div className="relative flex items-end justify-between" style={{ transform: "translateZ(34px)" }}>
        <span className={cn("text-2xl font-bold leading-none tabular-nums", t.text)}>
          {animated}
        </span>
        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground/60" />
      </div>
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
    <div className={cn("min-w-0 rounded-lg border border-border border-l-[3px] bg-secondary/30 px-2 py-2 sm:px-2.5", accentClass ? accentClass.replace("text-", "border-l-") : "border-l-primary")}>
      <div className="flex items-start gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span className="leading-tight">{label}</span>
      </div>
      <p
        className={cn(
          "mt-0.5 text-lg font-bold tabular-nums leading-none text-foreground sm:text-xl",
          accentClass
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{sub}</p>
    </div>
  );
}
