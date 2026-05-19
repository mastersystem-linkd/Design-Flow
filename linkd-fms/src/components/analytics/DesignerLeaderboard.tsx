import { useState } from "react";
import { Trophy, ChevronUp, ChevronDown, CheckCircle2, XCircle, RotateCcw, FileText } from "lucide-react";
import {
  Card,
  CardContent,
  Badge,
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import type { DesignerConceptStat } from "@/hooks/useAnalytics";
import type { ConceptWithRelations } from "@/types/database";

type SortKey = "score" | "submitted" | "approved" | "rejected" | "revisions";

const RANK_EMOJI: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

// ============================================================================
// Main component
// ============================================================================

export function DesignerLeaderboard({
  data,
  concepts,
}: {
  data: DesignerConceptStat[];
  concepts?: ConceptWithRelations[];
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "score",
    dir: "desc",
  });
  const [selectedDesigner, setSelectedDesigner] = useState<DesignerConceptStat | null>(null);

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
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-warning" />
              <h3 className="text-lg font-semibold text-foreground">
                Designer Concept Performance
              </h3>
            </div>
            <span className="text-xs text-muted-foreground">Monthly target: 3</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-sm">
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
                  const emoji = RANK_EMOJI[rank];
                  const progressPct = Math.min(100, (d.approved / d.target) * 100);
                  const progressColor =
                    d.approved >= 3 ? "bg-success" : d.approved >= 1 ? "bg-warning" : "bg-destructive";
                  const scoreColor =
                    d.score >= 90 ? "bg-success" : d.score >= 75 ? "bg-warning" : "bg-destructive";

                  return (
                    <tr
                      key={d.id}
                      onClick={() => setSelectedDesigner(d)}
                      className={cn(
                        "border-b border-border transition-colors hover:bg-primary/[0.03] cursor-pointer",
                        rank === 1 && "bg-warning/[0.04]",
                        rank === 2 && "bg-muted/[0.06]",
                        rank === 3 && "bg-warning/[0.02]"
                      )}
                    >
                      <td className="px-4 py-3 text-center">
                        {emoji ?? <span className="text-muted-foreground">{rank}</span>}
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

                      <td className="px-4 py-3">
                        <div className="relative h-6 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className={cn(
                              "h-full rounded-full transition-[width] duration-[800ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
                              scoreColor
                            )}
                            style={{ width: `${d.score}%`, transitionDelay: `${i * 80}ms` }}
                          />
                          <span className={cn(
                            "absolute top-1/2 -translate-y-1/2 text-xs font-bold tabular-nums",
                            d.score >= 20 ? "left-2 text-white" : "right-2 text-foreground"
                          )}>
                            {d.score}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Designer Detail Sheet ── */}
      <DesignerDetailSheet
        designer={selectedDesigner}
        open={!!selectedDesigner}
        onOpenChange={(o) => !o && setSelectedDesigner(null)}
        concepts={concepts}
      />
    </>
  );
}

// ============================================================================
// Designer Detail Sheet
// ============================================================================

