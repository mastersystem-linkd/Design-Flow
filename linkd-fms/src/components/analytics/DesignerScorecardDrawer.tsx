import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Download,
  ExternalLink,
  MessageSquare,
  Users,
  Target,
  Send as SendIcon,
  Trophy,
  Flame,
  PackageCheck,
  Timer,
  TrendingDown,
  TrendingUp,
  Zap,
  Crown,
  X,
} from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
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
  Skeleton,
  SkeletonCard,
  EmptyState,
  toast,
} from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import {
  useDesignerScorecard,
  type ScorecardPeriod,
  type ScorecardActivity,
  type ScorecardInsight,
} from "@/hooks/useDesignerScorecard";
import { sendNotification } from "@/lib/notifications";
import { exportToCSV, type CsvColumn } from "@/lib/exportCSV";
import { isAdmin as isAdminCheck } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/constants";
import type { UserRole } from "@/types/database";
import { scorecardDetailPath } from "@/lib/routes";
import { useConcepts } from "@/hooks/useConcepts";
import { useTasks } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";

// ============================================================================
// Public component
// ============================================================================

export interface DesignerScorecardDrawerProps {
  designerId: string | null;
  onClose: () => void;
}

const PERIODS: { value: ScorecardPeriod; label: string }[] = [
  { value: "week", label: "W" },
  { value: "month", label: "M" },
  { value: "quarter", label: "Q" },
  { value: "year", label: "Y" },
];

