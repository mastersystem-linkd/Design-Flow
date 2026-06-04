import { useMemo } from "react";
import {
  startOfWeek, startOfMonth, startOfQuarter,
  endOfWeek, endOfMonth, endOfQuarter,
  startOfDay, endOfDay, addDays, addWeeks,
  subWeeks, subMonths, subQuarters,
  format, isWithinInterval, parseISO,
} from "date-fns";
import { useTasks } from "@/hooks/useTasks";
import { useProfiles } from "@/hooks/useProfiles";
import { useDesignerCodes } from "@/hooks/useDesignerCodes";
import type { TaskWithRelations } from "@/types/database";

// ============================================================================
// Types
// ============================================================================

export type Period = "week" | "month" | "quarter";

export interface KpiMetric {
  current: number;
  previous: number;
  trend: number;
}

export interface PipelineItem {
  status: string;
  count: number;
  percentage: number;
}

export interface VolumePoint {
  label: string;
  created: number;
  completed: number;
}

export interface DesignerTaskStat {
  id: string;
  full_name: string;
  avatar_url: string | null;
  designerCode: string;
  assigned: number;
  completed: number;
  onTime: number;
  /**
   * Average days late on this designer's completed tasks in the period.
   * Named `avgDays` for backwards compat — semantically this is "average
   * delay relative to planned_deadline", NOT cycle time. See `avgCycleDays`
   * for the true assigned→completed duration.
   */
  avgDays: number;
  /**
   * Average actual cycle time (days between `assigned_at` and `completed_at`)
   * for tasks completed in the period. Reflects effort, not punctuality.
   * 0 when no completion has both stamps.
   */
  avgCycleDays: number;
  inProgress: number;
  score: number;
}

/** Full-kitting workload split — how much of the pipeline needs the kitting form. */
export interface KittingMix {
  withKitting: number;
  withoutKitting: number;
  /** % of in-window tasks that require kitting (0 if no tasks). */
  pct: number;
  /** Kitting forms that were actually submitted in the window. */
  kittingSubmitted: number;
  /** Kitting tasks where the form is still missing. */
  kittingPending: number;
}

/** Distribution of tasks by priority across the active pipeline. */
export interface PriorityMix {
  urgent: number;
  high: number;
  normal: number;
  low: number;
}

/** Buckets of completed-task cycle times (days between assigned and done). */
export interface CycleTimeBucket {
  label: string;
  count: number;
}

/** One row in the per-client task volume list. */
export interface TopClient {
  client_id: string;
  party_name: string;
  total: number;
  completed: number;
  active: number;
}

export interface TaskDashboardMetrics {
  kpis: {
    totalCompleted: KpiMetric;
    onTimeRate: KpiMetric;
    /**
     * Average days late on completed tasks (0 = on time, positive = late).
     * Field is named `avgCompletionDays` for backwards compat — semantically
     * this is "avg delay", not "avg duration". Use `avgCycleDays` for
     * cycle time. Lower is better.
     */
    avgCompletionDays: KpiMetric;
    /** Average cycle time (assigned → completed) for the period, in days. */
    avgCycleDays: KpiMetric;
    /** Late completions in the period (delay_days > 1). */
    lateCompletions: KpiMetric;
    totalCreated: KpiMetric;
    activePipeline: number;
    urgentCount: number;
    overdueCount: number;
  };
  pipeline: PipelineItem[];
  volumeData: VolumePoint[];
  designerStats: DesignerTaskStat[];
  /**
   * Full-kitting mix across in-window tasks. Kitting is the structured form
   * coordinators need to complete on FK-required jobs — knowing what fraction
   * of the pipeline needs it tells admins whether to staff up at that stage.
   */
  kittingMix: KittingMix;
  /** Priority breakdown of the active (non-done) pipeline. */
  priorityMix: PriorityMix;
  /**
   * Completed-task durations bucketed by cycle-time (assigned_at → completed_at).
   * Same buckets the scorecard uses, scoped to in-window completions.
   */
  cycleTimeDist: CycleTimeBucket[];
  /**
   * Every client touched by in-window tasks, sorted by total task count DESC.
   * UI is expected to slice for previews (e.g. top 5 on the card) and show
   * the full list inside a "View all" dialog.
   */
  topClients: TopClient[];
  /**
   * 7-bucket time series for the KPI card sparklines.
   *   - completed:   number of tasks completed per bucket
   *   - onTime:      number of those that were on time (delay_days ≤ 1)
   *   - created:     number of tasks created per bucket
   *   - avgDelay:    average delay_days across completions per bucket
   *                  (0 when no completions in that bucket)
   */
  sparklines: {
    completed: number[];
    onTime: number[];
    created: number[];
    avgDelay: number[];
  };
  /** Raw tasks list, re-exported so consumers don't double-fetch via useTasks. */
  tasks: TaskWithRelations[];
  periodStart: Date;
  periodEnd: Date;
  periodLabel: string;
  isLoading: boolean;
  error: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

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
  try { return isWithinInterval(parseISO(dateStr), { start, end }); }
  catch { return false; }
}