function DesignerDetailSheet({
  designer,
  open,
  onOpenChange,
  concepts,
}: {
  designer: DesignerConceptStat | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  concepts?: ConceptWithRelations[];
}) {
  if (!designer) return null;

  const designerConcepts = (concepts ?? []).filter(
    (c) => c.submitted_by === designer.id || c.designer_id === designer.id
  );

  // Score breakdown (matching useAnalytics scoring)
  const maxSubmitted = Math.max(designer.submitted, 1);
  const volumePts = Math.round((designer.submitted / Math.max(maxSubmitted, 3)) * 30);
  const approvalPts = designer.submitted > 0
    ? Math.round((designer.approved / designer.submitted) * 35)
    : 0;
  const speedPts = designer.avgApprovalHours > 0
    ? Math.round(Math.max(0, 1 - designer.avgApprovalHours / 48) * 20)
    : 0;
  const revisionPts = designer.submitted > 0
    ? Math.round(Math.max(0, 1 - designer.revisions / designer.submitted) * 15)
    : 15;

  const scoreColor = designer.score >= 90 ? "text-success" : designer.score >= 75 ? "text-warning" : "text-destructive";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] overflow-y-auto sm:w-[440px]">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              {designer.avatar_url ? <AvatarImage src={designer.avatar_url} /> : null}
              <AvatarFallback className="bg-primary/10 text-primary">
                {getInitials(designer.full_name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <SheetTitle>{designer.full_name}</SheetTitle>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-[10px]">{designer.designerCode}</Badge>
                <Badge className={cn("text-[10px]", scoreColor, "bg-secondary border border-border")}>
                  Score: {designer.score}
                </Badge>
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Section 1: Concepts this period */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">
              Concepts This Period
            </h4>
            {designerConcepts.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-lg bg-secondary/50 p-4 text-center">
                No concepts submitted
              </p>
            ) : (
              <div className="space-y-2">
                {designerConcepts.slice(0, 10).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card p-3"
                  >
                    <StatusIcon status={c.md_status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {c.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {c.concept_code}
                      </p>
                    </div>
                    <Badge className={cn("text-[9px] shrink-0", statusBadgeClass(c.md_status))}>
                      {c.md_status === "revision_requested" ? "Revision" : c.md_status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Monthly Target */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">
              Monthly Target
            </h4>
            <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
              <div className="text-center">
                <p className={cn("text-3xl font-bold tabular-nums", designer.approved >= 3 ? "text-success" : designer.approved >= 1 ? "text-warning" : "text-destructive")}>
                  {designer.approved}
                </p>
                <p className="text-xs text-muted-foreground">of {designer.target}</p>
              </div>
              <div className="flex-1">
                <div className="h-3 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn("h-full rounded-full", designer.approved >= 3 ? "bg-success" : designer.approved >= 1 ? "bg-warning" : "bg-destructive")}
                    style={{ width: `${Math.min(100, (designer.approved / designer.target) * 100)}%` }}
                  />
                </div>
                <p className={cn("mt-1 text-xs font-medium", designer.approved >= 3 ? "text-success" : designer.approved >= 1 ? "text-warning" : "text-muted-foreground")}>
                  {designer.approved >= 3 ? "Target met!" : designer.approved >= 1 ? "In progress" : "Not started"}
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Score Breakdown */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">
              Score Breakdown
            </h4>
            <div className="space-y-2">
              <ScoreRow label="Volume" points={volumePts} max={30} />
              <ScoreRow label="Approval Rate" points={approvalPts} max={35} />
              <ScoreRow label="Speed" points={speedPts} max={20} />
              <ScoreRow label="Low Revisions" points={revisionPts} max={15} />
              <div className="border-t border-border pt-2 mt-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Total</span>
                <span className={cn("text-lg font-bold tabular-nums", scoreColor)}>
                  {designer.score}/100
                </span>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function StatusIcon({ status }: { status: string }) {
  if (status === "approved") return <CheckCircle2 className="h-4 w-4 text-success shrink-0" />;
  if (status === "rejected") return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
  if (status === "revision_requested") return <RotateCcw className="h-4 w-4 text-warning shrink-0" />;
  return <FileText className="h-4 w-4 text-primary shrink-0" />;
}

function statusBadgeClass(status: string): string {
  if (status === "approved") return "bg-success/10 text-success border border-success/30";
  if (status === "rejected") return "bg-destructive/10 text-destructive border border-destructive/30";
  if (status === "revision_requested") return "bg-warning/10 text-warning border border-warning/30";
  return "bg-primary/10 text-primary border border-primary/30";
}

function ScoreRow({ label, points, max }: { label: string; points: number; max: number }) {
  const pct = max > 0 ? (points / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
        <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right text-xs font-semibold tabular-nums text-foreground">
        {points}/{max}
      </span>
    </div>
  );
}

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
