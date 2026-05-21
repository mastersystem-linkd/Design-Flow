import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  RefreshCw,
  Lightbulb,
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  Download,
  Check,
} from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";
import { useConcepts } from "@/hooks/useConcepts";
import { useAuth } from "@/hooks/useAuth";
import { useProfiles } from "@/hooks/useProfiles";
import {
  DesignerConceptDashboard,
  CoordinatorConceptDashboard,
  AdminConceptDashboard,
} from "@/components/concepts/ConceptDashboard";
import { Button } from "@/components/ui/button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  getInitials,
  EmptyState,
  ExportDialog,
  Pagination,
  toast,
} from "@/components/ui";
import { type CsvColumn } from "@/lib/exportCSV";
import { isAdminOrCoordinator } from "@/lib/permissions";
import { usePagination } from "@/hooks/usePagination";
import { SubmitConceptDialog } from "@/components/concepts/SubmitConceptDialog";
import { ConceptDetailDrawer } from "@/components/concepts/ConceptDetailDrawer";
import {
  CONCEPT_STATUS_LABELS,
  CONCEPT_STATUS_COLORS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { CONCEPT_STATUSES } from "@/types/database";
import type {
  ConceptStatus,
  ConceptWithRelations,
} from "@/types/database";

/**
 * Status filter tabs:
 *  - "all"            — everything
 *  - ConceptStatus    — pending / approved / rejected / revision_requested
 *  - "completed"      — virtual tab: md_status='approved' AND finalized
 *                      (final approval granted AND designer marked done).
 *                      These rows are HIDDEN from the "approved" tab so
 *                      "approved" only shows live work-in-progress.
 */
type Tab = "all" | ConceptStatus | "completed";

/**
 * A concept is "completed" once both sides of the workflow have signed off:
 *   1. `md_status === 'approved'`         — initial MD approval landed
 *   2. `final_approved_at` is set         — MD granted final approval
 *   3. `designer_actual_date` is set      — designer marked the work done
 *
 * Rejected and pending-revision concepts never count as completed.
 *
 * Revision loop is supported by design: when MD requests revision on an
 * already-approved concept and the designer hits "Re-submit",
 * `resubmitConcept` only clears `final_approval_notes` + bumps
 * `final_approval_planned_date`. It deliberately leaves `designer_actual_date`
 * intact (set by the original `finalizeConcept` call), and once MD eventually
 * grants the post-revision final approval, `final_approved_at` is stamped.
 * Both conditions (2) and (3) end up true through the same predicate — no
 * special-case branch needed.
 */
function isCompleted(c: ConceptWithRelations): boolean {
  return (
    c.md_status === "approved" &&
    !!c.final_approved_at &&
    !!c.designer_actual_date
  );
}

// ============================================================================
// Category accent colors — only used on the thin top-bar of merged headers
// ============================================================================

const CAT_ACCENT = {
  creation: "bg-primary",
  approval: "bg-[#7C5CFC]",
  completion: "bg-success",
  final: "bg-warning",
} as const;

// ============================================================================
// Helpers
// ============================================================================

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return format(parseISO(d), "dd MMM yy");
  } catch {
    return "—";
  }
}

function computeDelay(
  planned: string | null,
  actual: string | null
): number | null {
  if (!planned || !actual) return null;
  try {
    return differenceInDays(parseISO(actual), parseISO(planned));
  } catch {
    return null;
  }
}

function deriveCompletionStatus(
  c: ConceptWithRelations
): { label: string; cls: string } {
  if (c.designer_actual_date) return { label: "Done", cls: "text-success" };
  if (c.md_status === "approved" && c.designer_planned_date) {
    const planned = parseISO(c.designer_planned_date);
    if (new Date() > planned) return { label: "Late", cls: "text-destructive" };
    return { label: "In Progress", cls: "text-primary" };
  }
  if (c.md_status === "approved")
    return { label: "Waiting", cls: "text-muted-foreground" };
  return { label: "—", cls: "text-muted-foreground" };
}

function deriveFinalStatus(
  c: ConceptWithRelations
): { label: string; cls: string } {
  if (c.final_approved_at) return { label: "Approved", cls: "text-success" };
  if (c.final_approval_actual_date)
    return { label: "Reviewed", cls: "text-primary" };
  if (c.designer_actual_date && !c.final_approved_at) {
    if (c.final_approval_planned_date) {
      if (new Date() > parseISO(c.final_approval_planned_date))
        return { label: "Late", cls: "text-destructive" };
      return { label: "Pending", cls: "text-warning" };
    }
    return { label: "Pending", cls: "text-warning" };
  }
  return { label: "—", cls: "text-muted-foreground" };
}

