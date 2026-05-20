import { useMemo } from "react";
import {
  startOfWeek, startOfMonth, startOfQuarter,
  endOfWeek, endOfMonth, endOfQuarter,
  startOfDay, endOfDay, addDays, addWeeks,
  subWeeks, subMonths, subQuarters,
  format, isWithinInterval, parseISO,
  differenceInDays,
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
  avgDays: number;
  inProgress: number;
  score: number;
}

export interface TaskDashboardMetrics {
  kpis: {
    totalCompleted: KpiMetric;
    onTimeRate: KpiMetric;
    avgCompletionDays: KpiMetric;
    totalCreated: KpiMetric;
    activePipeline: number;
    urgentCount: number;
    overdueCount: number;
  };
  pipeline: PipelineItem[];
  volumeData: VolumePoint[];
  designerStats: DesignerTaskStat[];
  sparklines: { completed: number[]; onTime: number[]; created: number[] };
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
  if (t.status === "done") return t.updated_at;
  return null;
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

export function useTaskAnalytics(period: Period = "month"): TaskDashboardMetrics {
  const { tasks, isLoading, error: tasksError } = useTasks();
  const { profiles } = useProfiles({ roles: ["designer"] });
  const { codesByProfile } = useDesignerCodes();

  const error = tasksError || null;
  const now = useMemo(() => new Date(), []);
  const { start, end, prevStart, prevEnd } = useMemo(() => getPeriodRange(period, now), [period, now]);
  const periodLabel = useMemo(() => `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`, [start, end]);

  // ── KPIs ──────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const currCompleted = tasks.filter((t) => inRange(completionDate(t), start, end));
    const prevCompleted = tasks.filter((t) => inRange(completionDate(t), prevStart, prevEnd));
    const currCreated = tasks.filter((t) => inRange(t.created_at, start, end));
    const prevCreated = tasks.filter((t) => inRange(t.created_at, prevStart, prevEnd));

    const currOnTime = currCompleted.filter((t) => (t.delay_days ?? 999) <= 1).length;
    const prevOnTime = prevCompleted.filter((t) => (t.delay_days ?? 999) <= 1).length;
    const currOnTimeRate = currCompleted.length > 0 ? Math.round((currOnTime / currCompleted.length) * 100) : 0;
    const prevOnTimeRate = prevCompleted.length > 0 ? Math.round((prevOnTime / prevCompleted.length) * 100) : 0;

    const currAvg = safeAvg(currCompleted.map((t) => t.delay_days ?? 0));
    const prevAvg = safeAvg(prevCompleted.map((t) => t.delay_days ?? 0));

    return {
      totalCompleted: { current: currCompleted.length, previous: prevCompleted.length, trend: calcTrend(currCompleted.length, prevCompleted.length) },
      onTimeRate: { current: currOnTimeRate, previous: prevOnTimeRate, trend: calcTrend(currOnTimeRate, prevOnTimeRate) },
      avgCompletionDays: { current: currAvg, previous: prevAvg, trend: calcTrend(currAvg, prevAvg) },
      totalCreated: { current: currCreated.length, previous: prevCreated.length, trend: calcTrend(currCreated.length, prevCreated.length) },
      activePipeline: tasks.filter((t) => t.status !== "done").length,
      urgentCount: tasks.filter((t) => t.priority === "urgent" && t.status !== "done").length,
      overdueCount: tasks.filter((t) => t.status !== "done" && t.planned_deadline && new Date(t.planned_deadline) < new Date()).length,
    };
  }, [tasks, start, end, prevStart, prevEnd]);

  // ── Pipeline ──────────────────────────────────────────────────────
  const pipeline = useMemo(() => {
    const statuses = ["pool", "todo", "in_progress", "full_kitting", "done"];
    const total = tasks.length || 1;
    return statuses.map((s) => {
      const count = tasks.filter((t) => t.status === s).length;
      return { status: s, count, percentage: Math.round((count / total) * 100) };
    });
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
      const onTime = completed.filter((t) => (t.delay_days ?? 999) <= 1).length;
      const avgDays = safeAvg(completed.map((t) => t.delay_days ?? 0));
      const inProgress = myTasks.filter((t) => t.status === "in_progress").length;

      const codes = codesByProfile.get(p.id);
      const designerCode = codes?.[0]?.code?.slice(0, 1) ?? "—";

      return { id: p.id, full_name: p.full_name, avatar_url: p.avatar_url, designerCode, assigned, completed: completed.length, onTime, avgDays, inProgress, score: 0 };
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

  // ── Sparkline data (7 points across current period) ──────────────
  const sparklines = useMemo(() => {
    const buckets = 7;
    const span = end.getTime() - start.getTime();
    const step = span / buckets;

    const completed: number[] = [];
    const onTime: number[] = [];
    const created: number[] = [];

    for (let i = 0; i < buckets; i++) {
      const bStart = new Date(start.getTime() + i * step);
      const bEnd = new Date(start.getTime() + (i + 1) * step);

      const comp = tasks.filter((t) => inRange(completionDate(t), bStart, bEnd));
      completed.push(comp.length);
      onTime.push(comp.filter((t) => (t.delay_days ?? 999) <= 1).length);
      created.push(tasks.filter((t) => inRange(t.created_at, bStart, bEnd)).length);
    }

    return { completed, onTime, created };
  }, [tasks, start, end]);

  return { kpis, pipeline, volumeData, designerStats, sparklines, tasks, periodStart: start, periodEnd: end, periodLabel, isLoading, error };
}
