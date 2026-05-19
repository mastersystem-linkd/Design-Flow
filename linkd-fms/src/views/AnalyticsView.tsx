import { useState } from "react";
import {
  Lightbulb,
  CheckCircle2,
  Clock,
  RotateCcw,
  AlertTriangle,
  FileText,
  Download,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAnalytics, type Period } from "@/hooks/useAnalytics";
import { useConcepts } from "@/hooks/useConcepts";
import { KpiCard } from "@/components/analytics/KpiCard";
import { VolumeChart } from "@/components/analytics/VolumeChart";
import { PipelineHealth } from "@/components/analytics/PipelineHealth";
import { DesignerLeaderboard } from "@/components/analytics/DesignerLeaderboard";
import { ConceptTurnaround } from "@/components/analytics/ConceptTurnaround";
import { ConceptFunnel } from "@/components/analytics/ConceptFunnel";
import { MdReviewPanel } from "@/components/analytics/MdReviewPanel";
import { DesignerConceptMatrix } from "@/components/analytics/DesignerConceptMatrix";
import { TeamTargetHero } from "@/components/analytics/TeamTargetHero";
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

export function AnalyticsView() {
  const { profile } = useAuth();
  const role: UserRole = profile?.role ?? "designer";
  const isDesigner = role === "designer";

  const [period, setPeriod] = useState<Period>("month");
  const a = useAnalytics(period);
  const { concepts } = useConcepts();
  const canExport = isAdminOrCoordinator(role);

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
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-secondary" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
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
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Lightbulb className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {isDesigner ? "My Concept Performance" : "Concept Dashboard"}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{a.periodLabel}</p>
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

      {/* ── DESIGNER PERSONAL VIEW ── */}
      {isDesigner && myStats ? (
        <>
          {/* Personal monthly progress ring */}
          <Card className="overflow-hidden">
            <CardContent className="py-6">
              <div className="flex flex-col items-center gap-6 sm:flex-row">
                <PersonalTargetRing approved={myStats.approved} target={myStats.target} />
                <div className="flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Your monthly target
                  </p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {myStats.approved} of {myStats.target} concepts approved
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {myStats.approved >= myStats.target
                      ? "🎉 Target met — anything past this is bonus."
                      : myStats.approved >= 1
                      ? `${myStats.target - myStats.approved} more to hit this month's goal.`
                      : "Get one concept across the line to start the streak."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                      {myStats.submitted} submitted
                    </span>
                    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-warning">
                      {myStats.revisions} revision
                    </span>
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
                      {myStats.rejected} rejected
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={<FileText className="h-4 w-4 text-primary" />}
              label="Submitted"
              value={myStats.submitted}
              metric={{ current: myStats.submitted, previous: 0, trend: 0 }}
              tintClass="bg-primary/10"
              to={ROUTES.concepts}
            />
            <KpiCard
              icon={<CheckCircle2 className="h-4 w-4 text-success" />}
              label="Approved"
              value={`${myStats.approved} / ${myStats.target}`}
              metric={{ current: myStats.approved, previous: 0, trend: 0 }}
              tintClass="bg-success/10"
              valueColor={
                myStats.approved >= 3 ? "text-success" : myStats.approved >= 1 ? "text-warning" : "text-destructive"
              }
              to={ROUTES.concepts}
            />
            <KpiCard
              icon={<RotateCcw className="h-4 w-4 text-warning" />}
              label="Revisions"
              value={myStats.revisions}
              metric={{ current: myStats.revisions, previous: 0, trend: 0 }}
              tintClass="bg-warning/10"
              to={ROUTES.concepts}
            />
            <KpiCard
              icon={<Lightbulb className="h-4 w-4 text-primary" />}
              label="Score"
              value={myStats.score}
              metric={{ current: myStats.score, previous: 0, trend: 0 }}
              tintClass="bg-primary/10"
              valueColor={
                myStats.score >= 90 ? "text-success" : myStats.score >= 75 ? "text-warning" : "text-destructive"
              }
            />
          </div>

          <Card>
            <CardContent className="flex flex-col items-center py-8">
              <p className={cn(
                "text-6xl font-bold tabular-nums",
                myStats.score >= 90 ? "text-success" : myStats.score >= 75 ? "text-warning" : "text-destructive"
              )}>
                {myStats.score}
              </p>
              <div className="mt-3 h-3 w-64 overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-[800ms]",
                    myStats.score >= 90 ? "bg-success" : myStats.score >= 75 ? "bg-warning" : "bg-destructive"
                  )}
                  style={{ width: `${myStats.score}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Your concept performance score this {period}
              </p>
            </CardContent>
          </Card>
        </>
      ) : (
        /* ── ADMIN / COORDINATOR VIEW ── */
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={<FileText className="h-4 w-4 text-primary" />}
              label="Concepts Submitted"
              value={a.kpis.totalSubmitted.current}
              metric={a.kpis.totalSubmitted}
              tintClass="bg-primary/10"
              to={ROUTES.concepts}
              sub={`by ${a.designerStats.filter(d => d.submitted > 0).length} designer${a.designerStats.filter(d => d.submitted > 0).length !== 1 ? "s" : ""}`}
            />
            <KpiCard
              icon={<CheckCircle2 className="h-4 w-4 text-success" />}
              label="Approved"
              value={a.kpis.totalApproved.current}
              metric={a.kpis.totalApproved}
              tintClass="bg-success/10"
              to={ROUTES.concepts}
              sub={`${a.kpis.totalApproved.current + (a.statusDistribution.find(s => s.status === "rejected")?.count ?? 0)} reviewed`}
            />
            <KpiCard
              icon={<Clock className="h-4 w-4 text-primary" />}
              label="Approval Rate"
              value={`${a.kpis.approvalRate.current}%`}
              metric={a.kpis.approvalRate}
              tintClass="bg-primary/10"
              valueColor={
                a.kpis.approvalRate.current > 80 ? "text-success" : a.kpis.approvalRate.current < 50 ? "text-destructive" : "text-warning"
              }
              to={ROUTES.concepts}
              sub={`${a.kpis.totalApproved.current}/${a.kpis.totalSubmitted.current} approved`}
            />
            <KpiCard
              icon={<RotateCcw className="h-4 w-4 text-warning" />}
              label="Avg Review Time"
              value={a.kpis.avgApprovalHours.current > 0 ? `${a.kpis.avgApprovalHours.current}h` : "—"}
              metric={a.kpis.avgApprovalHours}
              tintClass="bg-warning/10"
              invertTrend
              valueColor={
                a.kpis.avgApprovalHours.current === 0 ? undefined :
                a.kpis.avgApprovalHours.current < 24 ? "text-success" :
                a.kpis.avgApprovalHours.current < 48 ? "text-warning" : "text-destructive"
              }
              sub="Target: < 24 hours"
            />
          </div>

          {/* Status badges — clickable, ordered by urgency */}
          <div className="flex flex-wrap gap-2">
            <Badge
              className={cn(
                "cursor-pointer border transition-colors hover:opacity-80",
                a.kpis.pendingReview > 2
                  ? "bg-destructive/10 text-destructive border-destructive/20"
                  : "bg-warning/10 text-warning border-warning/20",
                a.kpis.pendingReview > 0 && "animate-pulse"
              )}
              onClick={() => window.location.href = ROUTES.concepts}
            >
              {a.kpis.pendingReview} pending review
            </Badge>
            <Badge
              className="cursor-pointer bg-primary/10 text-primary border border-primary/20 hover:opacity-80"
              onClick={() => window.location.href = ROUTES.concepts}
            >
              {a.kpis.revisionRequested} in revision
            </Badge>
            <Badge
              className="cursor-pointer bg-success/10 text-success border border-success/20 hover:opacity-80"
              onClick={() => window.location.href = ROUTES.concepts}
            >
              {a.funnel.approved} approved
            </Badge>
            <Badge
              className="cursor-pointer bg-secondary text-muted-foreground border border-border hover:opacity-80"
              onClick={() => window.location.href = ROUTES.concepts}
            >
              {a.funnel.finalization} awaiting finalization
            </Badge>
          </div>

          {/* Hero row: Designer matrix + Monthly target */}
          <div className="grid gap-4 xl:grid-cols-5">
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
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <VolumeChart
                data={a.volumeData}
                title={period === "week" ? "Daily Concepts" : period === "quarter" ? "Monthly Concepts" : "Weekly Concepts"}
              />
            </div>
            <PipelineHealth data={a.statusDistribution} />
          </div>

          {/* Concept Pipeline Funnel */}
          <ConceptFunnel
            funnel={a.funnel}
            conversionRates={a.conversionRates}
            oldestPendingDays={a.mdReview.oldestPendingDays}
          />

          {/* MD Review Performance — admin only */}
          {isAdminCheck(role) && (
            <MdReviewPanel stats={a.mdReview} />
          )}

          {/* Leaderboard */}
          <DesignerLeaderboard data={a.designerStats} concepts={concepts} />

          {/* Approval speed */}
          <ConceptTurnaround data={a.approvalSpeed} />
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