function completionDate(t: TaskWithRelations): string | null {
  if (t.completed_at) return t.completed_at;
  // 'completed' tasks always carry completed_at (stamped at the done
  // transition), but fall back to the metadata-capture stamp just in case.
  if (t.status === "completed") return t.completion_filled_at ?? t.updated_at;
  if (t.status === "done") return t.updated_at;
  return null;
}

/** Terminal states — design work is finished and the task has left the active
 *  pipeline. 'done' = awaiting completion details, 'completed' = fully closed.
 *  Both are excluded from "what's still in front of us" counts. */
function isFinished(t: TaskWithRelations): boolean {
  return t.status === "done" || t.status === "completed";
}

/**
 * Days a completed task finished AFTER its planned deadline, at day
 * granularity. Returns 0 when finished on/before the deadline, null when the
 * task isn't completed or has no deadline. Mirrors the "Completed Late" column
 * on the All Tasks board (completion date vs the deadline the designer set at
 * claim) — NOT cycle time / delay_days.
 */
function lateDays(t: TaskWithRelations): number | null {
  if (!t.planned_deadline) return null;
  const comp = completionDate(t);
  if (!comp) return null;
  const c = startOfDay(parseISO(comp)).getTime();
  const d = startOfDay(parseISO(t.planned_deadline)).getTime();
  return Math.max(0, Math.round((c - d) / 86_400_000));
}

/** A completed task that finished after its planned deadline. Tasks with no
 *  deadline can't be "late" (same rule as the All Tasks "Completed Late"). */
function isLateCompletion(t: TaskWithRelations): boolean {
  const ld = lateDays(t);
  return ld != null && ld > 0;
}

/**
 * Actual cycle time in days = completed_at − assigned_at. Returns null when
 * either stamp is missing (e.g. legacy tasks completed pre-0014, or tasks
 * still in flight). The dashboard avgs ignore null entries.
 */
function cycleDays(t: TaskWithRelations): number | null {
  const done = t.completed_at ?? (t.status === "done" ? t.updated_at : null);
  const started = t.assigned_at ?? t.created_at;
  if (!done || !started) return null;
  const ms = parseISO(done).getTime() - parseISO(started).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round((ms / 86_400_000) * 10) / 10;
}

function calcTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 999 : 0;
  return Math.max(-999, Math.min(999, Math.round(((current - previous) / previous) * 100)));
}

function safeAvg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

// ============================================================================
// Hook
// ============================================================================

