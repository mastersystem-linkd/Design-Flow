import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import ReactDOM from "react-dom";
import {
  Plus,
  RefreshCw,
  Lightbulb,
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  Download,
  ChevronDown,
  MoreVertical,
  Eye,
  Pencil,
  Trash2,
  Send,
  Hammer,
  Sparkles,
  AlertCircle,
  FilterX,
  Calendar,
  Columns3,
  Star,
  Zap,
} from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";
import { useConcepts } from "@/hooks/useConcepts";
import { useAuth } from "@/hooks/useAuth";
// ConceptDashboard components moved to AnalyticsView (Concept Dashboard).
import { Button } from "@/components/ui/button";
import {
  Badge,
  EmptyState,
  ExportDialog,
  Pagination,
  toast,
  ConfirmDialog,
} from "@/components/ui";
import { type CsvColumn } from "@/lib/exportCSV";
import { isAdminOrCoordinator } from "@/lib/permissions";
import { useProfiles } from "@/hooks/useProfiles";
import { usePagination } from "@/hooks/usePagination";
import { SubmitConceptDialog } from "@/components/concepts/SubmitConceptDialog";
import { ConceptDetailDrawer } from "@/components/concepts/ConceptDetailDrawer";
import { ResubmitConceptDialog } from "@/components/concepts/ResubmitConceptDialog";
import {
  CONCEPT_STATUS_LABELS,
  CONCEPT_STATUS_COLORS,
  WORK_STATUS_LABELS,
  WORK_STATUS_COLORS,
  WORK_STATUS_DOT,
} from "@/lib/constants";
import { cn, parseIntervalSeconds, formatDuration } from "@/lib/utils";
import { CONCEPT_STATUSES } from "@/types/database";
import type {
  ConceptStatus,
  ConceptWithRelations,
  CompletionHistoryEntry,
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

// Work-status filter row — visible when the user is looking at approved
// concepts (either explicitly or via the "All" tab). Mirrors the
// `concept_work_status` enum + an "all" affordance.
// Most options mirror `concept_work_status`; `rejected` is a hybrid shortcut
// that filters md_status='rejected' (rejected concepts never enter the work
// pipeline, but users still want a one-click subset).
type WorkTab =
  | "all"
  | "not_started"
  | "in_progress"
  | "on_hold"
  | "in_revision"
  | "changes_requested"
  | "completed"
  | "rejected";

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
// Stage visual identity — each lifecycle group gets:
//   • a 3px top accent bar (CAT_ACCENT)
//   • a soft gradient header background (CAT_GRADIENT) that ties the columns
//     visually without distracting from the data
//   • an icon (CAT_ICON) that reinforces the stage's meaning at a glance
// All three tokens are co-located so adding a 5th stage is a one-spot edit.
// ============================================================================

const CAT_ACCENT = {
  creation: "bg-primary",
  approval: "bg-[#7C5CFC]",
  completion: "bg-success",
  final: "bg-warning",
} as const;

const CAT_GRADIENT = {
  creation:
    "bg-gradient-to-b from-primary/[0.06] via-primary/[0.02] to-transparent",
  approval:
    "bg-gradient-to-b from-[#7C5CFC]/[0.07] via-[#7C5CFC]/[0.02] to-transparent",
  completion:
    "bg-gradient-to-b from-success/[0.06] via-success/[0.02] to-transparent",
  final:
    "bg-gradient-to-b from-warning/[0.07] via-warning/[0.02] to-transparent",
} as const;

const CAT_ICON = {
  creation: Send,
  approval: Eye,
  completion: Hammer,
  final: Sparkles,
} as const;

const CAT_ICON_COLOR = {
  creation: "text-primary",
  approval: "text-[#7C5CFC]",
  completion: "text-success",
  final: "text-warning",
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
// Column visibility for the concepts table
// ============================================================================

type ConceptColKey =
  | "submitted" | "designer" | "concept" | "description" | "party" | "designs" | "assigned_by"
  | "decision" | "planned" | "reviewed"
  | "work_status" | "started" | "holds" | "marked_done"
  | "final_decision" | "approved_count" | "md_feedback" | "completed";

type StageGroup = "creation" | "approval" | "completion" | "final";

const CONCEPT_COLS: readonly { key: ConceptColKey; label: string; stage: StageGroup }[] = [
  { key: "submitted", label: "Submitted", stage: "creation" },
  { key: "designer", label: "Designer", stage: "creation" },
  { key: "concept", label: "Concept", stage: "creation" },
  { key: "description", label: "Description", stage: "creation" },
  { key: "party", label: "Party", stage: "creation" },
  { key: "designs", label: "Designs", stage: "creation" },
  { key: "assigned_by", label: "Assigned By", stage: "creation" },
  { key: "decision", label: "Decision", stage: "approval" },
  { key: "planned", label: "Planned", stage: "approval" },
  { key: "reviewed", label: "Reviewed", stage: "approval" },
  { key: "work_status", label: "Work Status", stage: "completion" },
  { key: "started", label: "Started", stage: "completion" },
  { key: "holds", label: "Holds", stage: "completion" },
  { key: "marked_done", label: "Marked Done", stage: "completion" },
  { key: "final_decision", label: "Decision", stage: "final" },
  { key: "approved_count", label: "Approved", stage: "final" },
  { key: "md_feedback", label: "MD Feedback", stage: "final" },
  { key: "completed", label: "Completed", stage: "final" },
];

const CONCEPT_DEFAULT_COLS: ConceptColKey[] = [
  "submitted", "designer", "concept", "description", "party", "designs", "assigned_by",
  "decision", "planned", "reviewed",
  "work_status", "started", "holds", "marked_done",
  "final_decision", "approved_count", "completed",
];

const CONCEPT_COL_KEY = "concept_visible_columns";
// The user's *own* pinned default (the Reset target). Absent until they click
// "Set as my default"; falls back to CONCEPT_DEFAULT_COLS. Stored per-device
// in localStorage, mirroring how the live selection is already persisted.
const CONCEPT_DEFAULT_KEY = "concept_default_columns";

function loadConceptCols(): ConceptColKey[] {
  try {
    const raw = localStorage.getItem(CONCEPT_COL_KEY);
    if (raw) return JSON.parse(raw) as ConceptColKey[];
  } catch { /* ignore */ }
  return [...CONCEPT_DEFAULT_COLS];
}

/** The user's pinned default, or null if they've never set one. */
function loadConceptDefaultCols(): ConceptColKey[] | null {
  try {
    const raw = localStorage.getItem(CONCEPT_DEFAULT_KEY);
    if (raw) return JSON.parse(raw) as ConceptColKey[];
  } catch { /* ignore */ }
  return null;
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
    resubmitForReview,
    startConcept,
    holdConcept,
    resumeConcept,
    markConceptDone,
    approveDesign,
    suggestChanges,
    startChanges,
    deleteConcept,
  } = useConcepts();
  // designers no longer needed — dashboards moved to AnalyticsView.

  const role = profile?.role ?? "designer";
  const isAdmin = role === "admin" || role === "design_coordinator";
  const isDesigner = role === "designer";
  const userId = profile?.id;
  const { profiles: designers } = useProfiles({ roles: ["designer"] });
  type Scope = "mine" | "all";
  const [scope, setScope] = useState<Scope>(isDesigner ? "mine" : "all");
  const [designerFilter, setDesignerFilter] = useState<string>("");
  const [dateRange, setDateRange] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });

  // URL deep-linking: dashboard KPI cards link to `/concepts?tab=approved` etc.
  // Read once for the initial state, then re-sync on URL change so card clicks
  // re-target the same view without remount.
  const [urlParams] = useSearchParams();
  const urlTab = urlParams.get("tab") as Tab | null;
  const validTabs: Tab[] = ["all", "pending", "approved", "rejected", "revision_requested", "completed"];
  const initialTab: Tab = urlTab && validTabs.includes(urlTab) ? urlTab : "all";

  const [tab, setTab] = useState<Tab>(initialTab);
  const [conceptCols, setConceptCols] = useState<ConceptColKey[]>(loadConceptCols);
  const [conceptDefaultCols, setConceptDefaultCols] = useState<
    ConceptColKey[] | null
  >(loadConceptDefaultCols);
  const showCol = useCallback((k: ConceptColKey) => conceptCols.includes(k), [conceptCols]);
  function saveConceptCols(next: ConceptColKey[]) {
    setConceptCols(next);
    localStorage.setItem(CONCEPT_COL_KEY, JSON.stringify(next));
  }
  // The Reset target: the user's pinned default, else the built-in default.
  const effectiveConceptDefault = conceptDefaultCols ?? CONCEPT_DEFAULT_COLS;
  // Pin the current selection as the user's personal default.
  function setAsConceptDefault() {
    const next = [...conceptCols];
    setConceptDefaultCols(next);
    localStorage.setItem(CONCEPT_DEFAULT_KEY, JSON.stringify(next));
  }
  function stageColSpan(stage: StageGroup): number {
    return CONCEPT_COLS.filter((c) => c.stage === stage && conceptCols.includes(c.key)).length;
  }
  // Secondary tab — work-status. Drives the second chip row when md_status
  // filter is "All" or "Approved". Stays "all" otherwise so switching back
  // doesn't surprise the user with a hidden filter.
  const [workTab, setWorkTab] = useState<WorkTab>("all");
  // Admin "inbox" mode — when active, the table shows only the rows that
  // need the admin's attention (pending initial review + work_status in
  // final review). Overrides the Status + Stage chips while engaged so the
  // admin gets a clean, focused queue with one click.
  const [inboxMode, setInboxMode] = useState(false);
  useEffect(() => {
    if (urlTab && validTabs.includes(urlTab)) setTab(urlTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab]);
  const [submitOpen, setSubmitOpen] = useState(false);
  // Track the selected concept by id, not by snapshot. We then derive the
  // live concept object from the `concepts` array on each render — so after
  // any mutation invalidates the cache, the drawer reflects the new state
  // (e.g. Hold → On Hold + Resume button) WITHOUT needing the user to close
  // and reopen the dialog. The previous `useState<ConceptWithRelations>`
  // snapshot pattern silently held stale rows for the whole open session.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedConcept = useMemo(
    () => (selectedId ? concepts.find((c) => c.id === selectedId) ?? null : null),
    [selectedId, concepts]
  );
  const [exportOpen, setExportOpen] = useState(false);
  // Inline row-level action state removed — all lifecycle transitions now
  // happen inside the centered detail modal (one click on any row opens
  // it). This keeps the wide table read-only and free of edit shortcuts
  // that bypassed the proper work-status pipeline.
  //
  // The row ⋮ Actions menu only does View / Edit / Delete — none of which
  // mutate work_status. Delete target lives at view scope so the confirm
  // dialog can be a single mount shared across rows.
  const [deleteTarget, setDeleteTarget] =
    useState<ConceptWithRelations | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** Concept currently in the Re-submit dialog (designer uploading revised files). */
  const [resubmitTarget, setResubmitTarget] =
    useState<ConceptWithRelations | null>(null);

  /** Concept ownership check — used by the ⋮ Edit gate. The submitter or
   *  the assigned designer counts as "owner". Admins can edit anything
   *  regardless via the wide `isAdmin` flag below, but Edit here also
   *  needs to be reachable for designers on their own rows. */
  const isOwner = useCallback(
    (c: ConceptWithRelations) =>
      !!userId && (userId === c.submitted_by || userId === c.designer_id),
    [userId]
  );

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

  const scopedConcepts = useMemo(
    () =>
      scope === "mine" && userId
        ? concepts.filter((c) => c.submitted_by === userId || c.designer_id === userId)
        : concepts,
    [concepts, scope, userId]
  );

  // -- Counts --
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
    for (const c of scopedConcepts) {
      if (isCompleted(c)) {
        map.completed++;
      } else {
        map[c.md_status]++;
      }
    }
    return map;
  }, [scopedConcepts]);

  // Work-stage counts — most options derive from the approved subset so the
  // chip row reflects the post-approval pipeline. `rejected` is the
  // exception: it counts md_status='rejected' regardless of work_status,
  // surfacing rejected concepts as a one-click subset.
  const workCounts = useMemo(() => {
    const approved = scopedConcepts.filter((c) => c.md_status === "approved");
    const map: Record<Exclude<WorkTab, "all">, number> = {
      not_started: 0,
      in_progress: 0,
      on_hold: 0,
      in_revision: 0,
      changes_requested: 0,
      completed: 0,
      rejected: 0,
    };
    for (const c of approved) {
      const ws = c.work_status as Exclude<WorkTab, "all"> | "done_partial" | null;
      if (ws && ws in map) {
        map[ws as Exclude<WorkTab, "all">]++;
      }
    }
    map.rejected = scopedConcepts.filter((c) => c.md_status === "rejected").length;
    return map;
  }, [scopedConcepts]);

  // A concept is on the MD/coordinator's desk when:
  //   • md_status='pending'      → initial concept review queue
  //   • work_status='in_revision' → designer marked done, final review queue
  // We expose this as a predicate so both the inbox count AND the per-row
  // "Your turn" pill below stay in lockstep with whatever counts as
  // actionable.
  const needsMdAction = useCallback(
    (c: ConceptWithRelations): boolean =>
      c.md_status === "pending" ||
      (c.md_status === "approved" && c.work_status === "in_revision"),
    []
  );
  const needsApprovalCount = useMemo(
    () => concepts.filter(needsMdAction).length,
    [concepts, needsMdAction]
  );

  const allVisible = useMemo(() => {
    // Inbox mode short-circuits everything — admin sees only their queue.
    if (inboxMode) {
      let pool = concepts.filter(needsMdAction);
      if (designerFilter) {
        pool = pool.filter((c) => c.designer_id === designerFilter);
      }
      return pool;
    }
    let pool = scopedConcepts;
    if (tab === "completed") {
      pool = concepts.filter(isCompleted);
    } else if (tab !== "all") {
      pool = concepts.filter((c) => c.md_status === tab && !isCompleted(c));
    }
    // Then narrow further by Stage chip.
    if (workTab === "rejected" && tab === "all") {
      pool = pool.filter((c) => c.md_status === "rejected");
    } else {
      const workActive =
        workTab !== "all" &&
        workTab !== "rejected" &&
        (tab === "all" || tab === "approved");
      if (workActive) {
        pool = pool.filter((c) => c.work_status === workTab);
      }
    }
    // Designer filter
    if (designerFilter) {
      pool = pool.filter((c) => c.designer_id === designerFilter);
    }
    // Date range filter
    if (dateRange.from || dateRange.to) {
      const from = dateRange.from ? new Date(dateRange.from).getTime() : -Infinity;
      const to = dateRange.to ? new Date(dateRange.to + "T23:59:59.999").getTime() : Infinity;
      pool = pool.filter((c) => {
        const anchor = c.start_date ?? c.created_at;
        if (!anchor) return false;
        const ts = new Date(anchor).getTime();
        return ts >= from && ts <= to;
      });
    }
    return pool;
  }, [concepts, scopedConcepts, tab, workTab, inboxMode, designerFilter, dateRange, needsMdAction]);

  const conceptPg = usePagination(allVisible.length, 25);

  const visible = useMemo(
    () => allVisible.slice(conceptPg.from, conceptPg.to + 1),
    [allVisible, conceptPg.from, conceptPg.to]
  );

  const pendingCount = counts.pending;
  // Legacy `handleMarkDone` removed — completion is now driven exclusively
  // by the work-status lifecycle through the modal's "Mark done" button.
  // The `finalizeConcept` mutation is still exposed on useConcepts and the
  // drawer wires it for back-compat with pre-0026 rows.

  // Final-approval table handlers removed with the column.
  // ConceptDetailDrawer still drives finalApproveConcept / resubmitConcept
  // for any remaining workflow that lives outside the table.


  return (
    <div className="space-y-4">
      {/* -- Unified header: title · filters · actions — one compact strip -- */}
      <div className="flex flex-col gap-2">
        {/* Top line: title left, action buttons right */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Lightbulb className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight text-foreground">Concepts</h1>
              <p className="text-[10px] text-muted-foreground">
                {scopedConcepts.length} total · {pendingCount} awaiting review
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isAdmin && (needsApprovalCount > 0 || inboxMode) && (
              <button
                type="button"
                onClick={() => setInboxMode((v) => !v)}
                aria-pressed={inboxMode}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-all",
                  inboxMode
                    ? "border-primary bg-primary text-white shadow-sm"
                    : "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
                )}
              >
                <AlertCircle className="h-3 w-3" />
                <span className="hidden sm:inline">{inboxMode ? "Inbox" : "Approval"}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none",
                    inboxMode ? "bg-white/25 text-white" : "bg-primary text-white"
                  )}
                >
                  {needsApprovalCount}
                </span>
              </button>
            )}
            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isLoading} className="gap-1 px-2">
              <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <ConceptColumnMenu
              visible={conceptCols}
              defaultColumns={effectiveConceptDefault}
              hasCustomDefault={conceptDefaultCols !== null}
              onSetDefault={setAsConceptDefault}
              onChange={saveConceptCols}
            />
            {canExport && (
              <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1 px-2">
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            )}
            <Button size="sm" className="gap-1 px-2.5" onClick={() => setSubmitOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Submit Concept</span>
            </Button>
          </div>
        </div>

        {/* Inbox banner */}
        {inboxMode && (
          <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-[11px] text-muted-foreground">
            Showing only concepts pending your review. Filters paused.
            <button type="button" onClick={() => setInboxMode(false)} className="ml-2 font-medium text-primary hover:underline">
              Exit inbox
            </button>
          </p>
        )}

        {/* Single filter strip: status · designer · dates · stage chips · clear */}
        <div
          className={cn(
            "no-scrollbar touch-scroll-x -mx-3 flex items-center gap-1.5 overflow-x-auto border-b border-border px-3 pb-2 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0",
            inboxMode && "pointer-events-none opacity-40"
          )}
        >
          {/* Scope toggle: My Concepts / All — designers only */}
          {isDesigner && (
            <div className="flex shrink-0 items-center rounded-lg border border-border bg-card p-0.5">
              {(["mine", "all"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                    scope === s
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {s === "mine" ? "My Concepts" : "All"}
                  <span className={cn(
                    "ml-1 tabular-nums",
                    scope === s ? "text-white/80" : "text-muted-foreground/60"
                  )}>
                    {s === "mine" && userId
                      ? concepts.filter((c) => c.submitted_by === userId || c.designer_id === userId).length
                      : concepts.length}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Status dropdown */}
          <div className="relative shrink-0">
            <select
              value={tab}
              onChange={(e) => setTab(e.target.value as Tab)}
              className="h-7 cursor-pointer appearance-none rounded-md border border-border bg-card pl-2 pr-6 text-[11px] font-medium text-foreground transition-colors hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All · {scopedConcepts.length}</option>
              {CONCEPT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CONCEPT_STATUS_LABELS[s]} · {counts[s]}
                </option>
              ))}
              <option value="completed">Completed · {counts.completed}</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
          </div>

          {isAdmin && (
            <select
              value={designerFilter}
              onChange={(e) => setDesignerFilter(e.target.value)}
              className="h-7 shrink-0 rounded-md border border-border bg-card px-2 text-[11px] focus:outline-none focus:ring-2 focus:ring-ring sm:w-[140px]"
              aria-label="Filter by designer"
            >
              <option value="">All designers</option>
              {designers.map((d) => (
                <option key={d.id} value={d.id}>{d.full_name}</option>
              ))}
            </select>
          )}

          {isAdmin && (
            <div className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-card px-1.5">
              <Calendar className="h-3 w-3 shrink-0 text-muted-foreground" />
              <input
                type="date"
                value={dateRange.from ?? ""}
                onChange={(e) => setDateRange({ ...dateRange, from: e.target.value || null })}
                className="h-6 w-[90px] min-w-0 border-0 bg-transparent px-0.5 text-[10px] text-foreground outline-none focus:ring-0"
                aria-label="From date"
              />
              <span className="text-[9px] text-muted-foreground">–</span>
              <input
                type="date"
                value={dateRange.to ?? ""}
                onChange={(e) => setDateRange({ ...dateRange, to: e.target.value || null })}
                className="h-6 w-[90px] min-w-0 border-0 bg-transparent px-0.5 text-[10px] text-foreground outline-none focus:ring-0"
                aria-label="To date"
              />
              {(dateRange.from || dateRange.to) && (
                <button
                  type="button"
                  onClick={() => setDateRange({ from: null, to: null })}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  title="Clear dates"
                >
                  <span className="text-xs leading-none">&times;</span>
                </button>
              )}
            </div>
          )}

          {/* Divider before stage chips */}
          {(tab === "all" || tab === "approved") &&
            Object.values(workCounts).reduce((a, b) => a + b, 0) > 0 && (
            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
          )}

          {/* Stage chips inline */}
          {(tab === "all" || tab === "approved") &&
            Object.values(workCounts).reduce((a, b) => a + b, 0) > 0 && (
            <>
              <FilterChip
                label="All"
                count={Object.values(workCounts).reduce((a, b) => a + b, 0)}
                active={workTab === "all"}
                onClick={() => setWorkTab("all")}
                hint="Every approved concept, across all work stages."
              />
              {WORK_TAB_ORDER.map((w) => (
                <FilterChip
                  key={w}
                  label={w === "rejected" ? "Rejected" : WORK_STATUS_LABELS[w]}
                  count={workCounts[w]}
                  active={workTab === w}
                  onClick={() => setWorkTab(w)}
                  dotColor={WORK_DOT_COLOR[w]}
                  hint={WORK_TAB_HINT[w]}
                />
              ))}
            </>
          )}

          {/* Clear all filters — end of strip */}
          {!inboxMode && (tab !== "all" || workTab !== "all" || designerFilter || dateRange.from || dateRange.to) && (
            <button
              type="button"
              onClick={() => {
                setTab("all");
                setWorkTab("all");
                setDesignerFilter("");
                setDateRange({ from: null, to: null });
              }}
              title="Reset all filters"
              className="shrink-0 sm:ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] font-medium text-muted-foreground transition-all hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
            >
              <FilterX className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* -- Error -- */}
      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* -- Pipeline Table -- */}
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
        <div className="hidden md:block overflow-x-auto overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full min-w-[2600px] text-sm">
            <caption className="sr-only">Design concepts with approval workflow</caption>
            <thead>
              {/* -- Row 1: Merged category headers -- */}
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-20 w-[42px] border-b border-r border-border/30 bg-secondary/40 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-[0.07em] text-foreground shadow-[6px_0_10px_-8px_rgba(0,0,0,0.14)]"
                >
                  #
                </th>

                {stageColSpan("creation") > 0 && <StageHeader stage="creation" colSpan={stageColSpan("creation")} step={1} label="Concept Submitted" />}
                {stageColSpan("approval") > 0 && <StageHeader stage="approval" colSpan={stageColSpan("approval")} step={2} label="MD Approval" />}
                {stageColSpan("completion") > 0 && <StageHeader stage="completion" colSpan={stageColSpan("completion")} step={3} label="Designer Working" />}
                {stageColSpan("final") > 0 && <StageHeader stage="final" colSpan={stageColSpan("final")} step={4} label="Final Approval" />}

                {/* Sticky right Actions column — outside any lifecycle
                     group because the menu controls row-level operations,
                     not stage data. */}
                <th
                  rowSpan={2}
                  className="sticky right-0 z-20 w-[68px] border-b border-l border-border/30 bg-secondary/40 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-[0.07em] text-foreground shadow-[-6px_0_10px_-8px_rgba(0,0,0,0.14)]"
                >
                  Actions
                </th>
              </tr>

              <tr className="bg-secondary/40">
                {showCol("submitted") && <ColHead>Submitted</ColHead>}
                {showCol("designer") && <ColHead>Designer</ColHead>}
                {showCol("concept") && <ColHead>Concept</ColHead>}
                {showCol("description") && <ColHead>Description</ColHead>}
                {showCol("party") && <ColHead>Party</ColHead>}
                {showCol("designs") && <ColHead center>Designs</ColHead>}
                {showCol("assigned_by") && <ColHead>Assigned By</ColHead>}
                {showCol("decision") && <ColHead>Decision</ColHead>}
                {showCol("planned") && <ColHead>Planned</ColHead>}
                {showCol("reviewed") && <ColHead>Reviewed</ColHead>}
                {showCol("work_status") && <ColHead>Work Status</ColHead>}
                {showCol("started") && <ColHead>Started</ColHead>}
                {showCol("holds") && <ColHead center>Holds</ColHead>}
                {showCol("marked_done") && <ColHead>Marked Done</ColHead>}
                {showCol("final_decision") && <ColHead>Decision</ColHead>}
                {showCol("approved_count") && <ColHead center>Approved</ColHead>}
                {showCol("md_feedback") && <ColHead wider>MD Feedback</ColHead>}
                {showCol("completed") && <ColHead>Completed</ColHead>}
              </tr>
            </thead>

            <tbody className="bg-card">
              {visible.map((c, idx) => {
                const submitter = c.submitter ?? c.designer;
                const approvalDelay = computeDelay(
                  c.md_planned_date,
                  c.md_actual_date
                );
                return (
                  <tr
                    key={c.id}
                    className="group relative cursor-pointer border-b border-border/40 transition-colors duration-150 ease-out hover:bg-primary/[0.05]"
                    onClick={() => setSelectedId(c.id)}
                  >
                    {/* # — zero-padded monospace for visual alignment */}
                    <td className={cn(
                      "sticky left-0 z-10 border-r border-r-border/40 border-l-[3px] bg-card px-2 py-3 text-center font-mono text-[11px] tabular-nums text-muted-foreground/60 shadow-[6px_0_10px_-8px_rgba(0,0,0,0.10)] transition-colors group-hover:bg-primary/[0.05] group-hover:text-muted-foreground",
                      c.md_status === "approved" ? "border-l-success"
                        : c.md_status === "pending" ? "border-l-warning"
                        : c.md_status === "revision_requested" || c.md_status === "rejected" ? "border-l-destructive"
                        : "border-l-muted-foreground/40"
                    )}>
                      {String(conceptPg.from + idx + 1).padStart(2, "0")}
                    </td>

                    {showCol("submitted") && <Cell>{fmtDate(c.start_date ?? c.created_at)}</Cell>}
                    {showCol("designer") && <td className="px-3 py-2.5">{submitter ? <div className="flex items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold uppercase text-primary ring-1 ring-inset ring-primary/15">{submitter.full_name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("")}</span><span className="truncate text-xs font-medium text-foreground">{submitter.full_name}</span></div> : <Dash />}</td>}
                    {showCol("concept") && <td className="px-3 py-2.5"><span className="text-[13px] font-semibold text-foreground line-clamp-1" title={c.concept_code ?? undefined}>{c.title}</span></td>}
                    {showCol("description") && <td className="px-3 py-2.5">{c.description ? <span className="max-w-[200px] text-xs font-medium text-foreground line-clamp-1" title={c.description}>{c.description}</span> : <Dash />}</td>}
                    {showCol("party") && <Cell>{c.client?.party_name || "—"}</Cell>}
                    {showCol("designs") && <td className="px-3 py-2.5 text-center">{c.designs_count != null ? <span className="inline-flex h-5 min-w-[24px] items-center justify-center rounded-md bg-primary/8 px-1.5 text-[11px] font-bold tabular-nums text-primary ring-1 ring-inset ring-primary/20">{c.designs_count}</span> : <Dash />}</td>}
                    {showCol("assigned_by") && <Cell>{c.assigned_by || "—"}</Cell>}

                    {showCol("decision") && <td className="px-3 py-2.5"><div className="flex items-center gap-1.5"><StatusPill status={c.md_status} label={c.md_status === "pending" && Array.isArray(c.completion_history) && c.completion_history.length > 0 ? "Re-submitted" : undefined} />{isAdmin && needsMdAction(c) && <YourTurnPill />}</div></td>}
                    {showCol("planned") && <Cell>{fmtDate(c.md_planned_date)}</Cell>}
                    {showCol("reviewed") && <td className="px-3 py-2.5"><span className="text-xs">{fmtDate(c.md_actual_date)}</span>{approvalDelay !== null && <DelayLabel days={approvalDelay} />}</td>}

                    {/* ── Stage 3 · Designer Working — lifecycle-driven. The
                         legacy "Done / Done Date / Delayed" columns are gone;
                         work-status, started_at, hold_count, revision_count,
                         and designer_actual_date (set automatically by
                         markConceptDone) now drive the picture. ── */}
                    {showCol("work_status") && <td className="px-3 py-2.5 whitespace-nowrap">{c.md_status === "approved" ? <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset", WORK_STATUS_COLORS[c.work_status])}><span className={cn("h-1.5 w-1.5 rounded-full", WORK_STATUS_DOT[c.work_status], c.work_status === "in_progress" && "animate-pulse")} aria-hidden />{WORK_STATUS_LABELS[c.work_status]}</span> : <Dash />}</td>}
                    {showCol("started") && <Cell>{fmtDate(c.work_started_at)}</Cell>}
                    {showCol("holds") && <td className="px-3 py-2.5 text-center whitespace-nowrap"><HoldCell concept={c} /></td>}
                    {showCol("marked_done") && <td className="px-3 py-2.5 whitespace-nowrap">{c.designer_actual_date ? <span className="text-xs">{fmtDate(c.designer_actual_date)}</span> : <Dash />}</td>}
                    {showCol("final_decision") && <td className="px-3 py-2.5 whitespace-nowrap"><FinalDecisionPill concept={c} /></td>}
                    {showCol("approved_count") && <td className="px-3 py-2.5 text-center text-xs tabular-nums">{c.work_status === "completed" ? <span className="font-semibold text-success">{c.approved_designs_count ?? "—"}<span className="text-muted-foreground/60">{c.designs_count != null ? ` / ${c.designs_count}` : ""}</span></span> : c.designs_count != null ? <span className="text-muted-foreground/60">— / {c.designs_count}</span> : <Dash />}</td>}
                    {showCol("md_feedback") && <td className="max-w-[180px] px-3 py-2.5 text-xs text-muted-foreground">{c.md_feedback ? <span className="line-clamp-1 italic" title={c.md_feedback}>"{c.md_feedback}"</span> : <Dash />}</td>}
                    {showCol("completed") && <td className="px-3 py-2.5 whitespace-nowrap">{c.work_completed_at ? <span className="text-xs font-medium text-success">{fmtDate(c.work_completed_at)}</span> : <Dash />}</td>}

                    {/* Sticky right Actions cell — ⋮ menu with View / Edit /
                         Delete. stopPropagation everywhere so a menu click
                         doesn't also open the row's detail modal. */}
                    <td
                      className="sticky right-0 z-10 border-l border-border/40 bg-card px-2 py-2.5 text-center shadow-[-6px_0_10px_-8px_rgba(0,0,0,0.10)] transition-colors group-hover:bg-primary/[0.05]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ConceptRowActionsMenu
                        canEdit={isOwner(c) || isAdmin}
                        canDelete={isOwner(c) || isAdmin}
                        onView={() => setSelectedId(c.id)}
                        onEdit={() => setSelectedId(c.id)}
                        onDelete={() => setDeleteTarget(c)}
                      />
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
              onClick={() => setSelectedId(c.id)}
              className={cn(
                "rounded-xl border border-border border-l-[3px] bg-card p-3.5 shadow-sm cursor-pointer transition-colors hover:bg-card/80 active:scale-[0.99]",
                c.md_status === "approved" ? "border-l-success"
                  : c.md_status === "pending" ? "border-l-warning"
                  : c.md_status === "revision_requested" ? "border-l-destructive"
                  : c.md_status === "rejected" ? "border-l-destructive"
                  : "border-l-muted-foreground/40"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-1 flex-1 text-sm font-medium text-foreground">
                  {c.title}
                </p>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                  {isAdmin && needsMdAction(c) && <YourTurnPill />}
                  <Badge
                    className={cn(
                      "shrink-0 text-[10px]",
                      CONCEPT_STATUS_COLORS[c.md_status]
                    )}
                  >
                    {c.md_status === "pending" && Array.isArray(c.completion_history) && c.completion_history.length > 0
                      ? "Re-submitted"
                      : CONCEPT_STATUS_LABELS[c.md_status]}
                  </Badge>
                </div>
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

      {/* -- Pagination -- */}
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

      {/* -- Dialogs / Drawers -- */}
      <SubmitConceptDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        onSubmit={submitConcept}
      />
      <ConceptDetailDrawer
        concept={selectedConcept}
        open={!!selectedConcept}
        onOpenChange={(o) => !o && setSelectedId(null)}
        onReview={reviewConcept}
        onFinalize={finalizeConcept}
        onFinalApprove={finalApproveConcept}
        onFinalRevise={finalReviseConcept}
        onResubmit={resubmitConcept}
        /* Pass the dialog-opener as the resubmit handler — the dialog
           collects revised files + notes, then calls resubmitForReview
           with them. This keeps the drawer's button click cheap (just
           opens the dialog) and the file-upload concern co-located in
           ResubmitConceptDialog. */
        onOpenResubmitForReview={(c) => setResubmitTarget(c)}
        onStart={startConcept}
        onHold={holdConcept}
        onResume={resumeConcept}
        onMarkDone={markConceptDone}
        onApproveDesign={approveDesign}
        onSuggestChanges={suggestChanges}
        onStartChanges={startChanges}
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

      {/* Designer's revision re-submit — collects new file(s) + optional
           "what I changed" notes, then calls resubmitForReview. */}
      <ResubmitConceptDialog
        concept={resubmitTarget}
        open={!!resubmitTarget}
        onOpenChange={(o) => !o && setResubmitTarget(null)}
        onResubmit={resubmitForReview}
      />

      {/* Hard-delete confirmation — admin/coordinator only per RLS. */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this concept?"
        description={
          deleteTarget
            ? `"${deleteTarget.title}" (${deleteTarget.concept_code}) will be permanently removed. This cannot be undone.`
            : ""
        }
        confirmLabel={deleting ? "Deleting…" : "Delete concept"}
        variant="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleting(true);
          const { error: err } = await deleteConcept(deleteTarget.id);
          setDeleting(false);
          if (err) {
            toast.error(err);
            return;
          }
          toast.success("Concept deleted");
          setDeleteTarget(null);
        }}
      />

    </div>
  );
}

// ============================================================================
// Tiny reusable cell components
// ============================================================================

/**
 * Stage group header — top-row `<th>` with a thin accent strip, icon-tagged
 * label, and soft gradient wash. Step number (1–4) is rendered as a small
 * monospace chip so the lifecycle sequence is unmistakable at a glance.
 */
function StageHeader({
  stage,
  colSpan,
  step,
  label,
}: {
  stage: keyof typeof CAT_ACCENT;
  colSpan: number;
  step: number;
  label: string;
}) {
  const Icon = CAT_ICON[stage];
  return (
    <th
      colSpan={colSpan}
      className="relative border-b border-border/50 bg-secondary/40 p-0"
    >
      <div className={cn("absolute inset-x-0 top-0 h-[2px]", CAT_ACCENT[stage])} />
      <div className="flex items-center justify-center gap-1.5 px-3 py-2">
        <span className={cn("flex h-4 w-4 items-center justify-center rounded", CAT_ICON_COLOR[stage])}>
          <Icon className="h-2.5 w-2.5" />
        </span>
        <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
          {String(step).padStart(2, "0")}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-foreground">
          {label}
        </span>
      </div>
    </th>
  );
}

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
        "px-3 py-2.5 text-xs text-foreground whitespace-nowrap",
        border && "border-r border-border/20"
      )}
    >
      {children}
    </td>
  );
}

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
        "px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.07em] text-foreground border-b border-border bg-secondary/40",
        center && "text-center",
        border && "border-r border-border/30",
        wider && "min-w-[200px]"
      )}
    >
      {children}
    </th>
  );
}

