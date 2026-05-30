import { useMemo } from "react";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  subWeeks,
  subMonths,
  subQuarters,
  subYears,
  subDays,
  format,
  differenceInHours,
  isWithinInterval,
  parseISO,
  getDate,
} from "date-fns";
import { useConcepts } from "@/hooks/useConcepts";
import { useTasks } from "@/hooks/useTasks";
import { useProfiles } from "@/hooks/useProfiles";
import { useDesignerCodes } from "@/hooks/useDesignerCodes";
import {
  isCompleted as conceptIsCompleted,
  countRevisionCycles,
} from "@/lib/conceptStatus";
import type {
  Profile,
  ConceptWithRelations,
  TaskWithRelations,
} from "@/types/database";

// ============================================================================
// Types
// ============================================================================

export type ScorecardPeriod = "week" | "month" | "quarter" | "year";

export interface ScoreBreakdown {
  volume: number;
  approval: number;
  speed: number;
  lowRev: number;
}

export interface TaskScoreBreakdown {
  volume: number;
  onTime: number;
  speed: number;
  active: number;
}

export interface ScorecardActivity {
  type:
    | "concept_submitted"
    | "concept_reviewed"
    | "task_assigned"
    | "task_completed"
    | "revision_requested";
  title: string;
  status?: string;
  at: string;
}

export interface ScorecardInsight {
  kind: "strength" | "watchout";
  text: string;
}

export interface ScorecardTrendPoint {
  month: string;
  conceptsApproved: number;
  tasksCompleted: number;
}

export interface ScorecardDailyActivity {
  /** ISO date `yyyy-MM-dd`. Oldest → newest. */
  date: string;
  concepts: number;
  tasks: number;
  total: number;
}

export interface DesignerScorecardData {
  profile: Profile | null;
  designerCodes: string[];
  joinedDate: string;

  concept: {
    submitted: number;
    approved: number;
    rejected: number;
    /** Live `md_status === 'revision_requested'` count. */
    revisions: number;
    /**
     * Total revision cycles absorbed by this designer's submissions in the
     * period, from `completion_history`. A concept revised twice contributes
     * 2 cycles. More accurate than `revisions` for true rework volume.
     */
    revisionCycles: number;
    pending: number;
    approvalRate: number;
    /**
     * Concepts that finished the loop (approved + designer_actual_date +
     * final_approved_at). Subset of `approved`.
     */
    completed: number;
    /** approved → completed conversion (0–100). */
    completionRate: number;
    avgReviewHours: number;
    score: number;
    monthlyTargetProgress: number;
    breakdown: ScoreBreakdown;
    // ── Work-status lifecycle metrics (post-approval pipeline; added 0026) ──
    /**
     * % of completed work where MD approved on the first review round
     * (revision_count === 1). Null when no completed work in the period.
     */
    firstPassRate: number | null;
    /**
     * Mean working days per completed concept, with hold time subtracted.
     * Null when no completed work in the period.
     */
    avgDesignDays: number | null;
    /**
     * % of in-flight approved concepts that have been held at least once.
     * Null when nothing in flight.
     */
    holdRate: number | null;
    /**
     * Total hold events across the designer's approved concepts in-period.
     */
    totalHolds: number;
    /**
     * Mean revision rounds across completed work. 1.0 = always nails it.
     * Null when no completed work.
     */
    avgRevisionRounds: number | null;
  };

  task: {
    assigned: number;
    completed: number;
    onTime: number;
    /** Late = delay_days > 1 day. */
    late: number;
    inProgress: number;
    /** Avg days late (lower = better, 0 = on time). */
    avgDays: number;
    /** True cycle time in days (assigned_at → completed_at). */
    avgCycleDays: number;
    score: number;
    breakdown: TaskScoreBreakdown;
    teamAvgDays: number;
  };

  compositeScore: number;

  rank: {
    conceptRank: number;
    taskRank: number;
    overallRank: number;
    totalDesigners: number;
  };

