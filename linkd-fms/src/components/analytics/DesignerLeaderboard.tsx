import { useState } from "react";
import { ChevronUp, ChevronDown, ChevronRight } from "lucide-react";
import { Trophy3D } from "@/components/analytics/Trophy3D";
import { TrophySpin } from "@/components/analytics/TrophySpin";
import {
  Card,
  CardContent,
  Badge,
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { DesignerScorecardDrawer } from "@/components/analytics/DesignerScorecardDrawer";
import type { DesignerConceptStat } from "@/hooks/useAnalytics";
import type { ConceptWithRelations } from "@/types/database";

type SortKey = "score" | "submitted" | "approved" | "rejected" | "revisions";

const TOP_3 = new Set([1, 2, 3]);

// ============================================================================
// Main component
// ============================================================================

export function DesignerLeaderboard({
  data,
}: {
  data: DesignerConceptStat[];
  // Kept for backwards-compat with callers; the scorecard drawer pulls its
  // own data so we no longer thread concepts through here.
  concepts?: ConceptWithRelations[];
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "score",
    dir: "desc",
  });
  const [scorecardDesignerId, setScorecardDesignerId] = useState<string | null>(null);

  const sorted = [...data].sort((a, b) => {
    const m = sort.dir === "asc" ? 1 : -1;
    return m * ((a[sort.key] ?? 0) - (b[sort.key] ?? 0));
  });

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sort.key !== col) return <ChevronUp className="h-3 w-3 opacity-30" />;
    return sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  }

  return (
    <>
      <Card>
        <CardContent className="py-4">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 via-primary/10 to-transparent ring-1 ring-inset ring-primary/25 sm:h-12 sm:w-12">
                <TrophySpin size={36} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground sm:text-lg">
                  Designer Concept Performance
                </h3>
                <p className="text-[10px] text-muted-foreground sm:text-[11px]">
                  Tap any row to open the designer's full scorecard.
                </p>
              </div>
            </div>
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">Monthly target: 2</span>
          </div>

          {/* Mobile card view */}
          <div className="space-y-2 sm:hidden">
            {sorted.map((d, i) => {
              const rank = i + 1;
              const scoreColor =
                d.score >= 90 ? "bg-success" : d.score >= 75 ? "bg-warning" : "bg-destructive";
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setScorecardDesignerId(d.id)}
                  title="View scorecard"
                  className="group flex w-full items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors active:scale-[0.99] hover:bg-secondary/50"
                >
                  <div className="flex flex-col items-center gap-1">
                    {TOP_3.has(rank) ? <Trophy3D rank={rank as 1|2|3} size={28} /> : <span className="text-sm text-muted-foreground">#{rank}</span>}
                    <Avatar className="h-8 w-8">
                      {d.avatar_url ? <AvatarImage src={d.avatar_url} /> : null}
                      <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                        {getInitials(d.full_name)}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{d.full_name}</p>
                    <div className="mt-1.5 grid grid-cols-4 gap-x-2 text-[11px]">
                      <div><span className="text-muted-foreground">Sub </span><span className="font-semibold">{d.submitted}</span></div>
                      <div><span className="text-muted-foreground">Apv </span><span className="font-semibold text-success">{d.approved}</span></div>
                      <div><span className="text-muted-foreground">Rej </span><span className="font-semibold text-destructive">{d.rejected}</span></div>
                      <div><span className="text-muted-foreground">Rev </span><span className="font-semibold text-warning">{d.revisions}</span></div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        Approved {d.approved}/{d.target}
                      </span>
                    </div>
                  </div>
                  {/* Score pill — same primary-tinted look as Task Dashboard. */}
                  <span className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2 py-1 text-[11px] font-semibold tabular-nums text-primary group-active:bg-primary/15">
                    {d.score}/100
                    <ChevronRight className="h-3 w-3" aria-hidden />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Desktop table view */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[650px] text-sm">
              <caption className="sr-only">Designer performance rankings</caption>
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="w-12 px-4 py-3 text-center font-medium">#</th>
                  <th className="px-4 py-3 text-left font-medium">Designer</th>
                  <Th label="Submitted" col="submitted" sort={sort} onSort={toggleSort} SortIcon={SortIcon} />
                  <Th label="Approved" col="approved" sort={sort} onSort={toggleSort} SortIcon={SortIcon} />
                  <Th label="Rejected" col="rejected" sort={sort} onSort={toggleSort} SortIcon={SortIcon} />
                  <Th label="Revisions" col="revisions" sort={sort} onSort={toggleSort} SortIcon={SortIcon} />
                  <th className="px-4 py-3 text-center font-medium">Progress</th>
                  <Th label="Score" col="score" sort={sort} onSort={toggleSort} SortIcon={SortIcon} className="w-[140px]" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((d, i) => {
                  const rank = i + 1;
                  const progressPct = Math.min(100, (d.approved / d.target) * 100);
                  const progressColor =
                    d.approved >= 3 ? "bg-success" : d.approved >= 1 ? "bg-warning" : "bg-destructive";
                  const scoreColor =
                    d.score >= 90 ? "bg-success" : d.score >= 75 ? "bg-warning" : "bg-destructive";

                  return (
                    <tr
                      key={d.id}
                      onClick={() => setScorecardDesignerId(d.id)}
                      title="View scorecard"
                      className={cn(
                        "group border-b border-border transition-colors hover:bg-primary/[0.03] cursor-pointer",
                        rank === 1 && "bg-warning/[0.04]",
                        rank === 2 && "bg-muted/[0.06]",
                        rank === 3 && "bg-warning/[0.02]"
                      )}
                    >
                      <td className="px-4 py-3 text-center">
                        {TOP_3.has(rank) ? <div className="inline-flex justify-center"><Trophy3D rank={rank as 1|2|3} size={32} /></div> : <span className="text-muted-foreground">{rank}</span>}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8">
                            {d.avatar_url ? <AvatarImage src={d.avatar_url} /> : null}
                            <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                              {getInitials(d.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-primary leading-tight hover:underline">{d.full_name}</p>
                            <Badge variant="outline" className="mt-0.5 text-[9px] px-1">{d.designerCode}</Badge>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-center font-semibold tabular-nums">
                        {d.submitted || <span className="text-muted-foreground/50">0</span>}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-success">
                        {d.approved || <span className="text-muted-foreground/50">0</span>}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-destructive">
                        {d.rejected || <span className="text-muted-foreground/50">0</span>}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-warning">
                        {d.revisions || <span className="text-muted-foreground/50">0</span>}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                            <div
                              className={cn("h-full rounded-full", progressColor)}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            {d.approved}/{d.target}
                          </span>
                        </div>
                      </td>

                      {/* Score — pill style matches the Task Dashboard score
                          column: primary-tinted, with `{score}/100` and an
                          inline chevron. The pill is the click target *and*
                          the affordance; the whole row stays clickable too
                          so users can tap anywhere. `stopPropagation` here
                          prevents a double-fire. */}
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setScorecardDesignerId(d.id); }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold tabular-nums text-primary transition-all hover:border-primary hover:bg-primary/15 hover:shadow"
                        >
                          {d.score}/100
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <DesignerScorecardDrawer
        designerId={scorecardDesignerId}
        onClose={() => setScorecardDesignerId(null)}
      />
    </>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function Th({
  label, col, sort, onSort, SortIcon, className,
}: {
  label: string;
  col: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (k: SortKey) => void;
  SortIcon: React.ComponentType<{ col: SortKey }>;
  className?: string;
}) {
  return (
    <th className={cn("px-4 py-3 text-center font-medium", className)}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          "inline-flex items-center gap-1",
          sort.key === col ? "text-foreground" : "hover:text-foreground"
        )}
      >
        {label}
        <SortIcon col={col} />
      </button>
    </th>
  );
}
