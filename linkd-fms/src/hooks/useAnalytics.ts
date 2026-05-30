import { useMemo } from "react";
import {
  startOfWeek, startOfMonth, startOfQuarter,
  endOfWeek, endOfMonth, endOfQuarter,
  startOfDay, endOfDay, addDays, addWeeks,
  subWeeks, subMonths, subQuarters,
  format, differenceInHours, isWithinInterval, parseISO,
} from "date-fns";
import { useConcepts } from "@/hooks/useConcepts";
import { useProfiles } from "@/hooks/useProfiles";
import { useDesignerCodes } from "@/hooks/useDesignerCodes";
import {
  isCompleted as conceptIsCompleted,
  isApprovedAwaitingFinalisation,
  countRevisionCycles,
  sumRevisionCycles,
} from "@/lib/conceptStatus";
import type { ConceptWithRelations } from "@/types/database";

// ============================================================================
// Types
// ============================================================================

export type Period = "week" | "month" | "quarter";

export interface KpiMetric {
  current: number;
  previous: number;
  trend: number;
}

export interface StatusDistribution {
  status: string;
  count: number;
  percentage: number;
}

export interface VolumePoint {
  label: string;
  submitted: number;
  approved: number;
  rejected: number;
}

export interface DesignerConceptStat {
  id: string;
  full_name: string;
  avatar_url: string | null;
  designerCode: string;
  submitted: number;
  approved: number;
  rejected: number;
  /**
   * Concepts currently in `revision_requested` state. This is the LIVE count,
   * not the historical cycle count — see `revisionCycles` for the true
   * "how many times revisions were requested across this designer's work".
   */
  revisions: number;
  /**
   * Total revision cycles tallied across the designer's submissions from
   * `completion_history`. A concept revised twice and then approved
   * contributes 2 cycles. More accurate than `revisions` for workload.
   */
  revisionCycles: number;
  /**
   * Concepts that completed the whole loop (MD approval → designer done →
   * final approval). Subset of `approved`.
   */
  completed: number;
  /**
   * Of the approved concepts, what % made it all the way to completion.
   * 0–100. Highlights designers who get approval but stall on finalisation.
   */
  completionRate: number;
  avgApprovalHours: number;
  target: number; // monthly target (3)
  score: number;
}

export interface ApprovalSpeedItem {
  month: string;
  avgHours: number;
}

export interface FunnelData {
  submitted: number;
  underReview: number;
  decided: number;
  approved: number;
  rejected: number;
  revision: number;
  finalization: number;
  completed: number;
}

export interface ConversionRates {
  submittedToReviewed: number;
  reviewedToApproved: number;
}

export interface MdReviewStats {
  avgHours: number;
  approvedCount: number;
  rejectedCount: number;
  revisionCount: number;
  pendingCount: number;
  oldestPendingDays: number;
  reviewsPerWeek: number;
}

export interface TargetRaceEntry {
  id: string;
  name: string;
  avatarUrl: string | null;
  approvedCount: number;
  isOnTarget: boolean;
  designerCode: string;
}