  trend: ScorecardTrendPoint[];
  activity: ScorecardActivity[];
  /** 365 entries, oldest → newest, used by the activity heatmap. */
  dailyActivity: ScorecardDailyActivity[];
  insights: ScorecardInsight[];

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

function getPeriodRange(period: ScorecardPeriod, now: Date) {
  switch (period) {
    case "week":
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
      };
    case "quarter":
      return { start: startOfQuarter(now), end: endOfQuarter(now) };
    case "year":
      return { start: startOfYear(now), end: endOfYear(now) };
    default:
      return { start: startOfMonth(now), end: endOfMonth(now) };
  }
}

function inRange(
  dateStr: string | null | undefined,
  start: Date,
  end: Date
): boolean {
  if (!dateStr) return false;
  try {
    return isWithinInterval(parseISO(dateStr), { start, end });
  } catch {
    return false;
  }
}

function approvalHours(c: ConceptWithRelations): number | null {
  const reviewDate = c.md_actual_date ?? c.md_reviewed_at;
  if (!reviewDate || !c.created_at) return null;
  const h = differenceInHours(parseISO(reviewDate), parseISO(c.created_at));
  return h >= 0 ? h : null;
}

function safeAvg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function completionDate(t: TaskWithRelations): string | null {
  if (t.completed_at) return t.completed_at;
  if (t.status === "done") return t.updated_at;
  return null;
}

function cycleDays(t: TaskWithRelations): number | null {
  const done = t.completed_at ?? (t.status === "done" ? t.updated_at : null);
  const started = t.assigned_at ?? t.created_at;
  if (!done || !started) return null;
  const ms = parseISO(done).getTime() - parseISO(started).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round((ms / 86_400_000) * 10) / 10;
}

// ── Score calculators (mirrors useAnalytics + useTaskAnalytics) ──

function computeConceptBreakdown(
  submitted: number,
  approved: number,
  revisions: number,
  avgApprovalHours: number,
  maxSubmittedAcrossTeam: number
): ScoreBreakdown {
  if (submitted === 0) {
    return { volume: 0, approval: 0, speed: 0, lowRev: 15 };
  }
  const volume = Math.round(
    (submitted / Math.max(1, maxSubmittedAcrossTeam)) * 30
  );
  const approval = Math.round((approved / submitted) * 35);
  const speed = Math.round(
    Math.max(0, (48 - avgApprovalHours) / 48) * 20
  );
  const lowRev = Math.round(Math.max(0, 1 - revisions / submitted) * 15);
  return { volume, approval, speed, lowRev };
}

function computeTaskBreakdown(
  assigned: number,
  completed: number,
  onTime: number,
  avgDays: number,
  inProgress: number,
  maxCompletedAcrossTeam: number
): TaskScoreBreakdown {
  if (assigned === 0) {
    return { volume: 0, onTime: 0, speed: 0, active: 0 };
  }
  const volume = Math.round((completed / Math.max(1, maxCompletedAcrossTeam)) * 30);
  const onTimeScore = Math.round((onTime / assigned) * 35);
  const speed = Math.round(Math.max(0, (5 - avgDays) / 5) * 20);
  const active = Math.round(Math.min(1, inProgress / 3) * 15);
  return { volume, onTime: onTimeScore, speed, active };
}

function sumBreakdown(b: ScoreBreakdown | TaskScoreBreakdown): number {
  return Object.values(b).reduce((a, c) => a + c, 0);
}

// ── Insights ──