export function useTaskAnalytics(
  period: Period = "month",
  customRange?: { from: Date; to: Date } | null
): TaskDashboardMetrics {
  const { tasks, isLoading, error: tasksError } = useTasks();
  const { profiles } = useProfiles({ roles: ["designer"] });
  const { codesByProfile } = useDesignerCodes();

  const error = tasksError || null;
  const now = useMemo(() => new Date(), []);
  const { start, end, prevStart, prevEnd } = useMemo(() => {
    if (customRange) {
      const span = customRange.to.getTime() - customRange.from.getTime();
      return {
        start: customRange.from,
        end: customRange.to,
        prevStart: new Date(customRange.from.getTime() - span),
        prevEnd: new Date(customRange.to.getTime() - span),
      };
    }
    return getPeriodRange(period, now);
  }, [period, now, customRange]);
  const periodLabel = useMemo(() => `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`, [start, end]);

  // ── KPIs ──────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const currCompleted = tasks.filter((t) => inRange(completionDate(t), start, end));
    const prevCompleted = tasks.filter((t) => inRange(completionDate(t), prevStart, prevEnd));
    const currCreated = tasks.filter((t) => inRange(t.created_at, start, end));
    const prevCreated = tasks.filter((t) => inRange(t.created_at, prevStart, prevEnd));

    // On-time / late are measured against the planned deadline (the rule the
    // All Tasks "Completed Late" column uses), not cycle time.
    const currOnTime = currCompleted.filter((t) => !isLateCompletion(t)).length;
    const prevOnTime = prevCompleted.filter((t) => !isLateCompletion(t)).length;
    const currOnTimeRate = currCompleted.length > 0 ? Math.round((currOnTime / currCompleted.length) * 100) : 0;
    const prevOnTimeRate = prevCompleted.length > 0 ? Math.round((prevOnTime / prevCompleted.length) * 100) : 0;

    // Average days late vs deadline (0 when on/under deadline).
    const currAvg = safeAvg(currCompleted.map((t) => lateDays(t) ?? 0));
    const prevAvg = safeAvg(prevCompleted.map((t) => lateDays(t) ?? 0));

    const currCycle = safeAvg(
      currCompleted.map(cycleDays).filter((n): n is number => n !== null)
    );
    const prevCycle = safeAvg(
      prevCompleted.map(cycleDays).filter((n): n is number => n !== null)
    );

    const currLate = currCompleted.filter(isLateCompletion).length;
    const prevLate = prevCompleted.filter(isLateCompletion).length;

    return {
      totalCompleted: { current: currCompleted.length, previous: prevCompleted.length, trend: calcTrend(currCompleted.length, prevCompleted.length) },
      onTimeRate: { current: currOnTimeRate, previous: prevOnTimeRate, trend: calcTrend(currOnTimeRate, prevOnTimeRate) },
      avgCompletionDays: { current: currAvg, previous: prevAvg, trend: calcTrend(currAvg, prevAvg) },
      avgCycleDays: { current: currCycle, previous: prevCycle, trend: calcTrend(currCycle, prevCycle) },
      lateCompletions: { current: currLate, previous: prevLate, trend: calcTrend(currLate, prevLate) },
      totalCreated: { current: currCreated.length, previous: prevCreated.length, trend: calcTrend(currCreated.length, prevCreated.length) },
      activePipeline: tasks.filter((t) => !isFinished(t)).length,
      urgentCount: tasks.filter((t) => t.priority === "urgent" && !isFinished(t)).length,
      overdueCount: tasks.filter((t) => !isFinished(t) && t.planned_deadline && new Date(t.planned_deadline) < new Date()).length,
    };
  }, [tasks, start, end, prevStart, prevEnd]);

  // ── Pipeline (simplified Pool → In Progress → Done) ──────────────
  // Legacy in-flight statuses (todo / full_kitting / approved / sampling)
  // roll up into "In Progress" so the chart counts remain accurate.
  const pipeline = useMemo(() => {
    const total = tasks.length || 1;
    const counts = {
      pool: tasks.filter((t) => t.status === "pool").length,
      in_progress: tasks.filter(
        (t) =>
          t.status === "in_progress" ||
          t.status === "todo" ||
          t.status === "full_kitting" ||
          t.status === "approved" ||
          t.status === "sampling"
      ).length,
      // 'done' bar merges the new terminal 'completed' status so finished
      // work stays in one bucket (matches the board's Done tab grouping).
      done: tasks.filter((t) => t.status === "done" || t.status === "completed").length,
    } as const;
    return (["pool", "in_progress", "done"] as const).map((s) => ({
      status: s,
      count: counts[s],
      percentage: Math.round((counts[s] / total) * 100),
    }));
  }, [tasks]);

  // ── Volume data (adapts to period: days for week, weeks for month, months for quarter) ──
  const volumeData = useMemo(() => {
    const points: VolumePoint[] = [];

    if (period === "week") {
      // 7 days: Mon → Sun
      for (let i = 0; i < 7; i++) {
        const d = addDays(start, i);
        const ds = startOfDay(d);
        const de = endOfDay(d);
        points.push({
          label: format(d, "EEE"), // Mon, Tue, ...
          created: tasks.filter((t) => inRange(t.created_at, ds, de)).length,
          completed: tasks.filter((t) => inRange(completionDate(t), ds, de)).length,
        });
      }
    } else if (period === "month") {
      // ~4-5 weeks within the month
      let cursor = startOfWeek(start, { weekStartsOn: 1 });
      let weekNum = 1;
      while (cursor <= end) {
        const ws = cursor < start ? start : cursor;
        const we = endOfWeek(cursor, { weekStartsOn: 1 });
        const weekEnd = we > end ? end : we;
        points.push({
          label: `W${weekNum}`,
          created: tasks.filter((t) => inRange(t.created_at, ws, weekEnd)).length,
          completed: tasks.filter((t) => inRange(completionDate(t), ws, weekEnd)).length,
        });
        cursor = addWeeks(cursor, 1);
        weekNum++;
        if (weekNum > 6) break; // safety
      }
    } else {
      // Quarter: iterate actual months within the quarter start→end
      let cursor = startOfMonth(start);
      while (cursor <= end) {
        const ms = startOfMonth(cursor);
        const me = endOfMonth(cursor);
        points.push({
          label: format(ms, "MMM"),
          created: tasks.filter((t) => inRange(t.created_at, ms, me)).length,
          completed: tasks.filter((t) => inRange(completionDate(t), ms, me)).length,
        });
        cursor = addDays(me, 1); // move to first day of next month
      }
    }

    return points;
  }, [tasks, period, start, end]);

  // ── Designer stats ────────────────────────────────────────────────
  const designerStats = useMemo(() => {
    const stats: DesignerTaskStat[] = profiles.map((p) => {
      const myTasks = tasks.filter((t) => t.assigned_to === p.id);
      const assigned = myTasks.filter((t) => inRange(t.created_at, start, end) || inRange(completionDate(t), start, end)).length;
      const completed = myTasks.filter((t) => inRange(completionDate(t), start, end));
      // On-time = finished on/before the planned deadline (deadline-based).
      const onTime = completed.filter((t) => !isLateCompletion(t)).length;
      const avgCycleDays = safeAvg(
        completed.map(cycleDays).filter((n): n is number => n !== null)
      );
      // "Avg Days" now reflects the real cycle time (assigned → completed).
      const avgDays = avgCycleDays;
      const inProgress = myTasks.filter((t) => t.status === "in_progress").length;

      const codes = codesByProfile.get(p.id);
      const designerCode = codes?.[0]?.code?.slice(0, 1) ?? "—";

      return { id: p.id, full_name: p.full_name, avatar_url: p.avatar_url, designerCode, assigned, completed: completed.length, onTime, avgDays, avgCycleDays, inProgress, score: 0 };
    });

    const maxCompleted = Math.max(1, ...stats.map((s) => s.completed));
    for (const s of stats) {
      if (s.assigned === 0) { s.score = 0; continue; }
      const vol = (s.completed / maxCompleted) * 30;
      const otRate = s.assigned > 0 ? (s.onTime / s.assigned) * 35 : 0;
      const speed = Math.max(0, (5 - s.avgDays) / 5) * 20;
      const active = Math.min(1, s.inProgress / 3) * 15; // having work in progress = engaged
      s.score = Math.round(vol + otRate + speed + active);
    }
    stats.sort((a, b) => b.score - a.score);
    return stats;
  }, [tasks, profiles, codesByProfile, start, end]);

  // ── Kitting mix ─────────────────────────────────────────────────────
  // Window = tasks created in the current period. The dashboard shows what
  // fraction of recently briefed work needs the full-kitting handoff, so
  // staffing can be planned. Submission status uses `full_kitting_submitted_at`
  // which `useFullKitting.submitKitting` stamps on task completion.
  const kittingMix = useMemo<KittingMix>(() => {
    const inWindow = tasks.filter((t) => inRange(t.created_at, start, end));
    let withKitting = 0;
    let submitted = 0;
    for (const t of inWindow) {
      if (t.requires_full_kitting) {
        withKitting++;
        if (t.full_kitting_submitted_at) submitted++;
      }
    }
    const withoutKitting = inWindow.length - withKitting;
    const pct = inWindow.length > 0 ? Math.round((withKitting / inWindow.length) * 100) : 0;
    return {
      withKitting,
      withoutKitting,
      pct,
      kittingSubmitted: submitted,
      kittingPending: withKitting - submitted,
    };
  }, [tasks, start, end]);

  // ── Priority distribution (active pipeline) ─────────────────────────
  // Counted over non-done tasks so the dashboard reflects "what's in front
  // of us right now", not historical priority trends.
  const priorityMix = useMemo<PriorityMix>(() => {
    const active = tasks.filter((t) => !isFinished(t));
    const out: PriorityMix = { urgent: 0, high: 0, normal: 0, low: 0 };
    for (const t of active) {
      const p = t.priority as keyof PriorityMix;
      if (p in out) out[p]++;
    }
    return out;
  }, [tasks]);

  // ── Cycle-time histogram ────────────────────────────────────────────
  // Same buckets used by the scorecard so the language stays consistent
  // ("delivered in 0-1 days", etc.). Scoped to in-window completions.
  const cycleTimeDist = useMemo<CycleTimeBucket[]>(() => {
    const buckets: CycleTimeBucket[] = [
      { label: "Same day", count: 0 },
      { label: "1–2 days", count: 0 },
      { label: "3–5 days", count: 0 },
      { label: "6–10 days", count: 0 },
      { label: "10+ days", count: 0 },
    ];
    for (const t of tasks) {
      if (!inRange(completionDate(t), start, end)) continue;
      const days = cycleDays(t);
      if (days == null) continue;
      let idx: number;
      if (days < 1) idx = 0;
      else if (days <= 2) idx = 1;
      else if (days <= 5) idx = 2;
      else if (days <= 10) idx = 3;
      else idx = 4;
      buckets[idx].count++;
    }
    return buckets;
  }, [tasks, start, end]);

  // ── Top clients ────────────────────────────────────────────────────
  // Aggregate by client_id within the in-window task set (created OR
  // completed in window). Surfaces who's pulling on the team this period.
  const topClients = useMemo<TopClient[]>(() => {
    const inWindow = tasks.filter(
      (t) =>
        inRange(t.created_at, start, end) ||
        inRange(completionDate(t), start, end)
    );
    const byClient = new Map<
      string,
      { party_name: string; total: number; completed: number; active: number }
    >();
    for (const t of inWindow) {
      if (!t.client_id || !t.client) continue;
      const entry = byClient.get(t.client_id) ?? {
        party_name: t.client.party_name,
        total: 0,
        completed: 0,
        active: 0,
      };
      entry.total++;
      if (isFinished(t)) entry.completed++;
      else entry.active++;
      byClient.set(t.client_id, entry);
    }
    // Return the full sorted list — consumers (TopClientsCard) slice to
    // their preview window and use the rest for the expanded "View all"
    // dialog so they don't recompute the same map.
    return Array.from(byClient.entries())
      .map(([client_id, v]) => ({ client_id, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [tasks, start, end]);

  // ── Sparkline data (7 points across current period) ──────────────
  const sparklines = useMemo(() => {
    const buckets = 7;
    const span = end.getTime() - start.getTime();
    const step = span / buckets;

    const completed: number[] = [];
    const onTime: number[] = [];
    const created: number[] = [];
    // Per-bucket average delay (days late). 0 when no completions in the
    // bucket so the line stays anchored at the baseline.
    const avgDelay: number[] = [];

    for (let i = 0; i < buckets; i++) {
      const bStart = new Date(start.getTime() + i * step);
      const bEnd = new Date(start.getTime() + (i + 1) * step);

      const comp = tasks.filter((t) => inRange(completionDate(t), bStart, bEnd));
      completed.push(comp.length);
      onTime.push(comp.filter((t) => !isLateCompletion(t)).length);
      created.push(tasks.filter((t) => inRange(t.created_at, bStart, bEnd)).length);
      // Cycle-time sparkline (real duration) — pairs with the Avg Cycle tile.
      avgDelay.push(safeAvg(comp.map(cycleDays).filter((n): n is number => n !== null)));
    }

    return { completed, onTime, created, avgDelay };
  }, [tasks, start, end]);

  return {
    kpis,
    pipeline,
    volumeData,
    designerStats,
    kittingMix,
    priorityMix,
    cycleTimeDist,
    topClients,
    sparklines,
    tasks,
    periodStart: start,
    periodEnd: end,
    periodLabel,
    isLoading,
    error,
  };
}