// ============================================================================
// Main view
// ============================================================================

export function ConceptsView() {
  const { profile } = useAuth();
  const {
    concepts,
    isLoading,
    error,
    refetch,
    submitConcept,
    reviewConcept,
    finalizeConcept,
    finalApproveConcept,
    finalReviseConcept,
    resubmitConcept,
  } = useConcepts();
  const { profiles: designers } = useProfiles({ roles: ["designer"] });

  const role = profile?.role ?? "designer";
  const isAdmin = role === "admin" || role === "design_coordinator";
  const isCoordinator = role === "design_coordinator";
  const isDesigner = role === "designer";
  const userId = profile?.id;

  // URL deep-linking: dashboard KPI cards link to `/concepts?tab=approved` etc.
  // Read once for the initial state, then re-sync on URL change so card clicks
  // re-target the same view without remount.
  const [urlParams] = useSearchParams();
  const urlTab = urlParams.get("tab") as Tab | null;
  const validTabs: Tab[] = ["all", "pending", "approved", "rejected", "revision_requested", "completed"];
  const initialTab: Tab = urlTab && validTabs.includes(urlTab) ? urlTab : "all";

  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => {
    if (urlTab && validTabs.includes(urlTab)) setTab(urlTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab]);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [selected, setSelected] = useState<ConceptWithRelations | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [resubmittingId, setResubmittingId] = useState<string | null>(null);

  const canExport = isAdminOrCoordinator(role);

  const conceptExportColumns: CsvColumn<ConceptWithRelations>[] = [
    {
      key: "designer",
      label: "Designer",
      transform: (v) => (v as any)?.full_name ?? "",
    },
    { key: "title", label: "Title" },
    { key: "concept_code", label: "Code" },
    {
      key: "client",
      label: "Client",
      transform: (v) => (v as any)?.party_name ?? "",
    },
    { key: "md_status", label: "Status" },
    { key: "priority", label: "Priority" },
    { key: "created_at", label: "Submitted Date" },
    { key: "md_reviewed_at", label: "Reviewed Date" },
    { key: "assigned_by", label: "Assigned By" },
    { key: "md_notes", label: "Feedback" },
    { key: "remarks", label: "Remarks" },
    {
      key: "approved_designs_count",
      label: "Approved #",
      transform: (v) => (v != null ? String(v) : ""),
    },
  ];

  // ── Counts ──
  // `approved` here is "approved but NOT yet completed". Fully completed
  // concepts get their own bucket so the two tabs never double-count.
  const counts = useMemo(() => {
    const map: Record<ConceptStatus, number> & { completed: number } = {
      pending: 0,
      approved: 0,
      rejected: 0,
      revision_requested: 0,
      completed: 0,
    };
    for (const c of concepts) {
      if (isCompleted(c)) {
        map.completed++;
      } else {
        map[c.md_status]++;
      }
    }
    return map;
  }, [concepts]);

  const allVisible = useMemo(() => {
    if (tab === "all") return concepts;
    if (tab === "completed") return concepts.filter(isCompleted);
    // For status tabs: rows that match the status AND aren't yet completed.
    // (Completed rows live in their own tab so they don't muddy the
    // "Approved" view, which should be live work in progress.)
    return concepts.filter(
      (c) => c.md_status === tab && !isCompleted(c)
    );
  }, [concepts, tab]);

  const conceptPg = usePagination(allVisible.length, 25);

  const visible = useMemo(
    () => allVisible.slice(conceptPg.from, conceptPg.to + 1),
    [allVisible, conceptPg.from, conceptPg.to]
  );

  const pendingCount = counts.pending;

  // ── Done handler ──
  const handleMarkDone = useCallback(
    async (conceptId: string) => {
      setCompletingId(conceptId);
      const { error: err } = await finalizeConcept(conceptId);
      setCompletingId(null);
      if (err) toast.error(err);
      else toast.success("Concept marked as completed");
    },
    [finalizeConcept]
  );

  // ── Re-submit handler (designer addresses revision) ──
  const handleResubmit = useCallback(
    async (conceptId: string) => {
      setResubmittingId(conceptId);
      const { error: err } = await resubmitConcept(conceptId);
      setResubmittingId(null);
      if (err) toast.error(err);
      else toast.success("Re-submitted for final approval");
    },
    [resubmitConcept]
  );

  // ── Final Approve handler ──
  const handleFinalApprove = useCallback(
    async (conceptId: string) => {
      setApprovingId(conceptId);
      const { error: err } = await finalApproveConcept(conceptId);
      setApprovingId(null);
      if (err) toast.error(err);
      else toast.success("Final approval granted");
    },
    [finalApproveConcept]
  );


  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Lightbulb className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Concepts</h1>
            <p className="text-xs text-muted-foreground">
              {concepts.length} total · {pendingCount} awaiting review
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isLoading}
            className="gap-1.5"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
            />
            Refresh
          </Button>
          {canExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportOpen(true)}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          )}
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setSubmitOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Submit Concept
          </Button>
        </div>
      </div>

      {/* ── Role-specific dashboard ── */}
      {isDesigner && userId && (
        <DesignerConceptDashboard
          concepts={concepts}
          userId={userId}
          onSubmit={() => setSubmitOpen(true)}
          onConceptSelect={(c) => setSelected(c)}
        />
      )}
      {isCoordinator && (
        <CoordinatorConceptDashboard
          concepts={concepts}
          designers={designers}
          onDesignerFilter={() => {}}
        />
      )}
      {isAdmin && !isCoordinator && (
        <AdminConceptDashboard concepts={concepts} designers={designers} />
      )}

      {/* ── Status filter tabs ── */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip
          label="All"
          count={concepts.length}
          active={tab === "all"}
          onClick={() => setTab("all")}
        />
        {CONCEPT_STATUSES.map((s) => (
          <FilterChip
            key={s}
            label={CONCEPT_STATUS_LABELS[s]}
            count={counts[s]}
            active={tab === s}
            onClick={() => setTab(s)}
            dotColor={STATUS_DOT_COLOR[s]}
          />
        ))}
        <FilterChip
          label="Completed"
          count={counts.completed}
          active={tab === "completed"}
          onClick={() => setTab("completed")}
          dotColor="bg-success"
        />
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Pipeline Table ── */}
      {isLoading && concepts.length === 0 ? (
        <LoadingSkeleton />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Lightbulb className="h-10 w-10 text-primary/40" />}
          title={
            tab === "all"
              ? "No concepts yet"
              : tab === "completed"
              ? "No completed concepts yet"
              : `No ${CONCEPT_STATUS_LABELS[tab].toLowerCase()} concepts`
          }
          description={
            tab === "all"
              ? "Submit your first concept to get started."
              : tab === "completed"
              ? "Concepts land here once the designer is done and MD has granted final approval."
              : "Try switching to a different filter."
          }
          action={
            tab === "all"
              ? {
                  label: "Submit Concept",
                  onClick: () => setSubmitOpen(true),
                }
              : undefined
          }
        />
      ) : (
        <>
        <div className="hidden md:block overflow-x-auto rounded-xl border border-border shadow-sm">
          <table className="w-full min-w-[1800px] border-collapse text-[13px]">
            <caption className="sr-only">Design concepts with approval workflow</caption>
            <thead>
              {/* ── Row 1: Merged category headers ── */}
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-20 w-[42px] bg-card border-b border-border px-2 py-3 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  #
                </th>

                {/* Concept Creation — 6 cols */}
                <th colSpan={6} className="relative border-b border-border p-0">
                  <div className={cn("absolute inset-x-0 top-0 h-[3px]", CAT_ACCENT.creation)} />
                  <div className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-widest text-foreground">
                    Concept Creation
                  </div>
                </th>

                {/* Approval — 3 cols */}
                <th colSpan={3} className="relative border-b border-l border-border p-0">
                  <div className={cn("absolute inset-x-0 top-0 h-[3px]", CAT_ACCENT.approval)} />
                  <div className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-widest text-foreground">
                    Approval
                  </div>
                </th>

                {/* Concept Completion — 4 cols */}
                <th colSpan={4} className="relative border-b border-l border-border p-0">
                  <div className={cn("absolute inset-x-0 top-0 h-[3px]", CAT_ACCENT.completion)} />
                  <div className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-widest text-foreground">
                    Concept Completion
                  </div>
                </th>

                {/* Final Approval — 5 cols */}
                <th colSpan={5} className="relative border-b border-l border-border p-0">
                  <div className={cn("absolute inset-x-0 top-0 h-[3px]", CAT_ACCENT.final)} />
                  <div className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-widest text-foreground">
                    Final Approval
                  </div>
                </th>
              </tr>

              {/* ── Row 2: Sub-column headers ── */}
              <tr className="bg-secondary/40">
                {/* Concept Creation */}
                <ColHead>Start</ColHead>
                <ColHead>Designer</ColHead>
                <ColHead>Concept</ColHead>
                <ColHead wider>Description</ColHead>
                <ColHead>Party Name</ColHead>
                <ColHead border>Assigned By</ColHead>

                {/* Approval */}
                <ColHead>Status</ColHead>
                <ColHead>Planned</ColHead>
                <ColHead border>Actual</ColHead>

                {/* Concept Completion */}
                <ColHead center>Done</ColHead>
                <ColHead>Due Date</ColHead>
                <ColHead>Done Date</ColHead>
                <ColHead border>Delayed</ColHead>

                {/* Final Approval */}
                <ColHead>Status</ColHead>
                <ColHead center>Re-submit</ColHead>
                <ColHead>Re-submitted</ColHead>
                <ColHead center>Approved #</ColHead>
                <ColHead>Feedback</ColHead>
              </tr>
            </thead>

            <tbody className="bg-card">
              {visible.map((c, idx) => {
                const submitter = c.submitter ?? c.designer;
                const approvalDelay = computeDelay(
                  c.md_planned_date,
                  c.md_actual_date
                );
                const completionDelay = computeDelay(
                  c.designer_planned_date,
                  c.designer_actual_date
                );
                const compStatus = deriveCompletionStatus(c);
                const finalStatus = deriveFinalStatus(c);
                const isOwner =
                  userId === c.submitted_by || userId === c.designer_id;
                const canDone =
                  c.md_status === "approved" &&
                  !c.designer_actual_date &&
                  isOwner;

                return (
                  <tr
                    key={c.id}
                    className="group border-b border-border/40 transition-colors hover:bg-secondary/30 cursor-pointer"
                    onClick={() => setSelected(c)}
                  >
                    {/* # */}
                    <td className="sticky left-0 z-10 bg-card group-hover:bg-secondary/30 px-2 py-3 text-center text-xs tabular-nums text-muted-foreground transition-colors">
                      {idx + 1}
                    </td>

                    {/* ── Concept Creation ── */}
                    <Cell>{fmtDate(c.start_date ?? c.created_at)}</Cell>
                    <td className="px-3 py-3">
                      {submitter ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6 ring-1 ring-border">
                            {submitter.avatar_url ? (
                              <AvatarImage src={submitter.avatar_url} />
                            ) : null}
                            <AvatarFallback className="text-[8px] bg-secondary">
                              {getInitials(submitter.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate text-xs font-medium">
                            {submitter.full_name}
                          </span>
                        </div>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs font-medium text-foreground line-clamp-1">
                        {c.title}
                      </span>
                      {c.concept_code && (
                        <span className="block text-[10px] font-mono text-muted-foreground">
                          {c.concept_code}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 max-w-[200px]">
                      <span className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {c.description || "—"}
                      </span>
                    </td>
                    <Cell>{c.client?.party_name || "—"}</Cell>
                    <Cell border>{c.assigned_by || "—"}</Cell>

                    {/* ── Approval ── */}
                    <td className="px-3 py-3 border-l border-border/20">
                      <StatusPill status={c.md_status} />
                    </td>
                    <Cell>{fmtDate(c.md_planned_date)}</Cell>
                    <td className={cn("px-3 py-3", "border-r border-border/20")}>
                      <span className="text-xs">{fmtDate(c.md_actual_date)}</span>
                      {approvalDelay !== null && (
                        <DelayLabel days={approvalDelay} />
                      )}
                    </td>

                    {/* ── Concept Completion ── */}
                    <td
                      className="px-3 py-3 text-center border-l border-border/20"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.designer_actual_date ? (
                        <CheckCircle2 className="mx-auto h-4.5 w-4.5 text-success" />
                      ) : canDone ? (
                        <button
                          type="button"
                          onClick={() => handleMarkDone(c.id)}
                          disabled={completingId === c.id}
                          className="inline-flex items-center gap-1 rounded-md bg-success px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition-all hover:bg-success/90 hover:shadow active:scale-95 disabled:opacity-50"
                        >
                          <Check className="h-3 w-3" />
                          Done
                        </button>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    <Cell>{fmtDate(c.designer_planned_date)}</Cell>
                    <Cell>{fmtDate(c.designer_actual_date)}</Cell>
                    <td className="px-3 py-3 border-r border-border/20">
                      {completionDelay !== null ? (
                        <DelayLabel days={completionDelay} />
                      ) : c.md_status === "approved" &&
                        !c.designer_actual_date &&
                        c.designer_planned_date ? (
                        <span
                          className={cn(
                            "text-[11px] font-medium",
                            compStatus.cls
                          )}
                        >
                          {compStatus.label}
                        </span>
                      ) : (
                        <Dash />
                      )}
                    </td>

                    {/* ── Final Approval ── */}
                    {/* Status */}
                    <td
                      className="px-3 py-3 border-l border-border/20"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.final_approved_at ? (
                        <StatusPill status="approved" label="Approved" />
                      ) : c.designer_actual_date ? (
                        c.final_approval_notes ? (
                          <StatusPill status="revision_requested" label="Revision" />
                        ) : isAdmin ? (
                          <button
                            type="button"
                            onClick={() => handleFinalApprove(c.id)}
                            disabled={approvingId === c.id}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50"
                          >
                            {approvingId === c.id ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                            Approve
                          </button>
                        ) : (
                          <StatusPill status="pending" label="Pending" />
                        )
                      ) : (
                        <Dash />
                      )}
                    </td>
                    {/* Re-submit button */}
                    <td
                      className="px-3 py-3 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.final_approval_notes && !c.final_approved_at && c.designer_actual_date && isOwner ? (
                        <button
                          type="button"
                          onClick={() => handleResubmit(c.id)}
                          disabled={resubmittingId === c.id}
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50"
                        >
                          {resubmittingId === c.id ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                          Re-submit
                        </button>
                      ) : c.final_approval_notes && !c.final_approved_at && c.designer_actual_date ? (
                        <span className="text-[10px] text-muted-foreground">Awaiting</span>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    {/* Re-submitted date */}
                    <Cell>
                      {c.final_approval_planned_date
                        ? fmtDate(c.final_approval_planned_date)
                        : "—"}
                    </Cell>
                    {/* Approved # */}
                    <td className="px-3 py-3 text-center">
                      <span className="text-xs tabular-nums">
                        {c.approved_designs_count != null
                          ? c.approved_designs_count
                          : "—"}
                      </span>
                    </td>
                    {/* Feedback */}
                    <td className="px-3 py-3 max-w-[150px]">
                      <span className="text-xs text-muted-foreground line-clamp-1">
                        {c.final_approval_notes || "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile card list — shown below md (replaces the 22-col wide table). */}
        <ul className="flex flex-col gap-2 md:hidden">
          {visible.map((c) => (
            <li
              key={c.id}
              onClick={() => setSelected(c)}
              className="rounded-xl border border-border bg-card p-3 cursor-pointer transition-colors hover:bg-card/80 active:bg-card/60"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-1 flex-1 text-sm font-medium text-foreground">
                  {c.title}
                </p>
                <Badge
                  className={cn(
                    "shrink-0 text-[10px]",
                    CONCEPT_STATUS_COLORS[c.md_status]
                  )}
                >
                  {CONCEPT_STATUS_LABELS[c.md_status]}
                </Badge>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {(c.submitter ?? c.designer)?.full_name ?? "—"}
                {c.client?.party_name && <> · {c.client.party_name}</>}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                {fmtDate(c.start_date ?? c.created_at)}
              </p>
            </li>
          ))}
        </ul>
        </>
      )}

      {/* ── Pagination ── */}
      {allVisible.length > 0 && (
        <Pagination
          page={conceptPg.page}
          totalPages={conceptPg.totalPages}
          hasNext={conceptPg.hasNext}
          hasPrev={conceptPg.hasPrev}
          onPageChange={conceptPg.setPage}
          showing={conceptPg.showing}
          pageSize={conceptPg.pageSize}
          onPageSizeChange={conceptPg.setPageSize}
        />
      )}

      {/* ── Dialogs / Drawers ── */}
      <SubmitConceptDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        onSubmit={submitConcept}
      />
      <ConceptDetailDrawer
        concept={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        onReview={reviewConcept}
        onFinalize={finalizeConcept}
        onFinalApprove={finalApproveConcept}
        onFinalRevise={finalReviseConcept}
        onResubmit={resubmitConcept}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        data={concepts as unknown as Record<string, unknown>[]}
        columns={
          conceptExportColumns as unknown as CsvColumn<
            Record<string, unknown>
          >[]
        }
        defaultFilename="linkd-concepts"
        dateField="created_at"
      />
    </div>
  );
}

// ============================================================================
// Tiny reusable cell components
// ============================================================================

/** Standard text cell. */
function Cell({
  children,
  border,
}: {
  children: React.ReactNode;
  border?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-3 py-3 text-xs text-foreground whitespace-nowrap",
        border && "border-r border-border/20"
      )}
    >
      {children}
    </td>
  );
}

/** Column header (sub-row). */
function ColHead({
  children,
  border,
  center,
  wider,
}: {
  children: React.ReactNode;
  border?: boolean;
  center?: boolean;
  wider?: boolean;
}) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border",
        center ? "text-center" : "text-left",
        border && "border-r border-border/20",
        wider && "min-w-[180px]"
      )}
    >
      {children}
    </th>
  );
}

/** Em-dash placeholder for empty values. */
function Dash() {
  return <span className="text-xs text-muted-foreground/50">—</span>;
}

// ============================================================================
// Status pill — clean, minimal
// ============================================================================

function StatusPill({ status, label }: { status: ConceptStatus; label?: string }) {
  const map: Record<ConceptStatus, { label: string; cls: string }> = {
    pending: {
      label: "Pending",
      cls: "bg-warning/10 text-warning ring-warning/20",
    },
    approved: {
      label: "Approved",
      cls: "bg-success/10 text-success ring-success/20",
    },
    rejected: {
      label: "Rejected",
      cls: "bg-destructive/10 text-destructive ring-destructive/20",
    },
    revision_requested: {
      label: "Revision",
      cls: "bg-warning/10 text-warning ring-warning/20",
    },
  };
  const s = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
        s.cls
      )}
    >
      {label ?? s.label}
    </span>
  );
}

// ============================================================================
// Delay label — subtle, inline
// ============================================================================

function DelayLabel({ days }: { days: number }) {
  if (days <= 0) {
    return (
      <span className="block text-[10px] font-medium text-success mt-0.5">
        On time
      </span>
    );
  }
  return (
    <span className="block text-[10px] font-medium text-destructive mt-0.5">
      +{days}d late
    </span>
  );
}

// ============================================================================
// Filter chip
// ============================================================================

function FilterChip({
  label,
  count,
  active,
  onClick,
  dotColor,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-white"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
    >
      {dotColor && !active && (
        <span className={cn("h-2 w-2 rounded-full", dotColor)} />
      )}
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
          active ? "bg-white/20 text-white" : "bg-secondary text-foreground"
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ============================================================================
// Status dot colors for filter chips
// ============================================================================

const STATUS_DOT_COLOR: Record<ConceptStatus, string> = {
  pending: "bg-warning",
  approved: "bg-success",
  rejected: "bg-destructive",
  revision_requested: "bg-primary",
};

// ============================================================================
// Loading skeleton
// ============================================================================

function LoadingSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border shadow-sm">
      {/* Category header bars */}
      <div className="flex">
        <div className="flex-[6] border-b border-border p-0">
          <div className="h-[3px] bg-primary" />
          <div className="h-10 bg-card" />
        </div>
        <div className="flex-[3] border-b border-l border-border p-0">
          <div className="h-[3px] bg-[#7C5CFC]" />
          <div className="h-10 bg-card" />
        </div>
        <div className="flex-[4] border-b border-l border-border p-0">
          <div className="h-[3px] bg-success" />
          <div className="h-10 bg-card" />
        </div>
        <div className="flex-[4] border-b border-l border-border p-0">
          <div className="h-[3px] bg-warning" />
          <div className="h-10 bg-card" />
        </div>
      </div>
      {/* Sub-header row */}
      <div className="h-8 border-b border-border bg-secondary/40" />
      {/* Skeleton rows */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex h-[52px] items-center gap-4 border-b border-border/40 bg-card px-4"
        >
          <div className="h-3 w-6 animate-pulse rounded bg-secondary" />
          <div className="h-3 w-16 animate-pulse rounded bg-secondary" />
          <div className="h-6 w-6 animate-pulse rounded-full bg-secondary" />
          <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
          <div className="h-3 flex-1 animate-pulse rounded bg-secondary" />
          <div className="h-5 w-14 animate-pulse rounded-full bg-secondary" />
          <div className="h-3 w-16 animate-pulse rounded bg-secondary" />
          <div className="h-3 w-16 animate-pulse rounded bg-secondary" />
        </div>
      ))}
    </div>
  );
}
