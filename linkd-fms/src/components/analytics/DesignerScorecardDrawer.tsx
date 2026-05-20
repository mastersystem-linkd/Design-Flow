import { useMemo, useState } from "react";
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
  Sparkles,
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
  Sheet,
  SheetContent,
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

  // Non-admin viewing someone else: do not render
  if (designerId && !isAdmin && !isSelf) {
    return (
      <Sheet open={!!designerId} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-[400px]">
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<AlertTriangle className="h-8 w-8" />}
              title="Restricted"
              description="Scorecards are visible to admins only."
            />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={!!designerId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        className="w-[560px] max-w-[90vw] overflow-y-auto sm:w-[600px]"
      >
        {designerId && (
          <ScorecardBody
            designerId={designerId}
            onClose={onClose}
            isSelf={isSelf}
            isAdmin={isAdmin}
          />
        )}
      </SheetContent>
    </Sheet>
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

  const compositeColor =
    data.compositeScore >= 80
      ? "text-success"
      : data.compositeScore >= 50
      ? "text-warning"
      : "text-destructive";
  const compositeBorder =
    data.compositeScore >= 80
      ? "border-b-success"
      : data.compositeScore >= 50
      ? "border-b-warning"
      : "border-b-destructive";

  const concept = data.concept;
  const task = data.task;

  const targetProgress = concept.monthlyTargetProgress;
  const targetColor =
    targetProgress >= 3
      ? "text-success"
      : targetProgress >= 1
      ? "text-warning"
      : "text-destructive";

  const onTimePct =
    task.completed > 0 ? Math.round((task.onTime / task.completed) * 100) : null;
  const onTimeColor =
    onTimePct === null
      ? "text-muted-foreground"
      : onTimePct > 85
      ? "text-success"
      : onTimePct >= 70
      ? "text-warning"
      : "text-destructive";

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

  return (
    <div className="space-y-4 pb-6">
      {/* ── SECTION 1: HEADER ── */}
      <div className="flex items-center gap-4 border-b border-border pb-4">
        <Avatar className="h-14 w-14">
          {data.profile.avatar_url ? (
            <AvatarImage src={data.profile.avatar_url} />
          ) : null}
          <AvatarFallback className="bg-primary/10 text-primary text-base font-bold">
            {getInitials(data.profile.full_name)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-foreground">
            {data.profile.full_name}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px]">
              {ROLE_LABELS[data.profile.role]}
            </Badge>
            {data.designerCodes.map((c) => (
              <Badge
                key={c}
                variant="outline"
                className="text-[10px] font-mono"
              >
                {c}
              </Badge>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isSelf
              ? "My Performance"
              : `Joined ${
                  data.joinedDate
                    ? format(parseISO(data.joinedDate), "MMM yyyy")
                    : "—"
                }`}
          </p>

          {/* Verdict pill — combined judgment from composite score */}
          <div className="mt-2">
            <VerdictPill
              compositeScore={data.compositeScore}
              hasActivity={data.concept.submitted > 0 || data.task.assigned > 0}
            />
          </div>
        </div>

        {/* Rank pill — only for admin viewing other designers */}
        {!isSelf && (
          <RankPill
            rank={data.rank.overallRank}
            total={data.rank.totalDesigners}
          />
        )}
      </div>

      {/* ── SECTION 2: KPI STRIP ── */}
      <div className="grid grid-cols-2 gap-3">
        <KpiBox
          label="Composite Score"
          value={`${data.compositeScore}/100`}
          valueClass={compositeColor}
          borderClass={cn("border-b-2", compositeBorder)}
        />
        <KpiBox
          label="Monthly Concepts"
          value={`${targetProgress} / 3`}
          valueClass={targetColor}
          extra={<TargetRing progress={targetProgress} target={3} />}
        />
        <KpiBox label="Tasks Done" value={String(task.completed)} />
        <KpiBox
          label="On-Time"
          value={onTimePct === null ? "—" : `${onTimePct}%`}
          valueClass={onTimeColor}
        />
      </div>

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

      {/* ── SECTION 3: PERIOD SELECTOR ── */}
      <div>
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
        <p className="mt-1.5 text-xs text-muted-foreground">
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

function VerdictPill({
  compositeScore,
  hasActivity,
}: {
  compositeScore: number;
  hasActivity: boolean;
}) {
  const { label, cls, icon } = (() => {
    if (!hasActivity) {
      return {
        label: "No activity this period",
        cls: "bg-secondary text-muted-foreground border-border",
        icon: "·",
      };
    }
    if (compositeScore >= 80) {
      return {
        label: "Top Performer",
        cls: "bg-success/15 text-success border-success/30",
        icon: "★",
      };
    }
    if (compositeScore >= 60) {
      return {
        label: "Solid Contributor",
        cls: "bg-primary/10 text-primary border-primary/30",
        icon: "✓",
      };
    }
    if (compositeScore >= 40) {
      return {
        label: "Developing",
        cls: "bg-warning/15 text-warning border-warning/30",
        icon: "↗",
      };
    }
    return {
      label: "Needs Support",
      cls: "bg-destructive/15 text-destructive border-destructive/30",
      icon: "!",
    };
  })();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        cls
      )}
      title={`Composite score ${compositeScore}/100`}
    >
      <span className="text-[10px]">{icon}</span>
      {label}
    </span>
  );
}

function RankPill({ rank, total }: { rank: number; total: number }) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
  const isTop = rank <= 3;
  return (
    <div
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
        isTop
          ? "bg-warning/10 text-warning"
          : "bg-secondary text-muted-foreground"
      )}
      title={`Ranked #${rank} of ${total} by composite score`}
    >
      {medal ? <span className="mr-1">{medal}</span> : null}#{rank} of {total}
    </div>
  );
}

function KpiBox({
  label,
  value,
  valueClass,
  borderClass,
  extra,
}: {
  label: string;
  value: string;
  valueClass?: string;
  borderClass?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl bg-secondary/30 p-3",
        borderClass
      )}
    >
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <p className={cn("text-xl font-bold tabular-nums", valueClass ?? "text-foreground")}>
          {value}
        </p>
        {extra}
      </div>
    </div>
  );
}

function TargetRing({ progress, target }: { progress: number; target: number }) {
  const pct = Math.min(100, (progress / target) * 100);
  const r = 8;
  const c = 2 * Math.PI * r;
  const color =
    progress >= target
      ? "stroke-success"
      : progress >= 1
      ? "stroke-warning"
      : "stroke-destructive";
  return (
    <svg viewBox="0 0 22 22" className="-rotate-90 h-5 w-5" aria-hidden>
      <circle cx="11" cy="11" r={r} className="fill-none stroke-secondary" strokeWidth={2.5} />
      <circle
        cx="11"
        cy="11"
        r={r}
        className={cn("fill-none", color)}
        strokeWidth={2.5}
        strokeDasharray={c}
        strokeDashoffset={c - (pct / 100) * c}
        strokeLinecap="round"
      />
    </svg>
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
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgb(var(--border))"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            tick={{ fill: "rgb(var(--muted-foreground))", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "rgb(var(--muted-foreground))", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgb(var(--card))",
              border: "1px solid rgb(var(--border))",
              borderRadius: 8,
              fontSize: 12,
              color: "rgb(var(--foreground))",
            }}
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