export interface ConceptDashboardMetrics {
  kpis: {
    totalSubmitted: KpiMetric;
    totalApproved: KpiMetric;
    /**
     * Fully-shipped concepts in the period. Subset of approved — requires
     * designer-done + final-approval stamps. New top-line KPI.
     */
    totalCompleted: KpiMetric;
    approvalRate: KpiMetric;
    /**
     * Approved → completed conversion rate this period (0–100). Surfaces
     * concepts stuck waiting on designer/MD finalisation.
     */
    completionRate: KpiMetric;
    avgApprovalHours: KpiMetric;
    pendingReview: number;
    revisionRequested: number;
    /** True revision cycles tallied across all concepts (from completion_history). */
    revisionCyclesAllTime: number;
    /** Approved-but-not-finalised cohort, across all concepts (not just period). */
    awaitingFinalisation: number;
    distinctSubmitters: number;
    reviewedCount: number;
  };
  /**
   * Work-status lifecycle KPIs (added with migration 0026). Drawn from the
   * post-approval pipeline columns (`work_status`, `hold_count`,
   * `revision_count`, etc.). Counts are across ALL approved concepts, not
   * period-scoped, so the dashboard reflects the live pipeline.
   */
  workStatus: {
    /** Approved concepts the designer hasn't started yet. Legacy — 0029
     *  auto-starts work on MD approval, so this is ~always 0 for new rows. */
    notStarted: number;
    /** Active concepts (in_progress + on_hold + in_revision). */
    inFlight: number;
    /** Designer is paused — admins should see this. */
    onHold: number;
    /** Sitting in MD's design-review inbox. */
    inRevision: number;
    /** Legacy — 0030 collapsed changes_requested into in_progress, so this
     *  is ~always 0 for new rows. Kept exposed for any pre-0030 rows. */
    changesRequested: number;
    /** Fully completed. */
    completed: number;
    /** MD-rejected concepts (md_status='rejected') — terminal, no work pipeline. */
    rejected: number;
    /**
     * First-pass approval rate — % of completed concepts that finished with
     * exactly one revision round. Higher = designers nail it first try.
     * Returns null when there are no completed concepts.
     */
    firstPassRate: number | null;
    /**
     * Average revision rounds across completed concepts. 1 = nailed first
     * time; higher = more cycles. Returns null when no completed concepts.
     */
    avgRevisionRounds: number | null;
    /**
     * Average actual working days for completed concepts
     * (`work_completed_at - work_started_at - total_hold_duration`).
     * Returns null when no completed concepts.
     */
    avgDesignDays: number | null;
    /** % of in-flight concepts that have been held at least once. */
    holdRate: number | null;
    /** Total hold events across all concepts (sum of `hold_count`). */
    totalHolds: number;
    /**
     * Avg hours from MD approval (`md_actual_date`) to designer kickoff
     * (`work_started_at`). Lower = designers pick up faster. Null when no
     * approved concept has been started yet.
     */
    avgTimeToStartHours: number | null;
    /**
     * Avg hours from designer marking done to MD's final verdict
     * (work_completed_at − last `marked_done` event from `completion_history`).
     * Lower = MD reviews fast. Null when no rows have completed the loop.
     */
    avgReviewTurnaroundHours: number | null;
  };
  statusDistribution: StatusDistribution[];
  volumeData: VolumePoint[];
  designerStats: DesignerConceptStat[];
  approvalSpeed: ApprovalSpeedItem[];
  funnel: FunnelData;
  conversionRates: ConversionRates;
  mdReview: MdReviewStats;
  targetRace: TargetRaceEntry[];
  sparklines: {
    submitted: number[];
    approved: number[];
    completed: number[];
    approvalRate: number[];
    avgReviewHours: number[];
  };
  periodStart: Date;
  periodEnd: Date;
  periodLabel: string;
  isLoading: boolean;
  error: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

const MONTHLY_TARGET = 2;

function getPeriodRange(period: Period, now: Date) {
  switch (period) {
    case "week":
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
        prevStart: startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
        prevEnd: endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
      };
    case "quarter":
      return {
        start: startOfQuarter(now),
        end: endOfQuarter(now),
        prevStart: startOfQuarter(subQuarters(now, 1)),
        prevEnd: endOfQuarter(subQuarters(now, 1)),
      };
    default:
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
        prevStart: startOfMonth(subMonths(now, 1)),
        prevEnd: endOfMonth(subMonths(now, 1)),
      };
  }
}

function inRange(dateStr: string | null | undefined, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  try {
    return isWithinInterval(parseISO(dateStr), { start, end });
  } catch {
    return false;
  }
}

function calcTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 999 : 0;
  return Math.max(-999, Math.min(999, Math.round(((current - previous) / previous) * 100)));
}

function safeAvg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function approvalHours(c: ConceptWithRelations): number | null {
  const reviewDate = c.md_actual_date ?? c.md_reviewed_at;
  if (!reviewDate || !c.created_at) return null;
  const h = differenceInHours(parseISO(reviewDate), parseISO(c.created_at));
  return h >= 0 ? h : null;
}

// ============================================================================
// Hook
// ============================================================================