/** Em-dash placeholder for empty values — minimal so it doesn't compete
 *  with real data when scanning the table. */
/** Order-independent set equality for concept column lists. */
function sameConceptColumns(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((k) => sb.has(k));
}

function ConceptColumnMenu({
  visible,
  defaultColumns = CONCEPT_DEFAULT_COLS,
  hasCustomDefault = false,
  onSetDefault,
  onChange,
}: {
  visible: ConceptColKey[];
  /** Column set "Reset" restores (the user's pinned default or the built-in). */
  defaultColumns?: readonly ConceptColKey[];
  /** Whether the user has pinned a personal default (affects copy). */
  hasCustomDefault?: boolean;
  /** Pin the current selection as the user's default; hides the button if absent. */
  onSetDefault?: () => void;
  onChange: (next: ConceptColKey[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Clear the "Saved" confirmation when the selection changes or menu reopens.
  const selectionKey = [...visible].sort().join(",");
  useEffect(() => { setJustSaved(false); }, [selectionKey, open]);

  const isVis = (k: ConceptColKey) => visible.includes(k);
  function toggle(k: ConceptColKey) { onChange(isVis(k) ? visible.filter((v) => v !== k) : [...visible, k]); }
  const isCurrentTheDefault = sameConceptColumns(visible, defaultColumns);
  function setAsDefault() { onSetDefault?.(); setJustSaved(true); }

  return (
    <div className="relative" ref={ref}>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen((o) => !o)} className="gap-1 px-2">
        <Columns3 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Columns</span>
        <span className="rounded-full bg-secondary px-1.5 text-[9px] font-semibold tabular-nums text-muted-foreground">{visible.length}</span>
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-lg" role="menu">
          <div className="border-b border-border px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Visible Columns</span>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {CONCEPT_COLS.map(({ key, label, stage }) => (
              <button key={key} type="button" role="menuitemcheckbox" aria-checked={isVis(key)} onClick={() => toggle(key)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary/60">
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", isVis(key) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}>
                  {isVis(key) && <CheckCircle2 className="h-3 w-3" />}
                </span>
                <span className="truncate text-foreground">{label}</span>
                <span className="ml-auto text-[9px] text-muted-foreground/50">{stage === "creation" ? "S1" : stage === "approval" ? "S2" : stage === "completion" ? "S3" : "S4"}</span>
              </button>
            ))}
          </div>
          <div className="space-y-1.5 border-t border-border px-2 py-2">
            {onSetDefault && (
              <button
                type="button"
                onClick={setAsDefault}
                disabled={isCurrentTheDefault && !justSaved}
                title="Make this column layout the one Reset restores"
                className={cn(
                  "inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
                  justSaved
                    ? "border-success/40 bg-success/5 text-success"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary",
                  "disabled:cursor-default disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-card disabled:hover:text-muted-foreground"
                )}
              >
                {justSaved ? (
                  <><CheckCircle2 className="h-3 w-3" /> Saved as your default</>
                ) : (
                  <><Star className="h-3 w-3" /> {isCurrentTheDefault ? "This is your default" : "Set as my default"}</>
                )}
              </button>
            )}
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => onChange(CONCEPT_COLS.map((c) => c.key))} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary">
                <Eye className="h-3 w-3" /> Show All
              </button>
              <button type="button" onClick={() => onChange([...defaultColumns])} title={hasCustomDefault ? "Reset to your saved default" : "Reset to the built-in default"} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary">
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// "Your turn" pill — rendered on rows where the current admin/coordinator
// needs to act (pending initial review, OR designer-resubmitted final
// review). Tinted primary so it pops next to the muted status badge and
// pulses subtly to read as a call-to-action rather than just decoration.
// Mirrored on both the desktop row decision cell and the mobile card
// header so the affordance is consistent across devices.
function YourTurnPill() {
  return (
    <span
      title="This concept is waiting for your review"
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white shadow-sm ring-1 ring-inset ring-primary/40"
    >
      <Zap className="h-2.5 w-2.5" />
      Your turn
    </span>
  );
}

function Dash() {
  return (
    <span
      className="text-xs text-muted-foreground/30 select-none"
      aria-label="No value"
    >
      —
    </span>
  );
}

// ============================================================================
// Status pill — clean, minimal
// ============================================================================

function StatusPill({ status, label }: { status: ConceptStatus; label?: string }) {
  const map: Record<
    ConceptStatus,
    { label: string; cls: string; dot: string }
  > = {
    pending: {
      label: "Pending",
      cls: "bg-warning/10 text-warning ring-warning/25",
      dot: "bg-warning",
    },
    approved: {
      label: "Approved",
      cls: "bg-success/10 text-success ring-success/25",
      dot: "bg-success",
    },
    rejected: {
      label: "Rejected",
      cls: "bg-destructive/10 text-destructive ring-destructive/25",
      dot: "bg-destructive",
    },
    revision_requested: {
      label: "Revision",
      cls: "bg-warning/10 text-warning ring-warning/25",
      dot: "bg-warning",
    },
  };
  const isResubmit = label === "Re-submitted";
  const s = map[status];
  const pillCls = isResubmit
    ? "bg-primary/10 text-primary ring-primary/25"
    : s.cls;
  const dotCls = isResubmit ? "bg-primary" : s.dot;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] ring-1 ring-inset",
        pillCls
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", dotCls)}
        aria-hidden
      />
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
  hint,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  dotColor?: string;
  /** Native browser tooltip explaining what this filter shows. */
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
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

const WORK_DOT_COLOR: Record<Exclude<WorkTab, "all">, string> = {
  not_started: "bg-muted-foreground",
  in_progress: "bg-primary",
  on_hold: "bg-warning",
  in_revision: "bg-destructive",
  changes_requested: "bg-warning",
  completed: "bg-success",
  rejected: "bg-destructive",
};

// `not_started` removed from the visible filter row — migration 0029 auto-
// starts work the moment MD approves. `changes_requested` also removed —
// migration 0030 collapsed it into `in_progress` (with the rework banner
// + md_feedback inline). Both enum values stay on the DB type for
// back-compat but no longer surface as filters.
const WORK_TAB_ORDER: readonly Exclude<WorkTab, "all">[] = [
  "in_progress",
  "on_hold",
  "in_revision",
  "completed",
  "rejected",
];

/** Hover tooltip copy per work-stage chip — explains what the user is
 *  filtering to in one sentence. Title attribute keeps it native, no
 *  extra component required. */
const WORK_TAB_HINT: Record<Exclude<WorkTab, "all">, string> = {
  not_started: "Approved but designer hasn't begun yet (legacy state).",
  in_progress:
    "Designer is actively working — first pass or reworking MD's feedback.",
  on_hold: "Designer paused the work — they'll resume later.",
  in_revision: "Designer marked it done; waiting for Ma'am's verdict.",
  changes_requested:
    "MD asked for changes (legacy — collapsed into In Progress in 0030).",
  completed: "Fully approved by Ma'am — terminal state.",
  rejected: "Ma'am rejected the initial concept — terminal, no further work.",
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

// ============================================================================
// FinalDecisionPill — single-cell summary of where stage 4 stands. The
// row's md_status + work_status together pick the right pill:
//
//   md_status != approved          → "—" (stage 4 not reachable yet)
//   work_status === in_revision    → Awaiting MD (review queue)
//   work_status === completed      → Completed (terminal)
//   anything else (still working)  → "—" (stage 4 not in play yet)
// ============================================================================

/**
 * HoldCell — Holds column body. Shows count + cumulative duration so the
 * reader knows both "how many times" and "for how long" at a glance.
 * When the concept is currently on_hold, the duration includes the live
 * delta from work_held_at to now (the DB only flushes total_hold_duration
 * on resume, so we add the running sliver client-side).
 *
 *   0 holds                       → "—"
 *   1 hold completed              → "1"        title="3d total on hold"
 *   2 holds + currently on hold   → "2 · 5d"   title="…"
 *   1 hold + currently on hold    → "1 · live" title="…"
 */
function HoldCell({ concept }: { concept: ConceptWithRelations }) {
  const count = concept.hold_count ?? 0;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (count === 0) return <Dash />;

  const isOnHold = concept.work_status === "on_hold";
  const heldAt = concept.work_held_at
    ? new Date(concept.work_held_at).getTime()
    : null;
  const currentSliverSec = isOnHold && heldAt
    ? Math.max(0, Math.floor((Date.now() - heldAt) / 1000))
    : 0;
  const cumulativeSec =
    parseIntervalSeconds(concept.total_hold_duration) + currentSliverSec;
  const totalLabel = cumulativeSec > 0 ? formatDuration(cumulativeSec) : null;

  // Extract hold/resume events from completion_history
  const history: CompletionHistoryEntry[] = Array.isArray(concept.completion_history)
    ? concept.completion_history
    : [];
  const holdEvents = history.filter(
    (h) => h.type === "held" || h.type === "resumed"
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-secondary"
      >
        <span className="font-semibold tabular-nums text-foreground">{count}</span>
        {totalLabel && <span className="text-muted-foreground">· {totalLabel}</span>}
        {isOnHold && (
          <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-warning" />
        )}
      </button>

      {open && holdEvents.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-card p-3 shadow-lg">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Hold History
          </p>
          <div className="max-h-40 space-y-1.5 overflow-y-auto">
            {holdEvents.map((h, i) => (
              <div key={i} className={cn(
                "flex items-baseline gap-2 rounded-md px-2 py-1 text-[11px]",
                h.type === "held" ? "border-l-2 border-warning bg-warning/5" : "border-l-2 border-success bg-success/5"
              )}>
                <span className={cn("shrink-0 font-semibold", h.type === "held" ? "text-warning" : "text-success")}>
                  {h.type === "held" ? "Held" : "Resumed"}
                </span>
                <span className="flex-1 text-muted-foreground">{h.date}</span>
                {h.feedback && (
                  <span className="max-w-[120px] truncate text-foreground" title={h.feedback}>{h.feedback}</span>
                )}
              </div>
            ))}
          </div>
          {isOnHold && concept.work_held_at && (
            <p className="mt-2 flex items-center gap-1 text-[10px] text-warning">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" />
              On hold since {new Date(concept.work_held_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function FinalDecisionPill({ concept }: { concept: ConceptWithRelations }) {
  if (concept.md_status !== "approved") return <Dash />;
  const ws = concept.work_status;
  if (ws === "completed") {
    return (
      <Badge className="border border-success/30 bg-success/10 text-success text-[10px]">
        Completed
      </Badge>
    );
  }
  if (ws === "in_revision") {
    return (
      <Badge className="border border-destructive/30 bg-destructive/10 text-destructive text-[10px]">
        Awaiting MD
      </Badge>
    );
  }
  return <Dash />;
}

// ============================================================================
// ConceptRowActionsMenu — per-row ⋮ menu with View / Edit / Delete.
// Portal-rendered so the open menu can escape the table's overflow clipping
// and the sticky right column. Same pattern as KanbanView's row actions.
// ============================================================================

function ConceptRowActionsMenu({
  canEdit,
  canDelete,
  onView,
  onEdit,
  onDelete,
}: {
  canEdit: boolean;
  canDelete: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Outside-click + Escape closes the menu. We bind these only while the
  // menu is open so the rest of the page isn't paying for unmounted rows.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const menuHeight = 132; // ~3 items × ~38px + padding
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < menuHeight + 8;
      setPos({
        top: openUp ? rect.top - menuHeight - 4 : rect.bottom + 4,
        left: rect.right - 160,
      });
    }
    setOpen(true);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-[var(--border-hover)] hover:bg-secondary hover:text-foreground"
        aria-label="Concept actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {open &&
        ReactDOM.createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            className="z-[9999] min-w-[160px] overflow-hidden rounded-lg border border-border bg-card py-1 shadow-dropdown animate-fade-in"
          >
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onView();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
            >
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              View details
            </button>
            {canEdit && (
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onEdit();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                Edit concept
              </button>
            )}
            {canDelete && (
              <>
                <div className="my-1 h-px bg-border" aria-hidden />
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete concept
                </button>
              </>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