function buildInsights(args: {
  concept: DesignerScorecardData["concept"];
  task: DesignerScorecardData["task"];
  compositeScore: number;
  period: ScorecardPeriod;
}): ScorecardInsight[] {
  const { concept, task, compositeScore, period } = args;
  const strengths: ScorecardInsight[] = [];
  const watchouts: ScorecardInsight[] = [];
  const now = new Date();
  const dayOfMonth = getDate(now);

  // ── Strengths ──
  if (concept.approvalRate > 85 && concept.submitted > 0) {
    strengths.push({
      kind: "strength",
      text: `High approval rate — ${concept.approvalRate}% of concepts approved`,
    });
  }
  if (concept.completionRate >= 80 && concept.approved >= 2) {
    strengths.push({
      kind: "strength",
      text: `Strong follow-through — ${concept.completionRate}% of approved concepts shipped`,
    });
  }
  if (concept.avgReviewHours > 0 && concept.avgReviewHours < 24) {
    strengths.push({
      kind: "strength",
      text: "Fast reviewer engagement — avg review under 24h",
    });
  }
  if (task.completed > 0) {
    const otRate = Math.round((task.onTime / task.completed) * 100);
    if (otRate > 85) {
      strengths.push({
        kind: "strength",
        text: `Strong deadline compliance — ${otRate}% on time`,
      });
    }
  }
  if (task.completed > 0 && task.avgDays < 3) {
    strengths.push({
      kind: "strength",
      text: `Quick turnaround — averaging ${task.avgDays}d per task`,
    });
  }
  if (
    concept.submitted >= 3 &&
    concept.revisionCycles === 0
  ) {
    strengths.push({
      kind: "strength",
      text: "Clean first drafts — no revisions requested this period",
    });
  }
  if (compositeScore > 80) {
    strengths.push({
      kind: "strength",
      text: `Top performer — composite score ${compositeScore}/100`,
    });
  }

  // ── Watchouts ──
  // Use truer revisionCycles for rework signal (md_status only catches "in
  // revision right now"; a concept revised twice and approved would show 0).
  if (concept.submitted > 0 && concept.revisionCycles / concept.submitted > 0.5) {
    const ratio = (concept.revisionCycles / concept.submitted).toFixed(1);
    watchouts.push({
      kind: "watchout",
      text: `Heavy rework — ${ratio} revision cycles per submission`,
    });
  } else if (concept.submitted > 0 && concept.revisions / concept.submitted > 0.3) {
    const pct = Math.round((concept.revisions / concept.submitted) * 100);
    watchouts.push({
      kind: "watchout",
      text: `High revision rate — ${pct}% of submissions awaiting redo`,
    });
  }
  // New: completion-gap. Approved concepts piling up unshipped means designer
  // is starting strong but losing the finalisation handoff.
  const finalisationGap = concept.approved - concept.completed;
  if (finalisationGap >= 3 && concept.approved >= 4) {
    watchouts.push({
      kind: "watchout",
      text: `${finalisationGap} approved concepts awaiting finalisation`,
    });
  }
  if (task.completed > 0) {
    const otRate = Math.round((task.onTime / task.completed) * 100);
    if (otRate < 70) {
      watchouts.push({
        kind: "watchout",
        text: `On-time delivery slipping — ${otRate}% this period`,
      });
    }
  }
  if (concept.submitted === 0 && period === "month" && dayOfMonth > 7) {
    watchouts.push({
      kind: "watchout",
      text: "No concept submissions this month",
    });
  }
  if (task.completed > 0 && task.avgDays > 5) {
    watchouts.push({
      kind: "watchout",
      text: `Slow completion — averaging ${task.avgDays}d per task`,
    });
  }
  if (
    concept.monthlyTargetProgress < 1 &&
    period === "month" &&
    dayOfMonth > 15
  ) {
    watchouts.push({
      kind: "watchout",
      text: "Behind on monthly concept target",
    });
  }

  // Watchouts first, cap 4, max 2 strengths + 2 watchouts
  const result = [
    ...watchouts.slice(0, 2),
    ...strengths.slice(0, 2),
  ];
  return result;
}

// ============================================================================
// Hook
// ============================================================================

