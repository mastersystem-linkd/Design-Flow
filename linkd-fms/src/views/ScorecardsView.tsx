import { useMemo, useState } from "react";
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
} from "@/components/ui";
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
import { isAdmin as isAdminCheck } from "@/lib/permissions";
import { scorecardDetailPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { KpiCard } from "@/components/analytics/KpiCard";
import { TextileHeroWrapper } from "@/components/analytics/TextileHeroWrapper";
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

  const [period, setPeriod] = useState<Period>("month");
  const [search, setSearch] = useState("");

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
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md py-20">
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10 text-destructive" />}
          title="Admin only"
          description="Designer scorecards are visible to admins."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header — title left; search + leader summary + period filters
           right-aligned on the same row. Hero strip below carries the
           team-level KPIs and a subtle textile dot overlay so the page
           reads in the visual language of digital fabric printing. ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10">
            <Trophy className="h-5 w-5 text-warning" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Designer Scorecards
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {conceptAnalytics.periodLabel} · composite of Concept + Task performance
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Search */}
          <div className="relative w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search designer or code…"
              className="h-9 pl-8 text-sm"
            />
          </div>

          {/* Leader summary — compact inline form of the old banner */}
          {teamSummary.topPerformer && teamSummary.topPerformer.compositeScore > 0 && (
            <button
              type="button"
              onClick={() => openScorecard(teamSummary.topPerformer!.id)}
              className="group flex h-9 items-center gap-2 rounded-lg border border-warning/30 bg-warning/[0.06] px-2.5 text-xs transition-colors hover:bg-warning/[0.12]"
              title={`${teamSummary.topPerformer.name} · ${teamSummary.topPerformer.compositeScore}/100`}
            >
              <Trophy className="h-3.5 w-3.5 shrink-0 text-warning" />
              <span className="max-w-[140px] truncate font-medium text-foreground">
                {teamSummary.topPerformer.name}
              </span>
              <span className="font-bold tabular-nums text-success">
                {teamSummary.topPerformer.compositeScore}
              </span>
              <ArrowUpRight className="h-3 w-3 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
          )}

          {/* Period filter */}
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

      {/* ── Team KPI strip — wrapped in the shared TextileHeroWrapper so
           the inline duplicate frame is gone. Same KpiCard primitive
           used on every other dashboard. ── */}
      <TextileHeroWrapper className="p-0 sm:p-0">
        <div className="grid grid-cols-2 divide-x divide-y divide-border/40 sm:divide-y-0 lg:grid-cols-4">
          <KpiCard
            flat
            icon={<UsersIcon className="h-4 w-4 text-primary" />}
            label="Designers"
            value={teamSummary.total}
            tintClass="bg-primary/10"
          />
          <KpiCard
            flat
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
            flat
            icon={<CheckCircle2 className="h-4 w-4 text-success" />}
            label="On Track"
            value={teamSummary.onTrack}
            tintClass="bg-success/10"
            valueColor="text-success"
            sub={`of ${rows.filter((r) => r.hasActivity).length} active`}
          />
          <KpiCard
            flat
            icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
            label="Needs Support"
            value={teamSummary.needsSupport}
            tintClass={
              teamSummary.needsSupport > 0
                ? "bg-destructive/10"
                : "bg-secondary"
            }
            valueColor={
              teamSummary.needsSupport > 0
                ? "text-destructive"
                : "text-muted-foreground"
            }
            sub={
              teamSummary.needsSupport > 0
                ? "score below 50"
                : "all designers above threshold"
            }
          />
        </div>
      </TextileHeroWrapper>

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRows.map((row, i) => (
            <DesignerScorecardCard
              key={row.id}
              row={row}
              rank={i + 1}
              onOpen={() => openScorecard(row.id)}
            />
          ))}
        </div>
      )}
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
  onOpen,
}: {
  row: CardRow;
  rank: number;
  onOpen: () => void;
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
        "group flex flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-all",
        "hover:-translate-y-0.5 hover:shadow-md",
        verdict.cardRing
      )}
    >
      {/* Top row: avatar + name + rank */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Avatar className="h-10 w-10">
            {row.avatarUrl ? <AvatarImage src={row.avatarUrl} /> : null}
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
              {getInitials(row.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {row.name}
            </p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <Badge variant="outline" className="text-[9px] font-mono">
                {row.designerCode}
              </Badge>
              {medal && <span className="text-xs">{medal}</span>}
            </div>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      {/* Big composite score */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Composite Score
          </p>
          <p
            className={cn(
              "text-4xl font-bold tabular-nums leading-none",
              scoreColor
            )}
          >
            {row.compositeScore}
            <span className="text-base font-normal text-muted-foreground">
              /100
            </span>
          </p>
        </div>
        <Badge
          className={cn(
            "border text-[10px] font-semibold",
            verdict.badgeClass
          )}
        >
          {verdict.label}
        </Badge>
      </div>

      {/* Score progress bar */}
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            row.compositeScore >= 80
              ? "bg-success"
              : row.compositeScore >= 60
              ? "bg-primary"
              : row.compositeScore >= 40
              ? "bg-warning"
              : "bg-destructive"
          )}
          style={{
            width: `${row.compositeScore}%`,
            transitionDuration: "600ms",
          }}
        />
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
      <div className="flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2.5">
          {row.insights.strengths > 0 && (
            <span className="inline-flex items-center gap-1 text-success">
              <Sparkles className="h-3 w-3" />
              {row.insights.strengths} strength
              {row.insights.strengths !== 1 ? "s" : ""}
            </span>
          )}
          {row.insights.watchouts > 0 && (
            <span className="inline-flex items-center gap-1 text-warning">
              <AlertTriangle className="h-3 w-3" />
              {row.insights.watchouts} watchout
              {row.insights.watchouts !== 1 ? "s" : ""}
            </span>
          )}
          {row.insights.strengths === 0 && row.insights.watchouts === 0 && (
            <span>No signals yet</span>
          )}
        </div>
        <span className="inline-flex items-center gap-0.5 font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
          Open <TrendingUp className="h-3 w-3" />
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
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-2">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <span className={cn("text-xs font-bold tabular-nums", scoreColor)}>
          {score}
        </span>
      </div>
      {lines.map((l, i) => (
        <p key={i} className="text-[11px] leading-tight text-muted-foreground">
          {l}
        </p>
      ))}
    </div>
  );
}
