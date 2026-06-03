import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Trophy,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  ChevronRight,
  Users as UsersIcon,
  CheckCircle2,
  Target,
  ArrowUpRight,
  Search,
  MoreVertical,
  Eye,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  Card,
  CardContent,
  Badge,
  Button,
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
  SkeletonCard,
  EmptyState,
  Input,
  ConfirmDialog,
  toast,
} from "@/components/ui";
import { ScoreRing } from "@/components/analytics/ScoreRing";
import { useAuth } from "@/hooks/useAuth";
import {
  useAnalytics,
  type Period,
  type DesignerConceptStat,
} from "@/hooks/useAnalytics";
import {
  useTaskAnalytics,
  type DesignerTaskStat,
} from "@/hooks/useTaskAnalytics";
import { useProfiles } from "@/hooks/useProfiles";
import { useDesignerCodes } from "@/hooks/useDesignerCodes";
import { supabase } from "@/lib/supabase";
import { isAdmin as isAdminCheck, isAdminOrCoordinator } from "@/lib/permissions";
import { scorecardDetailPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { KpiCard } from "@/components/analytics/KpiCard";
import { AlertBanner } from "@/components/analytics/AlertBanner";

const PERIODS: { value: Period; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
];

// ============================================================================
// Verdict tiers (combined judgment from composite score)
// ============================================================================

type VerdictKey = "top" | "solid" | "developing" | "support" | "inactive";

interface Verdict {
  key: VerdictKey;
  label: string;
  badgeClass: string;
  cardRing: string;
}

function verdictFor(compositeScore: number, hasAnyActivity: boolean): Verdict {
  if (!hasAnyActivity) {
    return {
      key: "inactive",
      label: "No activity",
      badgeClass: "bg-secondary text-muted-foreground border-border",
      cardRing: "border-border",
    };
  }
  if (compositeScore >= 80) {
    return {
      key: "top",
      label: "Top Performer",
      badgeClass: "bg-success/15 text-success border-success/30",
      cardRing: "border-success/40 ring-1 ring-success/20",
    };
  }
  if (compositeScore >= 60) {
    return {
      key: "solid",
      label: "Solid Contributor",
      badgeClass: "bg-primary/10 text-primary border-primary/30",
      cardRing: "border-primary/30",
    };
  }
  if (compositeScore >= 40) {
    return {
      key: "developing",
      label: "Developing",
      badgeClass: "bg-warning/15 text-warning border-warning/30",
      cardRing: "border-warning/30",
    };
  }
  return {
    key: "support",
    label: "Needs Support",
    badgeClass: "bg-destructive/15 text-destructive border-destructive/30",
    cardRing: "border-destructive/30",
  };
}

// ============================================================================
// Insights builder — same rules as the drawer hook, condensed counts
// ============================================================================

function countInsights(
  c: DesignerConceptStat,
  t: DesignerTaskStat | undefined
): { strengths: number; watchouts: number } {
  let strengths = 0;
  let watchouts = 0;

  // Concept side
  if (c.submitted > 0) {
    const approvalRate = c.submitted > 0 ? (c.approved / c.submitted) * 100 : 0;
    if (approvalRate > 85) strengths++;
    if (c.avgApprovalHours > 0 && c.avgApprovalHours < 24) strengths++;
    if (c.revisions / c.submitted > 0.3) watchouts++;
  } else {
    // Will fire as "no submissions" watchout downstream
    watchouts++;
  }

  // Task side
  if (t && t.completed > 0) {
    const otRate = (t.onTime / t.completed) * 100;
    if (otRate > 85) strengths++;
    if (t.avgDays < 3) strengths++;
    if (otRate < 70) watchouts++;
    if (t.avgDays > 5) watchouts++;
  }

  return { strengths, watchouts };
}

// ============================================================================
// View
// ============================================================================

export function ScorecardsView() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = isAdminCheck(profile?.role);
  // Coordinators can view scorecards; destructive actions stay admin-only.
  const canView = isAdminOrCoordinator(profile?.role);

  const [period, setPeriod] = useState<Period>("month");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openScorecard = (id: string) => navigate(scorecardDetailPath(id));

  const conceptAnalytics = useAnalytics(period);
  const taskAnalytics = useTaskAnalytics(period);
  const { profiles, isLoading: profilesLoading } = useProfiles({ roles: ["designer"] });
  const { codesByProfile } = useDesignerCodes();

  const isLoading =
    conceptAnalytics.isLoading || taskAnalytics.isLoading || profilesLoading;

  // ── Merge per-designer stats ──────────────────────────────────────
  const rows = useMemo(() => {
    const taskById = new Map<string, DesignerTaskStat>(
      taskAnalytics.designerStats.map((t) => [t.id, t])
    );
    const conceptById = new Map<string, DesignerConceptStat>(
      conceptAnalytics.designerStats.map((c) => [c.id, c])
    );

    type Row = {
      id: string;
      name: string;
      firstName: string;
      avatarUrl: string | null;
      designerCode: string;
      concept: DesignerConceptStat | null;
      task: DesignerTaskStat | null;
      compositeScore: number;
      hasActivity: boolean;
      onTimePct: number | null;
      approvalRate: number;
      insights: { strengths: number; watchouts: number };
    };

    const items: Row[] = profiles.map((p) => {
      const c = conceptById.get(p.id) ?? null;
      const t = taskById.get(p.id) ?? null;
      const compositeScore = Math.round(((c?.score ?? 0) + (t?.score ?? 0)) / 2);
      const hasActivity = (c?.submitted ?? 0) > 0 || (t?.assigned ?? 0) > 0;
      const onTimePct =
        t && t.completed > 0
          ? Math.round((t.onTime / t.completed) * 100)
          : null;
      const approvalRate =
        c && c.submitted > 0
          ? Math.round(
              (c.approved /
                Math.max(1, c.approved + c.rejected + c.revisions)) *
                100
            )
          : 0;
      const code = codesByProfile.get(p.id)?.[0]?.code?.slice(0, 1) ?? "—";
      const firstName = p.full_name.split(" ")[0] ?? p.full_name;
      const insights = c ? countInsights(c, t ?? undefined) : { strengths: 0, watchouts: 0 };

      return {
        id: p.id,
        name: p.full_name,
        firstName,
        avatarUrl: p.avatar_url,
        designerCode: code,
        concept: c,
        task: t,
        compositeScore,
        hasActivity,
        onTimePct,
        approvalRate,
        insights,
      };
    });

    // Sort: active first by composite, then inactives at the bottom
    items.sort((a, b) => {
      if (a.hasActivity !== b.hasActivity) return a.hasActivity ? -1 : 1;
      return b.compositeScore - a.compositeScore;
    });

    return items;
  }, [conceptAnalytics.designerStats, taskAnalytics.designerStats, profiles, codesByProfile]);

  // ── Search filter ──
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.designerCode.toLowerCase().includes(q)
    );
  }, [rows, search]);

  // ── Team-wide summary banner ──
  const teamSummary = useMemo(() => {
    const active = rows.filter((r) => r.hasActivity);
    const avgScore =
      active.length > 0
        ? Math.round(
            active.reduce((s, r) => s + r.compositeScore, 0) / active.length
          )
        : 0;
    const topPerformer = [...active].sort((a, b) => b.compositeScore - a.compositeScore)[0] ?? null;
    const needsSupport = rows.filter(
      (r) => r.hasActivity && r.compositeScore < 40
    ).length;
    const onTrack = rows.filter(
      (r) => r.hasActivity && r.compositeScore >= 60
    ).length;
    return { avgScore, topPerformer, needsSupport, onTrack, total: rows.length };
  }, [rows]);

  // ── Permission gate ──
  if (!canView) {
    return (
      <div className="mx-auto max-w-md py-20">
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10 text-destructive" />}
          title="Restricted"
          description="Designer scorecards are visible to admins and coordinators."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-warning/20 to-warning/5 ring-1 ring-inset ring-warning/20">
            <Trophy className="h-6 w-6 text-warning" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Designer Scorecards
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
              {conceptAnalytics.periodLabel} · composite of Concept + Task performance
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <div className="relative w-full sm:w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search designer or code…"
              className="h-9 rounded-xl pl-8 text-sm"
            />
          </div>

          {teamSummary.topPerformer && teamSummary.topPerformer.compositeScore > 0 && (
            <button
              type="button"
              onClick={() => openScorecard(teamSummary.topPerformer!.id)}
              className="group hidden h-9 items-center gap-2 rounded-xl border border-warning/20 bg-warning/[0.06] px-3 text-xs transition-all hover:bg-warning/[0.12] hover:shadow-sm sm:flex"
              title={`${teamSummary.topPerformer.name} · ${teamSummary.topPerformer.compositeScore}/100`}
            >
              <Trophy className="h-3.5 w-3.5 shrink-0 text-warning" />
              <span className="max-w-[140px] truncate font-medium text-foreground">
                {teamSummary.topPerformer.name}
              </span>
              <span className="font-mono-data text-sm text-success">
                {teamSummary.topPerformer.compositeScore}
              </span>
              <ArrowUpRight className="h-3 w-3 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
          )}

          <div className="inline-flex rounded-xl bg-secondary p-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all",
                  period === p.value
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Team KPI row — clean elevated cards (2-up on mobile, 4-up on
           desktop). The washed textile strip is gone; each metric is its own
           premium tile with a confident numeral. ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          centered
          icon={<UsersIcon className="h-4 w-4 text-primary" />}
          label="Designers"
          value={teamSummary.total}
          tintClass="bg-primary/10"
          sub="being scored"
        />
        <KpiCard
          centered
          icon={<Target className="h-4 w-4 text-success" />}
          label="Avg Composite"
          value={`${teamSummary.avgScore}/100`}
          tintClass="bg-success/10"
          valueColor={
            teamSummary.avgScore >= 70
              ? "text-success"
              : teamSummary.avgScore >= 50
                ? "text-warning"
                : "text-destructive"
          }
          sub="team average score"
        />
        <KpiCard
          centered
          icon={<CheckCircle2 className="h-4 w-4 text-success" />}
          label="On Track"
          value={teamSummary.onTrack}
          tintClass="bg-success/10"
          valueColor="text-success"
          sub={`of ${rows.filter((r) => r.hasActivity).length} active`}
        />
        <KpiCard
          centered
          icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
          label="Needs Support"
          value={teamSummary.needsSupport}
          tintClass={
            teamSummary.needsSupport > 0 ? "bg-destructive/10" : "bg-secondary"
          }
          valueColor={
            teamSummary.needsSupport > 0
              ? "text-destructive"
              : "text-muted-foreground"
          }
          sub={
            teamSummary.needsSupport > 0
              ? "score below 50"
              : "all above threshold"
          }
        />
      </div>

      {/* Needs-support alert — surfaces designers below the threshold so
          managers don't have to scroll the grid to find them. */}
      {teamSummary.needsSupport > 0 ? (
        <AlertBanner
          variant="danger"
          title="Needs Support"
          count={teamSummary.needsSupport}
          description="Designers with a composite score below 50 — open their card to see strengths and watchouts."
        />
      ) : null}

      {/* ── Grid of scorecards ── */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filteredRows.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="h-10 w-10" />}
          title="No designers match"
          description={search ? "Try a different search." : "No designers in the system yet."}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {filteredRows.map((row, i) => (
            <DesignerScorecardCard
              key={row.id}
              row={row}
              rank={i + 1}
              isAdmin={isAdmin}
              onOpen={() => openScorecard(row.id)}
              onDelete={() => setDeleteTarget({ id: row.id, name: row.name })}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove designer?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" will be deactivated and hidden from the team. This can be reversed from the Team page.`
            : ""
        }
        confirmLabel={deleting ? "Removing…" : "Remove designer"}
        variant="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleting(true);
          const { error } = await supabase
            .from("profiles")
            .update({ is_active: false })
            .eq("id", deleteTarget.id);
          setDeleting(false);
          if (error) {
            toast.error(error.message);
            return;
          }
          toast.success(`${deleteTarget.name} removed`);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================


interface CardRow {
  id: string;
  name: string;
  firstName: string;
  avatarUrl: string | null;
  designerCode: string;
  concept: DesignerConceptStat | null;
  task: DesignerTaskStat | null;
  compositeScore: number;
  hasActivity: boolean;
  onTimePct: number | null;
  approvalRate: number;
  insights: { strengths: number; watchouts: number };
}

function DesignerScorecardCard({
  row,
  rank,
  isAdmin,
  onOpen,
  onDelete,
}: {
  row: CardRow;
  rank: number;
  isAdmin: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const verdict = verdictFor(row.compositeScore, row.hasActivity);
  const scoreColor =
    !row.hasActivity
      ? "text-muted-foreground"
      : row.compositeScore >= 80
      ? "text-success"
      : row.compositeScore >= 60
      ? "text-primary"
      : row.compositeScore >= 40
      ? "text-warning"
      : "text-destructive";

  const medal =
    rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-4 text-left shadow-card transition-all duration-300",
        "hover:-translate-y-1 hover:shadow-card-hover",
        !row.hasActivity
          ? "border-border"
          : row.compositeScore >= 80
          ? "border-success/30"
          : row.compositeScore >= 60
          ? "border-primary/30"
          : row.compositeScore >= 40
          ? "border-warning/30"
          : "border-destructive/30"
      )}
    >
      {/* Top accent line */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-[2px]",
          !row.hasActivity
            ? "bg-muted"
            : row.compositeScore >= 80
            ? "bg-gradient-to-r from-success via-success/60 to-transparent"
            : row.compositeScore >= 60
            ? "bg-gradient-to-r from-primary via-primary/60 to-transparent"
            : row.compositeScore >= 40
            ? "bg-gradient-to-r from-warning via-warning/60 to-transparent"
            : "bg-gradient-to-r from-destructive via-destructive/60 to-transparent"
        )}
      />

      {/* Top row: avatar + name + rank + menu */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className={cn("h-11 w-11 ring-2 ring-offset-2 ring-offset-card", !row.hasActivity ? "ring-border" : row.compositeScore >= 80 ? "ring-success/40" : row.compositeScore >= 60 ? "ring-primary/40" : row.compositeScore >= 40 ? "ring-warning/40" : "ring-destructive/40")}>
              {row.avatarUrl ? <AvatarImage src={row.avatarUrl} /> : null}
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                {getInitials(row.name)}
              </AvatarFallback>
            </Avatar>
            {medal && (
              <span className="absolute -bottom-1 -right-1 text-sm leading-none">{medal}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {row.name}
            </p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <Badge variant="outline" className="text-[9px] font-mono">
                {row.designerCode}
              </Badge>
              <Badge className={cn("border text-[9px] font-semibold", verdict.badgeClass)}>
                {verdict.label}
              </Badge>
            </div>
          </div>
        </div>
        <DesignerCardMenu isAdmin={isAdmin} onView={onOpen} onDelete={onDelete} />
      </div>

      {/* Score ring — centered, prominent */}
      <div className="flex items-center justify-center gap-4 py-1">
        <ScoreRing score={row.compositeScore} size={88} strokeWidth={5}>
          <p className={cn("font-mono-data text-2xl leading-none", scoreColor)}>
            {row.compositeScore}
          </p>
          <p className="text-[8px] font-medium uppercase tracking-wider text-muted-foreground">/ 100</p>
        </ScoreRing>
      </div>

      {/* Concept + Task mini blocks */}
      <div className="grid grid-cols-2 gap-2">
        <MiniBlock
          label="Concept"
          score={row.concept?.score ?? 0}
          lines={[
            `${row.concept?.submitted ?? 0} submitted`,
            `${row.concept?.approved ?? 0} approved · ${row.approvalRate}%`,
          ]}
        />
        <MiniBlock
          label="Task"
          score={row.task?.score ?? 0}
          lines={[
            `${row.task?.completed ?? 0} completed`,
            row.onTimePct === null
              ? "—"
              : `${row.onTimePct}% on time · ${row.task?.avgDays ?? 0}d avg`,
          ]}
        />
      </div>

      {/* Insights footer */}
      <div className="flex items-center justify-between border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2.5">
          {row.insights.strengths > 0 && (
            <span className="inline-flex items-center gap-1 text-success">
              <Sparkles className="h-3 w-3" />
              {row.insights.strengths} strength{row.insights.strengths !== 1 ? "s" : ""}
            </span>
          )}
          {row.insights.watchouts > 0 && (
            <span className="inline-flex items-center gap-1 text-warning">
              <AlertTriangle className="h-3 w-3" />
              {row.insights.watchouts} watchout{row.insights.watchouts !== 1 ? "s" : ""}
            </span>
          )}
          {row.insights.strengths === 0 && row.insights.watchouts === 0 && (
            <span>No signals yet</span>
          )}
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary opacity-0 transition-all duration-300 group-hover:opacity-100">
          View <ChevronRight className="h-3 w-3" />
        </span>
      </div>
    </button>
  );
}

function MiniBlock({
  label,
  score,
  lines,
}: {
  label: string;
  score: number;
  lines: string[];
}) {
  const scoreColor =
    score >= 80
      ? "text-success"
      : score >= 50
      ? "text-warning"
      : "text-muted-foreground";
  const borderAccent =
    score >= 80
      ? "border-l-success"
      : score >= 60
      ? "border-l-primary"
      : score >= 40
      ? "border-l-warning"
      : "border-l-destructive";
  return (
    <div className={cn("rounded-xl border border-l-[3px] border-border/60 bg-secondary/20 p-2.5", borderAccent)}>
      <div className="flex items-center justify-between gap-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <span className={cn("font-mono-data text-sm leading-none", scoreColor)}>
          {score}
        </span>
      </div>
      <div className="mt-1.5 space-y-0.5">
        {lines.map((l, i) => (
          <p key={i} className="text-[10px] leading-snug text-muted-foreground">
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}

function DesignerCardMenu({
  isAdmin,
  onView,
  onDelete,
}: {
  isAdmin: boolean;
  onView: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Card actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && createPortal(
        <div
          className="fixed inset-0 z-50"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute z-50 min-w-[140px] rounded-lg border border-border bg-card py-1 shadow-xl"
            style={{
              top: (ref.current?.getBoundingClientRect().bottom ?? 0) + 4,
              left: (ref.current?.getBoundingClientRect().left ?? 0) - 100,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => { onView(); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
            >
              <Eye className="h-3.5 w-3.5" /> View
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => { onDelete(); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