export function useAnalytics(period: Period = "month"): ConceptDashboardMetrics {
  const { concepts, isLoading: conceptsLoading, error: conceptsError } = useConcepts();
  const { profiles } = useProfiles({ roles: ["designer"] });
  const { codesByProfile } = useDesignerCodes();

  const isLoading = conceptsLoading;
  const error = conceptsError || null;

  const now = useMemo(() => new Date(), []);
  const { start, end, prevStart, prevEnd } = useMemo(
    () => getPeriodRange(period, now),
    [period, now]
  );

  const periodLabel = useMemo(
    () => `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`,
    [start, end]
  );

  // ── KPIs ──────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const curr = concepts.filter((c) => inRange(c.created_at, start, end));
    const prev = concepts.filter((c) => inRange(c.created_at, prevStart, prevEnd));

    const currApproved = curr.filter((c) => c.md_status === "approved").length;
    const prevApproved = prev.filter((c) => c.md_status === "approved").length;

    // Completion: a strict subset of approved. We count concepts created in
    // the period that ended up fully shipped (regardless of when the final
    // approval landed) so the dashboard reads "cohort progress", not "ship
    // events that happened to fall in the period".
    const currCompleted = curr.filter(conceptIsCompleted).length;
    const prevCompleted = prev.filter(conceptIsCompleted).length;
    const currCompletionRate = currApproved > 0
      ? Math.round((currCompleted / currApproved) * 100) : 0;
    const prevCompletionRate = prevApproved > 0
      ? Math.round((prevCompleted / prevApproved) * 100) : 0;

    const currReviewed = curr.filter((c) => c.md_status !== "pending");
    const prevReviewed = prev.filter((c) => c.md_status !== "pending");

    const currApprovalRate = currReviewed.length > 0
      ? Math.round((currApproved / currReviewed.length) * 100) : 0;
    const prevApprovalRate = prevReviewed.length > 0
      ? Math.round((prevApproved / prevReviewed.length) * 100) : 0;

    const currHours = curr.map(approvalHours).filter((h): h is number => h !== null);
    const prevHours = prev.map(approvalHours).filter((h): h is number => h !== null);

    return {
      totalSubmitted: {
        current: curr.length,
        previous: prev.length,
        trend: calcTrend(curr.length, prev.length),
      },
      totalApproved: {
        current: currApproved,
        previous: prevApproved,
        trend: calcTrend(currApproved, prevApproved),
      },
      totalCompleted: {
        current: currCompleted,
        previous: prevCompleted,
        trend: calcTrend(currCompleted, prevCompleted),
      },
      approvalRate: {
        current: currApprovalRate,
        previous: prevApprovalRate,
        trend: calcTrend(currApprovalRate, prevApprovalRate),
      },
      completionRate: {
        current: currCompletionRate,
        previous: prevCompletionRate,
        trend: calcTrend(currCompletionRate, prevCompletionRate),
      },
      avgApprovalHours: {
        current: safeAvg(currHours),
        previous: safeAvg(prevHours),
        trend: calcTrend(safeAvg(currHours), safeAvg(prevHours)),
      },
      pendingReview: concepts.filter((c) => c.md_status === "pending").length,
      revisionRequested: concepts.filter((c) => c.md_status === "revision_requested").length,
      revisionCyclesAllTime: sumRevisionCycles(concepts),
      awaitingFinalisation: concepts.filter(isApprovedAwaitingFinalisation).length,
      distinctSubmitters: new Set(curr.map((c) => c.submitted_by)).size,
      reviewedCount: currReviewed.length,
    };
  }, [concepts, start, end, prevStart, prevEnd]);

  // ── Work-status lifecycle KPIs (post-approval pipeline) ────────────
  //
  // Snapshot across ALL approved concepts — the work-status pipeline isn't
  // period-scoped because the designer board needs the live state, not a
  // rolling window. The `firstPassRate` etc. derivatives ARE period-agnostic
  // for the same reason: they describe the team's overall quality bar.

  const workStatus = useMemo(() => {
    const approved = concepts.filter((c) => c.md_status === "approved");
    const rejected = concepts.filter((c) => c.md_status === "rejected").length;

    const buckets = {
      notStarted: approved.filter((c) => c.work_status === "not_started").length,
      inProgress: approved.filter((c) => c.work_status === "in_progress").length,
      onHold: approved.filter((c) => c.work_status === "on_hold").length,
      inRevision: approved.filter((c) => c.work_status === "in_revision").length,
      changesRequested: approved.filter((c) => c.work_status === "changes_requested").length,
      completed: approved.filter((c) => c.work_status === "completed").length,
    };

    // "In flight" = anything actively in the pipeline (not Ready/legacy,
    // not Completed). `changesRequested` survives in the formula so any
    // legacy pre-0030 row still counts as in-flight.
    const inFlight =
      buckets.inProgress +
      buckets.onHold +
      buckets.inRevision +
      buckets.changesRequested;

    // First-pass rate — `revision_count == 1` means designer marked done once
    // and MD approved without sending it back. Anything > 1 = had to rework.
    const completedRows = approved.filter((c) => c.work_status === "completed");
    const firstPass = completedRows.filter(
      (c) => (c.revision_count ?? 0) === 1
    ).length;
    const firstPassRate = completedRows.length
      ? Math.round((firstPass / completedRows.length) * 100)
      : null;

    // Avg revision rounds — mean of revision_count among completed rows.
    const avgRevisionRounds = completedRows.length
      ? Number(
          (
            completedRows.reduce(
              (sum, c) => sum + (c.revision_count ?? 1),
              0
            ) / completedRows.length
          ).toFixed(1)
        )
      : null;

    // Avg design days — (completed_at - started_at) - total_hold_duration,
    // averaged across completed rows. Hold-aware so heavy-hold designers
    // aren't unfairly tagged as slow.
    const designDayValues = completedRows
      .map((c) => {
        if (!c.work_started_at || !c.work_completed_at) return null;
        const start = new Date(c.work_started_at).getTime();
        const end = new Date(c.work_completed_at).getTime();
        if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
        const elapsedMs = end - start;
        const holdSeconds = parseIntervalToSecondsLocal(c.total_hold_duration);
        const workingMs = Math.max(0, elapsedMs - holdSeconds * 1000);
        return workingMs / 86_400_000; // → days
      })
      .filter((v): v is number => v !== null);
    const avgDesignDays = designDayValues.length
      ? Number(
          (
            designDayValues.reduce((a, b) => a + b, 0) / designDayValues.length
          ).toFixed(1)
        )
      : null;

    // Hold rate — fraction of in-flight concepts that have been held ≥ once.
    // High value = designers context-switching too much / urgent work
    // displacing committed work.
    const inFlightRows = approved.filter(
      (c) =>
        c.work_status === "in_progress" ||
        c.work_status === "on_hold" ||
        c.work_status === "in_revision" ||
        c.work_status === "changes_requested"
    );
    const heldAtLeastOnce = inFlightRows.filter(
      (c) => (c.hold_count ?? 0) > 0
    ).length;
    const holdRate = inFlightRows.length
      ? Math.round((heldAtLeastOnce / inFlightRows.length) * 100)
      : null;

    const totalHolds = approved.reduce(
      (sum, c) => sum + (c.hold_count ?? 0),
      0
    );

    // Time-to-Start — hours between MD approval (`md_actual_date` stored
    // as yyyy-MM-dd) and the designer's kickoff (`work_started_at`).
    const ttsValues = approved
      .map((c) => {
        if (!c.md_actual_date || !c.work_started_at) return null;
        const approvedAt = new Date(c.md_actual_date).getTime();
        const startedAt = new Date(c.work_started_at).getTime();
        if (
          Number.isNaN(approvedAt) ||
          Number.isNaN(startedAt) ||
          startedAt < approvedAt
        ) {
          return null;
        }
        return (startedAt - approvedAt) / 3_600_000;
      })
      .filter((v): v is number => v !== null);
    const avgTimeToStartHours = ttsValues.length
      ? Number(
          (ttsValues.reduce((a, b) => a + b, 0) / ttsValues.length).toFixed(1)
        )
      : null;

    // Review-Turnaround — hours from designer's most recent `marked_done`
    // event (read from completion_history) to MD's verdict
    // (`work_completed_at`). Rows from before this lifecycle existed have no
    // `marked_done` entry and skip naturally.
    const rtValues = completedRows
      .map((c) => {
        if (!c.work_completed_at) return null;
        const history = Array.isArray(c.completion_history)
          ? c.completion_history
          : [];
        const markedDone = [...history]
          .reverse()
          .find((e) => e?.type === "marked_done");
        if (!markedDone?.date) return null;
        const sentAt = new Date(markedDone.date).getTime();
        const closedAt = new Date(c.work_completed_at).getTime();
        if (
          Number.isNaN(sentAt) ||
          Number.isNaN(closedAt) ||
          closedAt < sentAt
        ) {
          return null;
        }
        return (closedAt - sentAt) / 3_600_000;
      })
      .filter((v): v is number => v !== null);
    const avgReviewTurnaroundHours = rtValues.length
      ? Number(
          (rtValues.reduce((a, b) => a + b, 0) / rtValues.length).toFixed(1)
        )
      : null;

    return {
      notStarted: buckets.notStarted,
      inFlight,
      onHold: buckets.onHold,
      inRevision: buckets.inRevision,
      changesRequested: buckets.changesRequested,
      completed: buckets.completed,
      rejected,
      firstPassRate,
      avgRevisionRounds,
      avgDesignDays,
      holdRate,
      totalHolds,
      avgTimeToStartHours,
      avgReviewTurnaroundHours,
    };
  }, [concepts]);

  // ── Status distribution ───────────────────────────────────────────

  const statusDistribution = useMemo(() => {
    const statuses = ["pending", "approved", "rejected", "revision_requested"];
    const total = concepts.length || 1;
    return statuses.map((s) => {
      const count = concepts.filter((c) => c.md_status === s).length;
      return { status: s, count, percentage: Math.round((count / total) * 100) };
    });
  }, [concepts]);

  // ── Volume data (adapts: days for week, weeks for month, months for quarter) ──

  const volumeData = useMemo(() => {
    const points: VolumePoint[] = [];
    if (period === "week") {
      for (let i = 0; i < 7; i++) {
        const d = addDays(start, i);
        const ds = startOfDay(d);
        const de = endOfDay(d);
        const inDay = concepts.filter((c) => inRange(c.created_at, ds, de));
        points.push({
          label: format(d, "EEE"),
          submitted: inDay.length,
          approved: inDay.filter((c) => c.md_status === "approved").length,
          rejected: inDay.filter((c) => c.md_status === "rejected").length,
        });
      }
    } else if (period === "month") {
      let cursor = startOfWeek(start, { weekStartsOn: 1 });
      let weekNum = 1;
      while (cursor <= end && weekNum <= 6) {
        const ws = cursor < start ? start : cursor;
        const we = endOfWeek(cursor, { weekStartsOn: 1 });
        const weekEnd = we > end ? end : we;
        const inWeek = concepts.filter((c) => inRange(c.created_at, ws, weekEnd));
        points.push({
          label: `W${weekNum}`,
          submitted: inWeek.length,
          approved: inWeek.filter((c) => c.md_status === "approved").length,
          rejected: inWeek.filter((c) => c.md_status === "rejected").length,
        });
        cursor = addWeeks(cursor, 1);
        weekNum++;
      }
    } else {
      // Quarter: iterate actual months within the quarter
      let cursor = startOfMonth(start);
      while (cursor <= end) {
        const ms = startOfMonth(cursor);
        const me = endOfMonth(cursor);
        const inMonth = concepts.filter((c) => inRange(c.created_at, ms, me));
        points.push({
          label: format(ms, "MMM"),
          submitted: inMonth.length,
          approved: inMonth.filter((c) => c.md_status === "approved").length,
          rejected: inMonth.filter((c) => c.md_status === "rejected").length,
        });
        cursor = addDays(me, 1);
      }
    }
    return points;
  }, [concepts, period, start, end]);

  // ── Designer concept stats ────────────────────────────────────────

  const designerStats = useMemo(() => {
    const stats: DesignerConceptStat[] = profiles.map((p) => {
      const mine = concepts.filter(
        (c) => c.submitted_by === p.id && inRange(c.created_at, start, end)
      );
      const approved = mine.filter((c) => c.md_status === "approved").length;
      const rejected = mine.filter((c) => c.md_status === "rejected").length;
      const revisions = mine.filter((c) => c.md_status === "revision_requested").length;
      const completed = mine.filter(conceptIsCompleted).length;
      const completionRate = approved > 0
        ? Math.round((completed / approved) * 100) : 0;
      const revisionCycles = mine.reduce(
        (sum, c) => sum + countRevisionCycles(c),
        0
      );

      const hours = mine.map(approvalHours).filter((h): h is number => h !== null);

      const codes = codesByProfile.get(p.id);
      const designerCode = codes?.[0]?.code?.slice(0, 1) ?? "—";

      return {
        id: p.id,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        designerCode,
        submitted: mine.length,
        approved,
        rejected,
        revisions,
        revisionCycles,
        completed,
        completionRate,
        avgApprovalHours: safeAvg(hours),
        target: MONTHLY_TARGET,
        score: 0,
      };
    });

    // Score formula unchanged on purpose — we use the new fields for surfaces
    // (KPI tiles, leaderboard footnotes) without retroactively shifting ranks.
    // Volume (30) + approval rate (35) + speed (20) + low revision (15).
    // `revisions` here is the live "currently in revision" count; using the
    // truer cycle count would penalise designers for already-resolved
    // revisions which arguably isn't the intent of this dial.
    const maxSubmitted = Math.max(1, ...stats.map((s) => s.submitted));
    for (const s of stats) {
      if (s.submitted === 0) { s.score = 0; continue; }
      const vol = (s.submitted / maxSubmitted) * 30;
      const appRate = (s.approved / s.submitted) * 35;
      const speed = Math.max(0, (48 - s.avgApprovalHours) / 48) * 20; // faster approval = better
      const lowRev = Math.max(0, 1 - s.revisions / s.submitted) * 15;
      s.score = Math.round(vol + appRate + speed + lowRev);
    }

    stats.sort((a, b) => b.score - a.score);
    return stats;
  }, [concepts, profiles, codesByProfile, start, end]);

  // ── Approval speed (last 6 months) ────────────────────────────────

  const approvalSpeed = useMemo(() => {
    const items: ApprovalSpeedItem[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i);
      const ms = startOfMonth(d);
      const me = endOfMonth(d);
      const reviewed = concepts.filter(
        (c) => c.md_status !== "pending" && inRange(c.md_actual_date ?? c.md_reviewed_at ?? c.updated_at, ms, me)
      );
      const hours = reviewed.map(approvalHours).filter((h): h is number => h !== null);
      items.push({
        month: format(d, "MMM"),
        avgHours: safeAvg(hours),
      });
    }
    return items;
  }, [concepts, now]);

  // ── Funnel data ────────────────────────────────────────────────────

  const funnel = useMemo((): FunnelData => {
    const monthConcepts = concepts.filter((c) => inRange(c.created_at, start, end));
    const submitted = monthConcepts.length;
    const underReview = monthConcepts.filter((c) => c.md_status === "pending").length;
    const approved = monthConcepts.filter((c) => c.md_status === "approved").length;
    const rejected = monthConcepts.filter((c) => c.md_status === "rejected").length;
    const revision = monthConcepts.filter((c) => c.md_status === "revision_requested").length;
    const decided = approved + rejected + revision;
    // "Finalisation" = MD-approved but still waiting on designer-done OR
    // MD's post-handoff final approval. "Completed" = both stamps present.
    const finalization = monthConcepts.filter(isApprovedAwaitingFinalisation).length;
    const completed = monthConcepts.filter(conceptIsCompleted).length;
    return { submitted, underReview, decided, approved, rejected, revision, finalization, completed };
  }, [concepts, start, end]);

  // ── Conversion rates ──────────────────────────────────────────────

  const conversionRates = useMemo((): ConversionRates => {
    const reviewed = funnel.decided;
    return {
      submittedToReviewed: funnel.submitted > 0 ? Math.round((reviewed / funnel.submitted) * 100) : 0,
      reviewedToApproved: reviewed > 0 ? Math.round((funnel.approved / reviewed) * 100) : 0,
    };
  }, [funnel]);

  // ── MD review stats ───────────────────────────────────────────────

  const mdReview = useMemo((): MdReviewStats => {
    const pending = concepts.filter((c) => c.md_status === "pending");
    const nowMs = Date.now();
    const oldestPendingDays = pending.length > 0
      ? Math.floor(Math.max(...pending.map((c) => (nowMs - new Date(c.created_at).getTime()) / 86400000)))
      : 0;

    const reviewed = concepts.filter(
      (c) => c.md_status !== "pending" && inRange(c.created_at, start, end)
    );
    const hours = reviewed.map(approvalHours).filter((h): h is number => h !== null);

    // Reviews per week this period
    const periodDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
    const reviewsPerWeek = reviewed.length > 0 ? Math.round((reviewed.length / periodDays) * 7 * 10) / 10 : 0;

    return {
      avgHours: safeAvg(hours),
      approvedCount: reviewed.filter((c) => c.md_status === "approved").length,
      rejectedCount: reviewed.filter((c) => c.md_status === "rejected").length,
      revisionCount: reviewed.filter((c) => c.md_status === "revision_requested").length,
      pendingCount: pending.length,
      oldestPendingDays,
      reviewsPerWeek,
    };
  }, [concepts, start, end]);

  // ── Target race ───────────────────────────────────────────────────

  const targetRace = useMemo((): TargetRaceEntry[] => {
    return profiles
      .map((p) => {
        const mine = concepts.filter(
          (c) => c.submitted_by === p.id && inRange(c.created_at, start, end)
        );
        const approvedCount = mine.filter((c) => c.md_status === "approved").length;
        const codes = codesByProfile.get(p.id);
        return {
          id: p.id,
          name: p.full_name,
          avatarUrl: p.avatar_url,
          approvedCount,
          isOnTarget: approvedCount >= MONTHLY_TARGET,
          designerCode: codes?.[0]?.code?.slice(0, 1) ?? "—",
        };
      })
      .sort((a, b) => b.approvedCount - a.approvedCount || a.name.localeCompare(b.name));
  }, [concepts, profiles, codesByProfile, start, end]);

  // ── Sparkline data (7 points across current period) ──────────────
  const sparklines = useMemo(() => {
    const buckets = 7;
    const span = end.getTime() - start.getTime();
    const step = span / buckets;

    const submitted: number[] = [];
    const approved: number[] = [];
    const completed: number[] = [];
    const approvalRate: number[] = [];
    const avgReviewHours: number[] = [];

    for (let i = 0; i < buckets; i++) {
      const bStart = new Date(start.getTime() + i * step);
      const bEnd = new Date(start.getTime() + (i + 1) * step);

      const submittedInBucket = concepts.filter((c) =>
        inRange(c.created_at, bStart, bEnd)
      );
      const reviewedInBucket = concepts.filter((c) =>
        inRange(c.md_reviewed_at ?? c.md_actual_date, bStart, bEnd)
      );
      const approvedInBucket = reviewedInBucket.filter(
        (c) => c.md_status === "approved"
      );
      const completedInBucket = concepts.filter(
        (c) =>
          conceptIsCompleted(c) &&
          inRange(c.designer_actual_date ?? c.final_approved_at, bStart, bEnd)
      );

      submitted.push(submittedInBucket.length);
      approved.push(approvedInBucket.length);
      completed.push(completedInBucket.length);

      // Approval-rate spark: % approved out of reviewed in this bucket.
      // Falls back to 0 if no reviews happened (keeps the line continuous).
      approvalRate.push(
        reviewedInBucket.length > 0
          ? Math.round((approvedInBucket.length / reviewedInBucket.length) * 100)
          : 0
      );

      // Avg review hours for concepts reviewed in this bucket.
      const hours = reviewedInBucket
        .map(approvalHours)
        .filter((h): h is number => h !== null);
      avgReviewHours.push(
        hours.length > 0
          ? Math.round(hours.reduce((a, b) => a + b, 0) / hours.length)
          : 0
      );
    }

    return { submitted, approved, completed, approvalRate, avgReviewHours };
  }, [concepts, start, end]);

  return {
    kpis,
    workStatus,
    statusDistribution,
    volumeData,
    designerStats,
    approvalSpeed,
    funnel,
    conversionRates,
    mdReview,
    targetRace,
    sparklines,
    periodStart: start,
    periodEnd: end,
    periodLabel,
    isLoading,
    error,
  };
}

// ============================================================================
// Helpers (work-status KPIs)
// ============================================================================

/**
 * Loose interval-to-seconds parser. Postgres returns `interval` columns in
 * either ISO 8601 ("PT5025S"), HH:MM:SS ("01:23:45"), or numeric-string
 * ("5025") shapes depending on the rest config. Mirrors the parser in
 * useConcepts so the analytics hook stays self-contained.
 */
function parseIntervalToSecondsLocal(raw: string | null | undefined): number {
  if (!raw) return 0;
  const iso = raw.match(/^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (iso) {
    const h = parseInt(iso[1] ?? "0", 10);
    const m = parseInt(iso[2] ?? "0", 10);
    const s = parseFloat(iso[3] ?? "0");
    return h * 3600 + m * 60 + s;
  }
  const hms = raw.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (hms) {
    return (
      parseInt(hms[1], 10) * 3600 +
      parseInt(hms[2], 10) * 60 +
      parseFloat(hms[3])
    );
  }
  const numeric = parseFloat(raw);
  return Number.isFinite(numeric) ? numeric : 0;
}
