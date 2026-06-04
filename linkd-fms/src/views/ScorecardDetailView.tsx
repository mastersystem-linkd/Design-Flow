import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Check,
  Download,
  MessageSquare,
  Send as SendIcon,
  Trophy,
  AlertTriangle,
  CheckCircle,
  Activity,
  Sparkles,
  BarChart3,
  Calendar as CalendarIcon,
  Clock,
  Users,
  Flame,
  X,
  RotateCcw,
  Layers,
  Zap,
  GitBranch,
  TrendingUp,
  Pause,
  Lightbulb,
} from "lucide-react";
import {
  format,
  formatDistanceToNow,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  getDate,
  isSameDay,
  isWithinInterval,
  isValid,
  differenceInDays,
  subDays,
  subMonths,
  subWeeks,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
} from "date-fns";
import {
  AreaChart,
  Area,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  Badge,
  Button,
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
  SkeletonCard,
  EmptyState,
  toast,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import {
  useDesignerScorecard,
  type ScorecardActivity,
  type ScorecardInsight,
} from "@/hooks/useDesignerScorecard";
import { useConcepts } from "@/hooks/useConcepts";
import { useTasks } from "@/hooks/useTasks";
import { sendNotification } from "@/lib/notifications";
import { exportToCSV, type CsvColumn } from "@/lib/exportCSV";
import { isAdmin as isAdminCheck, isAdminOrCoordinator } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/constants";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { KpiCard } from "@/components/analytics/KpiCard";
import { ScoreRing } from "@/components/analytics/ScoreRing";
import { TextileHeroWrapper } from "@/components/analytics/TextileHeroWrapper";
import { ChartGradients, CHART_GRAD } from "@/lib/chartGradients";
import type { TaskWithRelations } from "@/types/database";

// ============================================================================
// Date-range state
// ============================================================================

type RangePreset = "7d" | "30d" | "90d" | "6mo" | "12mo" | "custom";

const RANGE_PRESETS: { value: RangePreset; label: string; days: number }[] = [
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "90d", label: "90 days", days: 90 },
  { value: "6mo", label: "6 months", days: 180 },
  { value: "12mo", label: "12 months", days: 365 },
];

// ============================================================================
// View
// ============================================================================

