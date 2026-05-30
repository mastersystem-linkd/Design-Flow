import { useMemo, useState } from "react";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  isWithinInterval,
  parseISO,
  format,
} from "date-fns";
import {
  Users,
  TrendingUp,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Clock,
  ChevronUp,
  ChevronDown,
  Trophy,
} from "lucide-react";
import {
  Card,
  CardContent,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  getInitials,
  EmptyState,
} from "@/components/ui";
import { useConcepts } from "@/hooks/useConcepts";
import { useProfiles } from "@/hooks/useProfiles";
import { useDesignerCodes } from "@/hooks/useDesignerCodes";
import { useAuth } from "@/hooks/useAuth";
import { isAdminOrCoordinator } from "@/lib/permissions";
import { DesignerScorecardDrawer } from "@/components/analytics/DesignerScorecardDrawer";
import { cn } from "@/lib/utils";

type LocalPeriod = "week" | "month" | "quarter" | "year";
type SortKey = "submitted" | "approved" | "rejected" | "rate";

const PERIODS: { value: LocalPeriod; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

interface DesignerRow {
  id: string;
  full_name: string;
  avatar_url: string | null;
  designerCode: string;
  submitted: number;
  approved: number;
  rejected: number;
  revisions: number;
  pending: number;
  approvalRate: number; // 0-100, of reviewed only
}

/**
 * DesignerConceptMatrix
 * -------------------------------------------------------------------------
 * Per-designer concept-decision breakdown with its own time-range filter
 * (Week / Month / Quarter / Year). For each designer, shows:
 *   • Total submitted in the period
 *   • Stacked bar split by approved / revision / rejected / pending
 *   • Count chips for each status
 *   • Approval rate (of reviewed concepts)
 *
 * Sortable, with a team-totals strip at the top and a champion call-out.
 */
export function DesignerConceptMatrix() {
  const { profile: viewer } = useAuth();
  const canOpenScorecard = isAdminOrCoordinator(viewer?.role);
  const [scorecardDesignerId, setScorecardDesignerId] = useState<string | null>(null);
  const [period, setPeriod] = useState<LocalPeriod>("month");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "submitted",
    dir: "desc",
  });

  const { concepts, isLoading } = useConcepts();
  const { profiles } = useProfiles({ roles: ["designer"] });
  const { codesByProfile } = useDesignerCodes();

  const { start, end, label } = useMemo(() => getPeriodRange(period), [period]);

  const designers: DesignerRow[] = useMemo(() => {
    const rows = profiles.map<DesignerRow>((p) => {
      const mine = concepts.filter(
        (c) =>
          c.submitted_by === p.id && inRange(c.created_at, start, end)
      );
      const approved = mine.filter((c) => c.md_status === "approved").length;
      const rejected = mine.filter((c) => c.md_status === "rejected").length;
      const revisions = mine.filter(
        (c) => c.md_status === "revision_requested"
      ).length;
      const pending = mine.filter((c) => c.md_status === "pending").length;
      const reviewed = approved + rejected + revisions;
      const approvalRate =
        reviewed > 0 ? Math.round((approved / reviewed) * 100) : 0;

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
        pending,
        approvalRate,
      };
    });

    return rows.sort((a, b) => {
      const m = sort.dir === "asc" ? 1 : -1;
      const av =
        sort.key === "rate" ? a.approvalRate : (a[sort.key as keyof DesignerRow] as number);
      const bv =
        sort.key === "rate" ? b.approvalRate : (b[sort.key as keyof DesignerRow] as number);
      return m * (av - bv);
    });
  }, [profiles, concepts, codesByProfile, start, end, sort]);

  // ── Team totals ──
  const totals = useMemo(() => {
    const t = designers.reduce(
      (acc, d) => {
        acc.submitted += d.submitted;
        acc.approved += d.approved;
        acc.rejected += d.rejected;
        acc.revisions += d.revisions;
        acc.pending += d.pending;
        return acc;
      },
      { submitted: 0, approved: 0, rejected: 0, revisions: 0, pending: 0 }
    );
    const reviewed = t.approved + t.rejected + t.revisions;
    const approvalRate =
      reviewed > 0 ? Math.round((t.approved / reviewed) * 100) : 0;
    return { ...t, approvalRate };
  }, [designers]);

  const activeDesigners = designers.filter((d) => d.submitted > 0).length;
  const champion = [...designers].sort((a, b) => {
    if (b.approved !== a.approved) return b.approved - a.approved;
    return b.approvalRate - a.approvalRate;
  })[0];

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="py-4">
        {/* ── Header ── */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Designer Concept Performance
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {label} · {activeDesigners}/{designers.length} designer{designers.length !== 1 ? "s" : ""} active
            </p>
          </div>

          {/* Period filter — own scope, independent of dashboard top filter */}
          <div className="inline-flex shrink-0 rounded-lg bg-secondary p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
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

        {/* ── Team totals strip ── */}
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl border border-border bg-secondary/30 p-2 sm:grid-cols-4">
          <TotalStat
            label="Submitted"
            value={totals.submitted}
            icon={<Users className="h-3 w-3" />}
            tone="primary"
          />
          <TotalStat
            label="Approved"
            value={totals.approved}
            sub={totals.submitted > 0 ? `${Math.round((totals.approved / totals.submitted) * 100)}% overall` : undefined}
            icon={<CheckCircle2 className="h-3 w-3" />}
            tone="success"
          />
          <TotalStat
            label="Approval Rate"
            value={`${totals.approvalRate}%`}
            sub="of reviewed"
            icon={<TrendingUp className="h-3 w-3" />}
            tone={
              totals.approvalRate >= 70
                ? "success"
                : totals.approvalRate >= 50
                ? "warning"
                : totals.submitted > 0
                ? "destructive"
                : "muted"
            }
          />
          <TotalStat
            label="Pending"
            value={totals.pending}
            icon={<Clock className="h-3 w-3" />}
            tone={totals.pending > 0 ? "warning" : "muted"}
          />
        </div>

        {/* ── Champion call-out ── */}
        {champion && champion.approved > 0 && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-warning/25 bg-warning/[0.06] px-2.5 py-1.5">
            <Trophy className="h-3.5 w-3.5 shrink-0 text-warning" />
            <p className="text-[11px] text-foreground">
              Top performer{" "}
              <b>{champion.full_name}</b> — {champion.approved} approved,{" "}
              {champion.approvalRate}% rate
            </p>
          </div>
        )}

        {/* ── Mobile sort selector — replaces the desktop column strip. ── */}
        <div className="mb-2 flex items-center justify-between gap-2 sm:hidden">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Sort by
          </span>
          <select
            value={`${sort.key}:${sort.dir}`}
            onChange={(e) => {
              const [k, d] = e.target.value.split(":") as [SortKey, "asc" | "desc"];
              setSort({ key: k, dir: d });
            }}
            className="h-7 rounded-md border border-border bg-card px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="submitted:desc">Submitted ↓</option>
            <option value="submitted:asc">Submitted ↑</option>
            <option value="approved:desc">Approved ↓</option>
            <option value="approved:asc">Approved ↑</option>
            <option value="rejected:desc">Rejected ↓</option>
            <option value="rejected:asc">Rejected ↑</option>
            <option value="rate:desc">Approval rate ↓</option>
            <option value="rate:asc">Approval rate ↑</option>
          </select>
        </div>

        {/* ── Sort header — desktop only. On mobile, rows are card-style and
            don't need a column header strip. ── */}
        <div className="mb-2 hidden items-center gap-2 border-b border-border pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:flex">
          <span className="flex-1">Designer</span>
          <SortBtn
            label="Subm."
            col="submitted"
            sort={sort}
            onSort={toggleSort}
            className="w-12 text-right"
          />
          <SortBtn
            label="Apprv"
            col="approved"
            sort={sort}
            onSort={toggleSort}
            className="w-12 text-right"
          />
          <SortBtn
            label="Rej."
            col="rejected"
            sort={sort}
            onSort={toggleSort}
            className="w-12 text-right"
          />
          <SortBtn
            label="Rate"
            col="rate"
            sort={sort}
            onSort={toggleSort}
            className="w-12 text-right"
          />
        </div>

        {/* ── Designer rows ── */}
        {isLoading ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
        ) : activeDesigners === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="No submissions"
            description={`No concepts submitted ${label.toLowerCase()}.`}
          />
        ) : (
          <ul className="space-y-1.5">
            {designers.map((d) => (
              <DesignerRow
                key={d.id}
                d={d}
                maxSubmitted={Math.max(1, totals.submitted, ...designers.map((x) => x.submitted))}
                onClickName={canOpenScorecard ? () => setScorecardDesignerId(d.id) : undefined}
              />
            ))}
          </ul>
        )}

        {/* Legend removed — bar segments are explained by the right-hand
            count columns (Apprv / Rej. / Rate) and per-segment tooltips. */}
      </CardContent>

      <DesignerScorecardDrawer
        designerId={scorecardDesignerId}
        onClose={() => setScorecardDesignerId(null)}
      />
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function DesignerRow({
  d,
  maxSubmitted,
  onClickName,
}: {
  d: DesignerRow;
  maxSubmitted: number;
  onClickName?: () => void;
}) {
  const hasData = d.submitted > 0;
  const widthPct = (d.submitted / maxSubmitted) * 100;
  const seg = (n: number) =>
    d.submitted > 0 ? (n / d.submitted) * 100 : 0;

  return (
    <li
      className={cn(
        "group overflow-hidden rounded-lg border border-border bg-card px-3 py-2 transition-all hover:border-primary/30 hover:shadow-sm sm:px-2.5 sm:py-1.5",
        !hasData && "opacity-60"
      )}
    >
      {/* Mobile layout — stacked: name row, bar row, counts row.
          Desktop layout (sm+) — single flex row, same as before. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5">
        {/* Name row — avatar + first name + designer code chip.
            On mobile we also show the approval rate inline-right so it's
            paired with the name; on desktop the rate lives in its own column
            at the far right. */}
        <button
          type="button"
          onClick={onClickName}
          disabled={!onClickName}
          className={cn(
            "flex w-full items-center gap-2 rounded-md text-left sm:w-[130px] sm:shrink-0",
            onClickName && "cursor-pointer hover:opacity-80"
          )}
          title={onClickName ? "View scorecard" : undefined}
        >
          <Avatar className="h-6 w-6 shrink-0">
            {d.avatar_url ? <AvatarImage src={d.avatar_url} /> : null}
            <AvatarFallback className="bg-primary/10 text-primary text-[9px]">
              {getInitials(d.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <p
              className={cn(
                "truncate text-xs font-medium leading-tight text-foreground",
                onClickName && "group-hover:text-primary group-hover:underline"
              )}
            >
              {d.full_name.split(" ")[0]}
            </p>
            <span className="shrink-0 rounded border border-border bg-secondary/40 px-1 text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">
              {d.designerCode}
            </span>
          </div>
          {/* Mobile-only inline rate so the name row has both identity + score */}
          <span
            className={cn(
              "shrink-0 text-xs font-bold tabular-nums sm:hidden",
              !hasData
                ? "text-muted-foreground/50"
                : d.approvalRate >= 75
                ? "text-success"
                : d.approvalRate >= 50
                ? "text-warning"
                : "text-destructive"
            )}
          >
            {hasData && d.approved + d.rejected + d.revisions > 0
              ? `${d.approvalRate}%`
              : "—"}
          </span>
        </button>

        {/* Stacked bar — full-width on mobile, flex-1 on desktop.
            "No submissions" placeholder uses leading-tight + single line so
            it occupies the same vertical room as the bar (no row reflow). */}
        <div className="w-full min-w-0 sm:flex-1">
          {hasData ? (
            <div
              className="flex h-4 max-w-full overflow-hidden rounded-md border border-border/50 bg-secondary/30 transition-[width] duration-[600ms] ease-out"
              style={{ width: `${Math.max(20, widthPct)}%` }}
            >
              <div
                className="h-full bg-success"
                style={{ width: `${seg(d.approved)}%` }}
                title={`${d.approved} approved`}
              />
              <div
                className="h-full bg-warning"
                style={{ width: `${seg(d.revisions)}%` }}
                title={`${d.revisions} revision`}
              />
              <div
                className="h-full bg-destructive"
                style={{ width: `${seg(d.rejected)}%` }}
                title={`${d.rejected} rejected`}
              />
              <div
                className="h-full bg-muted/60"
                style={{ width: `${seg(d.pending)}%` }}
                title={`${d.pending} pending`}
              />
            </div>
          ) : (
            <p className="truncate text-[10px] italic leading-tight text-muted-foreground">
              No submissions in this period
            </p>
          )}
        </div>

        {/* Counts — on mobile rendered as a 3-equal-column strip below the bar;
            on desktop reverts to inline w-12 right-aligned cells matching the
            sort header. */}
        <div className="grid w-full grid-cols-3 gap-2 sm:contents">
          <span className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground sm:hidden">
            <span>Sub</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {d.submitted || <span className="text-muted-foreground/50">0</span>}
            </span>
          </span>
          <span className="hidden w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground sm:inline">
            {d.submitted || <span className="text-muted-foreground/50">0</span>}
          </span>

          <span className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground sm:hidden">
            <span>Apv</span>
            <span className="text-sm font-semibold tabular-nums text-success">
              {d.approved || <span className="text-muted-foreground/50">0</span>}
            </span>
          </span>
          <span className="hidden w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-success sm:inline">
            {d.approved || <span className="text-muted-foreground/50">0</span>}
          </span>

          <span className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground sm:hidden">
            <span>Rej</span>
            <span className="text-sm font-semibold tabular-nums text-destructive">
              {d.rejected || <span className="text-muted-foreground/50">0</span>}
            </span>
          </span>
          <span className="hidden w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-destructive sm:inline">
            {d.rejected || <span className="text-muted-foreground/50">0</span>}
          </span>
        </div>

        {/* Approval rate — desktop-only column at the far right.
            On mobile this is already shown inline next to the name. */}
        <div className="hidden w-12 shrink-0 text-right sm:block">
          <span
            className={cn(
              "text-sm font-bold tabular-nums",
              !hasData
                ? "text-muted-foreground/50"
                : d.approvalRate >= 75
                ? "text-success"
                : d.approvalRate >= 50
                ? "text-warning"
                : "text-destructive"
            )}
          >
            {hasData && d.approved + d.rejected + d.revisions > 0
              ? `${d.approvalRate}%`
              : "—"}
          </span>
        </div>
      </div>
    </li>
  );
}

function TotalStat({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
  tone: "primary" | "success" | "warning" | "destructive" | "muted";
}) {
  const toneClass: Record<typeof tone, string> = {
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    muted: "text-muted-foreground",
  };
  return (
    <div>
      <div className={cn("flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider", toneClass[tone])}>
        {icon}
        {label}
      </div>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">
        {value}
      </p>
      {sub && <p className="text-[9px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function SortBtn({
  label,
  col,
  sort,
  onSort,
  className,
}: {
  label: string;
  col: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === col;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={cn(
        "inline-flex items-center justify-end gap-0.5 transition-colors",
        active ? "text-foreground" : "hover:text-foreground",
        className
      )}
    >
      {label}
      {active ? (
        sort.dir === "asc" ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )
      ) : (
        <ChevronUp className="h-3 w-3 opacity-30" />
      )}
    </button>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("h-2 w-2 rounded-sm", color)} />
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */

function getPeriodRange(period: LocalPeriod) {
  const now = new Date();
  switch (period) {
    case "week":
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
        label: `Week of ${format(startOfWeek(now, { weekStartsOn: 1 }), "MMM d")}`,
      };
    case "quarter":
      return {
        start: startOfQuarter(now),
        end: endOfQuarter(now),
        label: `Q${Math.floor(now.getMonth() / 3) + 1} ${format(now, "yyyy")}`,
      };
    case "year":
      return {
        start: startOfYear(now),
        end: endOfYear(now),
        label: format(now, "yyyy"),
      };
    default:
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
        label: format(now, "MMMM yyyy"),
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