export function DesignerScorecardDrawer({
  designerId,
  onClose,
}: DesignerScorecardDrawerProps) {
  const { profile: viewer } = useAuth();
  const role = viewer?.role ?? "designer";
  const isAdmin = isAdminCheck(role);
  const isSelf = !!designerId && viewer?.id === designerId;

  useEffect(() => {
    if (!designerId) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [designerId]);

  if (!designerId) return null;

  // Non-admin viewing someone else
  if (!isAdmin && !isSelf) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />
        <div className="relative z-10 mx-4 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl">
          <EmptyState
            icon={<AlertTriangle className="h-8 w-8" />}
            title="Restricted"
            description="Scorecards are visible to admins only."
          />
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 mx-4 flex max-h-[95vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-2xl sm:mx-auto">
        <div className="flex-1 overflow-y-auto p-0">
          <ScorecardBody
            designerId={designerId}
            onClose={onClose}
            isSelf={isSelf}
            isAdmin={isAdmin}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// Body — full scorecard content
// ============================================================================

function ScorecardBody({
  designerId,
  onClose,
  isSelf,
  isAdmin,
}: {
  designerId: string;
  onClose: () => void;
  isSelf: boolean;
  isAdmin: boolean;
}) {
  const [period, setPeriod] = useState<ScorecardPeriod>("month");
  const data = useDesignerScorecard(designerId, period);
  const { concepts } = useConcepts();
  const { tasks } = useTasks();
  const navigate = useNavigate();

  // Feedback form local state
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);

  if (data.isLoading || !data.profile) {
    return <LoadingState />;
  }

  if (data.error) {
    return (
      <div className="mt-8">
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8 text-destructive" />}
          title="Couldn't load scorecard"
          description={data.error}
        />
      </div>
    );
  }

  const concept = data.concept;
  const task = data.task;

  const onTimePct =
    task.completed > 0 ? Math.round((task.onTime / task.completed) * 100) : null;

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
    if (error) {
      toast.error(error);
    } else {
      toast.success("Feedback sent");
      setFeedback("");
      setFeedbackOpen(false);
    }
  }

  function handleExport() {
    const conceptRows = concepts
      .filter((c) => c.submitted_by === designerId)
      .map((c) => ({
        kind: "Concept",
        code: c.concept_code,
        title: c.title,
        status: c.md_status,
        date: c.created_at,
        delayDays: "",
        score: "",
      }));
    const taskRows = tasks
      .filter((t) => t.assigned_to === designerId)
      .map((t) => ({
        kind: "Task",
        code: t.task_code,
        title: t.concept ?? "",
        status: t.status,
        date: t.created_at,
        delayDays: t.delay_days ?? "",
        score: "",
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
      { key: "score", label: "Score" },
    ];
    const safeName = (data.profile?.full_name ?? "designer")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    exportToCSV(rows, `scorecard-${safeName}`, cols);
  }

  const hasActivity = data.concept.submitted > 0 || data.task.assigned > 0;

  return (
    <div className="pb-6">
      {/* ── HERO ── Gradient banner with avatar halo, composite gauge,
          verdict, rank medal. Built as one visual block instead of a flat
          header so the drawer reads "judgment first" from the moment it opens. */}
      <HeroBlock
        profile={data.profile}
        designerCodes={data.designerCodes}
        isSelf={isSelf}
        joinedDate={data.joinedDate}
        compositeScore={data.compositeScore}
        rank={data.rank}
        hasActivity={hasActivity}
        onClose={onClose}
      />

      <div className="space-y-3 px-4">
        {/* ── VITAL SIGNS ── compact 4-stat strip replacing the old flat
            KPI boxes. Each cell carries a mini-visual (ring, sparkline-ish
            bar) + delta against team / target so the number isn't bare. */}
        <VitalSignsStrip
          monthlyTargetProgress={concept.monthlyTargetProgress}
          monthlyTarget={2}
          completed={task.completed}
          assigned={task.assigned}
          onTimePct={onTimePct}
          conceptsShipped={concept.completed}
          conceptsApproved={concept.approved}
          completionRate={concept.completionRate}
          cycleDays={task.avgCycleDays}
          teamAvgDays={task.teamAvgDays}
        />

        {/* ── Open full analysis ── */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            onClose();
            navigate(scorecardDetailPath(designerId));
          }}
          className="w-full gap-1.5"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open full scorecard analysis
        </Button>

        {/* ── PERIOD SELECTOR ── */}
        <div className="flex items-center justify-between">
          <div className="inline-flex rounded-lg bg-secondary/50 p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  period === p.value
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {data.periodLabel}
          </p>
        </div>


      {/* ── SECTION 4: CONCEPT PERFORMANCE ── */}
      <Card className="border border-border">
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              Concept Performance
            </h3>
            <ScorePill score={concept.score} />
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* Donut */}
            <ConceptDonut
              approved={concept.approved}
              revisions={concept.revisions}
              rejected={concept.rejected}
              pending={concept.pending}
              total={concept.submitted}
            />

            {/* Score bars */}
            <div className="flex-1 space-y-2">
              <ScoreRow
                label="Volume"
                points={concept.breakdown.volume}
                max={30}
                fillClass="bg-primary"
                index={0}
              />
              <ScoreRow
                label="Approval"
                points={concept.breakdown.approval}
                max={35}
                fillClass="bg-success"
                index={1}
              />
              <ScoreRow
                label="Speed"
                points={concept.breakdown.speed}
                max={20}
                fillClass="bg-primary"
                index={2}
              />
              <ScoreRow
                label="Low Rev"
                points={concept.breakdown.lowRev}
                max={15}
                fillClass="bg-primary"
                index={3}
              />
            </div>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Avg review time:{" "}
            <span
              className={cn(
                "font-semibold",
                concept.avgReviewHours === 0
                  ? "text-muted-foreground"
                  : concept.avgReviewHours < 24
                  ? "text-success"
                  : concept.avgReviewHours < 48
                  ? "text-warning"
                  : "text-destructive"
              )}
            >
              {concept.avgReviewHours === 0
                ? "—"
                : `${concept.avgReviewHours}h`}
            </span>
            <span className="ml-2 text-muted-foreground/70">target: &lt; 24h</span>
          </p>

          {/* Shipped + revision-cycle footnote — exposes the gap between
              "MD approved" and "actually shipped" + true rework volume. */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <FootStat
              icon={<PackageCheck className="h-3.5 w-3.5" />}
              label="Shipped"
              value={`${concept.completed}/${concept.approved}`}
              hint={
                concept.approved > 0
                  ? `${concept.completionRate}% completion`
                  : "No approvals yet"
              }
              tone={
                concept.approved === 0
                  ? "muted"
                  : concept.completionRate >= 70
                  ? "success"
                  : concept.completionRate >= 40
                  ? "warning"
                  : "destructive"
              }
            />
            <FootStat
              icon={<Flame className="h-3.5 w-3.5" />}
              label="Revision cycles"
              value={String(concept.revisionCycles)}
              hint={
                concept.submitted > 0 && concept.revisionCycles > 0
                  ? `${(concept.revisionCycles / concept.submitted).toFixed(1)} per submission`
                  : concept.revisionCycles === 0
                  ? "Clean first drafts"
                  : undefined
              }
              tone={
                concept.revisionCycles === 0
                  ? "success"
                  : concept.submitted > 0 &&
                    concept.revisionCycles / concept.submitted > 0.5
                  ? "destructive"
                  : "muted"
              }
            />
          </div>
        </div>
      </Card>

      {/* ── SECTION 5: TASK PERFORMANCE ── */}
      <Card className="border border-border">
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              Task Performance
            </h3>
            <ScorePill score={task.score} />
          </div>

          {/* Pipeline bar */}
          <PipelineBar
            completed={task.completed}
            inProgress={task.inProgress}
            assigned={task.assigned}
          />

          {/* Score bars */}
          <div className="mt-4 space-y-2">
            <ScoreRow
              label="Volume"
              points={task.breakdown.volume}
              max={30}
              fillClass="bg-primary"
              index={0}
            />
            <ScoreRow
              label="On-Time"
              points={task.breakdown.onTime}
              max={35}
              fillClass="bg-success"
              index={1}
            />
            <ScoreRow
              label="Speed"
              points={task.breakdown.speed}
              max={20}
              fillClass="bg-primary"
              index={2}
            />
            <ScoreRow
              label="Active"
              points={task.breakdown.active}
              max={15}
              fillClass="bg-primary"
              index={3}
            />
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Avg completion:{" "}
            <span
              className={cn(
                "font-semibold",
                task.completed === 0
                  ? "text-muted-foreground"
                  : task.avgDays < 3
                  ? "text-success"
                  : task.avgDays <= 5
                  ? "text-warning"
                  : "text-destructive"
              )}
            >
              {task.completed === 0 ? "—" : `${task.avgDays}d`}
            </span>
            {task.completed > 0 && task.teamAvgDays > 0 && (
              <span className="ml-2">
                {(() => {
                  const delta = Math.round((task.avgDays - task.teamAvgDays) * 10) / 10;
                  if (Math.abs(delta) < 0.1) return <span className="text-muted-foreground/70">on team avg</span>;
                  return delta > 0 ? (
                    <span className="text-destructive">+{delta}d slower</span>
                  ) : (
                    <span className="text-success">{delta}d faster</span>
                  );
                })()}
              </span>
            )}
          </p>

          {/* Cycle-time + late footnote — splits "avg delay" from true effort. */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <FootStat
              icon={<Timer className="h-3.5 w-3.5" />}
              label="Cycle time"
              value={task.completed === 0 ? "—" : `${task.avgCycleDays}d`}
              hint="assigned → done"
              tone={
                task.completed === 0
                  ? "muted"
                  : task.avgCycleDays <= 3
                  ? "success"
                  : task.avgCycleDays <= 6
                  ? "warning"
                  : "destructive"
              }
            />
            <FootStat
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              label="Late"
              value={String(task.late)}
              hint={
                task.completed > 0 ? `of ${task.completed} delivered` : undefined
              }
              tone={
                task.late === 0
                  ? "success"
                  : task.late > task.onTime
                  ? "destructive"
                  : "warning"
              }
            />
          </div>
        </div>
      </Card>

      {/* ── SECTION 6: 6-MONTH TREND ── */}
      <Card className="border border-border">
        <div className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            6-Month Trend
          </h3>
          <TrendChart data={data.trend} />
        </div>
      </Card>

      {/* ── SECTION 7: RECENT ACTIVITY ── */}
      <Card className="border border-border">
        <div className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Recent Activity
            </h3>
          </div>
          {data.activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity</p>
          ) : (
            <ul className="max-h-[300px] space-y-3 overflow-y-auto">
              {data.activity.map((ev, i) => (
                <ActivityRow key={`${ev.at}-${i}`} ev={ev} />
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* ── SECTION 8: INSIGHTS ── */}
      <Card className="border border-border">
        <div className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Insights</h3>
          <InsightsList insights={data.insights} />
        </div>
      </Card>

      {/* ── SECTION 9: FOOTER (admin only, not for self-view) ── */}
      {isAdmin && !isSelf && (
        <div className="border-t border-border pt-4">
          {feedbackOpen ? (
            <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-xs font-medium text-foreground">
                Send feedback to {data.profile.full_name.split(" ")[0]}
              </p>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Write feedback…"
                rows={2}
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
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setFeedbackOpen(true)}
              >
                <MessageSquare className="mr-1 h-3 w-3" />
                Send Feedback
              </Button>
              <Button size="sm" variant="outline" onClick={handleExport}>
                <Download className="mr-1 h-3 w-3" />
                Export Data
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  onClose();
                  navigate("/team");
                }}
              >
                <Users className="mr-1 h-3 w-3" />
                Open Team
              </Button>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 border-b border-border pb-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-success/10 text-success"
      : score >= 50
      ? "bg-warning/10 text-warning"
      : "bg-destructive/10 text-destructive";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", color)}>
      {score}/100
    </span>
  );
}

function ScoreRow({
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
  return (
    <div className="flex items-center gap-2">
      <span className="w-[68px] shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="relative h-[14px] flex-1 overflow-hidden rounded-full bg-secondary/40">
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full transition-[width]", fillClass)}
          style={{
            width: `${pct}%`,
            transitionDuration: "600ms",
            transitionDelay: `${index * 50}ms`,
          }}
        />
      </div>
      <span className="w-12 text-right text-[11px] font-medium tabular-nums text-muted-foreground">
        {points}/{max}
      </span>
    </div>
  );
}

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
  // Build segments with cumulative offsets for SVG strokes
  const r = 48;
  const c = 2 * Math.PI * r;
  const size = 120;
  const cx = size / 2;
  const cy = size / 2;

  const segments = useMemo(() => {
    if (total === 0) return [];
    const items: { color: string; value: number }[] = [
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
        <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90 h-full w-full" aria-hidden>
          {/* Track */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgb(var(--secondary))"
            strokeWidth={14}
          />
          {/* Segments */}
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
          <p className="text-2xl font-bold tabular-nums text-foreground">{total}</p>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
            submitted
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-2 gap-y-0.5 text-[10px]">
        <LegendItem dot="bg-success" label="Approved" value={approved} />
        <LegendItem dot="bg-warning" label="Revision" value={revisions} />
        <LegendItem dot="bg-destructive" label="Rejected" value={rejected} />
        <LegendItem dot="bg-primary" label="Pending" value={pending} />
      </div>
    </div>
  );
}

function LegendItem({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <span className={cn("h-2 w-2 rounded-full", dot)} />
      {label}{" "}
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </span>
  );
}

function PipelineBar({
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
      <div className="rounded-lg border border-dashed border-border bg-secondary/30 px-3 py-4 text-center text-xs italic text-muted-foreground">
        No tasks in this period
      </div>
    );
  }

  return (
    <div>
      <div className="flex h-[28px] overflow-hidden rounded-md border border-border/50 bg-secondary/40">
        <div
          className="h-full bg-success transition-[width]"
          style={{ width: `${seg(completed)}%`, transitionDuration: "600ms" }}
          title={`${completed} completed`}
        />
        <div
          className="h-full bg-primary"
          style={{ width: `${seg(inProgress)}%` }}
          title={`${inProgress} in progress`}
        />
        <div
          className="h-full bg-muted/60"
          style={{ width: `${seg(remaining)}%` }}
          title={`${remaining} remaining`}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span>
          <span className="inline-block h-2 w-2 rounded-sm bg-success" />{" "}
          Completed: <b className="text-foreground tabular-nums">{completed}</b>
        </span>
        <span>
          <span className="inline-block h-2 w-2 rounded-sm bg-primary" />{" "}
          In Progress: <b className="text-foreground tabular-nums">{inProgress}</b>
        </span>
        <span>
          <span className="inline-block h-2 w-2 rounded-sm bg-muted/60" />{" "}
          Remaining: <b className="text-foreground tabular-nums">{remaining}</b>
        </span>
      </div>
    </div>
  );
}

function TrendChart({
  data,
}: {
  data: Array<{ month: string; conceptsApproved: number; tasksCompleted: number }>;
}) {
  const hasData = data.some(
    (d) => d.conceptsApproved > 0 || d.tasksCompleted > 0
  );

  if (!hasData) {
    return (
      <div className="py-6">
        <EmptyState
          icon={<BarChart3 className="h-7 w-7" />}
          title="Not enough history for trend"
          description="Once a few months of activity accumulate, this chart will show momentum."
        />
      </div>
    );
  }

  return (
    <div className="h-[160px] w-full">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
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
            fill="rgb(var(--success))"
            fillOpacity={0.1}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Area
            type="monotone"
            dataKey="tasksCompleted"
            name="Tasks Completed"
            stroke="rgb(var(--primary))"
            fill="rgb(var(--primary))"
            fillOpacity={0.1}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ActivityRow({ ev }: { ev: ScorecardActivity }) {
  const dotClass = activityDotClass(ev);
  let when: string;
  try {
    when = formatDistanceToNow(parseISO(ev.at), { addSuffix: true });
  } catch {
    when = "";
  }
  return (
    <li className="flex items-start gap-3">
      <div className="mt-1 flex flex-col items-center">
        <span className={cn("h-2 w-2 rounded-full", dotClass)} />
        <span className="mt-0.5 h-full w-px bg-border" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{ev.title}</p>
        <p className="text-xs text-muted-foreground">{when}</p>
      </div>
    </li>
  );
}

function activityDotClass(ev: ScorecardActivity): string {
  if (ev.type === "concept_reviewed") {
    if (ev.status === "approved") return "bg-success";
    if (ev.status === "rejected") return "bg-destructive";
    return "bg-warning";
  }
  if (ev.type === "task_completed") return "bg-success";
  if (ev.type === "revision_requested") return "bg-warning";
  return "bg-primary";
}

// ============================================================================
// HERO BLOCK — gradient banner with halo'd avatar + composite gauge + verdict.
// Replaces the old flat header. Reads as "judgment at a glance" instead of a
// bio strip.
// ============================================================================

function HeroBlock({
  profile,
  designerCodes,
  isSelf,
  joinedDate,
  compositeScore,
  rank,
  hasActivity,
  onClose,
}: {
  profile: { id: string; full_name: string; avatar_url: string | null; role: UserRole };
  designerCodes: string[];
  isSelf: boolean;
  joinedDate: string;
  compositeScore: number;
  rank: { overallRank: number; totalDesigners: number };
  hasActivity: boolean;
  onClose: () => void;
}) {
  // Composite tier — drives both the gauge color and the verdict copy.
  const tier = compositeTier(compositeScore, hasActivity);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-t-2xl border-b border-border/60",
        // Top-edge gradient bleed colored by tier — subtle, not loud.
        "bg-gradient-to-br",
        tier.gradient
      )}
    >
      {/* Decorative dot grid — gives the banner texture without competing
          with the data. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(rgb(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "14px 14px",
        }}
      />
      <div className="relative px-5 pb-5 pt-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-4">
          {/* Avatar halo — the colored ring is the at-a-glance tier signal. */}
          <div className="relative shrink-0">
            <div
              className={cn(
                "absolute -inset-1 rounded-full opacity-50 blur-sm",
                tier.haloBg
              )}
            />
            <Avatar
              className={cn(
                "relative h-16 w-16 ring-4 ring-card",
                tier.ringClass
              )}
            >
              {profile.avatar_url ? <AvatarImage src={profile.avatar_url} /> : null}
              <AvatarFallback className="bg-card text-base font-bold text-foreground">
                {getInitials(profile.full_name)}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Name + meta */}
          <div className="min-w-0 flex-1 pt-1">
            <h2 className="truncate text-xl font-bold tracking-tight text-foreground">
              {profile.full_name}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px]">
                {ROLE_LABELS[profile.role]}
              </Badge>
              {designerCodes.map((c) => (
                <Badge
                  key={c}
                  variant="outline"
                  className="font-mono text-[10px]"
                >
                  {c}
                </Badge>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {isSelf
                ? "Your performance dashboard"
                : `Joined ${
                    joinedDate ? format(parseISO(joinedDate), "MMM yyyy") : "—"
                  }`}
            </p>
          </div>

          {/* Rank medal (admin viewing others) */}
          {!isSelf && rank.totalDesigners > 0 && (
            <RankMedal rank={rank.overallRank} total={rank.totalDesigners} />
          )}
        </div>

        {/* Composite gauge + verdict block */}
        <div className="mt-5 flex items-center gap-5">
          <CompositeGauge score={compositeScore} tier={tier} hasActivity={hasActivity} />
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider",
                tier.pillClass
              )}
            >
              <tier.IconComponent className="h-3.5 w-3.5" />
              {tier.label}
            </div>
            <p className="mt-2 text-[13px] font-medium leading-snug text-foreground">
              {tier.headline}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {tier.subhead}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Composite tier resolver ────────────────────────────────────────────
function compositeTier(score: number, hasActivity: boolean) {
  if (!hasActivity) {
    return {
      label: "Standby",
      headline: "No activity in this period",
      subhead: "Switch the period filter or check back later.",
      gradient: "from-card to-card",
      haloBg: "bg-muted/40",
      ringClass: "ring-border",
      gaugeColor: "stroke-muted",
      pillClass: "border-border bg-secondary text-muted-foreground",
      IconComponent: Activity,
      scoreClass: "text-muted-foreground",
    };
  }
  if (score >= 80) {
    return {
      label: "Top performer",
      headline: "Crushing it across the board.",
      subhead: "High volume, high approval, low rework.",
      gradient: "from-success/[0.12] via-card to-card",
      haloBg: "bg-success/40",
      ringClass: "ring-success/40",
      gaugeColor: "stroke-success",
      pillClass: "border-success/30 bg-success/15 text-success",
      IconComponent: Crown,
      scoreClass: "text-success",
    };
  }
  if (score >= 60) {
    return {
      label: "Solid contributor",
      headline: "Reliable output with room to push.",
      subhead: "Hitting the basics — eye the next tier next month.",
      gradient: "from-primary/[0.10] via-card to-card",
      haloBg: "bg-primary/40",
      ringClass: "ring-primary/40",
      gaugeColor: "stroke-primary",
      pillClass: "border-primary/30 bg-primary/10 text-primary",
      IconComponent: Trophy,
      scoreClass: "text-primary",
    };
  }
  if (score >= 40) {
    return {
      label: "Developing",
      headline: "Building momentum — keep going.",
      subhead: "A couple of metrics are below the team average.",
      gradient: "from-warning/[0.12] via-card to-card",
      haloBg: "bg-warning/40",
      ringClass: "ring-warning/40",
      gaugeColor: "stroke-warning",
      pillClass: "border-warning/30 bg-warning/15 text-warning",
      IconComponent: TrendingUp,
      scoreClass: "text-warning",
    };
  }
  return {
    label: "Needs support",
    headline: "Multiple signals are slipping.",
    subhead: "Schedule a check-in — review pace + delivery.",
    gradient: "from-destructive/[0.12] via-card to-card",
    haloBg: "bg-destructive/40",
    ringClass: "ring-destructive/40",
    gaugeColor: "stroke-destructive",
    pillClass: "border-destructive/30 bg-destructive/15 text-destructive",
    IconComponent: AlertTriangle,
    scoreClass: "text-destructive",
  };
}

// ─── Composite gauge — 220° semicircular arc with score in the middle ───
function CompositeGauge({
  score,
  tier,
  hasActivity,
}: {
  score: number;
  tier: ReturnType<typeof compositeTier>;
  hasActivity: boolean;
}) {
  const size = 124;
  const stroke = 10;
  const r = (size - stroke) / 2;
  // Sweep from 160° (lower-left) clockwise to 380° = 20° (lower-right) = 220°.
  const startAngle = 160;
  const endAngle = 380;
  const sweep = endAngle - startAngle;
  const pct = Math.max(0, Math.min(100, score)) / 100;

  // Build an SVG arc path
  const polar = (deg: number, radius: number) => {
    const rad = (deg - 90) * (Math.PI / 180);
    return {
      x: size / 2 + radius * Math.cos(rad),
      y: size / 2 + radius * Math.sin(rad),
    };
  };
  const arcPath = (toDeg: number) => {
    const s = polar(startAngle, r);
    const e = polar(toDeg, r);
    const large = toDeg - startAngle > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  };
  const fullArc = arcPath(endAngle);
  const filledArc = arcPath(startAngle + sweep * pct);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size * 0.78 }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 h-full w-full overflow-visible">
        <path
          d={fullArc}
          fill="none"
          stroke="rgb(var(--secondary))"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <path
          d={filledArc}
          fill="none"
          className={tier.gaugeColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{
            transition: "all 900ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
        <p className={cn("text-4xl font-bold leading-none tabular-nums", tier.scoreClass)}>
          {hasActivity ? score : "—"}
        </p>
        <p className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
          / 100 composite
        </p>
      </div>
    </div>
  );
}

// ─── Rank medal — distinct from the old pill, sits in the hero ───
function RankMedal({ rank, total }: { rank: number; total: number }) {
  const isTop3 = rank <= 3;
  const medalColors: Record<number, string> = {
    1: "from-amber-300 to-amber-500 text-amber-900",
    2: "from-slate-300 to-slate-400 text-slate-900",
    3: "from-orange-300 to-orange-500 text-orange-950",
  };
  return (
    <div className="flex shrink-0 flex-col items-center">
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold shadow-md",
          isTop3
            ? `bg-gradient-to-br ${medalColors[rank]}`
            : "bg-secondary text-foreground"
        )}
        title={`Ranked #${rank} of ${total}`}
      >
        #{rank}
      </div>
      <p className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground">
        of {total}
      </p>
    </div>
  );
}

// ============================================================================
// VITAL SIGNS STRIP — 4 cells with mini-visual + delta context
// ============================================================================

function VitalSignsStrip({
  monthlyTargetProgress,
  monthlyTarget,
  completed,
  assigned,
  onTimePct,
  conceptsShipped,
  conceptsApproved,
  completionRate,
  cycleDays,
  teamAvgDays,
}: {
  monthlyTargetProgress: number;
  monthlyTarget: number;
  completed: number;
  assigned: number;
  onTimePct: number | null;
  conceptsShipped: number;
  conceptsApproved: number;
  completionRate: number;
  cycleDays: number;
  teamAvgDays: number;
}) {
  const onTimeTone =
    onTimePct === null
      ? "muted"
      : onTimePct > 85
      ? "success"
      : onTimePct >= 70
      ? "warning"
      : "destructive";
  const targetTone =
    monthlyTargetProgress >= monthlyTarget
      ? "success"
      : monthlyTargetProgress >= 1
      ? "warning"
      : "destructive";
  const cycleTone =
    cycleDays === 0
      ? "muted"
      : cycleDays <= 3
      ? "success"
      : cycleDays <= 6
      ? "warning"
      : "destructive";
  const shipTone =
    conceptsApproved === 0
      ? "muted"
      : completionRate >= 70
      ? "success"
      : completionRate >= 40
      ? "warning"
      : "destructive";

  // Cycle delta vs team
  const cycleDelta =
    teamAvgDays > 0 && cycleDays > 0
      ? Math.round((cycleDays - teamAvgDays) * 10) / 10
      : null;

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <VitalCell
        icon={<Target className="h-3.5 w-3.5" />}
        label="Monthly target"
        value={`${monthlyTargetProgress}`}
        suffix={`/${monthlyTarget}`}
        tone={targetTone}
        visual={
          <ProgressDots
            filled={monthlyTargetProgress}
            total={monthlyTarget}
            tone={targetTone}
          />
        }
        hint={
          monthlyTargetProgress >= monthlyTarget
            ? "Target hit"
            : `${monthlyTarget - monthlyTargetProgress} to go`
        }
      />
      <VitalCell
        icon={<PackageCheck className="h-3.5 w-3.5" />}
        label="Concepts shipped"
        value={`${conceptsShipped}`}
        suffix={conceptsApproved > 0 ? `/${conceptsApproved}` : ""}
        tone={shipTone}
        visual={
          <MiniBar
            pct={
              conceptsApproved > 0 ? (conceptsShipped / conceptsApproved) * 100 : 0
            }
            tone={shipTone}
          />
        }
        hint={
          conceptsApproved === 0
            ? "No approvals yet"
            : `${completionRate}% of approved`
        }
      />
      <VitalCell
        icon={<CheckCircle className="h-3.5 w-3.5" />}
        label="On-time"
        value={onTimePct === null ? "—" : `${onTimePct}`}
        suffix={onTimePct === null ? "" : "%"}
        tone={onTimeTone}
        visual={
          <MiniBar pct={onTimePct ?? 0} tone={onTimeTone} />
        }
        hint={
          completed > 0
            ? `${completed} of ${assigned} delivered`
            : "Nothing delivered yet"
        }
      />
      <VitalCell
        icon={<Zap className="h-3.5 w-3.5" />}
        label="Cycle time"
        value={cycleDays === 0 ? "—" : `${cycleDays}`}
        suffix={cycleDays === 0 ? "" : "d"}
        tone={cycleTone}
        visual={
          cycleDelta === null ? null : (
            <DeltaPill delta={cycleDelta} invert />
          )
        }
        hint={
          cycleDelta === null
            ? "assigned → done"
            : Math.abs(cycleDelta) < 0.1
            ? "on team avg"
            : cycleDelta > 0
            ? `${cycleDelta}d slower than team`
            : `${Math.abs(cycleDelta)}d faster than team`
        }
      />
    </div>
  );
}

type Tone = "success" | "warning" | "destructive" | "muted" | "primary";

const TONE_VALUE: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
  primary: "text-primary",
};
const TONE_ICON: Record<Tone, string> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  muted: "bg-secondary text-muted-foreground",
  primary: "bg-primary/10 text-primary",
};
const TONE_BAR: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  muted: "bg-muted",
  primary: "bg-primary",
};

function VitalCell({
  icon,
  label,
  value,
  suffix,
  hint,
  tone,
  visual,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix?: string;
  hint?: string;
  tone: Tone;
  visual?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm">
      <div className="mb-1 flex items-center justify-between gap-1">
        <span
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-md",
            TONE_ICON[tone]
          )}
        >
          {icon}
        </span>
        <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "text-2xl font-bold leading-none tabular-nums",
          TONE_VALUE[tone]
        )}
      >
        {value}
        {suffix && (
          <span className="ml-0.5 text-sm font-medium text-muted-foreground">
            {suffix}
          </span>
        )}
      </p>
      {visual && <div className="mt-2">{visual}</div>}
      {hint && (
        <p className="mt-1.5 truncate text-[10px] text-muted-foreground" title={hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

function ProgressDots({
  filled,
  total,
  tone,
}: {
  filled: number;
  total: number;
  tone: Tone;
}) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 flex-1 rounded-full",
            i < filled ? TONE_BAR[tone] : "bg-secondary"
          )}
        />
      ))}
    </div>
  );
}

function MiniBar({ pct, tone }: { pct: number; tone: Tone }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className={cn("h-full rounded-full transition-[width] duration-700", TONE_BAR[tone])}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

function DeltaPill({ delta, invert }: { delta: number; invert?: boolean }) {
  // invert=true → smaller is better (cycle time, delay)
  if (Math.abs(delta) < 0.1) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-secondary px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
        =
      </span>
    );
  }
  const goodDirection = invert ? delta < 0 : delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[10px] font-semibold tabular-nums",
        goodDirection ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
      )}
    >
      {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(delta)}
    </span>
  );
}

// ============================================================================
// FOOTNOTE STAT — small two-line stat box for the bottom of perf cards
// ============================================================================

function FootStat({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone: Tone;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className={cn("flex h-4 w-4 items-center justify-center rounded", TONE_ICON[tone])}>
          {icon}
        </span>
        {label}
      </div>
      <p
        className={cn(
          "mt-0.5 text-base font-semibold tabular-nums",
          TONE_VALUE[tone]
        )}
      >
        {value}
      </p>
      {hint && (
        <p className="text-[10px] text-muted-foreground" title={hint}>
          {hint}
        </p>
      )}
    </div>
  );
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