export function ScorecardDetailView() {
  const { profile: viewer } = useAuth();
  const navigate = useNavigate();
  const { designerId = "" } = useParams<{ designerId: string }>();
  const isAdmin = isAdminCheck(viewer?.role);
  // Coordinators can view any scorecard; MD feedback actions stay admin-only.
  const canView = isAdminOrCoordinator(viewer?.role);
  const isSelf = viewer?.id === designerId;

  // Range state — controls the heatmap + KPI computation
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Data sources
  const data = useDesignerScorecard(designerId, "month");
  const { concepts } = useConcepts();
  const { tasks } = useTasks();

  // Feedback form
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);

  // Compute the active range
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (preset === "custom") {
      const from = customFrom ? parseISO(customFrom) : null;
      const to = customTo ? parseISO(customTo) : null;
      if (from && to && isValid(from) && isValid(to) && from <= to) {
        return { rangeStart: from, rangeEnd: to };
      }
    }
    const days =
      RANGE_PRESETS.find((p) => p.value === preset)?.days ??
      RANGE_PRESETS.find((p) => p.value === "30d")!.days;
    const today = new Date();
    const start = subDays(today, days - 1);
    return { rangeStart: start, rangeEnd: today };
  }, [preset, customFrom, customTo]);

  // Filter tasks + concepts to the active range, joined to this designer
  const designerTasks = useMemo(
    () => tasks.filter((t) => t.assigned_to === designerId),
    [tasks, designerId]
  );
  const designerConcepts = useMemo(
    () => concepts.filter((c) => c.submitted_by === designerId),
    [concepts, designerId]
  );

  // ── Build per-day map: scheduled, completed, onTime, delayed, pending, total events
  const dayMap = useMemo(
    () => buildDayMap(designerTasks, designerConcepts, rangeStart, rangeEnd),
    [designerTasks, designerConcepts, rangeStart, rangeEnd]
  );

  // ── Period totals
  const totals = useMemo(() => {
    let scheduled = 0;
    let completed = 0;
    let onTime = 0;
    let delayed = 0;
    let pending = 0;
    let activeDays = 0;
    const delayValues: number[] = [];

    for (const t of designerTasks) {
      const d = parseISO(t.created_at);
      if (!isWithinInterval(d, { start: rangeStart, end: rangeEnd })) continue;
      scheduled++;
    }

    for (const cell of dayMap.values()) {
      if (cell.total > 0) activeDays++;
      completed += cell.completed;
      onTime += cell.onTime;
      delayed += cell.delayed;
      pending += cell.pending;
      delayValues.push(...cell.delayValues);
    }

    const onTimePct =
      completed > 0 ? Math.round((onTime / completed) * 100) : 0;
    const avgDelay =
      delayValues.length > 0
        ? Math.round(
            (delayValues.reduce((s, v) => s + v, 0) / delayValues.length) * 10
          ) / 10
        : 0;

    return {
      scheduled,
      completed,
      onTime,
      delayed,
      pending,
      activeDays,
      onTimePct,
      avgDelay,
    };
  }, [designerTasks, dayMap, rangeStart, rangeEnd]);

  // ── Trend (on-time %) — adapts granularity to the active range
  const monthlyTrend = useMemo(() => {
    const totalDays = differenceInDays(rangeEnd, rangeStart) + 1;
    const points: { month: string; pct: number; completed: number }[] = [];

    const countBucket = (bStart: Date, bEnd: Date) => {
      let comp = 0;
      let ot = 0;
      for (const t of designerTasks) {
        const done = completionDate(t);
        if (!done) continue;
        const d = parseISO(done);
        if (!isWithinInterval(d, { start: startOfDay(bStart), end: endOfDay(bEnd) })) continue;
        comp++;
        if ((t.delay_days ?? 999) <= 1) ot++;
      }
      return { comp, ot };
    };

    if (totalDays <= 14) {
      const allDays = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
      for (const day of allDays) {
        const { comp, ot } = countBucket(day, day);
        points.push({
          month: format(day, "dd"),
          pct: comp > 0 ? Math.round((ot / comp) * 100) : 0,
          completed: comp,
        });
      }
    } else if (totalDays <= 90) {
      let cursor = startOfWeek(rangeStart, { weekStartsOn: 1 });
      while (cursor <= rangeEnd) {
        const ws = cursor < rangeStart ? rangeStart : cursor;
        const weekEnd = endOfWeek(cursor, { weekStartsOn: 1 });
        const we = weekEnd > rangeEnd ? rangeEnd : weekEnd;
        const { comp, ot } = countBucket(ws, we);
        points.push({
          month: format(ws, "dd MMM"),
          pct: comp > 0 ? Math.round((ot / comp) * 100) : 0,
          completed: comp,
        });
        cursor = new Date(weekEnd.getTime() + 86400000);
      }
    } else {
      let cursor = startOfMonth(rangeStart);
      while (cursor <= rangeEnd) {
        const ms = cursor < rangeStart ? rangeStart : cursor;
        const monthEnd = endOfMonth(cursor);
        const me = monthEnd > rangeEnd ? rangeEnd : monthEnd;
        const { comp, ot } = countBucket(ms, me);
        points.push({
          month: format(cursor, "MMM").toUpperCase(),
          pct: comp > 0 ? Math.round((ot / comp) * 100) : 0,
          completed: comp,
        });
        const nextMonth = new Date(cursor);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        cursor = nextMonth;
      }
    }
    return points;
  }, [designerTasks, rangeStart, rangeEnd]);

  // ── Weekday pattern (Mon-Sun) within active range
  const weekdayPattern = useMemo(() => {
    const labels = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    const buckets = Array.from({ length: 7 }, () => ({
      volume: 0,
      onTime: 0,
    }));
    for (const t of designerTasks) {
      const done = completionDate(t);
      if (!done) continue;
      const d = parseISO(done);
      if (!isWithinInterval(d, { start: rangeStart, end: rangeEnd })) continue;
      // JS getDay: 0 = Sun. Convert to Mon-first: (getDay + 6) % 7
      const wd = (getDay(d) + 6) % 7;
      buckets[wd]!.volume++;
      if ((t.delay_days ?? 999) <= 1) buckets[wd]!.onTime++;
    }
    return buckets.map((b, i) => ({
      label: labels[i]!,
      volume: b.volume,
      onTime: b.onTime,
      pct: b.volume > 0 ? Math.round((b.onTime / b.volume) * 100) : 0,
    }));
  }, [designerTasks, rangeStart, rangeEnd]);

  // ── Best streak (longest run of consecutive active days within range)
  const bestStreak = useMemo(() => {
    const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
    let best = 0;
    let cur = 0;
    let currentStreak = 0;
    let isCurrent = true;
    for (let i = days.length - 1; i >= 0; i--) {
      const key = format(days[i]!, "yyyy-MM-dd");
      const c = dayMap.get(key);
      const active = (c?.total ?? 0) > 0;
      if (active && isCurrent) currentStreak++;
      else isCurrent = false;
    }
    for (const d of days) {
      const key = format(d, "yyyy-MM-dd");
      const c = dayMap.get(key);
      if ((c?.total ?? 0) > 0) {
        cur++;
        if (cur > best) best = cur;
      } else {
        cur = 0;
      }
    }
    return { best, current: currentStreak };
  }, [dayMap, rangeStart, rangeEnd]);

  // ── Reliability score: 50 (on-time) + 30 (throughput) + 20 (consistency)
  const reliability = useMemo(() => {
    const onTimePts = totals.completed > 0 ? (totals.onTime / totals.completed) * 50 : 0;
    // Throughput: 30 pts at 30+ completions, scale linearly
    const throughputPts = Math.min(30, (totals.completed / 30) * 30);
    // Consistency: 20 pts when fully active every day
    const periodDays = Math.max(
      1,
      differenceInDays(rangeEnd, rangeStart) + 1
    );
    const consistencyPts = (totals.activeDays / periodDays) * 20;
    const total = Math.round(onTimePts + throughputPts + consistencyPts);
    return {
      total,
      onTime: Math.round(onTimePts),
      throughput: Math.round(throughputPts),
      consistency: Math.round(consistencyPts),
    };
  }, [totals, rangeEnd, rangeStart]);

  // ── Cycle time distribution: bins of delay_days for completed tasks
  const cycleTimeDist = useMemo(() => {
    const bins = [
      { label: "0d", color: "bg-success", count: 0 },
      { label: "1d", color: "bg-success/70", count: 0 },
      { label: "2-3d", color: "bg-warning", count: 0 },
      { label: "4-7d", color: "bg-warning/70", count: 0 },
      { label: "8+d", color: "bg-destructive", count: 0 },
    ];
    for (const t of designerTasks) {
      const done = completionDate(t);
      if (!done) continue;
      const dt = parseISO(done);
      if (!isWithinInterval(dt, { start: rangeStart, end: rangeEnd })) continue;
      const d = t.delay_days ?? 0;
      const idx = d <= 0 ? 0 : d === 1 ? 1 : d <= 3 ? 2 : d <= 7 ? 3 : 4;
      bins[idx]!.count++;
    }
    return bins;
  }, [designerTasks, rangeStart, rangeEnd]);

  // ── Task priority breakdown (created in range)
  const priorityBreakdown = useMemo(() => {
    const counts: Record<"low" | "normal" | "high" | "urgent", number> = {
      low: 0,
      normal: 0,
      high: 0,
      urgent: 0,
    };
    for (const t of designerTasks) {
      const d = parseISO(t.created_at);
      if (!isWithinInterval(d, { start: rangeStart, end: rangeEnd })) continue;
      counts[t.priority]++;
    }
    return [
      { label: "Urgent", value: counts.urgent, color: "bg-destructive" },
      { label: "High", value: counts.high, color: "bg-warning" },
      { label: "Normal", value: counts.normal, color: "bg-primary" },
      { label: "Low", value: counts.low, color: "bg-muted-foreground/40" },
    ];
  }, [designerTasks, rangeStart, rangeEnd]);

  // ── Vs Team Average: 4 comparison metrics
  const vsTeam = useMemo(() => {
    // Compute team totals across all designers in the same range
    const designerIds = new Set(
      tasks.map((t) => t.assigned_to).filter((id): id is string => !!id)
    );
    const designerCount = Math.max(1, designerIds.size);

    let teamCompleted = 0;
    let teamOnTime = 0;
    const teamDelays: number[] = [];
    for (const t of tasks) {
      const done = completionDate(t);
      if (!done) continue;
      const dt = parseISO(done);
      if (!isWithinInterval(dt, { start: rangeStart, end: rangeEnd })) continue;
      teamCompleted++;
      if ((t.delay_days ?? 999) <= 1) teamOnTime++;
      teamDelays.push(t.delay_days ?? 0);
    }
    const teamAvgCompleted = Math.round((teamCompleted / designerCount) * 10) / 10;
    const teamOnTimePct =
      teamCompleted > 0 ? Math.round((teamOnTime / teamCompleted) * 100) : 0;
    const teamAvgDelay =
      teamDelays.length > 0
        ? Math.round(
            (teamDelays.reduce((s, v) => s + v, 0) / teamDelays.length) * 10
          ) / 10
        : 0;

    // Concept approval rate (team)
    let teamSub = 0;
    let teamApp = 0;
    let teamRev = 0;
    for (const c of concepts) {
      const cd = parseISO(c.created_at);
      if (!isWithinInterval(cd, { start: rangeStart, end: rangeEnd })) continue;
      teamSub++;
      if (c.md_status !== "pending") teamRev++;
      if (c.md_status === "approved") teamApp++;
    }
    const teamApprovalPct =
      teamRev > 0 ? Math.round((teamApp / teamRev) * 100) : 0;

    // This designer's approval rate
    let myRev = 0;
    let myApp = 0;
    for (const c of designerConcepts) {
      const cd = parseISO(c.created_at);
      if (!isWithinInterval(cd, { start: rangeStart, end: rangeEnd })) continue;
      if (c.md_status !== "pending") myRev++;
      if (c.md_status === "approved") myApp++;
    }
    const myApprovalPct = myRev > 0 ? Math.round((myApp / myRev) * 100) : 0;

    return [
      {
        label: "Completed",
        me: totals.completed,
        team: teamAvgCompleted,
        unit: "",
        higherIsBetter: true,
      },
      {
        label: "On-Time %",
        me: totals.onTimePct,
        team: teamOnTimePct,
        unit: "%",
        higherIsBetter: true,
      },
      {
        label: "Avg Delay",
        me: totals.avgDelay,
        team: teamAvgDelay,
        unit: "d",
        higherIsBetter: false,
      },
      {
        label: "Approval Rate",
        me: myApprovalPct,
        team: teamApprovalPct,
        unit: "%",
        higherIsBetter: true,
      },
    ];
  }, [tasks, concepts, designerConcepts, totals, rangeStart, rangeEnd]);

  // ── Concept Pipeline Funnel (for this designer, in range)
  const conceptFunnel = useMemo(() => {
    const inRange = designerConcepts.filter((c) =>
      isWithinInterval(parseISO(c.created_at), {
        start: rangeStart,
        end: rangeEnd,
      })
    );
    const submitted = inRange.length;
    const reviewed = inRange.filter((c) => c.md_status !== "pending").length;
    const approved = inRange.filter((c) => c.md_status === "approved").length;
    const finalized = inRange.filter(
      (c) => c.md_status === "approved" && c.designer_actual_date
    ).length;
    return { submitted, reviewed, approved, finalized };
  }, [designerConcepts, rangeStart, rangeEnd]);

  // ── Weekly throughput sparkline — adapts to the active date range
  const throughputWeekly = useMemo(() => {
    const weeks: { label: string; tasks: number; concepts: number; total: number }[] = [];
    let cursor = startOfWeek(rangeStart, { weekStartsOn: 1 });
    while (cursor <= rangeEnd) {
      const ws = cursor < rangeStart ? rangeStart : cursor;
      const weekEnd = endOfWeek(cursor, { weekStartsOn: 1 });
      const we = weekEnd > rangeEnd ? rangeEnd : weekEnd;
      let taskCount = 0;
      let conceptCount = 0;
      for (const t of designerTasks) {
        const done = completionDate(t);
        if (!done) continue;
        const d = parseISO(done);
        if (isWithinInterval(d, { start: startOfDay(ws), end: endOfDay(we) })) taskCount++;
      }
      for (const c of designerConcepts) {
        if (c.md_status !== "approved") continue;
        const r = c.md_actual_date ?? c.md_reviewed_at;
        if (!r) continue;
        const rd = parseISO(r);
        if (isWithinInterval(rd, { start: startOfDay(ws), end: endOfDay(we) })) conceptCount++;
      }
      weeks.push({
        label: format(ws, "MMM d"),
        tasks: taskCount,
        concepts: conceptCount,
        total: taskCount + conceptCount,
      });
      cursor = new Date(weekEnd.getTime() + 86400000);
    }
    return weeks;
  }, [designerTasks, designerConcepts, rangeStart, rangeEnd]);

  // ── Momentum chart data — adapts granularity to the active range
  const momentumData = useMemo(() => {
    const totalDays = differenceInDays(rangeEnd, rangeStart) + 1;
    type MPoint = { month: string; conceptsApproved: number; tasksCompleted: number };
    const points: MPoint[] = [];

    const countBucket = (bStart: Date, bEnd: Date) => {
      let ca = 0;
      let tc = 0;
      for (const c of designerConcepts) {
        if (c.md_status !== "approved") continue;
        const rd = c.md_actual_date ?? c.md_reviewed_at;
        if (!rd) continue;
        const d = parseISO(rd);
        if (isWithinInterval(d, { start: startOfDay(bStart), end: endOfDay(bEnd) })) ca++;
      }
      for (const t of designerTasks) {
        const done = completionDate(t);
        if (!done) continue;
        const d = parseISO(done);
        if (isWithinInterval(d, { start: startOfDay(bStart), end: endOfDay(bEnd) })) tc++;
      }
      return { ca, tc };
    };

    if (totalDays <= 14) {
      const allDays = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
      for (const day of allDays) {
        const { ca, tc } = countBucket(day, day);
        points.push({ month: format(day, "dd MMM"), conceptsApproved: ca, tasksCompleted: tc });
      }
    } else if (totalDays <= 90) {
      let cursor = startOfWeek(rangeStart, { weekStartsOn: 1 });
      while (cursor <= rangeEnd) {
        const ws = cursor < rangeStart ? rangeStart : cursor;
        const weekEnd = endOfWeek(cursor, { weekStartsOn: 1 });
        const we = weekEnd > rangeEnd ? rangeEnd : weekEnd;
        const { ca, tc } = countBucket(ws, we);
        points.push({ month: format(ws, "dd MMM"), conceptsApproved: ca, tasksCompleted: tc });
        cursor = new Date(weekEnd.getTime() + 86400000);
      }
    } else {
      let cursor = startOfMonth(rangeStart);
      while (cursor <= rangeEnd) {
        const ms = cursor < rangeStart ? rangeStart : cursor;
        const monthEnd = endOfMonth(cursor);
        const me = monthEnd > rangeEnd ? rangeEnd : monthEnd;
        const { ca, tc } = countBucket(ms, me);
        points.push({ month: format(cursor, "MMM yy"), conceptsApproved: ca, tasksCompleted: tc });
        const nextMonth = new Date(cursor);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        cursor = nextMonth;
      }
    }
    return points;
  }, [designerTasks, designerConcepts, rangeStart, rangeEnd]);

  // ── Selected day events for the drill-in panel
  const selectedDayEvents = useMemo(() => {
    if (!selectedDay) return [];
    const events: Array<{
      kind: "task" | "concept";
      title: string;
      sub: string;
      status: string;
      tone: "success" | "warning" | "destructive" | "primary";
    }> = [];
    for (const t of designerTasks) {
      const done = completionDate(t);
      if (done && done.startsWith(selectedDay)) {
        const onTime = (t.delay_days ?? 999) <= 1;
        events.push({
          kind: "task",
          title: t.concept ?? t.task_code,
          sub: `Completed · ${t.task_code}`,
          status: onTime ? "On-time" : `+${t.delay_days ?? 0}d late`,
          tone: onTime ? "success" : "destructive",
        });
      }
      if (t.assigned_at && t.assigned_at.startsWith(selectedDay)) {
        events.push({
          kind: "task",
          title: t.concept ?? t.task_code,
          sub: `Assigned · ${t.task_code}`,
          status: "Assigned",
          tone: "primary",
        });
      }
    }
    for (const c of designerConcepts) {
      if (c.created_at.startsWith(selectedDay)) {
        events.push({
          kind: "concept",
          title: c.title,
          sub: `Submitted · ${c.concept_code}`,
          status: "Submitted",
          tone: "primary",
        });
      }
      const reviewedAt = c.md_actual_date ?? c.md_reviewed_at;
      if (reviewedAt && reviewedAt.startsWith(selectedDay)) {
        const tone =
          c.md_status === "approved"
            ? "success"
            : c.md_status === "rejected"
            ? "destructive"
            : "warning";
        events.push({
          kind: "concept",
          title: c.title,
          sub: `Reviewed · ${c.concept_code}`,
          status:
            c.md_status === "approved"
              ? "Approved"
              : c.md_status === "rejected"
              ? "Rejected"
              : "Revision",
          tone,
        });
      }
    }
    return events;
  }, [selectedDay, designerTasks, designerConcepts]);

  // ── Permission gate ──
  if (!canView && !isSelf) {
    return (
      <div className="mx-auto max-w-md py-20">
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10 text-destructive" />}
          title="Restricted"
          description="Scorecards are visible to admins, coordinators, or the designer viewing their own."
        />
      </div>
    );
  }

  if (data.isLoading || !data.profile) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <SkeletonCard />
          <div className="lg:col-span-2">
            <SkeletonCard />
          </div>
        </div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="mx-auto max-w-md py-20">
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10 text-destructive" />}
          title="Couldn't load scorecard"
          description={data.error}
        />
      </div>
    );
  }

  const tier = reliabilityTier(reliability.total);

  async function handleSendFeedback() {
    const text = feedback.trim();
    if (!text) {
      toast.error("Write a message first");
      return;
    }
    setSending(true);
    const { error } = await sendNotification(
      designerId,
      "Feedback from Admin",
      text,
      "info",
      "/notifications"
    );
    setSending(false);
    if (error) toast.error(error);
    else {
      toast.success("Feedback sent");
      setFeedback("");
      setFeedbackOpen(false);
    }
  }

  function handleExport() {
    const taskRows = designerTasks.map((t) => ({
      kind: "Task",
      code: t.task_code,
      title: t.concept ?? "",
      status: t.status,
      date: t.created_at,
      delayDays: t.delay_days ?? "",
    }));
    const conceptRows = designerConcepts.map((c) => ({
      kind: "Concept",
      code: c.concept_code,
      title: c.title,
      status: c.md_status,
      date: c.created_at,
      delayDays: "",
    }));
    const rows = [...conceptRows, ...taskRows] as Record<string, unknown>[];
    if (rows.length === 0) {
      toast.info("Nothing to export for this designer");
      return;
    }
    const cols: CsvColumn<Record<string, unknown>>[] = [
      { key: "kind", label: "Type" },
      { key: "code", label: "Code" },
      { key: "title", label: "Title/Concept" },
      { key: "status", label: "Status" },
      { key: "date", label: "Date" },
      { key: "delayDays", label: "Delay Days" },
    ];
    const safeName = (data.profile?.full_name ?? "designer")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    exportToCSV(rows, `scorecard-${safeName}`, cols);
  }

  return (
    <div className="space-y-3 pb-6">
      {/* Back + actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to={ROUTES.scorecards}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All scorecards
        </Link>
        {isAdmin && !isSelf && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFeedbackOpen((o) => !o)}
            >
              <MessageSquare className="mr-1 h-3 w-3" />
              Feedback
            </Button>
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="mr-1 h-3 w-3" />
              Export
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate(ROUTES.team)}
            >
              <Users className="mr-1 h-3 w-3" />
              Team
            </Button>
          </div>
        )}
      </div>

      {feedbackOpen && isAdmin && !isSelf && (
        <Card className="border border-border">
          <div className="space-y-2 p-3">
            <p className="text-xs font-medium text-foreground">
              Send feedback to {data.profile.full_name.split(" ")[0]}
            </p>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Write feedback…"
              rows={3}
              className="w-full resize-none rounded-md border border-border bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => void handleSendFeedback()}
                disabled={sending || !feedback.trim()}
              >
                <SendIcon className="mr-1 h-3 w-3" />
                {sending ? "Sending…" : "Send"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFeedbackOpen(false);
                  setFeedback("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── HERO: identity + date filter + reliability ── */}
      <Card className="border border-border">
        <div className="flex flex-col gap-2 p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
            <div className="flex items-center gap-3 shrink-0">
              <Avatar className="h-10 w-10">
                {data.profile.avatar_url ? (
                  <AvatarImage src={data.profile.avatar_url} />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                  {getInitials(data.profile.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h1 className="text-base font-semibold tracking-tight text-foreground">
                  {data.profile.full_name}
                </h1>
                <p className="text-[11px] text-muted-foreground">
                  {ROLE_LABELS[data.profile.role]}
                  {data.designerCodes.length > 0 && (
                    <> · <span className="font-mono">{data.designerCodes.join(", ")}</span></>
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
              <RangeControls
                preset={preset}
                setPreset={setPreset}
                customFrom={customFrom}
                customTo={customTo}
                setCustomFrom={setCustomFrom}
                setCustomTo={setCustomTo}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
              />
            </div>
            <div className="shrink-0">
              <ReliabilityGauge reliability={reliability} tier={tier} />
            </div>
          </div>
        </div>
      </Card>

      {/* ── KPI strip — same KpiCard tile used on every other dashboard
           (Concept, Task, Sampling, Scorecards list), wrapped in the
           shared TextileHeroWrapper. */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="grid grid-cols-2 divide-x divide-y divide-border/30 sm:grid-cols-3 sm:divide-y-0 md:grid-cols-5">
          <KpiCard
            flat
            centered
            icon={<CalendarIcon className="h-4 w-4 text-primary" />}
            label="Total Scheduled"
            value={totals.scheduled}
            tintClass="bg-primary/10"
            sub="tasks + concepts in range"
          />
          <KpiCard
            flat
            centered
            icon={<CheckCircle className="h-4 w-4 text-success" />}
            label="Completed"
            value={totals.completed}
            tintClass="bg-success/10"
            valueColor="text-success"
            sub={totals.completed > 0 ? "delivered this period" : "nothing closed yet"}
          />
          <KpiCard
            flat
            centered
            icon={<Clock className="h-4 w-4 text-primary" />}
            label="On-Time %"
            value={totals.completed === 0 ? "—" : `${totals.onTimePct}%`}
            tintClass={
              totals.completed === 0
                ? "bg-secondary"
                : totals.onTimePct >= 85
                  ? "bg-success/10"
                  : totals.onTimePct >= 70
                    ? "bg-warning/10"
                    : "bg-destructive/10"
            }
            valueColor={
              totals.completed === 0
                ? "text-muted-foreground"
                : totals.onTimePct >= 85
                  ? "text-success"
                  : totals.onTimePct >= 70
                    ? "text-warning"
                    : "text-destructive"
            }
            sub={
              totals.completed === 0
                ? "no completions yet"
                : totals.onTimePct >= 85
                  ? "on target"
                  : "watch closely"
            }
          />
          <KpiCard
            flat
            centered
            icon={<AlertTriangle className="h-4 w-4 text-warning" />}
            label="Avg Delay"
            value={`${totals.avgDelay}d`}
            tintClass={
              totals.completed === 0
                ? "bg-secondary"
                : totals.avgDelay <= 1
                  ? "bg-success/10"
                  : totals.avgDelay <= 3
                    ? "bg-warning/10"
                    : "bg-destructive/10"
            }
            valueColor={
              totals.completed === 0
                ? "text-muted-foreground"
                : totals.avgDelay <= 1
                  ? "text-success"
                  : totals.avgDelay <= 3
                    ? "text-warning"
                    : "text-destructive"
            }
            sub={totals.completed === 0 ? "no completions" : "avg vs. plan"}
          />
          <KpiCard
            flat
            centered
            icon={<Flame className="h-4 w-4 text-primary" />}
            label="Best Streak"
            value={bestStreak.best}
            tintClass={bestStreak.best > 0 ? "bg-primary/10" : "bg-secondary"}
            valueColor={bestStreak.best > 0 ? "text-primary" : "text-muted-foreground"}
            sub={
              bestStreak.current > 0
                ? `Current: ${bestStreak.current}`
                : "no active streak"
            }
          />
        </div>
      </div>

      {/* ── ROW: Concept + Task performance (detailed score cards) ──
           Each card now follows the textile / hero pattern from
           CLAUDE.md §8.2: tone-coloured top accent bar matching the
           score quality, icon-chipped header with subtitle, and a
           HERO SCORE block as the visual centrepiece (big tabular
           number + quality label like "Excellent" / "Needs Focus").
           See SCORE_TONE below for the tier definitions. */}
      <div className="grid gap-3 lg:grid-cols-2">
        <ScoreCard
          icon={<Lightbulb className="h-5 w-5" />}
          title="Concept Performance"
          subtitle="Submission → MD approval pipeline"
          score={data.concept.score}
        >
          {/* Donut + breakdown bars */}
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-6">
            <ConceptDonut
              approved={data.concept.approved}
              revisions={data.concept.revisions}
              rejected={data.concept.rejected}
              pending={data.concept.pending}
              total={data.concept.submitted}
            />
            <div className="flex-1 space-y-3">
              <p className="text-[11px] font-medium text-muted-foreground">
                50 marks per{" "}
                <span className="font-semibold text-foreground">finally-approved</span>{" "}
                concept · target 2
              </p>
              <ScoreBar
                label="Concept 1"
                points={data.concept.completed >= 1 ? 50 : 0}
                max={50}
                fillClass="bg-success"
                index={0}
              />
              <ScoreBar
                label="Concept 2"
                points={data.concept.completed >= 2 ? 50 : 0}
                max={50}
                fillClass="bg-success"
                index={1}
              />
              {data.concept.approved > data.concept.completed && (
                <p className="text-[11px] font-medium text-warning">
                  {data.concept.approved - data.concept.completed} approved, awaiting
                  final approval — no marks until then.
                </p>
              )}
            </div>
          </div>

          {/* Avg review time inline footnote */}
          <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
            <span className="text-muted-foreground">Avg review time</span>
            <span
              className={cn(
                "font-bold tabular-nums",
                data.concept.avgReviewHours === 0
                  ? "text-muted-foreground"
                  : data.concept.avgReviewHours < 24
                  ? "text-success"
                  : data.concept.avgReviewHours < 48
                  ? "text-warning"
                  : "text-destructive"
              )}
            >
              {data.concept.avgReviewHours === 0 ? "—" : `${data.concept.avgReviewHours}h`}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
              target &lt; 24h
            </span>
          </div>

          {/* Completion + revision-cycle stat strip — refined as side-by-
              side glass tiles with their own tone-coloured accent so the
              shipped-vs-approved gap reads at a glance. */}
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <StatTile
              label="Shipped"
              value={
                <>
                  {data.concept.completed}
                  <span className="text-base font-medium text-muted-foreground/50">
                    /{data.concept.approved}
                  </span>
                </>
              }
              hint={
                data.concept.approved > 0
                  ? `${data.concept.completionRate}% finalised`
                  : "no approvals yet"
              }
              tone={
                data.concept.approved === 0
                  ? "muted"
                  : data.concept.completionRate >= 70
                  ? "success"
                  : data.concept.completionRate >= 40
                  ? "warning"
                  : "destructive"
              }
            />
            <StatTile
              label="Revision Cycles"
              value={data.concept.revisionCycles}
              hint={
                data.concept.submitted > 0 && data.concept.revisionCycles > 0
                  ? `${(data.concept.revisionCycles / data.concept.submitted).toFixed(1)} per submission`
                  : data.concept.submitted > 0
                  ? "first-pass clean"
                  : "—"
              }
              tone={
                data.concept.revisionCycles === 0 && data.concept.submitted > 0
                  ? "success"
                  : data.concept.submitted > 0 &&
                    data.concept.revisionCycles / data.concept.submitted > 0.5
                  ? "destructive"
                  : "muted"
              }
            />
          </div>

            {/* ── Post-Approval Pipeline — work-status lifecycle metrics
                 from migration 0026. Hidden when the designer has no
                 lifecycle data yet so we don't show four "—" tiles. */}
          {(data.concept.firstPassRate !== null ||
            data.concept.avgRevisionRounds !== null ||
            data.concept.avgDesignDays !== null ||
            data.concept.holdRate !== null) && (
            <div className="mt-4 rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] via-card to-card p-3.5">
              <div className="mb-2.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground/85">
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <Sparkles className="h-2.5 w-2.5" />
                </div>
                Post-Approval Pipeline
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <LifecycleStat
                  icon={<Sparkles className="h-3 w-3" />}
                  label="First-Pass"
                  value={
                    data.concept.firstPassRate !== null
                      ? `${data.concept.firstPassRate}%`
                      : "—"
                  }
                  accentClass={
                    data.concept.firstPassRate === null
                      ? undefined
                      : data.concept.firstPassRate >= 80
                        ? "text-success"
                        : data.concept.firstPassRate >= 60
                          ? "text-warning"
                          : "text-destructive"
                  }
                />
                <LifecycleStat
                  icon={<RotateCcw className="h-3 w-3" />}
                  label="Avg Rounds"
                  value={
                    data.concept.avgRevisionRounds !== null
                      ? data.concept.avgRevisionRounds.toFixed(1)
                      : "—"
                  }
                />
                <LifecycleStat
                  icon={<CalendarIcon className="h-3 w-3" />}
                  label="Working Days"
                  value={
                    data.concept.avgDesignDays !== null
                      ? `${data.concept.avgDesignDays}d`
                      : "—"
                  }
                />
                <LifecycleStat
                  icon={<Pause className="h-3 w-3" />}
                  label="Hold Rate"
                  value={
                    data.concept.holdRate !== null
                      ? `${data.concept.holdRate}%`
                      : "—"
                  }
                  sub={
                    data.concept.totalHolds > 0
                      ? `${data.concept.totalHolds} total`
                      : undefined
                  }
                  accentClass={
                    data.concept.holdRate === null
                      ? undefined
                      : data.concept.holdRate <= 20
                        ? "text-success"
                        : data.concept.holdRate <= 50
                          ? "text-warning"
                          : "text-destructive"
                  }
                />
              </div>
            </div>
          )}
        </ScoreCard>

        <ScoreCard
          icon={<Activity className="h-5 w-5" />}
          title="Task Performance"
          subtitle="Briefs claimed → completed"
          score={data.task.score}
        >
          {/* Pipeline bar */}
          <DetailedPipelineBar
            completed={data.task.completed}
            inProgress={data.task.inProgress}
            assigned={data.task.assigned}
          />

          {/* Score breakdown bars */}
          <div className="mt-5 space-y-3">
            <ScoreBar label="Volume" points={data.task.breakdown.volume} max={30} fillClass="bg-primary" index={0} />
            <ScoreBar label="On-Time" points={data.task.breakdown.onTime} max={35} fillClass="bg-success" index={1} />
            <ScoreBar label="Speed" points={data.task.breakdown.speed} max={20} fillClass="bg-primary" index={2} />
            <ScoreBar label="Active" points={data.task.breakdown.active} max={15} fillClass="bg-primary" index={3} />
          </div>

          {/* Bottom stat tiles — 3 column grid, same StatTile primitive as
              the Concept card's footer so the visual rhythm is consistent.
              Tones drive the value colour + ring + accent automatically. */}
          <div className="mt-5 grid grid-cols-3 gap-2.5">
            <StatTile
              label="Avg Completion"
              value={data.task.completed === 0 ? "—" : `${data.task.avgDays}d`}
              hint={(() => {
                if (data.task.completed === 0 || data.task.teamAvgDays === 0) return undefined;
                const delta = Math.round((data.task.avgDays - data.task.teamAvgDays) * 10) / 10;
                if (Math.abs(delta) < 0.1) return "on team avg";
                return delta > 0 ? `+${delta}d slower` : `${delta}d faster`;
              })()}
              tone={
                data.task.completed === 0
                  ? "muted"
                  : data.task.avgDays < 3
                  ? "success"
                  : data.task.avgDays <= 5
                  ? "warning"
                  : "destructive"
              }
            />
            <StatTile
              label="Cycle Time"
              value={data.task.completed === 0 ? "—" : `${data.task.avgCycleDays}d`}
              hint="assigned → done"
              tone={
                data.task.completed === 0
                  ? "muted"
                  : data.task.avgCycleDays <= 3
                  ? "success"
                  : data.task.avgCycleDays <= 6
                  ? "warning"
                  : "destructive"
              }
            />
            <StatTile
              label="Late"
              value={
                <>
                  {data.task.late}
                  {data.task.completed > 0 && (
                    <span className="text-base font-medium text-muted-foreground/50">
                      /{data.task.completed}
                    </span>
                  )}
                </>
              }
              hint="completions"
              tone={
                data.task.late === 0
                  ? "success"
                  : data.task.late > data.task.onTime
                  ? "destructive"
                  : "warning"
              }
            />
          </div>
        </ScoreCard>
      </div>

      {/* ── ROW: Momentum (recharts area) — responds to date filter ── */}
      <Card className="border border-border">
        <div className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Momentum
            </h3>
            <span className="text-xs text-muted-foreground">
              concepts approved + tasks completed
            </span>
          </div>
          <MomentumChart data={momentumData} />
        </div>
      </Card>

      {/* ── ROW: Heatmap (compact) + Composition donut + Weekly throughput ── */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {/* Heatmap takes 2/4 cols */}
        <Card className="border border-border lg:col-span-2">
          <div className="p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Daily
                </p>
                <h3 className="text-sm font-semibold text-foreground">
                  Heatmap · click a day to drill in
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[10px]">
                <LegendChip color="bg-success" label="ON-TIME" />
                <LegendChip color="bg-warning" label="MIXED" />
                <LegendChip color="bg-destructive" label="DELAYED" />
                <LegendChip color="bg-muted" label="NONE" />
              </div>
            </div>

            <CalendarHeatmap
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              dayMap={dayMap}
              selectedDay={selectedDay}
              onSelect={(day) =>
                setSelectedDay((cur) => (cur === day ? null : day))
              }
            />

            <Dialog
              open={selectedDay !== null}
              onOpenChange={(open) => { if (!open) setSelectedDay(null); }}
            >
              <DialogContent className="flex max-h-[80vh] max-w-md flex-col gap-0 overflow-hidden p-0">
                <DrillInPanel
                  date={selectedDay ?? ""}
                  cell={selectedDay ? dayMap.get(selectedDay) ?? null : null}
                  events={selectedDayEvents}
                  onClose={() => setSelectedDay(null)}
                />
              </DialogContent>
            </Dialog>
          </div>
        </Card>

        {/* Composition donut */}
        <Card className="h-full border border-border">
          <div className="flex h-full flex-col p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Composition
            </p>
            <h3 className="text-sm font-semibold text-foreground">
              On-time · Late · Pending
            </h3>
            <div className="flex flex-1 items-center">
              <div className="w-full">
                <CompositionDonut
                  onTime={totals.onTime}
                  late={totals.delayed}
                  pending={totals.pending}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Weekly throughput sparkline */}
        <Card className="h-full border border-border">
          <div className="flex h-full flex-col p-4">
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              <span>Throughput</span>
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Weekly Throughput
            </h3>
            <div className="flex flex-1 items-center">
              <div className="w-full">
                <ThroughputSparkline data={throughputWeekly} />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── ROW: Priority + Vs Team + Concept Funnel ──
          `items-stretch` + `h-full` on every card so the priority donut
          (now substantially taller after the redesign) doesn't leave gaps
          next to its row-mates. */}
      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <Card className="h-full border border-border">
          <div className="flex h-full flex-col p-4">
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Zap className="h-3 w-3" />
              <span>Priority</span>
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Task priority mix
            </h3>
            <div className="flex-1">
              <PriorityBreakdown data={priorityBreakdown} />
            </div>
          </div>
        </Card>

        <Card className="h-full border border-border">
          <div className="flex h-full flex-col p-4">
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Layers className="h-3 w-3" />
              <span>Comparison</span>
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              You vs team average
            </h3>
            <div className="flex-1">
              <VsTeamChart data={vsTeam} />
            </div>
          </div>
        </Card>

        <Card className="h-full border border-border">
          <div className="flex h-full flex-col p-4">
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <GitBranch className="h-3 w-3" />
              <span>Concepts</span>
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Pipeline funnel
            </h3>
            <div className="flex flex-1 items-center">
              <div className="w-full">
                <ConceptFunnelChart data={conceptFunnel} />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Activity + Insights — compact cards, click to expand ── */}
      <ActivityInsightsRow activity={data.activity} insights={data.insights} />
    </div>
  );
}

// ============================================================================
// Helpers + sub-components
// ============================================================================

interface DayCell {
  scheduled: number;
  completed: number;
  onTime: number;
  delayed: number;
  pending: number;
  conceptEvents: number;
  total: number;
  delayValues: number[];
}

function buildDayMap(
  tasks: TaskWithRelations[],
  concepts: ReturnType<typeof useConcepts>["concepts"],
  rangeStart: Date,
  rangeEnd: Date
): Map<string, DayCell> {
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const map = new Map<string, DayCell>();
  for (const d of days) {
    map.set(format(d, "yyyy-MM-dd"), {
      scheduled: 0,
      completed: 0,
      onTime: 0,
      delayed: 0,
      pending: 0,
      conceptEvents: 0,
      total: 0,
      delayValues: [],
    });
  }

  for (const t of tasks) {
    // Assignment/scheduled
    const created = parseISO(t.created_at);
    if (isWithinInterval(created, { start: startOfDay(rangeStart), end: endOfDay(rangeEnd) })) {
      const key = format(created, "yyyy-MM-dd");
      const ex = map.get(key);
      if (ex) ex.scheduled++;
    }
    // Completion
    const done = completionDate(t);
    if (done) {
      const dt = parseISO(done);
      if (isWithinInterval(dt, { start: startOfDay(rangeStart), end: endOfDay(rangeEnd) })) {
        const key = format(dt, "yyyy-MM-dd");
        const ex = map.get(key);
        if (ex) {
          ex.completed++;
          const delay = t.delay_days ?? 0;
          ex.delayValues.push(delay);
          if (delay <= 1) ex.onTime++;
          else ex.delayed++;
        }
      }
    } else if (t.status === "in_progress") {
      // Reflect pending on its created date
      if (isWithinInterval(created, { start: startOfDay(rangeStart), end: endOfDay(rangeEnd) })) {
        const key = format(created, "yyyy-MM-dd");
        const ex = map.get(key);
        if (ex) ex.pending++;
      }
    }
  }

  for (const c of concepts) {
    const submitted = parseISO(c.created_at);
    if (isWithinInterval(submitted, { start: startOfDay(rangeStart), end: endOfDay(rangeEnd) })) {
      const key = format(submitted, "yyyy-MM-dd");
      const ex = map.get(key);
      if (ex) ex.conceptEvents++;
    }
    const reviewed = c.md_actual_date ?? c.md_reviewed_at;
    if (reviewed) {
      const rd = parseISO(reviewed);
      if (isWithinInterval(rd, { start: startOfDay(rangeStart), end: endOfDay(rangeEnd) })) {
        const key = format(rd, "yyyy-MM-dd");
        const ex = map.get(key);
        if (ex) ex.conceptEvents++;
      }
    }
  }

  // Compute total
  for (const v of map.values()) {
    v.total = v.completed + v.pending + v.conceptEvents;
  }

  return map;
}

function completionDate(t: TaskWithRelations): string | null {
  if (t.completed_at) return t.completed_at;
  if (t.status === "done") return t.updated_at;
  return null;
}

// ============================================================================
// ReliabilityGauge
// ============================================================================

interface ReliabilityScore {
  total: number;
  onTime: number;
  throughput: number;
  consistency: number;
}

function reliabilityTier(score: number): {
  label: string;
  badgeClass: string;
  textClass: string;
} {
  if (score >= 80)
    return {
      label: "STRONG",
      badgeClass: "border-success/30 bg-success/10 text-success",
      textClass: "text-success",
    };
  if (score >= 60)
    return {
      label: "SOLID",
      badgeClass: "border-primary/30 bg-primary/10 text-primary",
      textClass: "text-primary",
    };
  if (score >= 40)
    return {
      label: "DEVELOPING",
      badgeClass: "border-warning/30 bg-warning/10 text-warning",
      textClass: "text-warning",
    };
  return {
    label: "NEEDS SUPPORT",
    badgeClass: "border-destructive/30 bg-destructive/10 text-destructive",
    textClass: "text-destructive",
  };
}

function ReliabilityGauge({
  reliability,
  tier,
}: {
  reliability: ReliabilityScore;
  tier: ReturnType<typeof reliabilityTier>;
}) {
  return (
    <div
      className={cn(
        // Mobile: stack the score header above full-width bars so nothing
        // gets crushed on a phone. sm+: restore the side-by-side layout.
        "flex flex-col gap-3 rounded-xl border border-l-[3px] bg-secondary/30 p-3 sm:flex-row sm:items-center sm:gap-4",
        tier.textClass === "text-success"
          ? "border-l-success"
          : tier.textClass === "text-primary"
            ? "border-l-primary"
            : tier.textClass === "text-warning"
              ? "border-l-warning"
              : "border-l-destructive"
      )}
    >
      {/* Score + tier — one justified row on mobile, centered column on sm+ */}
      <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:justify-center sm:gap-1 sm:text-center">
        <div className="sm:space-y-0.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reliability
          </p>
          <p className="flex items-baseline gap-1 sm:justify-center">
            <span
              className={cn(
                "text-4xl font-bold tabular-nums leading-none sm:text-3xl",
                tier.textClass
              )}
            >
              {reliability.total}
            </span>
            <span className="text-[10px] text-muted-foreground">/100</span>
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
            tier.badgeClass
          )}
        >
          <CheckCircle className="h-2.5 w-2.5" />
          {tier.label}
        </span>
      </div>
      <div className="min-w-0 flex-1 space-y-2 sm:min-w-[200px] sm:space-y-1.5">
        <ComponentBar label="On-time" pts={reliability.onTime} max={50} />
        <ComponentBar label="Throughput" pts={reliability.throughput} max={30} />
        <ComponentBar label="Consistency" pts={reliability.consistency} max={20} />
      </div>
    </div>
  );
}

function ComponentBar({
  label,
  pts,
  max,
}: {
  label: string;
  pts: number;
  max: number;
}) {
  const pct = (pts / max) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[10px] text-muted-foreground sm:w-20">
        {label}
      </span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-success"
          style={{ width: `${pct}%`, transition: "width 700ms ease-out" }}
        />
      </div>
      <span className="w-7 text-right text-[10px] font-semibold tabular-nums text-foreground">
        {pts}
      </span>
    </div>
  );
}

// ============================================================================
// TrendBars (6-month on-time %)
// ============================================================================

function TrendBars({
  data,
}: {
  data: { month: string; pct: number; completed: number }[];
}) {
  return (
    <div className="mt-3 grid grid-cols-6 gap-2">
      {data.map((d) => {
        const color =
          d.pct >= 85 ? "text-success" : d.pct >= 50 ? "text-warning" : "text-destructive";
        return (
          <div key={d.month} className="flex flex-col items-center gap-1 text-center">
            <span className={cn("text-xs font-semibold tabular-nums", color)}>
              {d.pct}%
            </span>
            <div className="h-12 w-full overflow-hidden rounded bg-secondary/40">
              <div
                className={cn(
                  "w-full rounded",
                  d.pct >= 85
                    ? "bg-success"
                    : d.pct >= 50
                    ? "bg-warning"
                    : d.pct > 0
                    ? "bg-destructive"
                    : "bg-muted/30"
                )}
                style={{
                  height: `${Math.max(4, d.pct)}%`,
                  marginTop: `${100 - Math.max(4, d.pct)}%`,
                  transition: "height 700ms ease-out",
                }}
              />
            </div>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
              {d.month}
            </span>
            <span className="text-[9px] text-muted-foreground tabular-nums">
              {d.completed}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// WeekdayPattern
// ============================================================================

function WeekdayPattern({
  data,
}: {
  data: { label: string; volume: number; onTime: number; pct: number }[];
}) {
  const maxVol = Math.max(1, ...data.map((d) => d.volume));
  return (
    <div className="mt-3 space-y-1.5">
      {data.map((d) => {
        const pctOfMax = (d.volume / maxVol) * 100;
        const onTimeColor =
          d.pct >= 85
            ? "text-success"
            : d.pct >= 50
            ? "text-warning"
            : d.volume > 0
            ? "text-destructive"
            : "text-muted-foreground";
        return (
          <div key={d.label} className="flex items-center gap-2">
            <span className="w-9 shrink-0 text-[10px] font-medium text-muted-foreground">
              {d.label}
            </span>
            <div className="flex-1 overflow-hidden rounded bg-secondary/40">
              <div
                className={cn(
                  "h-2 rounded",
                  d.pct >= 85 ? "bg-success" : d.pct >= 50 ? "bg-warning" : "bg-muted-foreground/50"
                )}
                style={{
                  width: `${Math.max(4, pctOfMax)}%`,
                  transition: "width 700ms ease-out",
                }}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-[10px] tabular-nums text-foreground">
              {d.volume}
            </span>
            <span
              className={cn(
                "w-9 shrink-0 text-right text-[10px] font-semibold tabular-nums",
                onTimeColor
              )}
            >
              {d.volume > 0 ? `${d.pct}%` : "—"}
            </span>
          </div>
        );
      })}
      <div className="mt-3 flex justify-between text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Day</span>
        <span>Volume</span>
        <span>On-Time %</span>
      </div>
    </div>
  );
}

// ============================================================================
// CompositionDonut
// ============================================================================

// ============================================================================
// ScorePill — colored badge for the section score
// ============================================================================

// ============================================================================
// Score visual system (used by the Concept / Task performance cards)
// ============================================================================
//
// SCORE_TONE maps a 0–100 score onto:
//   - a *quality label* you can show next to the number ("Excellent" etc.)
//   - a *tone* (text colour + accent gradient + ring) so the card reads at a
//     glance from across the room — top bar tinted, hero number tinted,
//     header chip tinted, no decoding required.
// Tailwind can't compose dynamic colour utilities, so every variant is a
// static string here. Add a new tier by appending another entry.

type Tone = "success" | "primary" | "warning" | "destructive" | "muted";

interface ScoreTone {
  label: string;
  textClass: string;
  ringClass: string;
  bgChipClass: string;
  // Top accent bar — left-to-right tone gradient so the score quality is
  // legible at the very first pixel of the card.
  accentClass: string;
}

const TONE_BASE: Record<Tone, Omit<ScoreTone, "label" | "accentClass">> = {
  success: {
    textClass: "text-success",
    ringClass: "ring-success/30",
    bgChipClass: "bg-success/10 text-success",
  },
  primary: {
    textClass: "text-primary",
    ringClass: "ring-primary/30",
    bgChipClass: "bg-primary/10 text-primary",
  },
  warning: {
    textClass: "text-warning",
    ringClass: "ring-warning/30",
    bgChipClass: "bg-warning/10 text-warning",
  },
  destructive: {
    textClass: "text-destructive",
    ringClass: "ring-destructive/30",
    bgChipClass: "bg-destructive/10 text-destructive",
  },
  muted: {
    textClass: "text-muted-foreground",
    ringClass: "ring-border",
    bgChipClass: "bg-secondary text-muted-foreground",
  },
};

function getScoreTone(score: number): ScoreTone {
  if (score >= 90)
    return {
      ...TONE_BASE.success,
      label: "Excellent",
      accentClass: "bg-gradient-to-r from-success via-success/80 to-success/40",
    };
  if (score >= 80)
    return {
      ...TONE_BASE.success,
      label: "Strong",
      accentClass: "bg-gradient-to-r from-success via-success/70 to-primary/50",
    };
  if (score >= 70)
    return {
      ...TONE_BASE.primary,
      label: "On Track",
      accentClass: "bg-gradient-to-r from-primary via-primary/70 to-success/50",
    };
  if (score >= 60)
    return {
      ...TONE_BASE.primary,
      label: "Steady",
      accentClass: "bg-gradient-to-r from-primary via-warning/60 to-warning/40",
    };
  if (score >= 40)
    return {
      ...TONE_BASE.warning,
      label: "Needs Focus",
      accentClass: "bg-gradient-to-r from-warning via-warning/70 to-destructive/40",
    };
  return {
    ...TONE_BASE.destructive,
    label: "At Risk",
    accentClass: "bg-gradient-to-r from-destructive via-destructive/70 to-warning/40",
  };
}

// ----------------------------------------------------------------------------
// ScoreCard — card shell used by Concept + Task Performance.
// Composes: tone-coloured top accent bar, icon-chip header, hero score
// (big tabular number + quality label), and a slot for everything below.
// Adopts the textile / hero motif from CLAUDE.md §8.2 so the card reads in
// the same visual language as the rest of the dashboards.
// ----------------------------------------------------------------------------
function ScoreCard({
  icon,
  title,
  subtitle,
  score,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  score: number;
  children: React.ReactNode;
}) {
  const tone = getScoreTone(score);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/[0.04] via-card to-card shadow-sm">
      {/* Woven dot grid — textile motif backdrop (§8.2). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgb(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "14px 14px",
        }}
      />
      {/* Top accent bar — score-quality coloured so the card's tone is
          legible from the first pixel. */}
      <div
        aria-hidden
        className={cn("pointer-events-none absolute inset-x-0 top-0 h-[3px]", tone.accentClass)}
      />

      <div className="relative p-4 sm:p-5">
        {/* Header row: icon chip + title block | hero score block */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
                tone.bgChipClass,
                tone.ringClass
              )}
            >
              {icon}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
                {title}
              </h3>
              <p className="truncate text-[11px] text-muted-foreground">
                {subtitle}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <ScoreRing score={score} size={72} strokeWidth={5}>
              <span className={cn("text-lg font-bold tabular-nums leading-none", tone.textClass)}>
                {score}
              </span>
            </ScoreRing>
            <span
              className={cn(
                "mt-1 text-[9px] font-bold uppercase tracking-[0.14em]",
                tone.textClass
              )}
            >
              {tone.label}
            </span>
          </div>
        </div>

        {/* Subtle divider before the data body — same hairline as inside
            other dashboards for cohesion. */}
        <div className="my-4 h-px bg-border/60" />

        {children}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// StatTile — compact tone-tinted KPI tile used by the footer of each score
// card (Shipped / Revision Cycles / Avg Completion / Cycle Time / Late).
// Tone drives the bg tint, value colour and ring; "muted" is the empty
// state so a row with no data still reads as intentional.
// ----------------------------------------------------------------------------
function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone: Tone;
}) {
  const cfg = TONE_BASE[tone];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border/60 bg-secondary/30 px-3 py-2.5",
        // tinted top accent — 2px stripe in the tile's tone, lifts the
        // bottom-strip from looking like a generic stat list.
        "before:absolute before:inset-x-0 before:top-0 before:h-[2px]",
        tone === "success" && "before:bg-success/70",
        tone === "primary" && "before:bg-primary/70",
        tone === "warning" && "before:bg-warning/70",
        tone === "destructive" && "before:bg-destructive/70",
        tone === "muted" && "before:bg-border"
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 flex items-baseline gap-0.5 text-xl font-bold tabular-nums leading-none",
          cfg.textClass
        )}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[10px] text-muted-foreground/70">{hint}</p>
      )}
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-success/10 text-success border-l-success ring-success/20"
      : score >= 50
      ? "bg-warning/10 text-warning border-l-warning ring-warning/20"
      : "bg-destructive/10 text-destructive border-l-destructive ring-destructive/20";
  return (
    <span className={cn("rounded-full border-l-2 px-2.5 py-1 text-[11px] font-bold tabular-nums ring-1", color)}>
      {score}<span className="font-normal text-muted-foreground">/100</span>
    </span>
  );
}

// ============================================================================
// ScoreBar — single breakdown row (used in Concept + Task cards)
// ============================================================================

function ScoreBar({
  label,
  points,
  max,
  fillClass,
  index,
}: {
  label: string;
  points: number;
  max: number;
  fillClass: string;
  index: number;
}) {
  const pct = max > 0 ? (points / max) * 100 : 0;
  const isFull = points >= max;
  return (
    <div className="flex items-center gap-3">
      <span className="w-[72px] shrink-0 text-[12px] font-medium text-muted-foreground">
        {label}
      </span>
      <div className="relative h-2 flex-1 overflow-hidden rounded bg-secondary/50">
        <div
          className={cn("absolute inset-y-0 left-0 rounded transition-[width]", fillClass)}
          style={{ width: `${pct}%`, transitionDuration: "700ms", transitionDelay: `${index * 60}ms` }}
        />
      </div>
      <span className={cn(
        "w-[46px] text-right text-[11px] font-semibold tabular-nums",
        isFull ? "text-success" : "text-muted-foreground"
      )}>
        {points}/{max}
      </span>
    </div>
  );
}

// ============================================================================
// ConceptDonut — large concept-status donut for the Concept Performance card
// ============================================================================

function ConceptDonut({
  approved,
  revisions,
  rejected,
  pending,
  total,
}: {
  approved: number;
  revisions: number;
  rejected: number;
  pending: number;
  total: number;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const size = 130;
  const cx = size / 2;
  const cy = size / 2;

  const segments = useMemo(() => {
    if (total === 0) return [];
    const items = [
      { color: "rgb(var(--success))", value: approved },
      { color: "rgb(var(--warning))", value: revisions },
      { color: "rgb(var(--destructive))", value: rejected },
      { color: "rgb(var(--primary))", value: pending },
    ];
    let cumulative = 0;
    return items
      .filter((s) => s.value > 0)
      .map((s) => {
        const length = (s.value / total) * c;
        const offset = c - cumulative;
        cumulative += length;
        return { ...s, length, offset };
      });
  }, [approved, revisions, rejected, pending, total, c]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90 h-full w-full"
          aria-hidden
        >
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgb(var(--secondary))"
            strokeWidth={14}
          />
          {segments.map((s, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={14}
              strokeDasharray={`${s.length} ${c - s.length}`}
              strokeDashoffset={s.offset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-3xl font-bold tabular-nums text-foreground">{total}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            submitted
          </p>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-2 gap-y-0.5 text-[10px]">
        <ConceptLegendItem dot="bg-success" label="Approved" value={approved} />
        <ConceptLegendItem dot="bg-warning" label="Revision" value={revisions} />
        <ConceptLegendItem dot="bg-destructive" label="Rejected" value={rejected} />
        <ConceptLegendItem dot="bg-primary" label="Pending" value={pending} />
      </div>
    </div>
  );
}

function ConceptLegendItem({
  dot,
  label,
  value,
}: {
  dot: string;
  label: string;
  value: number;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <span className={cn("h-2 w-2 rounded-full", dot)} />
      {label}{" "}
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </span>
  );
}

// ============================================================================
// DetailedPipelineBar — stacked Completed/InProgress/Remaining for Task card
// ============================================================================

function DetailedPipelineBar({
  completed,
  inProgress,
  assigned,
}: {
  completed: number;
  inProgress: number;
  assigned: number;
}) {
  const remaining = Math.max(0, assigned - completed - inProgress);
  const total = Math.max(1, assigned);
  const seg = (n: number) => (n / total) * 100;

  if (assigned === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-secondary/30 px-3 py-6 text-center text-xs italic text-muted-foreground">
        No tasks assigned in this period
      </div>
    );
  }

  return (
    <div>
      <div className="flex h-6 overflow-hidden rounded-lg bg-secondary/40">
        <div className="h-full rounded-l-lg bg-success transition-[width]"
          style={{ width: `${seg(completed)}%`, transitionDuration: "700ms" }} title={`${completed} completed`} />
        <div className="h-full bg-primary transition-[width]"
          style={{ width: `${seg(inProgress)}%`, transitionDuration: "700ms", transitionDelay: "100ms" }} title={`${inProgress} in progress`} />
        <div className="h-full bg-muted/40"
          style={{ width: `${seg(remaining)}%` }} title={`${remaining} remaining`} />
      </div>
      <div className="mt-2.5 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-success" />
          Completed: <b className="text-foreground tabular-nums">{completed}</b>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-primary" />
          In Progress: <b className="text-foreground tabular-nums">{inProgress}</b>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-muted/60" />
          Remaining: <b className="text-foreground tabular-nums">{remaining}</b>
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// MomentumChart — 6-month area chart (concepts approved + tasks completed)
// ============================================================================

function MomentumChart({
  data,
}: {
  data: Array<{
    month: string;
    conceptsApproved: number;
    tasksCompleted: number;
  }>;
}) {
  const hasData = data.some(
    (d) => d.conceptsApproved > 0 || d.tasksCompleted > 0
  );

  if (!hasData) {
    return (
      <EmptyState
        icon={<BarChart3 className="h-7 w-7" />}
        title="Not enough history for momentum"
        description="Once a few months of activity accumulate, this chart will fill in."
      />
    );
  }

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <ChartGradients />
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgb(var(--border))"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            tick={{ fill: "rgb(var(--muted-foreground))", fontSize: 11, fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "rgb(var(--muted-foreground))", fontSize: 11, fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgb(var(--card))",
              border: "1px solid rgb(var(--border))",
              borderRadius: 10,
              fontSize: 12,
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              color: "rgb(var(--foreground))",
              boxShadow: "var(--shadow-dropdown)",
              padding: "8px 10px",
            }}
            labelStyle={{ fontWeight: 600, marginBottom: 2 }}
            cursor={{ stroke: "rgb(var(--border))", strokeWidth: 1 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
            iconType="circle"
            iconSize={8}
          />
          <Area
            type="monotone"
            dataKey="conceptsApproved"
            name="Concepts Approved"
            stroke="rgb(var(--success))"
            fill={`url(#${CHART_GRAD.areaSuccess})`}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
          <Area
            type="monotone"
            dataKey="tasksCompleted"
            name="Tasks Completed"
            stroke="rgb(var(--primary))"
            fill={`url(#${CHART_GRAD.areaPrimary})`}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function CompositionDonut({
  onTime,
  late,
  pending,
}: {
  onTime: number;
  late: number;
  pending: number;
}) {
  const total = onTime + late + pending;
  const r = 38;
  const c = 2 * Math.PI * r;

  const segments = useMemo(() => {
    if (total === 0) return [];
    const items = [
      { color: "rgb(var(--success))", value: onTime, label: "On-time" },
      { color: "rgb(var(--destructive))", value: late, label: "Late" },
      { color: "rgb(var(--warning))", value: pending, label: "Pending" },
    ];
    let cumulative = 0;
    return items
      .filter((s) => s.value > 0)
      .map((s) => {
        const length = (s.value / total) * c;
        const offset = c - cumulative;
        cumulative += length;
        return { ...s, length, offset };
      });
  }, [onTime, late, pending, total, c]);

  const onTimePct = total > 0 ? Math.round((onTime / total) * 100) : 0;
  const latePct = total > 0 ? Math.round((late / total) * 100) : 0;
  const pendingPct = total > 0 ? Math.round((pending / total) * 100) : 0;

  const summary =
    total === 0
      ? "No tasks tracked yet"
      : onTimePct === 100
      ? "All on-time — clean record"
      : onTimePct >= 80
      ? `${onTimePct}% on-time, ${latePct}% late`
      : latePct >= 50
      ? "Delays dominate — needs attention"
      : `Mixed quality · ${onTimePct}% on-time`;

  return (
    <div className="flex h-full flex-col items-center gap-4">
      {/* Bigger centered donut */}
      <div className="relative h-[170px] w-[170px] shrink-0">
        <svg viewBox="0 0 100 100" className="-rotate-90 h-full w-full" aria-hidden>
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="rgb(var(--secondary))"
            strokeWidth={11}
          />
          {segments.map((s, i) => (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={11}
              strokeDasharray={`${s.length} ${c - s.length}`}
              strokeDashoffset={s.offset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-3xl font-bold tabular-nums text-foreground">{total}</p>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
            tasks
          </p>
        </div>
      </div>

      {/* Stacked horizontal bar — fills space below donut with another view */}
      {total > 0 && (
        <div className="w-full">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full border border-border bg-secondary/40">
            <div
              className="bg-success"
              style={{ width: `${onTimePct}%`, transition: "width 700ms ease-out" }}
              title={`${onTime} on-time`}
            />
            <div
              className="bg-destructive"
              style={{ width: `${latePct}%`, transition: "width 700ms ease-out" }}
              title={`${late} late`}
            />
            <div
              className="bg-warning"
              style={{ width: `${pendingPct}%`, transition: "width 700ms ease-out" }}
              title={`${pending} pending`}
            />
          </div>
        </div>
      )}

      {/* Legend rows */}
      <div className="flex w-full flex-1 flex-col gap-1.5 text-xs">
        <DonutRow color="bg-success" label="On-time" value={onTime} total={total} />
        <DonutRow color="bg-destructive" label="Late" value={late} total={total} />
        <DonutRow color="bg-warning" label="Pending" value={pending} total={total} />
      </div>

      {/* Summary footnote */}
      <p
        className={cn(
          "w-full rounded-md border px-2 py-1.5 text-center text-[10px]",
          onTimePct === 100
            ? "border-success/30 bg-success/[0.07] text-success"
            : onTimePct >= 80
            ? "border-primary/30 bg-primary/[0.05] text-primary"
            : total === 0
            ? "border-border bg-secondary/30 text-muted-foreground"
            : "border-warning/30 bg-warning/[0.07] text-warning"
        )}
      >
        {summary}
      </p>
    </div>
  );
}

function DonutRow({
  color,
  label,
  value,
  total,
}: {
  color: string;
  label: string;
  value: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <span className={cn("h-2 w-2 rounded-full", color)} />
        {label}
      </span>
      <span className="tabular-nums text-foreground">
        {value}
        <span className="ml-1 text-[10px] text-muted-foreground">({pct}%)</span>
      </span>
    </div>
  );
}

// ============================================================================
// LegendChip
// ============================================================================

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary/40 px-1.5 py-0.5 font-semibold uppercase tracking-wider text-muted-foreground">
      <span className={cn("h-2 w-2 rounded-full", color)} />
      {label}
    </span>
  );
}

// ============================================================================
// RangeControls
// ============================================================================

// Compact period selector — a single dropdown replacing the old 6-pill strip.
function PeriodDropdown({
  preset,
  setPreset,
}: {
  preset: RangePreset;
  setPreset: (p: RangePreset) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const OPTIONS: { value: RangePreset; label: string }[] = [
    ...RANGE_PRESETS.map((p) => ({ value: p.value, label: p.label })),
    { value: "custom", label: "Custom" },
  ];
  const current = OPTIONS.find((o) => o.value === preset)?.label ?? "30 days";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="min-w-[48px] text-left capitalize">{current}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="listbox" className="absolute right-0 z-30 mt-1.5 w-44 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-dropdown">
          {OPTIONS.map((o) => {
            const active = preset === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => { setPreset(o.value); setOpen(false); }}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                  active ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-secondary"
                )}
              >
                <span className="capitalize">{o.label}</span>
                {active && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RangeControls({
  preset,
  setPreset,
  customFrom,
  customTo,
  setCustomFrom,
  setCustomTo,
  rangeStart,
  rangeEnd,
}: {
  preset: RangePreset;
  setPreset: (p: RangePreset) => void;
  customFrom: string;
  customTo: string;
  setCustomFrom: (s: string) => void;
  setCustomTo: (s: string) => void;
  rangeStart: Date;
  rangeEnd: Date;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <PeriodDropdown preset={preset} setPreset={setPreset} />

      {preset === "custom" ? (
        <div className="flex items-center gap-1.5 text-xs">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => { setPreset("custom"); setCustomFrom(e.target.value); }}
            max={customTo || undefined}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          <input
            type="date"
            value={customTo}
            onChange={(e) => { setPreset("custom"); setCustomTo(e.target.value); }}
            min={customFrom || undefined}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setPreset("30d"); setCustomFrom(""); setCustomTo(""); }}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Reset
          </Button>
        </div>
      ) : (
        // For a preset, show the resolved range inline (read-only) instead of
        // two editable date inputs — far less visual weight.
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <CalendarIcon className="h-3 w-3" />
          {format(rangeStart, "dd MMM")} – {format(rangeEnd, "dd MMM yyyy")}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// CalendarHeatmap (big, clickable)
// ============================================================================

const WEEKDAY_LABELS_MON = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function CalendarHeatmap({
  rangeStart,
  rangeEnd,
  dayMap,
  selectedDay,
  onSelect,
}: {
  rangeStart: Date;
  rangeEnd: Date;
  dayMap: Map<string, DayCell>;
  selectedDay: string | null;
  onSelect: (day: string) => void;
}) {
  // Build a contiguous grid Mon-first
  const allDays = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const firstDow = (getDay(allDays[0]!) + 6) % 7; // Mon = 0

  const cells: Array<Date | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (const d of allDays) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<typeof cells> = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const today = new Date();

  return (
    <div className="mt-3">
      {/* Weekday headers */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS_MON.map((w) => (
          <span
            key={w}
            className="text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {w}
          </span>
        ))}
      </div>

      {/* Cells — capped at 44px square, centered in the card */}
      <div className="grid grid-cols-7 gap-1">
        {weeks.flatMap((week, wi) =>
          week.map((d, di) => {
            if (!d) {
              return (
                <div
                  key={`${wi}-${di}`}
                  className="h-10 w-full rounded-md bg-secondary/30 opacity-50"
                  aria-hidden
                />
              );
            }
            const key = format(d, "yyyy-MM-dd");
            const cell = dayMap.get(key);
            const isToday = isSameDay(d, today);
            const isSelected = selectedDay === key;
            return (
              <DayHeatCell
                key={key}
                date={d}
                cell={cell ?? null}
                isToday={isToday}
                isSelected={isSelected}
                onClick={() => onSelect(key)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function DayHeatCell({
  date,
  cell,
  isToday,
  isSelected,
  onClick,
}: {
  date: Date;
  cell: DayCell | null;
  isToday: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const tier = dayTier(cell);
  const labelTop = getDate(date);
  const labelBottom = cell && cell.completed > 0
    ? `${cell.onTime}/${cell.completed}`
    : cell && cell.total > 0
    ? `${cell.total}`
    : "";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex h-10 w-full flex-col items-center justify-center rounded-md border text-center transition-all hover:scale-[1.04]",
        tier.bg,
        tier.border,
        isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-card",
        isToday && !isSelected && "ring-1 ring-primary/50"
      )}
      title={tooltipFor(date, cell)}
    >
      <span
        className={cn(
          "absolute top-0.5 left-1 text-[8px] font-semibold tabular-nums leading-none",
          tier.textTop
        )}
      >
        {labelTop}
      </span>
      {labelBottom && (
        <span className={cn("text-[10px] font-bold leading-none tabular-nums", tier.textBottom)}>
          {labelBottom}
        </span>
      )}
    </button>
  );
}

function dayTier(cell: DayCell | null): {
  bg: string;
  border: string;
  textTop: string;
  textBottom: string;
} {
  if (!cell || cell.total === 0) {
    return {
      bg: "bg-secondary/40",
      border: "border-border/40",
      textTop: "text-muted-foreground/60",
      textBottom: "text-muted-foreground",
    };
  }
  // Has completions? color by on-time / mixed / delayed
  if (cell.completed > 0) {
    if (cell.delayed === 0) {
      return {
        bg: "bg-success",
        border: "border-success",
        textTop: "text-white/85",
        textBottom: "text-white",
      };
    }
    if (cell.onTime === 0) {
      return {
        bg: "bg-destructive",
        border: "border-destructive",
        textTop: "text-white/85",
        textBottom: "text-white",
      };
    }
    return {
      bg: "bg-warning",
      border: "border-warning",
      textTop: "text-white/85",
      textBottom: "text-white",
    };
  }
  // Only pending or concept events → blue mixed
  return {
    bg: "bg-primary/70",
    border: "border-primary",
    textTop: "text-white/85",
    textBottom: "text-white",
  };
}

function tooltipFor(date: Date, cell: DayCell | null): string {
  const niceDate = format(date, "EEEE, MMM d, yyyy");
  if (!cell || cell.total === 0) return `${niceDate} — no activity`;
  const parts: string[] = [];
  if (cell.completed > 0)
    parts.push(`${cell.onTime}/${cell.completed} on-time`);
  if (cell.delayed > 0) parts.push(`${cell.delayed} delayed`);
  if (cell.pending > 0) parts.push(`${cell.pending} pending`);
  if (cell.conceptEvents > 0)
    parts.push(`${cell.conceptEvents} concept events`);
  return `${niceDate} — ${parts.join(" · ")}`;
}

// ============================================================================
// DrillInPanel
// ============================================================================

function DrillInPanel({
  date,
  cell,
  events,
  onClose,
}: {
  date: string;
  cell: DayCell | null;
  events: Array<{
    kind: "task" | "concept";
    title: string;
    sub: string;
    status: string;
    tone: "success" | "warning" | "destructive" | "primary";
  }>;
  onClose: () => void;
}) {
  let niceDate = date;
  try {
    niceDate = format(parseISO(date), "EEEE, MMM d, yyyy");
  } catch {
    // keep raw
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <CalendarIcon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <DialogHeader className="p-0">
            <DialogTitle className="text-base">{niceDate}</DialogTitle>
            <DialogDescription className="text-xs">
              {cell && cell.completed > 0
                ? `${cell.onTime}/${cell.completed} on-time · ${cell.total} total events`
                : events.length > 0
                  ? `${events.length} event${events.length !== 1 ? "s" : ""}`
                  : "No events"}
            </DialogDescription>
          </DialogHeader>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {events.length === 0 ? (
          <p className="rounded-lg bg-secondary/30 p-4 text-center text-sm text-muted-foreground">
            No tracked events on this day.
          </p>
        ) : (
          <div className="space-y-1.5">
            {events.map((ev, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-secondary/20 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{ev.title}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {ev.sub}
                  </p>
                </div>
                <Badge
                  className={cn(
                    "shrink-0 text-[9px]",
                    ev.tone === "success" && "bg-success/15 text-success border border-success/30",
                    ev.tone === "warning" && "bg-warning/15 text-warning border border-warning/30",
                    ev.tone === "destructive" && "bg-destructive/15 text-destructive border border-destructive/30",
                    ev.tone === "primary" && "bg-primary/10 text-primary border border-primary/30"
                  )}
                >
                  {ev.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================================
// ActivityInsightsRow — compact summary cards, click to open full popup
// ============================================================================

function ActivityInsightsRow({
  activity,
  insights,
}: {
  activity: ScorecardActivity[];
  insights: ScorecardInsight[];
}) {
  const [activityOpen, setActivityOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);

  const strengths = insights.filter((i) => i.kind === "strength").length;
  const warnings = insights.length - strengths;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Activity compact card */}
        <button
          type="button"
          onClick={() => setActivityOpen(true)}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/30 hover:shadow-md"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Recent Activity</p>
            <p className="text-xs text-muted-foreground">
              {activity.length === 0
                ? "No events yet"
                : `${activity.length} event${activity.length !== 1 ? "s" : ""} — tap to view`}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>

        {/* Insights compact card */}
        <button
          type="button"
          onClick={() => setInsightsOpen(true)}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-warning/30 hover:shadow-md"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10">
            <Sparkles className="h-4 w-4 text-warning" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Insights</p>
            <p className="text-xs text-muted-foreground">
              {insights.length === 0
                ? "No patterns this period"
                : `${strengths} strength${strengths !== 1 ? "s" : ""}, ${warnings} area${warnings !== 1 ? "s" : ""} to watch`}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </div>

      {/* Activity popup */}
      <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
        <DialogContent className="flex max-h-[80vh] max-w-md flex-col gap-0 overflow-hidden p-0">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div>
              <DialogHeader className="p-0">
                <DialogTitle className="text-base">Recent Activity</DialogTitle>
                <DialogDescription className="text-xs">
                  Last {activity.length} event{activity.length !== 1 ? "s" : ""} in this period
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-3">
            {activity.length === 0 ? (
              <EmptyState
                icon={<Activity className="h-7 w-7" />}
                title="No recent activity"
                description="Submitted concepts and task completions will appear here."
              />
            ) : (
              <div className="space-y-1.5">
                {activity.map((ev, i) => (
                  <ActivityRow key={`${ev.at}-${i}`} ev={ev} />
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Insights popup */}
      <Dialog open={insightsOpen} onOpenChange={setInsightsOpen}>
        <DialogContent className="flex max-h-[80vh] max-w-md flex-col gap-0 overflow-hidden p-0">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10">
              <Sparkles className="h-4 w-4 text-warning" />
            </div>
            <div>
              <DialogHeader className="p-0">
                <DialogTitle className="text-base">Insights</DialogTitle>
                <DialogDescription className="text-xs">
                  Patterns detected in the selected period
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-3">
            <InsightsList insights={insights} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================================
// Activity timeline (carry-over from previous version)
// ============================================================================

function ActivityRow({ ev }: { ev: ScorecardActivity }) {
  const { bg, text } = activityTone(ev);
  let when: string;
  try {
    when = formatDistanceToNow(parseISO(ev.at), { addSuffix: true });
  } catch {
    when = "";
  }
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-secondary/20 px-3 py-2.5">
      <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", bg)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{ev.title}</p>
        {ev.sub && (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {ev.sub}
          </p>
        )}
      </div>
      <span className={cn("mt-0.5 shrink-0 text-[10px] tabular-nums", text)}>
        {when}
      </span>
    </div>
  );
}

function activityTone(ev: ScorecardActivity): { bg: string; text: string } {
  if (ev.type === "concept_reviewed") {
    if (ev.status === "approved") return { bg: "bg-success", text: "text-success" };
    if (ev.status === "rejected") return { bg: "bg-destructive", text: "text-destructive" };
    return { bg: "bg-warning", text: "text-warning" };
  }
  if (ev.type === "task_completed")
    return ev.status === "late"
      ? { bg: "bg-warning", text: "text-warning" }
      : { bg: "bg-success", text: "text-success" };
  if (ev.type === "revision_requested") return { bg: "bg-warning", text: "text-warning" };
  return { bg: "bg-primary", text: "text-muted-foreground" };
}

function InsightsList({ insights }: { insights: ScorecardInsight[] }) {
  if (insights.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-secondary/30 p-3 text-sm text-muted-foreground">
        <BarChart3 className="h-4 w-4 shrink-0" />
        <span>No standout patterns this period</span>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {insights.map((ins, i) => (
        <div
          key={i}
          className={cn(
            "flex items-start gap-2 rounded-lg p-2 text-sm",
            ins.kind === "strength"
              ? "bg-success/5 text-foreground"
              : "bg-warning/5 text-foreground"
          )}
        >
          {ins.kind === "strength" ? (
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          )}
          <span>{ins.text}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// CycleTimeChart — distribution histogram across delay buckets
// ============================================================================

function CycleTimeChart({
  data,
}: {
  data: { label: string; color: string; count: number }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return (
      <p className="mt-4 rounded-lg bg-secondary/40 p-3 text-center text-xs italic text-muted-foreground">
        No completed tasks yet
      </p>
    );
  }
  return (
    <div className="mt-3">
      <div className="flex h-24 items-end gap-2">
        {data.map((d) => {
          const h = d.count > 0 ? (d.count / max) * 100 : 0;
          return (
            <div
              key={d.label}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${d.label}: ${d.count} tasks`}
            >
              <span className="text-[10px] font-semibold tabular-nums text-foreground">
                {d.count || ""}
              </span>
              <div className="flex h-full w-full items-end">
                <div
                  className={cn("w-full rounded-t", d.color)}
                  style={{
                    height: `${Math.max(d.count > 0 ? 8 : 0, h)}%`,
                    transition: "height 700ms ease-out",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2">
        {data.map((d) => (
          <span
            key={d.label}
            className="flex-1 text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {d.label}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Each bar groups completed tasks by their final delay vs deadline.
      </p>
    </div>
  );
}

// ============================================================================
// PriorityBreakdown — mini donut + legend
// ============================================================================

function PriorityBreakdown({
  data,
}: {
  data: { label: string; value: number; color: string }[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  // Larger ring (r=68) so the donut feels like the visual anchor of the
  // card — the old r=32 was lost on a 340px-wide column.
  const r = 68;
  const c = 2 * Math.PI * r;
  const stroke = 18;

  // Tone metadata for both the donut stroke and the legend row. Keeping
  // these together so the bar fill and dot match perfectly without two
  // separate Tailwind-class lookups.
  const meta: Record<
    string,
    { stroke: string; barClass: string; dotClass: string }
  > = {
    Urgent: {
      stroke: "rgb(var(--destructive))",
      barClass: "bg-destructive",
      dotClass: "bg-destructive",
    },
    High: {
      stroke: "rgb(var(--warning))",
      barClass: "bg-warning",
      dotClass: "bg-warning",
    },
    Normal: {
      stroke: "rgb(var(--primary))",
      barClass: "bg-primary",
      dotClass: "bg-primary",
    },
    Low: {
      stroke: "rgb(var(--muted-foreground))",
      barClass: "bg-muted-foreground/60",
      dotClass: "bg-muted-foreground/60",
    },
  };

  const segments = useMemo(() => {
    if (total === 0) return [];
    let cumulative = 0;
    return data
      .filter((d) => d.value > 0)
      .map((d) => {
        const length = (d.value / total) * c;
        const offset = c - cumulative;
        cumulative += length;
        return {
          ...d,
          length,
          offset,
          stroke: meta[d.label]?.stroke ?? "rgb(var(--primary))",
        };
      });
    // meta is stable in this render; total/data drive recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, total, c]);

  // Identify the dominant priority for the centre annotation ("mostly X").
  // Falls back to a neutral "tasks" footer when there's no clear winner.
  const dominant = useMemo(() => {
    if (total === 0) return null;
    const best = [...data].sort((a, b) => b.value - a.value)[0];
    if (!best || best.value === 0) return null;
    const pct = Math.round((best.value / total) * 100);
    return { label: best.label, pct };
  }, [data, total]);

  if (total === 0) {
    return (
      <div className="mt-4 flex flex-col items-center justify-center rounded-xl bg-secondary/40 px-4 py-10 text-center">
        <Zap className="mb-2 h-6 w-6 text-muted-foreground/60" />
        <p className="text-xs italic text-muted-foreground">
          No tasks scheduled in this range
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col items-center gap-5">
      {/* Donut hero — large, centered, with two lines of text inside. */}
      <div className="relative h-[180px] w-[180px] shrink-0">
        <svg
          viewBox="0 0 180 180"
          className="-rotate-90 h-full w-full"
          aria-hidden
        >
          {/* Track */}
          <circle
            cx="90"
            cy="90"
            r={r}
            fill="none"
            stroke="rgb(var(--secondary))"
            strokeWidth={stroke}
          />
          {/* Segments */}
          {segments.map((s, i) => (
            <circle
              key={i}
              cx="90"
              cy="90"
              r={r}
              fill="none"
              stroke={s.stroke}
              strokeWidth={stroke}
              strokeLinecap={segments.length === 1 ? "round" : "butt"}
              strokeDasharray={`${s.length} ${c - s.length}`}
              strokeDashoffset={s.offset}
              style={{
                transition: "stroke-dasharray 700ms cubic-bezier(0.4,0,0.2,1)",
              }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-4xl font-bold leading-none tabular-nums text-foreground">
            {total}
          </p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            tasks
          </p>
          {dominant && (
            <p className="mt-2 max-w-[120px] text-center text-[10px] text-muted-foreground">
              mostly{" "}
              <span className="font-semibold text-foreground">
                {dominant.label.toLowerCase()}
              </span>{" "}
              ({dominant.pct}%)
            </p>
          )}
        </div>
      </div>

      {/* Legend — each row has dot · label · proportion bar · count/% */}
      <ul className="w-full space-y-2">
        {data.map((d) => {
          const pct = total > 0 ? (d.value / total) * 100 : 0;
          const tone = meta[d.label];
          const isZero = d.value === 0;
          return (
            <li
              key={d.label}
              className={cn(
                "grid grid-cols-[auto_64px_1fr_auto] items-center gap-2 text-xs",
                isZero && "opacity-50"
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  tone?.dotClass ?? "bg-muted"
                )}
              />
              <span className="font-medium text-foreground">{d.label}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width]",
                    tone?.barClass ?? "bg-primary"
                  )}
                  style={{
                    width: `${pct}%`,
                    transitionDuration: "700ms",
                    transitionDelay: "150ms",
                  }}
                />
              </div>
              <span className="tabular-nums text-foreground">
                {d.value}
                <span className="ml-1 text-[10px] text-muted-foreground">
                  ({Math.round(pct)}%)
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ============================================================================
// VsTeamChart — 4 horizontal bar comparisons (me vs team)
// ============================================================================

function VsTeamChart({
  data,
}: {
  data: Array<{
    label: string;
    me: number;
    team: number;
    unit: string;
    higherIsBetter: boolean;
  }>;
}) {
  return (
    <div className="mt-3 space-y-3">
      {data.map((d) => {
        const max = Math.max(1, d.me, d.team);
        const meBetter = d.higherIsBetter ? d.me >= d.team : d.me <= d.team;
        const delta = d.me - d.team;
        const deltaStr =
          delta === 0
            ? "on par"
            : `${delta > 0 ? "+" : ""}${Math.round(delta * 10) / 10}${d.unit}`;
        return (
          <div key={d.label}>
            <div className="mb-1 flex items-baseline justify-between text-[10px]">
              <span className="font-semibold text-foreground">{d.label}</span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  delta === 0
                    ? "text-muted-foreground"
                    : meBetter
                    ? "text-success"
                    : "text-destructive"
                )}
              >
                {deltaStr}
              </span>
            </div>
            <div className="space-y-1">
              <ComparisonBar
                label="You"
                value={d.me}
                max={max}
                unit={d.unit}
                color={meBetter ? "bg-success" : "bg-destructive"}
              />
              <ComparisonBar
                label="Team avg"
                value={d.team}
                max={max}
                unit={d.unit}
                color="bg-muted-foreground/40"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ComparisonBar({
  label,
  value,
  max,
  unit,
  color,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  color: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-[58px] shrink-0 text-[10px] text-muted-foreground">
        {label}
      </span>
      <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-secondary/40">
        <div
          className={cn("h-full rounded-full", color)}
          style={{
            width: `${Math.max(4, pct)}%`,
            transition: "width 700ms ease-out",
          }}
        />
      </div>
      <span className="w-12 shrink-0 text-right text-[10px] font-semibold tabular-nums text-foreground">
        {Math.round(value * 10) / 10}
        {unit}
      </span>
    </div>
  );
}

// ============================================================================
// ConceptFunnelChart — 4 horizontal stage rows
// ============================================================================

function ConceptFunnelChart({
  data,
}: {
  data: { submitted: number; reviewed: number; approved: number; finalized: number };
}) {
  const max = Math.max(1, data.submitted, data.reviewed, data.approved, data.finalized);
  const rows = [
    { label: "Submitted", value: data.submitted, color: "bg-primary" },
    { label: "Reviewed", value: data.reviewed, color: "bg-[#7C5CFC]" },
    { label: "Approved", value: data.approved, color: "bg-success" },
    { label: "Finalized", value: data.finalized, color: "bg-success/60" },
  ];

  if (data.submitted === 0) {
    return (
      <p className="mt-4 rounded-lg bg-secondary/40 p-3 text-center text-xs italic text-muted-foreground">
        No concepts submitted in this range
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {rows.map((r, i) => {
        const pct = max > 0 ? (r.value / max) * 100 : 0;
        const prevValue = i > 0 ? rows[i - 1]!.value : 0;
        const dropPct =
          i > 0 && prevValue > 0
            ? Math.round(((prevValue - r.value) / prevValue) * 100)
            : 0;
        return (
          <div key={r.label}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold text-foreground">{r.label}</span>
              <span className="tabular-nums text-foreground">
                {r.value}
                {i > 0 && dropPct > 0 && (
                  <span className="ml-1 text-[10px] text-destructive">
                    -{dropPct}%
                  </span>
                )}
              </span>
            </div>
            <div className="mt-1 h-5 overflow-hidden rounded-md bg-secondary/40">
              <div
                className={cn("h-full rounded-md", r.color)}
                style={{
                  width: `${Math.max(4, pct)}%`,
                  transition: "width 700ms ease-out",
                }}
              />
            </div>
          </div>
        );
      })}
      <p className="mt-2 text-[10px] text-muted-foreground">
        Drop-off shows attrition between stages.
      </p>
    </div>
  );
}

// ============================================================================
// ThroughputSparkline — last 12 weeks, stacked tasks + concepts
// ============================================================================

function ThroughputSparkline({
  data,
}: {
  data: { label: string; tasks: number; concepts: number; total: number }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const total = data.reduce((s, d) => s + d.total, 0);
  const avg = Math.round((total / data.length) * 10) / 10;

  return (
    <div className="mt-3 flex flex-1 flex-col">
      <div className="flex min-h-0 flex-1 items-end gap-1">
        {data.map((d) => {
          const h = d.total > 0 ? (d.total / max) * 100 : 0;
          const taskH = d.total > 0 ? (d.tasks / d.total) * 100 : 0;
          return (
            <div
              key={d.label}
              className="flex flex-1 flex-col justify-end self-stretch"
              title={`${d.label}: ${d.tasks} tasks · ${d.concepts} concepts (${d.total} total)`}
            >
              <div
                className="w-full overflow-hidden rounded-t"
                style={{
                  height: `${Math.max(d.total > 0 ? 4 : 0, h)}%`,
                  transition: "height 700ms ease-out",
                }}
              >
                <div
                  className="w-full bg-primary"
                  style={{ height: `${taskH}%` }}
                />
                <div
                  className="w-full bg-success"
                  style={{ height: `${100 - taskH}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Total{" "}
        <span className="font-semibold text-foreground tabular-nums">
          {total}
        </span>{" "}
        · avg{" "}
        <span className="font-semibold text-foreground tabular-nums">
          {avg}/wk
        </span>
      </p>
      <div className="mt-1 flex gap-3 text-[9px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-primary" />
          Tasks
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-success" />
          Concepts approved
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// LifecycleStat — compact tile for the Post-Approval Pipeline strip inside
// the Concept Performance card. Lives at file scope so it can be reused
// without prop-drilling card-internal state.
// ============================================================================

function LifecycleStat({
  icon,
  label,
  value,
  sub,
  accentClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accentClass?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground/80">
        {icon}
        {label}
      </div>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums text-foreground",
          accentClass
        )}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[10px] text-muted-foreground/70">{sub}</p>
      )}
    </div>
  );
}