export function useDesignerScorecard(
  designerId: string | null,
  period: ScorecardPeriod = "month"
): DesignerScorecardData {
  const { concepts, isLoading: cLoading, error: cError } = useConcepts();
  const { tasks, isLoading: tLoading, error: tError } = useTasks();
  const { profiles, isLoading: pLoading, error: pError } = useProfiles({
    roles: ["designer"],
  });
  const { codesByProfile, isLoading: codesLoading } = useDesignerCodes();

  const isLoading = cLoading || tLoading || pLoading || codesLoading;
  const error = cError ?? tError ?? pError ?? null;

  const now = useMemo(() => new Date(), []);
  const { start, end } = useMemo(
    () => getPeriodRange(period, now),
    [period, now]
  );
  const periodLabel = useMemo(() => {
    if (period === "year") return format(now, "yyyy");
    if (period === "quarter")
      return `Q${Math.floor(now.getMonth() / 3) + 1} ${format(now, "yyyy")}`;
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  }, [period, start, end, now]);

  // ── Per-designer aggregates across the whole team (for ranking & scaling) ──
  const teamStats = useMemo(() => {
    type Row = {
      id: string;
      conceptScore: number;
      taskScore: number;
      avgDays: number;
    };
    const conceptByDesigner = new Map<
      string,
      { submitted: number; approved: number; revisions: number; avgHours: number }
    >();
    const taskByDesigner = new Map<
      string,
      {
        assigned: number;
        completed: number;
        onTime: number;
        avgDays: number;
        inProgress: number;
      }
    >();

    for (const p of profiles) {
      const mine = concepts.filter(
        (c) =>
          c.submitted_by === p.id && inRange(c.created_at, start, end)
      );
      const submitted = mine.length;
      const approved = mine.filter((c) => c.md_status === "approved").length;
      const revisions = mine.filter(
        (c) => c.md_status === "revision_requested"
      ).length;
      const hours = mine.map(approvalHours).filter((h): h is number => h !== null);
      conceptByDesigner.set(p.id, {
        submitted,
        approved,
        revisions,
        avgHours: safeAvg(hours),
      });

      const myTasks = tasks.filter((t) => t.assigned_to === p.id);
      const assigned = myTasks.filter(
        (t) =>
          inRange(t.created_at, start, end) ||
          inRange(completionDate(t), start, end)
      ).length;
      const completed = myTasks.filter((t) =>
        inRange(completionDate(t), start, end)
      );
      const onTime = completed.filter((t) => (t.delay_days ?? 999) <= 1).length;
      const avgDays = safeAvg(completed.map((t) => t.delay_days ?? 0));
      const inProgress = myTasks.filter((t) => t.status === "in_progress").length;
      taskByDesigner.set(p.id, {
        assigned,
        completed: completed.length,
        onTime,
        avgDays,
        inProgress,
      });
    }

    const maxSubmitted = Math.max(
      1,
      ...Array.from(conceptByDesigner.values()).map((v) => v.submitted)
    );
    const maxCompleted = Math.max(
      1,
      ...Array.from(taskByDesigner.values()).map((v) => v.completed)
    );

    const allCompletedDelays: number[] = [];
    for (const v of taskByDesigner.values()) {
      if (v.completed > 0) allCompletedDelays.push(v.avgDays);
    }
    const teamAvgDays = safeAvg(allCompletedDelays);

    const rows: Row[] = profiles.map((p) => {
      const c = conceptByDesigner.get(p.id)!;
      const t = taskByDesigner.get(p.id)!;
      const cBreak = computeConceptBreakdown(
        c.submitted,
        c.approved,
        c.revisions,
        c.avgHours,
        maxSubmitted
      );
      const tBreak = computeTaskBreakdown(
        t.assigned,
        t.completed,
        t.onTime,
        t.avgDays,
        t.inProgress,
        maxCompleted
      );
      const conceptScore = sumBreakdown(cBreak);
      const taskScore = sumBreakdown(tBreak);
      return { id: p.id, conceptScore, taskScore, avgDays: t.avgDays };
    });

    return {
      conceptByDesigner,
      taskByDesigner,
      rows,
      maxSubmitted,
      maxCompleted,
      teamAvgDays,
    };
  }, [profiles, concepts, tasks, start, end]);

  // ── Target designer profile ──
  const profile = useMemo(
    () => profiles.find((p) => p.id === designerId) ?? null,
    [profiles, designerId]
  );

  const designerCodes = useMemo(() => {
    if (!designerId) return [];
    const codes = codesByProfile.get(designerId) ?? [];
    return codes.map((c) => c.code);
  }, [codesByProfile, designerId]);

  // ── Concept block ──
  const conceptBlock = useMemo(() => {
    if (!designerId) {
      return {
        submitted: 0,
        approved: 0,
        rejected: 0,
        revisions: 0,
        revisionCycles: 0,
        pending: 0,
        approvalRate: 0,
        completed: 0,
        completionRate: 0,
        avgReviewHours: 0,
        score: 0,
        monthlyTargetProgress: 0,
        breakdown: { volume: 0, approval: 0, speed: 0, lowRev: 0 },
        firstPassRate: null,
        avgDesignDays: null,
        holdRate: null,
        totalHolds: 0,
        avgRevisionRounds: null,
      };
    }
    const mine = concepts.filter(
      (c) =>
        c.submitted_by === designerId && inRange(c.created_at, start, end)
    );
    const submitted = mine.length;
    const approved = mine.filter((c) => c.md_status === "approved").length;
    const rejected = mine.filter((c) => c.md_status === "rejected").length;
    const revisions = mine.filter(
      (c) => c.md_status === "revision_requested"
    ).length;
    const revisionCycles = mine.reduce(
      (sum, c) => sum + countRevisionCycles(c),
      0
    );
    const pending = mine.filter((c) => c.md_status === "pending").length;
    const reviewed = approved + rejected + revisions;
    const approvalRate =
      reviewed > 0 ? Math.round((approved / reviewed) * 100) : 0;
    const completed = mine.filter(conceptIsCompleted).length;
    const completionRate = approved > 0
      ? Math.round((completed / approved) * 100) : 0;
    const hours = mine.map(approvalHours).filter((h): h is number => h !== null);
    const avgReviewHours = safeAvg(hours);

    const breakdown = computeConceptBreakdown(
      submitted,
      approved,
      revisions,
      avgReviewHours,
      teamStats.maxSubmitted
    );
    const score = sumBreakdown(breakdown);

    // Monthly target progress: always count this calendar month's approved
    // regardless of selected period (the target is a monthly contract)
    const ms = startOfMonth(now);
    const me = endOfMonth(now);
    const monthlyTargetProgress = concepts.filter(
      (c) =>
        c.submitted_by === designerId &&
        c.md_status === "approved" &&
        inRange(c.created_at, ms, me)
    ).length;

    // ── Work-status lifecycle derivatives (designer's own approved rows) ──
    // Pipeline rows are not period-scoped — `firstPassRate` etc. describe the
    // designer's overall delivery quality, which is more useful than a
    // wobbly period slice when the concept count is small.
    const myApproved = concepts.filter(
      (c) => c.submitted_by === designerId && c.md_status === "approved"
    );
    const myCompleted = myApproved.filter(
      (c) => c.work_status === "completed"
    );
    const inFlight = myApproved.filter(
      (c) =>
        c.work_status === "in_progress" ||
        c.work_status === "on_hold" ||
        c.work_status === "in_revision" ||
        c.work_status === "changes_requested"
    );

    const firstPassCount = myCompleted.filter(
      (c) => (c.revision_count ?? 0) === 1
    ).length;
    const firstPassRate = myCompleted.length
      ? Math.round((firstPassCount / myCompleted.length) * 100)
      : null;
    const avgRevisionRounds = myCompleted.length
      ? Number(
          (
            myCompleted.reduce(
              (sum, c) => sum + (c.revision_count ?? 1),
              0
            ) / myCompleted.length
          ).toFixed(1)
        )
      : null;
    const designDays = myCompleted
      .map((c) => {
        if (!c.work_started_at || !c.work_completed_at) return null;
        const sStart = new Date(c.work_started_at).getTime();
        const sEnd = new Date(c.work_completed_at).getTime();
        if (Number.isNaN(sStart) || Number.isNaN(sEnd) || sEnd < sStart) return null;
        const holdSeconds = parseIntervalToSecondsLocal(c.total_hold_duration);
        const workingMs = Math.max(0, sEnd - sStart - holdSeconds * 1000);
        return workingMs / 86_400_000;
      })
      .filter((v): v is number => v !== null);
    const avgDesignDays = designDays.length
      ? Number((designDays.reduce((a, b) => a + b, 0) / designDays.length).toFixed(1))
      : null;
    const totalHolds = myApproved.reduce(
      (sum, c) => sum + (c.hold_count ?? 0),
      0
    );
    const heldInFlight = inFlight.filter(
      (c) => (c.hold_count ?? 0) > 0
    ).length;
    const holdRate = inFlight.length
      ? Math.round((heldInFlight / inFlight.length) * 100)
      : null;

    return {
      submitted,
      approved,
      rejected,
      revisions,
      revisionCycles,
      pending,
      approvalRate,
      completed,
      completionRate,
      avgReviewHours,
      score,
      monthlyTargetProgress,
      breakdown,
      firstPassRate,
      avgDesignDays,
      holdRate,
      totalHolds,
      avgRevisionRounds,
    };
  }, [concepts, designerId, start, end, now, teamStats.maxSubmitted]);

  // ── Task block ──
  const taskBlock = useMemo(() => {
    if (!designerId) {
      return {
        assigned: 0,
        completed: 0,
        onTime: 0,
        late: 0,
        inProgress: 0,
        avgDays: 0,
        avgCycleDays: 0,
        score: 0,
        breakdown: { volume: 0, onTime: 0, speed: 0, active: 0 },
        teamAvgDays: teamStats.teamAvgDays,
      };
    }
    const myTasks = tasks.filter((t) => t.assigned_to === designerId);
    const assigned = myTasks.filter(
      (t) =>
        inRange(t.created_at, start, end) ||
        inRange(completionDate(t), start, end)
    ).length;
    const completed = myTasks.filter((t) =>
      inRange(completionDate(t), start, end)
    );
    const onTime = completed.filter((t) => (t.delay_days ?? 999) <= 1).length;
    const late = completed.length - onTime;
    const avgDays = safeAvg(completed.map((t) => t.delay_days ?? 0));
    const avgCycleDays = safeAvg(
      completed.map(cycleDays).filter((n): n is number => n !== null)
    );
    const inProgress = myTasks.filter((t) => t.status === "in_progress").length;

    const breakdown = computeTaskBreakdown(
      assigned,
      completed.length,
      onTime,
      avgDays,
      inProgress,
      teamStats.maxCompleted
    );
    const score = sumBreakdown(breakdown);

    return {
      assigned,
      completed: completed.length,
      onTime,
      late,
      inProgress,
      avgDays,
      avgCycleDays,
      score,
      breakdown,
      teamAvgDays: teamStats.teamAvgDays,
    };
  }, [tasks, designerId, start, end, teamStats]);

  const compositeScore = useMemo(
    () => Math.round((conceptBlock.score + taskBlock.score) / 2),
    [conceptBlock.score, taskBlock.score]
  );

  // ── Rank ──
  const rank = useMemo(() => {
    if (!designerId)
      return { conceptRank: 0, taskRank: 0, overallRank: 0, totalDesigners: 0 };
    const sortedByConcept = [...teamStats.rows].sort(
      (a, b) => b.conceptScore - a.conceptScore
    );
    const sortedByTask = [...teamStats.rows].sort(
      (a, b) => b.taskScore - a.taskScore
    );
    const sortedByOverall = [...teamStats.rows].sort(
      (a, b) =>
        (b.conceptScore + b.taskScore) / 2 - (a.conceptScore + a.taskScore) / 2
    );
    const conceptRank =
      sortedByConcept.findIndex((r) => r.id === designerId) + 1;
    const taskRank = sortedByTask.findIndex((r) => r.id === designerId) + 1;
    const overallRank =
      sortedByOverall.findIndex((r) => r.id === designerId) + 1;
    return {
      conceptRank,
      taskRank,
      overallRank,
      totalDesigners: teamStats.rows.length,
    };
  }, [teamStats, designerId]);

  // ── Trend (last 6 months) ──
  const trend = useMemo(() => {
    if (!designerId) return [];
    const points: ScorecardTrendPoint[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i);
      const ms = startOfMonth(d);
      const me = endOfMonth(d);
      const conceptsApproved = concepts.filter(
        (c) =>
          c.submitted_by === designerId &&
          c.md_status === "approved" &&
          inRange(c.md_actual_date ?? c.md_reviewed_at ?? c.created_at, ms, me)
      ).length;
      const tasksCompleted = tasks.filter(
        (t) =>
          t.assigned_to === designerId && inRange(completionDate(t), ms, me)
      ).length;
      points.push({
        month: format(d, "MMM"),
        conceptsApproved,
        tasksCompleted,
      });
    }
    return points;
  }, [concepts, tasks, designerId, now]);

  // ── Activity feed ──
  const activity = useMemo(() => {
    if (!designerId) return [];
    const events: ScorecardActivity[] = [];

    for (const c of concepts) {
      if (c.submitted_by !== designerId) continue;
      events.push({
        type: "concept_submitted",
        title: `Submitted concept '${c.title}'`,
        at: c.created_at,
      });
      if (c.md_status === "approved" && c.md_actual_date) {
        events.push({
          type: "concept_reviewed",
          title: `Concept '${c.title}' approved`,
          status: "approved",
          at: c.md_actual_date,
        });
      } else if (c.md_status === "rejected" && c.md_actual_date) {
        events.push({
          type: "concept_reviewed",
          title: `Concept '${c.title}' rejected`,
          status: "rejected",
          at: c.md_actual_date,
        });
      } else if (c.md_status === "revision_requested" && c.md_actual_date) {
        events.push({
          type: "revision_requested",
          title: `Revision requested on '${c.title}'`,
          status: "revision_requested",
          at: c.md_actual_date,
        });
      }
    }

    for (const t of tasks) {
      if (t.assigned_to !== designerId) continue;
      if (t.assigned_at) {
        events.push({
          type: "task_assigned",
          title: `Assigned to task ${t.task_code}`,
          at: t.assigned_at,
        });
      }
      const done = completionDate(t);
      if (done) {
        events.push({
          type: "task_completed",
          title: `Completed task ${t.task_code}`,
          at: done,
        });
      }
    }

    events.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
    );
    return events.slice(0, 10);
  }, [concepts, tasks, designerId]);

  // ── Daily activity (last 365 days for heatmap) ──
  const dailyActivity = useMemo<ScorecardDailyActivity[]>(() => {
    const today = new Date();
    const map = new Map<string, { concepts: number; tasks: number }>();

    // Seed all 365 days with zeros
    for (let i = 0; i < 365; i++) {
      const d = subDays(today, i);
      const key = format(d, "yyyy-MM-dd");
      map.set(key, { concepts: 0, tasks: 0 });
    }

    if (!designerId) {
      return Array.from(map.entries())
        .map(([date, c]) => ({ date, ...c, total: 0 }))
        .reverse();
    }

    // Concepts: count submissions + review decisions per day
    for (const c of concepts) {
      if (c.submitted_by !== designerId) continue;
      try {
        const submitKey = format(parseISO(c.created_at), "yyyy-MM-dd");
        const ex = map.get(submitKey);
        if (ex) ex.concepts++;
      } catch {
        // ignore bad dates
      }
      const reviewedAt = c.md_actual_date ?? c.md_reviewed_at;
      if (reviewedAt) {
        try {
          const rk = format(parseISO(reviewedAt), "yyyy-MM-dd");
          const ex = map.get(rk);
          if (ex) ex.concepts++;
        } catch {
          // ignore
        }
      }
    }

    // Tasks: count assignments + completions per day
    for (const t of tasks) {
      if (t.assigned_to !== designerId) continue;
      const assignedKey = t.assigned_at ?? t.created_at;
      try {
        const ak = format(parseISO(assignedKey), "yyyy-MM-dd");
        const ex = map.get(ak);
        if (ex) ex.tasks++;
      } catch {
        // ignore
      }
      const done = completionDate(t);
      if (done) {
        try {
          const dk = format(parseISO(done), "yyyy-MM-dd");
          const ex = map.get(dk);
          if (ex) ex.tasks++;
        } catch {
          // ignore
        }
      }
    }

    // Map → array, oldest to newest
    return Array.from(map.entries())
      .map(([date, c]) => ({
        date,
        concepts: c.concepts,
        tasks: c.tasks,
        total: c.concepts + c.tasks,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [concepts, tasks, designerId]);

  // ── Insights ──
  const insights = useMemo(
    () =>
      buildInsights({
        concept: conceptBlock,
        task: taskBlock,
        compositeScore,
        period,
      }),
    [conceptBlock, taskBlock, compositeScore, period]
  );

  return {
    profile,
    designerCodes,
    joinedDate: profile?.created_at ?? "",
    concept: conceptBlock,
    task: taskBlock,
    compositeScore,
    rank,
    trend,
    activity,
    dailyActivity,
    insights,
    periodStart: start,
    periodEnd: end,
    periodLabel,
    isLoading,
    error,
  };
}

// Re-exported so other hooks can compose their own ranges if needed
export { subWeeks, subMonths, subQuarters, subYears };

// ============================================================================
// Helpers (work-status KPIs)
// ============================================================================

/**
 * Loose Postgres `interval` parser. Mirrors the implementation in
 * useConcepts/useAnalytics so the scorecard hook stays self-contained when
 * computing per-designer `total_hold_duration` averages.
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
