import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import ReactDOM from "react-dom";
import confetti from "canvas-confetti";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus,
  Paperclip,
  HandPlatter,
  Play,
  Send,
  Check,
  ArrowRight,
  Loader2,
  ChevronUp,
  ChevronDown,
  Inbox,
  MoreVertical,
  FlaskConical,
  Pencil,
  Trash2,
  Eye,
  RefreshCw,
  Download,
  Keyboard,
  Layers,
  Calendar,
  FilterX,
  ArrowDownToLine,
  Rows3,
  Scissors,
  Users,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTasks, usePoolWithGhosts, getMonday } from "@/hooks/useTasks";
import { useProfiles } from "@/hooks/useProfiles";
import { useTaskMutations, type TaskMutationOp } from "@/hooks/useTaskMutations";
import { TaskDetailDrawer } from "@/components/tasks/TaskDetailDrawer";
import { KeyboardShortcutsDialog } from "@/components/ui/KeyboardShortcutsDialog";
import {
  useKeyboardShortcuts,
  type Shortcut,
} from "@/hooks/useKeyboardShortcuts";
import { FullKittingModal } from "@/components/tasks/FullKittingModal";
import { KittingStageADialog } from "@/components/tasks/KittingStageADialog";
import {
  CompletedKittingPanel,
  FkColumnMenu,
  loadFkColumns,
  saveFkCols as persistFkCols,
  type FkColKey,
} from "@/components/tasks/CompletedKittingPanel";
import { supabase } from "@/lib/supabase";
import { EditTaskDialog } from "@/components/tasks/EditTaskDialog";
import { ClaimTaskModal } from "@/components/tasks/ClaimTaskModal";
import { PoolQueueTable } from "@/components/tasks/PoolQueueTable";
import { PostDoneModal } from "@/components/tasks/PostDoneModal";
import { SplitTaskDialog } from "@/components/tasks/SplitTaskDialog";
import { ColumnVisibilityMenu } from "@/components/tasks/ColumnVisibilityMenu";
import { TaskPipelineStepper } from "@/components/tasks/TaskPipelineStepper";
import {
  useUserPreferences,
  type PipelineStage,
} from "@/hooks/useUserPreferences";
import { NewBriefDialog } from "@/views/BriefingView";
import {
  Badge,
  Button,
  SkeletonText,
  SearchInput,
  EmptyState,
  ConfirmDialog,
  ExportDialog,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  toast,
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
  DeadlineCell,
} from "@/components/ui";
import { type CsvColumn } from "@/lib/exportCSV";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  COLUMN_DOT,
  COLUMN_ACCENT,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
} from "@/lib/constants";
import { ROUTES, kittingDetailPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { daysUntil, daysSeverity, DAYS_DOT_CLASS, DAYS_TEXT_CLASS } from "@/lib/days";
import { isAdminOrCoordinator, canCreateBriefs } from "@/lib/permissions";
import { isFullKittingAdded, isFullKittingBlocking } from "@/lib/taskHelpers";
import { flagFkPendingToCoordinator } from "@/lib/fkCoordinatorTask";
import { sendNotificationToRole } from "@/lib/notifications";
import { ExternalOriginBadge } from "@/components/integration/ExternalOriginBadge";

/** Compact creation timestamp for the Date/Time column (Indian locale). */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Date-only display for the WhatsApp message date (stored as yyyy-mm-dd). */
function formatDateOnly(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

/** Time-only display (stored as "HH:MM" / "HH:MM:SS") → 12-hour with am/pm. */
function formatTimeOnly(t: string | null | undefined): string {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hour = Number(h);
  if (m == null || !Number.isFinite(hour)) return t;
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m} ${ampm}`;
}

import type {
  TaskStatus,
  TaskWithRelations,
  UserRole,
} from "@/types/database";

function isAdminRole(role: UserRole | null | undefined): boolean {
  return isAdminOrCoordinator(role);
}

// Inline WhatsApp Group cell editor is not wired in KanbanView; the canonical
// catalogue lives in `lib/whatsappGroups.ts` and is used by the brief form
// and EditTaskDialog. Import from there if/when this surface gets an editor.

type FilterTab = "mine" | "all" | "urgent";

/** Kitting status + image path per task — drives the FK badge color and lets
 *  the badge open the kitting file directly. */
type KittingStatus =
  | "pending_image"
  | "pending_deo"
  | "in_progress"
  | "completed";
interface KittingInfo {
  id: string;
  status: KittingStatus;
  imageUrl: string | null;
}

/**
 * "Completed Late" — the designer finished the task AFTER the planned deadline
 * they set when claiming it. Compared at day granularity, so completing ON the
 * deadline day counts as on-time. Tasks not yet completed (or with no deadline)
 * are never "late".
 */
function isCompletedLate(task: TaskWithRelations): boolean {
  if (!task.planned_deadline) return false;
  const finished = task.status === "done" || task.status === "completed";
  const completionTs =
    task.completed_at ??
    task.completion_filled_at ??
    (finished ? task.updated_at : null);
  if (!completionTs) return false;
  const completedDay = new Date(completionTs);
  completedDay.setHours(0, 0, 0, 0);
  const deadlineDay = new Date(task.planned_deadline);
  deadlineDay.setHours(0, 0, 0, 0);
  return completedDay.getTime() > deadlineDay.getTime();
}

/**
 * Statuses shown on /dashboard — just three tabs to keep the board clean:
 *   Pool → In Progress → Completed.
 * There is no separate "Done" tab. A task marked done (design finished but
 * fabric not yet captured) STAYS in the In Progress tab, badged "Done", until
 * the designer adds fabric — at which point it moves to Completed. Legacy
 * `todo` / `full_kitting` also fold into In Progress; `approved` / `sampling`
 * live elsewhere.
 */
const DASHBOARD_STATUSES: readonly TaskStatus[] = [
  "pool",
  "in_progress",
  "completed",
] as const;

function defaultFilterForRole(role: UserRole): FilterTab {
  if (role === "designer") return "mine";
  return "all";
}

function defaultStatusTabForRole(role: UserRole): TaskStatus {
  // Designers land where their work usually is; admins start at the Pool.
  return role === "designer" ? "in_progress" : "pool";
}

type SortKey = "deadline" | "code" | "qty" | "priority";
type SortDir = "asc" | "desc";

interface SortConfig {
  key: SortKey;
  dir: SortDir;
}

const DEFAULT_SORT: SortConfig = { key: "deadline", dir: "asc" };

/**
 * Tracks whether the viewport is below Tailwind's `md` breakpoint (< 768px).
 * Used to swap the wide table for a stacked card list on phones.
 * Listens to `resize` and cleans up on unmount.
 */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < 768
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
}

// ============================================================================
// Types
// ============================================================================

interface TeamInfo {
  designTypes: string[];
  designers: { name: string; avatarUrl: string | null }[];
}

// ============================================================================
// Top-level view
// ============================================================================

export function KanbanView() {
  const { profile, user } = useAuth();
  const { tasks, isLoading, error, refetch } = useTasks();
  const queryClient = useQueryClient();

  // IDs of tasks where the current user has a split assignment
  const [myAssignmentTaskIds, setMyAssignmentTaskIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!user?.id) return;
    void supabase
      .from("task_assignments")
      .select("task_id")
      .eq("designer_id", user.id)
      .then(({ data }) => {
        setMyAssignmentTaskIds(new Set((data ?? []).map((r) => r.task_id)));
      });
  }, [user?.id, tasks]);
  const {
    assignTask,
    updateTaskStatus,
    markTaskDone,
    completeTask,
    updateTask,
    deleteTask: deleteTaskMutation,
    isPending,
  } = useTaskMutations();
  const { profiles: designers } = useProfiles({
    roles: ["designer"],
  });
  const {
    getVisibleColumns,
    setVisibleColumns,
    getDefaultColumns,
    setDefaultColumns,
    hasCustomDefault,
    tableDensity,
    setTableDensity,
  } = useUserPreferences();
  // Column visibility persists per pipeline stage. `done` tasks live in the
  // In Progress tab (§13.3), so map any non pool/completed tab to in_progress.
  const toColumnStage = (s: TaskStatus): PipelineStage =>
    s === "pool" || s === "completed" ? s : "in_progress";

  // ── Kitting status per task ──────────────────────────────────────────
  // Used to color the FK badge in the task row: red when pending DEO,
  // blue (default) when completed. One batched query — cheap enough to
  // run alongside the task list, and refreshes whenever the task list
  // does so newly-uploaded kitting forms reflect immediately.
  const [kittingByTask, setKittingByTask] = useState<Map<string, KittingInfo>>(
    new Map()
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("full_kitting_details")
        .select("id, task_id, data_entry_status, image_url");
      if (cancelled || !data) return;
      const next = new Map<string, KittingInfo>();
      for (const row of data) {
        if (row.task_id) {
          next.set(row.task_id, {
            id: row.id,
            status: row.data_entry_status,
            imageUrl: row.image_url ?? null,
          });
        }
      }
      setKittingByTask(next);
    })();
    return () => {
      cancelled = true;
    };
    // Re-fetch whenever the task list re-fetches (covers Stage A uploads
    // that didn't change the task list but did change a kitting row).
  }, [tasks]);

  // ── Team assignment info per task ─────────────────────────────────────
  // Batch-fetches assignment data (design types + designer names) per task.
  // A task_id present in this map = "team task" (has assignment rows).
  const [teamInfoByTask, setTeamInfoByTask] = useState<
    Map<string, TeamInfo>
  >(new Map());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("task_assignments")
        .select("task_id, design_type, designer:profiles!designer_id(full_name, avatar_url)");
      if (cancelled || !data) return;
      const grouped = new Map<string, { types: Set<string>; designers: Map<string, { name: string; avatarUrl: string | null }> }>();
      for (const row of data as any[]) {
        if (!row.task_id) continue;
        if (!grouped.has(row.task_id)) {
          grouped.set(row.task_id, { types: new Set(), designers: new Map() });
        }
        const g = grouped.get(row.task_id)!;
        if (row.design_type) g.types.add(row.design_type);
        if (row.designer?.full_name) {
          g.designers.set(row.designer.full_name, {
            name: row.designer.full_name,
            avatarUrl: row.designer.avatar_url ?? null,
          });
        }
      }
      const next = new Map<string, TeamInfo>();
      for (const [taskId, g] of grouped) {
        next.set(taskId, {
          designTypes: Array.from(g.types).sort(),
          designers: Array.from(g.designers.values()),
        });
      }
      setTeamInfoByTask(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [tasks]);

  const role: UserRole = profile?.role ?? "designer";
  const isAdmin = isAdminRole(role);
  // ── Pool claim state ─────────────────────────────────────────────────
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  /** When a designer picks a specific row from the pool table, we store its
   *  ID here so ClaimTaskModal loads that task instead of the FIFO top-1. */
  const [claimPreselectedId, setClaimPreselectedId] = useState<string | undefined>();

  // Pre-claim warning chain: skip warning → FK warning → claim modal.
  // Both warnings are centralized here so every entry point (pool table,
  // drawer, summary card) goes through the same checks.
  const [fkWarningTaskId, setFkWarningTaskId] = useState<string | null>(null);
  const [fkNotifying, setFkNotifying] = useState(false);
  const [skipWarningTaskId, setSkipWarningTaskId] = useState<string | null>(null);
  const [skipCount, setSkipCount] = useState(0);

  function openClaimOrWarn(taskId: string, tableQueuePos?: number) {
    const task = tasks.find((t) => t.id === taskId) ??
      poolLive?.find((t) => t.id === taskId);

    // Step 1: skip-ahead check — is the designer bypassing earlier pool tasks?
    // If the PoolQueueTable passed its pre-computed position, use it (most
    // accurate — same data + same ghost logic as the visual rows). Otherwise
    // compute from poolLive (for drawer / card entry points).
    let ahead = tableQueuePos ?? -1;
    if (ahead < 0 && poolLive.length > 0) {
      const monday = getMonday(new Date()).toISOString().split("T")[0]!;
      const briefedWeek = (d: string | null | undefined) =>
        d ? getMonday(new Date(d)).toISOString().split("T")[0]! : "";
      const claimable = poolLive.filter(
        (t) => !poolGhosts.has(t.id) && (t.qty_remaining == null || t.qty_remaining > 0)
      );
      // Match visual order: this-week first, carry-over second.
      const thisWeek = claimable.filter((t) => briefedWeek(t.created_at) >= monday);
      const carryOver = claimable.filter((t) => {
        const w = briefedWeek(t.created_at);
        return w !== "" && w < monday;
      });
      const ordered = [...thisWeek, ...carryOver];
      ahead = ordered.findIndex((t) => t.id === taskId);
    }

    if (ahead > 0) {
      setSkipWarningTaskId(taskId);
      setSkipCount(ahead);
      return;
    }

    // Step 2: check FK blocking.
    if (task && isFullKittingBlocking(task)) {
      setFkWarningTaskId(taskId);
      return;
    }

    setClaimPreselectedId(taskId);
    setClaimModalOpen(true);
  }

  function handleSkipConfirm() {
    if (!skipWarningTaskId) return;
    const taskId = skipWarningTaskId;
    setSkipWarningTaskId(null);
    setSkipCount(0);

    // After skip is confirmed, check FK next.
    const task = tasks.find((t) => t.id === taskId) ??
      poolLive?.find((t) => t.id === taskId);
    if (task && isFullKittingBlocking(task)) {
      setFkWarningTaskId(taskId);
      return;
    }
    setClaimPreselectedId(taskId);
    setClaimModalOpen(true);
  }

  async function handleFkAskCoordinator() {
    if (!fkWarningTaskId) return;
    const task = tasks.find((t) => t.id === fkWarningTaskId);
    setFkNotifying(true);
    try {
      await sendNotificationToRole(
        ["admin", "design_coordinator"],
        "Full Knitting Needed",
        `${profile?.full_name ?? "A designer"} is waiting on Full Knitting details for ${task?.task_code ?? "a task"}`,
        "warning",
        "/dashboard"
      );
      toast.info("Coordinator notified");
    } catch {
      toast.error("Failed to notify coordinator");
    }
    setFkNotifying(false);
    setFkWarningTaskId(null);
  }

  function handleFkContinue() {
    if (!fkWarningTaskId) return;
    const taskId = fkWarningTaskId;
    setFkWarningTaskId(null);
    // Just open the claim form — the coordinator notification + to-do only fire
    // when the designer ACTUALLY claims (onClaimed), not on this intent.
    setClaimPreselectedId(taskId);
    setClaimModalOpen(true);
  }

  // Live pool count from the SAME source as the pool table (usePoolWithGhosts),
  // so partially-claimed split tasks (status != 'pool' but still claimable with
  // qty_remaining > 0) are counted — not just status === 'pool' rows. Claimable
  // = the active/pool set minus fully-assigned ghost rows.
  const { tasks: poolLive, ghostIds: poolGhosts } = usePoolWithGhosts();
  const poolStats = useMemo(() => {
    const claimable = poolLive.filter((t) => !poolGhosts.has(t.id));
    const urgentCount = claimable.filter((t) => t.priority === "urgent").length;
    return {
      poolCount: claimable.length,
      urgentCount,
      normalCount: claimable.length - urgentCount,
    };
  }, [poolLive, poolGhosts]);

  // URL params support deep-linking from dashboard KPI cards. We read once on
  // mount (or whenever the search-string changes) and seed the filter/state.
  // Local UI mutations don't write back — the URL is treated as the entry
  // intent, not a live mirror of the user's clicks.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStatus = searchParams.get("status") as TaskStatus | null;
  const urlFilter = searchParams.get("filter") as FilterTab | null;
  const urlTab = searchParams.get("tab"); // "kitting" → Full Kitting sub-folder
  const urlOverdue = searchParams.get("overdue") === "1";
  const urlFrom = searchParams.get("from"); // ISO yyyy-mm-dd
  const urlTo = searchParams.get("to");
  const urlDesigner = searchParams.get("designer"); // profile id
  const urlFocus = searchParams.get("focus"); // single task id — coordinator FK redirect

  const [filter, setFilter] = useState<FilterTab>(
    urlFilter ?? defaultFilterForRole(role)
  );
  const [statusTab, setStatusTab] = useState<TaskStatus>(
    urlStatus ?? defaultStatusTabForRole(role)
  );
  // When true the body swaps from the task table to CompletedKittingPanel.
  // Lives alongside statusTab rather than being a `TaskStatus | "kitting"`
  // union so the existing status-tab plumbing stays simple. Synced with the
  // URL via ?tab=kitting so /kitting/:id can navigate back to the right tab.
  const [kittingView, setKittingView] = useState(urlTab === "kitting");
  const [designerFilter, setDesignerFilter] = useState<string>(urlDesigner ?? "");
  // Single-task focus (coordinator jumps here from an FK to-do). Hard-filters
  // the list to just that task so FK can be added fast. Cleared via the banner.
  const [focusTaskId, setFocusTaskId] = useState<string | null>(urlFocus);
  const [search, setSearch] = useState("");
  const [overdueOnly, setOverdueOnly] = useState<boolean>(urlOverdue);
  const [dateRange, setDateRange] = useState<{ from: string | null; to: string | null }>({
    from: urlFrom,
    to: urlTo,
  });

  // Re-sync state when the URL changes (e.g. clicking another KPI card while
  // already on this page — the route is the same but params differ).
  useEffect(() => {
    if (urlStatus) setStatusTab(urlStatus);
    if (urlFilter) setFilter(urlFilter);
    setOverdueOnly(urlOverdue);
    setDateRange({ from: urlFrom, to: urlTo });
    if (urlDesigner !== null) setDesignerFilter(urlDesigner);
    setFocusTaskId(urlFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStatus, urlFilter, urlOverdue, urlFrom, urlTo, urlDesigner, urlFocus]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [kittingTask, setKittingTask] = useState<TaskWithRelations | null>(null);
  // Task awaiting fabric+mtr completion details (opens PostDoneModal). Set
  // after Mark Done, or from the Done tab's per-row "Complete" button.
  const [postDoneTask, setPostDoneTask] = useState<TaskWithRelations | null>(null);
  const [editTask, setEditTask] = useState<TaskWithRelations | null>(null);
  const [deleteTask, setDeleteTask] = useState<TaskWithRelations | null>(null);
  const [fkDrawerTask, setFkDrawerTask] = useState<TaskWithRelations | null>(null);
  const [splitTask, setSplitTask] = useState<TaskWithRelations | null>(null);
  const [newBriefOpen, setNewBriefOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const kittingExportRef = useRef<(() => void) | null>(null);
  const [kittingRefreshKey, setKittingRefreshKey] = useState(0);
  const [fkCols, setFkCols] = useState<FkColKey[]>(loadFkColumns);
  function handleFkColsChange(next: FkColKey[]) {
    setFkCols(next);
    persistFkCols(next);
  }

  // Keyboard navigation: index of the highlighted row within the active tab.
  const [activeRowIndex, setActiveRowIndex] = useState<number>(-1);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Reset row selection whenever the user switches tabs.
  useEffect(() => {
    setActiveRowIndex(-1);
  }, [statusTab]);

  // ----------------- Bulk selection (admin / coordinator only) -----------------
  const canBulk = isAdminOrCoordinator(role);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });

  async function handleRefresh() {
    setRefreshing(true);
    await refetch();
    setKittingRefreshKey((k) => k + 1);
    setRefreshing(false);
  }

  const taskExportColumns: CsvColumn<TaskWithRelations>[] = [
    { key: "task_code", label: "Task Code" },
    { key: "created_at", label: "Briefed" },
    { key: "started_at", label: "Claimed" },
    { key: "concept", label: "Concept" },
    { key: "client", label: "Client", transform: (v, row) => (v as any)?.party_name ?? (row.brief_type === "ld" ? "LD Silk Mills" : "") },
    { key: "fabric", label: "Fabric", transform: (v, row) => String(v || "").trim() || row.completion_fabric?.trim() || "" },
    { key: "assignee", label: "Designer", transform: (v) => (v as any)?.full_name ?? "Unassigned" },
    { key: "status", label: "Status" },
    { key: "priority", label: "Priority" },
    { key: "whatsapp_received_date", label: "Message Date" },
    { key: "whatsapp_received_time", label: "Message Time" },
    { key: "assigned_at", label: "Assigned Date" },
    { key: "planned_deadline", label: "Planned Deadline" },
    { key: "completed_at", label: "Completed Date" },
    { key: "delay_days", label: "Delay Days", transform: (v) => v != null ? String(v) : "" },
    { key: "qty", label: "Qty (m)", transform: (v) => v != null ? String(v) : "" },
    { key: "qty_completed", label: "Completed", transform: (v) => v != null ? String(v) : "" },
    { key: "requires_full_kitting", label: "Full Knitting" },
    { key: "mtr", label: "Mtr", transform: (v) => v != null ? String(v) : "" },
  ];

  // One sort config per status section.
  const [sorts, setSorts] = useState<Record<TaskStatus, SortConfig>>(() => ({
    pool: { key: "code", dir: "asc" },
    todo: DEFAULT_SORT,
    in_progress: DEFAULT_SORT,
    full_kitting: DEFAULT_SORT,
    approved: DEFAULT_SORT, // unused but keeps the record total
    sampling: DEFAULT_SORT, // unused
    done: { key: "deadline", dir: "desc" },
    completed: { key: "deadline", dir: "desc" },
  }));

  // Track tasks that just changed status to flash a brief highlight.
  const [enteringIds, setEnteringIds] = useState<Set<string>>(new Set());

  // ----------------- Filtering / scoping -----------------

  const scoped = useMemo(() => {
    // Exclude statuses that don't belong on the dashboard anymore.
    // full_kitting tasks are kept — they'll be grouped under "in_progress" tab.
    let list = tasks.filter(
      (t) =>
        t.status !== "sampling" &&
        t.status !== "approved"
    );

    if (filter === "urgent") {
      list = list.filter((t) => t.priority === "urgent");
    } else if (filter === "mine") {
      if (!user?.id) return [];
      // Designers see: their own tasks + the open Pool (to claim from)
      // + all To-Do tasks (read-only, to see what colleagues are working on).
      list = list.filter(
        (t) =>
          t.assigned_to === user.id ||
          myAssignmentTaskIds.has(t.id) ||
          (role === "designer" && (t.status === "pool" || t.status === "todo"))
      );
    }

    if (isAdmin && designerFilter) {
      list = list.filter((t) => t.assigned_to === designerFilter);
    }

    // URL-driven filters from dashboard KPI deep-links.
    if (overdueOnly) {
      const todayStr = new Date().toISOString().slice(0, 10);
      list = list.filter(
        (t) =>
          t.status !== "done" &&
          t.planned_deadline &&
          t.planned_deadline < todayStr
      );
    }
    if (dateRange.from || dateRange.to) {
      const from = dateRange.from ? new Date(dateRange.from).getTime() : -Infinity;
      // To-date is inclusive of the day → end-of-day in epoch ms
      const to = dateRange.to
        ? new Date(dateRange.to + "T23:59:59.999").getTime()
        : Infinity;
      list = list.filter((t) => {
        // For done tasks, anchor to completion; for open tasks, to creation.
        // This makes "?status=done&from=X&to=Y" mean "shipped in window",
        // while "?from=X&to=Y" without status filters to created-in-window.
        const anchor =
          t.completed_at ?? (t.status === "done" ? t.updated_at : t.created_at);
        if (!anchor) return false;
        const ts = new Date(anchor).getTime();
        return ts >= from && ts <= to;
      });
    }

    return list;
  }, [tasks, filter, user?.id, role, isAdmin, designerFilter, overdueOnly, dateRange, myAssignmentTaskIds]);

  /** Search MATCHES — used for opacity dimming, not filtering. */
  const matchesSearch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return new Set<string>();
    const matches = new Set<string>();
    for (const t of scoped) {
      const haystack = [
        t.task_code,
        t.concept,
        t.client?.party_name ?? (t.brief_type === "ld" ? "LD Silk Mills" : ""),
        t.assignee?.full_name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (haystack.includes(q)) matches.add(t.id);
    }
    return matches;
  }, [scoped, search]);

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, TaskWithRelations[]> = {
      pool: [],
      todo: [],
      in_progress: [],
      full_kitting: [],
      approved: [],
      sampling: [],
      done: [],
      completed: [],
    };
    for (const t of scoped) {
      // 'done' = design finished, awaiting fabric — it STAYS in the In Progress
      // tab (badged "Done") until completion details are added → 'completed'.
      // Legacy full_kitting / todo also fold into In Progress.
      if (
        t.status === "full_kitting" ||
        t.status === "todo" ||
        t.status === "done"
      ) {
        map.in_progress.push(t);
      } else {
        map[t.status].push(t);
      }
    }
    return map;
  }, [scoped]);

  // When a CROSS-STATUS filter is active (overdue-only, or the Urgent-Only tab)
  // without an explicit status URL param, auto-jump to the first tab that has
  // matching tasks so the user doesn't land on an empty Pool tab. This is what
  // makes the dashboard's "N urgent / N overdue" chips land on the real rows.
  useEffect(() => {
    if ((!overdueOnly && filter !== "urgent") || urlStatus) return;
    const current = grouped[statusTab] ?? [];
    if (current.length > 0) return;
    const firstNonEmpty = DASHBOARD_STATUSES.find((s) => (grouped[s]?.length ?? 0) > 0);
    if (firstNonEmpty) setStatusTab(firstNonEmpty);
  }, [overdueOnly, filter, grouped, statusTab, urlStatus]);

  /**
   * Sorted tasks for the currently visible tab, mirroring what
   * `TaskTableSection` renders. Used by keyboard shortcuts (J/K/Enter) to
   * map `activeRowIndex` back to a real task.
   */
  const visibleTasks = useMemo(() => {
    const base = grouped[statusTab] ?? [];
    const focused = focusTaskId ? base.filter((t) => t.id === focusTaskId) : base;
    return sortTasks(focused, sorts[statusTab]);
  }, [grouped, statusTab, sorts, focusTaskId]);

  const myStats = useMemo(() => {
    if (!user?.id) return { active: 0, completed: 0, total: 0 };
    const mine = tasks.filter((t) => t.assigned_to === user.id);
    return {
      total: mine.length,
      // 'done' (awaiting fabric) counts as Active — it lives in In Progress.
      active: mine.filter((t) =>
        ["todo", "in_progress", "full_kitting", "done"].includes(t.status)
      ).length,
      completed: mine.filter((t) => t.status === "completed").length,
    };
  }, [tasks, user?.id]);

  const urgentCount = useMemo(
    () => scoped.filter((t) => t.priority === "urgent").length,
    [scoped]
  );

  // ----------------- Row actions -----------------

  function markEntering(taskId: string) {
    setEnteringIds((prev) => new Set(prev).add(taskId));
    setTimeout(() => {
      setEnteringIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }, 1800);
  }

  async function handleAccept(task: TaskWithRelations) {
    if (!user?.id) return;
    const { error } = await assignTask(task.id, user.id);
    if (error) {
      toast.error(error);
      return;
    }
    await refetch();
    markEntering(task.id);
    toast.success(`${task.task_code} accepted ✓`);
  }

  /** Designer picks a pool task to claim — opens the ClaimTaskModal with
   *  that task pre-selected so the designer can set deadline + fabric.
   *  If FK is required but not added, shows a warning dialog first. */
  function handleSelfAssign(task: TaskWithRelations) {
    openClaimOrWarn(task.id);
  }

  async function handleAdvance(task: TaskWithRelations, next: TaskStatus) {
    // Advancing to 'done' = design work finished but NOT yet fully completed.
    // We do NOT prompt for fabric here — the task simply lands in Done. The
    // designer captures fabric (if not already chosen at claim time) when they
    // click "Complete", which moves it to the terminal 'completed' state.
    if (next === "done") {
      // Hard FK gate — can't complete a task that needs Full Knitting until the
      // coordinator adds the details.
      if (isFullKittingBlocking(task)) {
        toast.error(
          "Full Knitting details are required before completing this task. Ask the coordinator to add them."
        );
        return;
      }
      const { error } = await markTaskDone(task.id);
      if (error) {
        toast.error(error);
        return;
      }
      await refetch();
      markEntering(task.id);
      toast.success(
        `${task.task_code} marked done. Add fabric details and click Complete to finish.`
      );
      return;
    }

    const { error } = await updateTaskStatus(task.id, next);
    if (error) {
      toast.error(error);
      return;
    }
    await refetch();
    markEntering(task.id);
    toast.success(`${task.task_code} → ${STATUS_LABELS[next]} ✓`);
  }

  function handleSubmitForReview(task: TaskWithRelations) {
    // FK gate: block moving to done when FK is required but missing.
    if (isFullKittingBlocking(task)) {
      toast.error("Full Knitting details must be added by the coordinator before you can complete this task.");
      return;
    }
    // Designers must finish every unit before completing. Admins/coordinators
    // can override (e.g. to close a cancelled or paused task).
    const elevated = isAdminRole(role);
    const allComplete = (task.qty_completed ?? 0) >= (task.qty ?? 0);
    if (!elevated && !allComplete) {
      const remaining = Math.max(0, (task.qty ?? 0) - (task.qty_completed ?? 0));
      toast.info(
        `Update Completed to ${task.qty} (still ${remaining} pending) before marking done.`
      );
      return;
    }
    // Simplified pipeline: In Progress → Done.
    void handleAdvance(task, "done");
  }

  // Complete a 'done' task. If the designer already picked a fabric at claim
  // time (task.fabric), finish straight away — no popup. Otherwise open the
  // PostDoneModal to capture the missing field(s) first. Completion requires
  // BOTH fabric AND design type — if either is missing, open the modal.
  // Full Knitting gate: block if FK is required but not yet added.
  function handleComplete(task: TaskWithRelations) {
    if (isFullKittingBlocking(task)) {
      toast.error(
        "Full Knitting details are required before completing this task. Ask the coordinator to add them."
      );
      return;
    }
    // Completion details (Design Type + Fabric + Sampling Required) are
    // MANDATORY for every task — always open the modal, never auto-complete.
    setPostDoneTask(task);
  }

  async function handleDeleteConfirm() {
    if (!deleteTask) return;
    const { error } = await deleteTaskMutation(deleteTask.id);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Task deleted");
    setDeleteTask(null);
    await refetch();
  }

  function updateSort(status: TaskStatus, key: SortKey) {
    setSorts((prev) => {
      const curr = prev[status];
      const nextDir: SortDir =
        curr.key === key ? (curr.dir === "asc" ? "desc" : "asc") : "asc";
      return { ...prev, [status]: { key, dir: nextDir } };
    });
  }

  // ----------------- Keyboard shortcuts -----------------
  const shortcuts = useMemo<Shortcut[]>(() => {
    const list: Shortcut[] = [
      {
        key: "j",
        category: "Navigation",
        description: "Move to next task",
        handler: () => {
          if (visibleTasks.length === 0) return;
          setActiveRowIndex((i) =>
            Math.min(visibleTasks.length - 1, i < 0 ? 0 : i + 1)
          );
        },
      },
      {
        key: "k",
        category: "Navigation",
        description: "Move to previous task",
        handler: () => {
          if (visibleTasks.length === 0) return;
          setActiveRowIndex((i) => Math.max(0, i < 0 ? 0 : i - 1));
        },
      },
      {
        key: "Enter",
        category: "Navigation",
        description: "Open selected task",
        handler: () => {
          if (activeRowIndex < 0) return;
          const task = visibleTasks[activeRowIndex];
          if (task) setSelectedTaskId(task.id);
        },
      },
      {
        key: "Escape",
        category: "Navigation",
        description: "Close drawer or deselect row",
        handler: () => {
          if (selectedTaskId) setSelectedTaskId(null);
          else setActiveRowIndex(-1);
        },
      },
      {
        key: "/",
        category: "Search",
        description: "Focus search input",
        handler: () => searchInputRef.current?.focus(),
      },
      {
        key: "f",
        category: "Search",
        description: "Focus search input",
        handler: () => searchInputRef.current?.focus(),
      },
      {
        key: "?",
        category: "Help",
        description: "Show keyboard shortcuts",
        handler: () => setShortcutsHelpOpen(true),
      },
    ];

    // Actions — keyboard access to the toolbar buttons.
    if (isAdmin) {
      list.push({
        key: "n",
        category: "Actions",
        description: "New brief",
        handler: () => setNewBriefOpen(true),
      });
    }
    list.push(
      {
        key: "r",
        category: "Actions",
        description: "Refresh tasks",
        handler: () => {
          void handleRefresh();
        },
      },
      {
        key: "c",
        category: "Actions",
        description: "Toggle row density",
        handler: () =>
          setTableDensity(tableDensity === "compact" ? "comfortable" : "compact"),
      }
    );
    if (isAdmin) {
      list.push({
        key: "e",
        category: "Actions",
        description: "Export CSV",
        handler: () => setExportOpen(true),
      });
    }

    // Tab shortcuts: 1 → first status, 2 → second, etc.
    DASHBOARD_STATUSES.forEach((status, idx) => {
      list.push({
        key: String(idx + 1),
        category: "Tabs",
        description: `Switch to ${STATUS_LABELS[status]}`,
        handler: () => setStatusTab(status),
      });
    });
    // Full Kitting is the side tab after the pipeline stages (key 4).
    list.push({
      key: String(DASHBOARD_STATUSES.length + 1),
      category: "Tabs",
      description: "Switch to Full Kitting",
      handler: () => handleStageClick("full_kitting"),
    });
    return list;
  }, [visibleTasks, activeRowIndex, selectedTaskId, isAdmin, tableDensity]);

  useKeyboardShortcuts(shortcuts);

  // Keep active row valid when the underlying task list shrinks.
  useEffect(() => {
    if (activeRowIndex >= visibleTasks.length) {
      setActiveRowIndex(visibleTasks.length > 0 ? visibleTasks.length - 1 : -1);
    }
  }, [visibleTasks.length, activeRowIndex]);

  // ----------------- Auto-clear bulk selection -----------------
  // Selection is scoped to "what's currently visible on screen", so reset
  // whenever the filter/tab/search/data changes underneath it.
  useEffect(() => {
    setSelectedIds(new Set());
    setLastSelectedIndex(null);
  }, [statusTab, filter, designerFilter, search, tasks]);

  // ----------------- Bulk handlers -----------------
  function toggleRowSelection(
    taskId: string,
    index: number,
    withShift: boolean
  ) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      // Shift-click: select the range between last selected and current index
      // using the *visible* (sorted + filtered) list so it matches what the
      // user is actually seeing.
      if (withShift && lastSelectedIndex !== null && lastSelectedIndex !== index) {
        const [from, to] =
          lastSelectedIndex < index
            ? [lastSelectedIndex, index]
            : [index, lastSelectedIndex];
        const shouldSelect = !prev.has(taskId);
        for (let i = from; i <= to; i++) {
          const t = visibleTasks[i];
          if (!t) continue;
          if (shouldSelect) next.add(t.id);
          else next.delete(t.id);
        }
      } else {
        if (next.has(taskId)) next.delete(taskId);
        else next.add(taskId);
      }
      return next;
    });
    setLastSelectedIndex(index);
  }

  function toggleAllVisible(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const t of visibleTasks) next.add(t.id);
      } else {
        for (const t of visibleTasks) next.delete(t.id);
      }
      return next;
    });
    setLastSelectedIndex(null);
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setLastSelectedIndex(null);
  }

  /**
   * Run a mutation sequentially across every selected task ID. Continues on
   * individual failures (per-task toast); surfaces a single success toast at
   * the end. Refetches once when done.
   */
  async function executeBulkOperation(
    operation: (taskId: string) => Promise<{ error: string | null } | void>
  ) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setBulkUpdating(true);
    setBulkProgress({ done: 0, total: ids.length });

    let successCount = 0;
    for (let i = 0; i < ids.length; i++) {
      const taskId = ids[i]!;
      try {
        const result = await operation(taskId);
        // Existing mutations return { data, error } and never throw.
        if (result && "error" in result && result.error) {
          toast.error(`Task ${taskId.slice(0, 8)}: ${result.error}`);
        } else {
          successCount++;
        }
      } catch (err) {
        // Defensive — none of our mutations currently throw, but isolate any
        // unexpected runtime errors so the loop keeps going.
        console.error(err);
        toast.error(`Failed updating task ${taskId.slice(0, 8)}`);
      }
      setBulkProgress({ done: i + 1, total: ids.length });
    }

    setBulkUpdating(false);
    if (successCount > 0) {
      toast.success(`${successCount} task${successCount === 1 ? "" : "s"} updated`);
    }
    clearSelection();
    await refetch();
  }

  async function bulkAssign(designerId: string) {
    if (!designerId) return;
    await executeBulkOperation((taskId) => assignTask(taskId, designerId));
  }

  async function bulkMove(nextStatus: TaskStatus) {
    await executeBulkOperation((taskId) => updateTaskStatus(taskId, nextStatus));
  }

  // ----------------- Pipeline stepper navigation -----------------
  // Replaces the old status tab pills. Routes a stage click to the same state
  // the tabs used: a status key → that stage; "full_kitting" → kitting view.
  function handleStageClick(key: string) {
    if (key === "full_kitting") {
      setKittingView(true);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("tab", "kitting");
          return next;
        },
        { replace: true }
      );
      return;
    }
    setKittingView(false);
    setStatusTab(key as TaskStatus);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("tab");
        return next;
      },
      { replace: true }
    );
  }

  // Render the active stage's task table. The pipeline stepper is passed as the
  // section header (replaces the old dot + name + count header).
  function renderStageSection(
    status: TaskStatus,
    rowIndex: number,
    headerSlot?: React.ReactNode
  ) {
    return (
      <TaskTableSection
        key={status}
        status={status}
        headerSlot={headerSlot}
        // Coordinator FK redirect narrows the *visible rows* to one task while
        // the stepper counts above stay the true pipeline totals.
        tasks={
          focusTaskId
            ? (grouped[status] ?? []).filter((t) => t.id === focusTaskId)
            : grouped[status]
        }
        sort={sorts[status]}
        onSortChange={(k) => updateSort(status, k)}
        search={search}
        matchesSearch={matchesSearch}
        enteringIds={enteringIds}
        activeRowIndex={rowIndex}
        onSelectTask={setSelectedTaskId}
        onAccept={handleAccept}
        onSelfAssign={handleSelfAssign}
        onAdvance={handleAdvance}
        onSubmitReview={handleSubmitForReview}
        onComplete={handleComplete}
        onEdit={setEditTask}
        onDelete={setDeleteTask}
        onFullKitting={setFkDrawerTask}
        onSplit={setSplitTask}
        onCellUpdate={async (taskId, fields) => {
          const { error } = await updateTask(taskId, fields);
          if (error) {
            toast.error(error);
            return;
          }
          await refetch();
        }}
        designers={designers}
        kittingByTask={kittingByTask}
        teamInfoByTask={teamInfoByTask}
        currentUserId={user?.id ?? null}
        role={role}
        isPending={isPending}
        canBulk={canBulk}
        selectedIds={selectedIds}
        onToggleRow={toggleRowSelection}
        onToggleAll={toggleAllVisible}
        visibleColumns={getVisibleColumns(toColumnStage(status))}
        tableDensity={tableDensity}
      />
    );
  }

  // ----------------- Loading state -----------------
  if (isLoading && tasks.length === 0) {
    return <TableSkeleton />;
  }

  const totalCount = scoped.length;
  const hasAny = totalCount > 0;
  const fullKittingCount = tasks.filter((t) => t.requires_full_kitting).length;

  // The pipeline stepper IS the task table's header (replaces the old section
  // header). Built once and rendered as the header of whichever body shows.
  const pipelineStepper = (
    <TaskPipelineStepper
      stages={[
        {
          key: "pool",
          label: "Pool",
          count: poolStats.poolCount,
          subLabel: `${poolStats.urgentCount} urgent · ${poolStats.normalCount} normal`,
          color: "muted",
        },
        {
          key: "in_progress",
          label: "In Progress",
          count: grouped.in_progress?.length ?? 0,
          color: "primary",
        },
        {
          key: "completed",
          label: "Completed",
          count: grouped.completed?.length ?? 0,
          color: "success",
        },
      ]}
      // Full Kitting is a separate data tab, not a pipeline step — rendered
      // divided off to the right of the flow.
      sideStage={{
        key: "full_kitting",
        label: "Full Kitting",
        count: fullKittingCount,
        color: "warning",
      }}
      activeStage={kittingView ? "full_kitting" : statusTab}
      onStageClick={handleStageClick}
    />
  );

  // Single-task focus (coordinator FK redirect) — resolve the task + a clearer.
  const focusedTask = focusTaskId
    ? tasks.find((t) => t.id === focusTaskId) ?? null
    : null;
  function clearFocus() {
    setFocusTaskId(null);
    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="space-y-4">
      <TopBar
        role={role}
        myStats={myStats}
        designers={designers}
        designerFilter={designerFilter}
        setDesignerFilter={setDesignerFilter}
        search={search}
        setSearch={setSearch}
        searchInputRef={searchInputRef}
        isAdmin={isAdmin}
        filter={filter}
        setFilter={setFilter}
        urgentCount={urgentCount}
        dateRange={dateRange}
        setDateRange={setDateRange}
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
        onExport={
          kittingView
            ? () => kittingExportRef.current?.()
            : isAdmin
              ? () => setExportOpen(true)
              : undefined
        }
        onNewBrief={() => setNewBriefOpen(true)}
        onOpenShortcuts={() => setShortcutsHelpOpen(true)}
        tableDensity={tableDensity}
        onToggleDensity={() => setTableDensity(tableDensity === "compact" ? "comfortable" : "compact")}
        columnMenuSlot={
          kittingView ? (
            <FkColumnMenu
              visible={fkCols}
              onChange={handleFkColsChange}
              includeIncomplete
            />
          ) : (
            <ColumnVisibilityMenu
              visibleColumns={getVisibleColumns(toColumnStage(statusTab))}
              defaultColumns={getDefaultColumns(toColumnStage(statusTab))}
              hasCustomDefault={hasCustomDefault(toColumnStage(statusTab))}
              onSetDefault={() => setDefaultColumns(toColumnStage(statusTab))}
              onChange={(cols) =>
                setVisibleColumns(toColumnStage(statusTab), cols)
              }
            />
          )
        }
      />

      {(overdueOnly || dateRange.from || dateRange.to) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <span className="font-medium text-primary">Filtered:</span>
          {overdueOnly && (
            <span className="rounded-full bg-destructive/15 px-2 py-0.5 font-medium text-destructive">
              Overdue only
            </span>
          )}
          {(dateRange.from || dateRange.to) && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary">
              {dateRange.from ?? "…"} → {dateRange.to ?? "…"}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setOverdueOnly(false);
              setDateRange({ from: null, to: null });
            }}
            className="ml-auto rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Clear filters
          </button>
        </div>
      )}

      {focusTaskId && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/[0.07] px-3 py-2 text-xs">
          <Layers className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span className="font-medium text-warning">
            Focused on {focusedTask?.task_code ?? "this task"}
            {focusedTask && isFullKittingBlocking(focusedTask)
              ? " — add Full Knitting to clear the coordinator to-do"
              : focusedTask
                ? " — Full Knitting already added ✓"
                : " — not on this tab"}
          </span>
          {focusedTask && isFullKittingBlocking(focusedTask) && (
            <button
              type="button"
              onClick={() => setFkDrawerTask(focusedTask)}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20"
            >
              <ArrowDownToLine className="h-3 w-3" />
              Add Full Knitting
            </button>
          )}
          <button
            type="button"
            onClick={clearFocus}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <FilterX className="h-3 w-3" />
            Clear focus
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Failed to load tasks: {error}
        </div>
      )}

      {filter === "urgent" && urgentCount === 0 ? (
        <EmptyState
          icon="🎉"
          title="No urgent tasks right now"
          description="Looks like everything's on track. Switch back to All Tasks to keep working."
        />
      ) : !hasAny ? (
        <EmptyState
          icon="📋"
          title="Nothing on the board"
          description={
            isAdmin
              ? "Create a new brief to start the pipeline."
              : "Once a brief lands, it will show up here."
          }
        />
      ) : (
        <>
          {kittingView ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                {pipelineStepper}
              </div>
              <CompletedKittingPanel
                includeIncomplete
                externalSearch={search}
                onExportRef={kittingExportRef}
                refreshKey={kittingRefreshKey}
                visibleColumns={fkCols}
              />
            </div>
          ) : statusTab === "pool" ? (
            <PoolQueueTable
              onClaimTask={(taskId, queuePosition) => {
                openClaimOrWarn(taskId, queuePosition);
              }}
              onViewTask={(task) => setSelectedTaskId(task.id)}
              onEditTask={isAdmin ? setEditTask : undefined}
              onDeleteTask={isAdmin ? setDeleteTask : undefined}
              onSplitTask={isAdmin ? setSplitTask : undefined}
              onFullKitting={isAdmin ? (task) => setFkDrawerTask(task) : undefined}
              headerSlot={pipelineStepper}
              tableDensity={tableDensity}
              urgentOnly={filter === "urgent"}
            />
          ) : (
            renderStageSection(statusTab, activeRowIndex, pipelineStepper)
          )}
        </>
      )}

      <TaskDetailDrawer
        taskId={selectedTaskId}
        open={!!selectedTaskId}
        onOpenChange={(o) => !o && setSelectedTaskId(null)}
        onChange={() => void refetch()}
        onClaimTask={(tid) => {
          setSelectedTaskId(null);
          openClaimOrWarn(tid);
        }}
      />

      <KeyboardShortcutsDialog
        open={shortcutsHelpOpen}
        onOpenChange={setShortcutsHelpOpen}
        shortcuts={shortcuts}
      />

      {canBulk && selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          designers={designers}
          updating={bulkUpdating}
          progress={bulkProgress}
          onAssign={bulkAssign}
          onMove={bulkMove}
          onClear={clearSelection}
        />
      )}

      {kittingTask && (
        <FullKittingModal
          task={kittingTask}
          open={!!kittingTask}
          onOpenChange={(o) => !o && setKittingTask(null)}
          onComplete={() => {
            setKittingTask(null);
            void refetch();
          }}
        />
      )}

      {editTask && (
        <EditTaskDialog
          task={editTask}
          open={!!editTask}
          onOpenChange={(o) => !o && setEditTask(null)}
          onSave={updateTask}
          onSaved={() => {
            setEditTask(null);
            void refetch();
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTask}
        title="Delete this task?"
        description={
          deleteTask
            ? `"${deleteTask.task_code}" will be permanently deleted. This action cannot be undone.`
            : ""
        }
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteTask(null)}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        data={tasks as unknown as Record<string, unknown>[]}
        columns={taskExportColumns as unknown as CsvColumn<Record<string, unknown>>[]}
        defaultFilename="linkd-tasks"
        dateField="created_at"
      />

      {/* Coordinator's Stage A: upload the kitting form photo from the
          task row. Creates a full_kitting_details row with status
          'pending_deo' so the DEO sees it in the Kitting Queue. */}
      <KittingStageADialog
        task={fkDrawerTask}
        open={!!fkDrawerTask}
        onOpenChange={(o) => !o && setFkDrawerTask(null)}
        onChange={() => void refetch()}
      />

      <NewBriefDialog
        open={newBriefOpen}
        onOpenChange={setNewBriefOpen}
        onCreated={() => void refetch()}
      />

      {/* Skip warning — shown when designer picks a non-first pool task */}
      <ConfirmDialog
        open={!!skipWarningTaskId}
        title="Skipping ahead in the queue"
        description={`${skipCount} task${skipCount !== 1 ? "s" : ""} ahead of this one in the pool ${skipCount !== 1 ? "are" : "is"} still unclaimed. Claim this one anyway?`}
        variant="warning"
        confirmLabel="Claim Anyway"
        cancelLabel="Cancel"
        onConfirm={handleSkipConfirm}
        onCancel={() => { setSkipWarningTaskId(null); setSkipCount(0); }}
      />

      {/* FK warning — shown before claim modal when FK is required but not added */}
      <Dialog open={!!fkWarningTaskId} onOpenChange={(o) => !o && setFkWarningTaskId(null)}>
        <DialogContent className="max-w-sm" srTitle="Full Knitting warning">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Full Knitting Not Added Yet
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-6 pb-2">
            <p className="text-sm text-muted-foreground">
              This task requires Full Knitting details, but the coordinator
              hasn&apos;t added them yet.
            </p>
            <p className="text-sm text-muted-foreground">
              You can claim and start working, but you won&apos;t be able to
              mark it complete until the coordinator adds the Full Knitting
              details.
            </p>
          </div>
          <DialogFooter className="flex-col gap-2 px-6 pb-6 sm:flex-col">
            <Button
              onClick={handleFkContinue}
              className="w-full"
            >
              Continue Without Full Knitting
            </Button>
            <Button
              variant="outline"
              onClick={handleFkAskCoordinator}
              disabled={fkNotifying}
              className="w-full"
            >
              {fkNotifying ? "Notifying…" : "Ask Coordinator to Add"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setFkWarningTaskId(null)}
              className="w-full text-muted-foreground"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ClaimTaskModal
        open={claimModalOpen}
        onOpenChange={(o) => {
          setClaimModalOpen(o);
          if (!o) setClaimPreselectedId(undefined);
        }}
        onClaimed={() => {
          // FK coordinator notification + to-do fire ONLY here — on a REAL
          // claim — with the actual claimer, never on "Continue Without FK"
          // intent (a designer who backs out spams nobody).
          const claimedTask = claimPreselectedId
            ? tasks.find((t) => t.id === claimPreselectedId)
            : null;
          if (claimedTask && isFullKittingBlocking(claimedTask)) {
            void flagFkPendingToCoordinator(
              claimedTask.id,
              claimedTask.task_code ?? "a task",
              profile?.full_name ?? "A designer"
            );
          }
          setClaimModalOpen(false);
          setClaimPreselectedId(undefined);
          void refetch();
          void queryClient.invalidateQueries({ queryKey: ["pool-with-ghosts"] });
        }}
        preselectedTaskId={claimPreselectedId}
      />

      <PostDoneModal
        open={!!postDoneTask}
        onOpenChange={(o) => !o && setPostDoneTask(null)}
        task={postDoneTask}
        onCompleted={() => {
          setPostDoneTask(null);
          void refetch();
        }}
      />

      {splitTask && (
        <SplitTaskDialog
          task={splitTask}
          open={!!splitTask}
          onOpenChange={(o) => !o && setSplitTask(null)}
          onSplit={() => {
            setSplitTask(null);
            void refetch();
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Top bar
// ============================================================================

interface TopBarProps {
  role: UserRole;
  myStats: { active: number; completed: number; total: number };
  designers: { id: string; full_name: string }[];
  designerFilter: string;
  setDesignerFilter: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  isAdmin: boolean;
  filter: FilterTab;
  setFilter: (v: FilterTab) => void;
  urgentCount: number;
  dateRange: { from: string | null; to: string | null };
  setDateRange: (v: { from: string | null; to: string | null }) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onExport?: () => void;
  onNewBrief: () => void;
  onOpenShortcuts: () => void;
  /** Column-visibility control, rendered in the action cluster (desktop). */
  columnMenuSlot?: React.ReactNode;
  tableDensity: string;
  onToggleDensity: () => void;
}

function TopBar({
  role,
  myStats,
  designers,
  designerFilter,
  setDesignerFilter,
  search,
  setSearch,
  searchInputRef,
  isAdmin,
  filter,
  setFilter,
  urgentCount,
  dateRange,
  setDateRange,
  onRefresh,
  isRefreshing,
  onExport,
  onNewBrief,
  onOpenShortcuts,
  columnMenuSlot,
  tableDensity,
  onToggleDensity,
}: TopBarProps) {
  const canCreate = canCreateBriefs(role);

  const iconBtn =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50";
  const hasFilters =
    !!search || (isAdmin && (!!designerFilter || !!dateRange.from || !!dateRange.to));

  return (
    <div className="space-y-2 border-b border-border pb-2">
      {/* Row 1: Filter tabs + designer dropdown (scrollable on mobile) */}
      <div className="no-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1">
        <FilterTabs
          value={filter}
          onChange={setFilter}
          urgentCount={urgentCount}
          isAdmin={isAdmin}
        />
        {isAdmin ? (
          <select
            value={designerFilter}
            onChange={(e) => setDesignerFilter(e.target.value)}
            className="h-7 w-[110px] shrink-0 rounded-md border border-border bg-card px-2 text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:w-[140px]"
            aria-label="Filter by designer"
          >
            <option value="">All designers</option>
            {designers.map((d) => (
              <option key={d.id} value={d.id}>{d.full_name}</option>
            ))}
          </select>
        ) : (
          <StatCluster stats={myStats} />
        )}

        {/* Date range — desktop only */}
        {isAdmin && (
          <div className="hidden h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2 sm:flex">
            <Calendar className="h-3 w-3 shrink-0 text-muted-foreground" />
            <input
              type="date"
              value={dateRange.from ?? ""}
              onChange={(e) => setDateRange({ ...dateRange, from: e.target.value || null })}
              className="h-5 w-[88px] min-w-0 border-0 bg-transparent px-0.5 text-[10px] text-foreground outline-none"
              aria-label="From date"
            />
            <span className="text-[9px] text-muted-foreground">–</span>
            <input
              type="date"
              value={dateRange.to ?? ""}
              onChange={(e) => setDateRange({ ...dateRange, to: e.target.value || null })}
              className="h-5 w-[88px] min-w-0 border-0 bg-transparent px-0.5 text-[10px] text-foreground outline-none"
              aria-label="To date"
            />
          </div>
        )}
      </div>

      {/* Row 2: Search + actions — compact single line */}
      <div className="flex items-center gap-1.5">
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setSearch(""); if (isAdmin) { setDesignerFilter(""); setDateRange({ from: null, to: null }); } }}
            title="Clear all filters"
            className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2 text-[10px] font-medium text-muted-foreground hover:border-destructive/40 hover:text-destructive"
          >
            <FilterX className="h-3 w-3" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <SearchInput
            ref={searchInputRef}
            value={search}
            onChange={setSearch}
            placeholder="Search tasks…"
            className="[&_input]:!h-7 [&_input]:!text-[11px] [&_input]:!pl-7"
          />
        </div>
        <button type="button" onClick={onRefresh} disabled={isRefreshing} className={iconBtn} title="Refresh">
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
        </button>
        {columnMenuSlot}
        <div className="hidden sm:flex sm:items-center sm:gap-1.5">
          <button type="button" onClick={onOpenShortcuts} className={iconBtn} title="Keyboard shortcuts">
            <Keyboard className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleDensity}
            className={cn(iconBtn, tableDensity === "compact" && "border-primary/40 bg-primary/10 text-primary")}
            title={tableDensity === "compact" ? "Comfortable rows" : "Compact rows"}
            aria-label="Toggle row density"
          >
            <Rows3 className="h-3.5 w-3.5" />
          </button>
          {onExport && (
            <button type="button" onClick={onExport} className={iconBtn} title="Export CSV">
              <Download className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {canCreate && (
          <Button size="sm" className="h-7 gap-1 px-2.5 text-[11px]" onClick={onNewBrief}>
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New brief</span>
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Bulk action bar — floating, admin/coordinator only
// ============================================================================

interface BulkActionBarProps {
  count: number;
  designers: { id: string; full_name: string }[];
  updating: boolean;
  progress: { done: number; total: number };
  onAssign: (designerId: string) => void | Promise<void>;
  onMove: (status: TaskStatus) => void | Promise<void>;
  onClear: () => void;
}

const BULK_MOVE_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "pool", label: "Pool" },
  { value: "in_progress", label: "In Progress" },
  { value: "full_kitting", label: "Full Knitting" },
  { value: "done", label: "Done" },
];

function BulkActionBar({
  count,
  designers,
  updating,
  progress,
  onAssign,
  onMove,
  onClear,
}: BulkActionBarProps) {
  const pct =
    progress.total > 0 ? (progress.done / progress.total) * 100 : 0;
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className={cn(
        // On mobile, push above the MobileTabBar (h-16) + iOS safe area.
        "fixed left-1/2 z-40 -translate-x-1/2",
        "bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] md:bottom-4",
        "flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-xl",
        "animate-slide-up"
      )}
    >
      <span className="text-sm font-medium text-foreground tabular-nums">
        {count} selected
      </span>

      <span className="h-5 w-px bg-border" aria-hidden />

      {/* Assign to */}
      <select
        defaultValue=""
        disabled={updating}
        onChange={(e) => {
          const id = e.target.value;
          if (!id) return;
          void onAssign(id);
          e.target.value = "";
        }}
        className="h-8 rounded-md border border-border bg-card px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        aria-label="Assign selected tasks to a designer"
      >
        <option value="" disabled>
          Assign to…
        </option>
        {designers.map((d) => (
          <option key={d.id} value={d.id}>
            {d.full_name}
          </option>
        ))}
      </select>

      {/* Move to */}
      <select
        defaultValue=""
        disabled={updating}
        onChange={(e) => {
          const v = e.target.value as TaskStatus | "";
          if (!v) return;
          void onMove(v);
          e.target.value = "";
        }}
        className="h-8 rounded-md border border-border bg-card px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        aria-label="Move selected tasks to a status"
      >
        <option value="" disabled>
          Move to…
        </option>
        {BULK_MOVE_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      {/* Progress while running */}
      {updating && (
        <>
          <span className="h-5 w-px bg-border" aria-hidden />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              Updating {progress.done}/{progress.total}…
            </span>
            <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </>
      )}

      <span className="h-5 w-px bg-border" aria-hidden />

      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        disabled={updating}
      >
        Deselect all
      </Button>
    </div>
  );
}

function StatCluster({
  stats,
}: {
  stats: { active: number; completed: number; total: number };
}) {
  return (
    <div className="flex gap-2 rounded-md border border-border bg-card px-2 py-2 sm:gap-4 sm:px-4">
      <Stat label="Active" value={stats.active} />
      <VDivider />
      <Stat label="Completed" value={stats.completed} />
      <VDivider />
      <Stat label="Total" value={stats.total} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-lg font-semibold tabular-nums text-foreground">
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function VDivider() {
  return <span className="self-stretch border-r border-border" />;
}

// ============================================================================
// Filter tabs
// ============================================================================

function FilterTabs({
  value,
  onChange,
  urgentCount,
  isAdmin,
}: {
  value: FilterTab;
  onChange: (v: FilterTab) => void;
  urgentCount: number;
  isAdmin: boolean;
}) {
  const TABS: { id: FilterTab; label: string }[] = isAdmin
    ? [
        { id: "all", label: "All Tasks" },
        { id: "urgent", label: "Urgent Only" },
      ]
    : [
        { id: "mine", label: "My Tasks" },
        { id: "all", label: "All Tasks" },
        { id: "urgent", label: "Urgent Only" },
      ];
  return (
    <>
      {TABS.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary text-white"
                : "border-border bg-card text-foreground hover:border-primary/40"
            )}
            aria-pressed={active}
          >
            {t.label}
            {t.id === "urgent" && urgentCount > 0 && (
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  active ? "bg-card" : "bg-destructive"
                )}
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </>
  );
}

// ============================================================================
// Status section (header + sortable table)
// ============================================================================

interface SectionProps {
  status: TaskStatus;
  tasks: TaskWithRelations[];
  sort: SortConfig;
  onSortChange: (key: SortKey) => void;
  search: string;
  matchesSearch: Set<string>;
  enteringIds: Set<string>;
  /** Index of the currently keyboard-highlighted row, or -1 for none. */
  activeRowIndex: number;
  /** Admin/coordinator can bulk-select rows. */
  canBulk: boolean;
  selectedIds: Set<string>;
  onToggleRow: (taskId: string, index: number, withShift: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onSelectTask: (id: string) => void;
  onAccept: (t: TaskWithRelations) => void;
  onSelfAssign: (t: TaskWithRelations) => void;
  onAdvance: (t: TaskWithRelations, next: TaskStatus) => void;
  onSubmitReview: (t: TaskWithRelations) => void;
  onComplete: (t: TaskWithRelations) => void;
  onEdit: (t: TaskWithRelations) => void;
  onDelete: (t: TaskWithRelations) => void;
  onFullKitting: (t: TaskWithRelations) => void;
  onSplit: (t: TaskWithRelations) => void;
  /** Inline cell-edit handler (Google Sheets style). */
  onCellUpdate: (
    taskId: string,
    fields: Parameters<ReturnType<typeof useTaskMutations>["updateTask"]>[1]
  ) => Promise<void>;
  /** task_id → kitting status + image path. Drives FK badge color and lets the
   *  badge open the kitting file. Tasks flagged but missing a kitting row
   *  default to "pending". */
  kittingByTask: Map<string, KittingInfo>;
  /** task_id → team info (design types + designer names) from task_assignments. */
  teamInfoByTask: Map<string, TeamInfo>;
  /** Designer roster for the inline assignee picker. */
  designers: { id: string; full_name: string }[];
  currentUserId: string | null;
  role: UserRole;
  isPending: ReturnType<typeof useTaskMutations>["isPending"];
  /** Column keys the viewer wants visible (from useUserPreferences). */
  visibleColumns: string[];
  tableDensity: string;
  /** When set, replaces the default section header — used to mount the
   *  pipeline stepper at the table-header level. */
  headerSlot?: React.ReactNode;
}

function TaskTableSection(props: SectionProps) {
  const { status, tasks, sort, canBulk, selectedIds, onToggleAll, visibleColumns, tableDensity } =
    props;
  const showCol = (key: string) => visibleColumns.includes(key);
  const sorted = useMemo(() => sortTasks(tasks, sort), [tasks, sort]);
  const isMobile = useIsMobile();

  // Header select-all state: count how many visible (sorted) rows are selected.
  const visibleSelectedCount = useMemo(
    () => sorted.reduce((n, t) => n + (selectedIds.has(t.id) ? 1 : 0), 0),
    [sorted, selectedIds]
  );
  const allSelected = sorted.length > 0 && visibleSelectedCount === sorted.length;
  const someSelected =
    visibleSelectedCount > 0 && visibleSelectedCount < sorted.length;

  // Drive the native "indeterminate" property via a ref (HTML attr can't do it).
  const headerCheckRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerCheckRef.current) {
      headerCheckRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      {/* Header — the pipeline stepper when provided, else the classic
          accent stripe + dot/name/count + hint. */}
      {props.headerSlot ? (
        <div className="border-b border-border">{props.headerSlot}</div>
      ) : (
        <>
          <div className={cn("h-[3px]", COLUMN_ACCENT[status])} aria-hidden />
          <div className="flex items-center justify-between border-b border-border bg-card/50 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span
                className={cn("h-2.5 w-2.5 rounded-full", COLUMN_DOT[status])}
                aria-hidden
              />
              <h2 className="text-sm font-semibold text-foreground">
                {STATUS_LABELS[status]}
              </h2>
              <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                {tasks.length}
              </span>
            </div>
            <p className="hidden text-[11px] text-muted-foreground sm:block">
              {SECTION_HINTS[status]}
            </p>
          </div>
        </>
      )}

      {/* Body — mobile: stacked cards. md+: wide horizontal-scrolling table. */}
      {tasks.length === 0 ? (
        <EmptySectionRow status={status} role={props.role} />
      ) : isMobile ? (
        <MobileCardList rows={sorted} sectionProps={props} />
      ) : (
        <div className={cn("overflow-x-auto", props.tableDensity === "compact" && "table-compact")}>
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Tasks organized by status</caption>
            <thead>
              <tr className="border-b border-border bg-secondary/60 text-left text-[11px] font-bold uppercase tracking-wider text-foreground whitespace-nowrap [&>th]:border-r [&>th]:border-border/30 [&>th:last-child]:border-r-0">
                {canBulk && (
                  <th className="w-[32px] px-2 py-2 text-center font-medium">
                    <input
                      ref={headerCheckRef}
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => onToggleAll(e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Select all visible tasks"
                      className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-primary"
                    />
                  </th>
                )}
                {showCol("date") && (
                  <th className="px-3 py-2 text-left font-bold">Briefed</th>
                )}
                {showCol("claimed") && (
                  <th className="px-3 py-2 text-left font-bold">Claimed</th>
                )}
                {showCol("designer") && (
                  <th className="px-3 py-2 text-left font-bold">Designer</th>
                )}
                {showCol("concept") && (
                  <th className="px-3 py-2 text-left font-bold">Concept</th>
                )}
                {showCol("description") && (
                  <th className="w-full px-3 py-2 text-left font-bold">
                    Description
                  </th>
                )}
                {showCol("files") && (
                  <th className="w-[160px] px-3 py-2 text-left font-bold">
                    Reference
                  </th>
                )}
                {showCol("party_name") && (
                  <th className="px-3 py-2 text-left font-bold">Party Name</th>
                )}
                {showCol("fabric") && (
                  <th className="px-3 py-2 text-left font-bold">Fabric</th>
                )}
                {showCol("whatsapp_group") && (
                  <th className="px-3 py-2 text-left font-bold">WhatsApp Group</th>
                )}
                {showCol("message_date") && (
                  <th className="w-[120px] px-3 py-2 text-left font-bold">
                    Message Date
                  </th>
                )}
                {showCol("message_time") && (
                  <th className="w-[100px] px-3 py-2 text-left font-bold">
                    Message Time
                  </th>
                )}
                {showCol("assigned_by") && (
                  <th className="px-3 py-2 text-left font-bold">Assigned By</th>
                )}
                {showCol("qty") && (
                  <th className="w-[80px] px-3 py-2 text-left font-bold">QTY</th>
                )}
                {showCol("deadline") && (
                  <SortableHeader
                    label="Planned Deadline"
                    active={sort.key === "deadline"}
                    dir={sort.dir}
                    onClick={() => props.onSortChange("deadline")}
                    className="w-[150px]"
                  />
                )}
                {showCol("completion_timestamp") && (
                  <th className="w-[150px] px-3 py-2 text-left font-bold">
                    Completion Timestamp
                  </th>
                )}
                {showCol("completed") && (
                  <th className="w-[80px] px-3 py-2 text-left font-bold">
                    Completed
                  </th>
                )}
                {showCol("pending") && (
                  <th className="w-[80px] px-3 py-2 text-left font-bold">Pending</th>
                )}
                {showCol("started_late") && (
                  <th className="w-[110px] px-3 py-2 text-left font-bold">
                    Completed Late
                  </th>
                )}
                {showCol("full_kitting") && (
                  <th className="w-[110px] px-3 py-2 text-left font-bold">
                    Full Kitting
                  </th>
                )}
                <th className="w-[140px] px-3 py-2 text-right font-bold sticky right-0 bg-card shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((task, idx) => (
                <TaskRow
                  key={`${task.id}-${task.status}`}
                  task={task}
                  dimmed={
                    !!props.search && !props.matchesSearch.has(task.id)
                  }
                  entering={props.enteringIds.has(task.id)}
                  active={idx === props.activeRowIndex}
                  selected={selectedIds.has(task.id)}
                  canBulk={canBulk}
                  rowIndex={idx}
                  onToggleSelect={props.onToggleRow}
                  onClick={() => props.onSelectTask(task.id)}
                  onAccept={() => props.onAccept(task)}
                  onSelfAssign={() => props.onSelfAssign(task)}
                  onAdvance={(s) => props.onAdvance(task, s)}
                  onSubmitReview={() => props.onSubmitReview(task)}
                  onComplete={() => props.onComplete(task)}
                  onFullKitting={() => props.onFullKitting(task)}
                  onSplit={() => props.onSplit(task)}
                  onEdit={() => props.onEdit(task)}
                  onDelete={() => props.onDelete(task)}
                  onCellUpdate={(fields) =>
                    props.onCellUpdate(task.id, fields)
                  }
                  designers={props.designers}
                  kittingStatus={
                    props.kittingByTask.get(task.id)?.status ?? null
                  }
                  kittingImageUrl={
                    props.kittingByTask.get(task.id)?.imageUrl ?? null
                  }
                  kittingRecordId={
                    props.kittingByTask.get(task.id)?.id ?? null
                  }
                  teamInfo={
                    props.teamInfoByTask.get(task.id) ?? null
                  }
                  currentUserId={props.currentUserId}
                  role={props.role}
                  isPending={props.isPending}
                  visibleColumns={visibleColumns}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const SECTION_HINTS: Record<TaskStatus, string> = {
  pool: "Anyone can claim from here.",
  todo: "Assigned and waiting to start.",
  in_progress: "Work underway · 'Done' tasks await fabric before completing.",
  full_kitting: "Waiting on admin review.",
  approved: "",
  sampling: "",
  done: "Design finished — add fabric and click Complete to finish.",
  completed: "Fully completed.",
};

// ============================================================================
// Mobile card list (< md). Renders below the wide table on phones.
// ============================================================================

function MobileCardList({
  rows,
  sectionProps,
}: {
  rows: TaskWithRelations[];
  sectionProps: SectionProps;
}) {
  return (
    <ul className="flex flex-col gap-1.5 px-2 py-2">
      {rows.map((task, idx) => (
        <MobileTaskCard
          key={`${task.id}-${task.status}`}
          task={task}
          index={idx}
          sectionProps={sectionProps}
        />
      ))}
    </ul>
  );
}

function MobileTaskCard({
  task,
  index,
  sectionProps,
}: {
  task: TaskWithRelations;
  index: number;
  sectionProps: SectionProps;
}) {
  const {
    canBulk,
    selectedIds,
    onToggleRow,
    onSelectTask,
    onAccept,
    onSelfAssign,
    onAdvance,
    onSubmitReview,
    onComplete,
    onFullKitting,
    currentUserId,
    role,
    isPending,
  } = sectionProps;

  const isMine = currentUserId !== null && task.assigned_to === currentUserId;
  const isUnassigned = !task.assigned_to;
  const isAdmin = isAdminRole(role);
  const isUrgent = task.priority === "urgent";
  const selected = selectedIds.has(task.id);

  const ctas = getCtasForRow({
    task,
    role,
    isMine,
    isUnassigned,
    isAdmin,
    // Section-level handlers expect the task object; bind per-card.
    onAccept: () => onAccept(task),
    onSelfAssign: () => onSelfAssign(task),
    onAdvance: (s) => onAdvance(task, s),
    onSubmitReview: () => onSubmitReview(task),
    onComplete: () => onComplete(task),
    onFullKitting: () => onFullKitting(task),
  });

  return (
    <li
      onClick={() => onSelectTask(task.id)}
      title={task.task_code}
      className={cn(
        "rounded-lg border border-border border-l-[3px] bg-card p-2.5 shadow-sm transition-colors active:scale-[0.99]",
        "hover:bg-card/80 active:bg-card/60 cursor-pointer",
        selected && "bg-primary/[0.04] ring-1 ring-primary/40",
        task.status === "done" ? "border-l-success"
          : task.status === "in_progress" ? "border-l-primary"
          : task.status === "approved" ? "border-l-warning"
          : isUrgent ? "border-l-destructive"
          : "border-l-muted-foreground/40",
        isUrgent && !selected && "border-destructive/30"
      )}
    >
      {/* Row 1 — brief title (design type / description) + priority. The
          task_code is intentionally NOT the visible label — it's meaningless
          to users — and lives only in the card's title tooltip (§8.9). */}
      <div className="flex items-start gap-2">
        {canBulk && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) =>
              onToggleRow(
                task.id,
                index,
                (e.nativeEvent as MouseEvent).shiftKey
              )
            }
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select task ${task.task_code}`}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-primary"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-medium text-foreground">
            {task.concept?.trim() || task.description?.trim() || "Untitled brief"}
            {(() => {
              const ti = sectionProps.teamInfoByTask.get(task.id);
              if (!ti && !task.is_split) return null;
              const dt = ti?.designTypes ?? [];
              const names = ti?.designers.map(d => d.name) ?? [];
              return (
                <>
                  {dt.length > 0 && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      {dt.join(", ")}
                    </span>
                  )}
                  {names.length > 0 && (
                    <Badge className="ml-1 inline-flex items-center gap-0.5 align-middle text-[8px] bg-primary/10 text-primary border-primary/20 px-1 py-0">
                      <Users className="h-2.5 w-2.5" />
                      {names.join(", ")}
                    </Badge>
                  )}
                </>
              );
            })()}
          </p>
          {/* Show the brief description as a sub-line when it isn't already the title. */}
          {task.concept?.trim() && task.description?.trim() && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {task.description}
            </p>
          )}
        </div>
        <Badge
          className={cn(
            "shrink-0 text-[10px]",
            PRIORITY_COLORS[task.priority]
          )}
        >
          {PRIORITY_LABELS[task.priority]}
        </Badge>
      </div>

      {/* Row 2 — brief meta: party · fabric · qty · group */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
        <span className="min-w-0 max-w-full truncate font-medium text-foreground/80">
          {task.client?.party_name ?? (task.brief_type === "ld" ? "LD Silk Mills" : "—")}
        </span>
        {(task.fabric || task.completion_fabric) && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className="truncate">{task.fabric || task.completion_fabric}</span>
          </>
        )}
        <span className="text-muted-foreground/40">·</span>
        <span className="whitespace-nowrap">Qty {task.qty}</span>
        {task.whatsapp_group && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className="truncate">{task.whatsapp_group}</span>
          </>
        )}
      </div>

      {/* Row 3 — assignee + deadline */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {task.assignee ? (
            <>
              <Avatar className="h-6 w-6">
                {task.assignee.avatar_url ? (
                  <AvatarImage src={task.assignee.avatar_url} />
                ) : null}
                <AvatarFallback className="text-[9px]">
                  {getInitials(task.assignee.full_name)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate text-xs text-foreground">
                {task.assignee.full_name}
              </span>
            </>
          ) : (
            <span className="text-xs italic text-muted-foreground">Open</span>
          )}
        </div>
        <DeadlineCell deadline={task.planned_deadline} />
      </div>

      {/* Row 4 — status chip + CTAs */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
        <Badge className={cn("text-[10px]", STATUS_COLORS[task.status])}>
          {STATUS_LABELS[task.status]}
        </Badge>
        <div
          className="flex flex-wrap items-center justify-end gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {ctas.slice(0, 2).map((cta) => {
            const pending = cta.pendingOp
              ? isPending(cta.pendingOp, task.id)
              : false;
            const Icon = cta.icon;
            return (
              <button
                key={cta.label}
                type="button"
                onClick={cta.onClick}
                disabled={pending}
                className={cn(
                  "inline-flex min-h-[40px] items-center gap-1 rounded-md px-3 text-xs font-medium transition-colors disabled:opacity-50",
                  CTA_CLASSES[cta.variant]
                )}
                aria-label={cta.label}
              >
                <Icon className="h-3.5 w-3.5" />
                {cta.label}
              </button>
            );
          })}
        </div>
      </div>
    </li>
  );
}

// ----------------- empty state row -----------------

function EmptySectionRow({
  status,
  role,
}: {
  status: TaskStatus;
  role: UserRole;
}) {
  const copy: Record<TaskStatus, string> = {
    pool: "No tasks in the open pool.",
    todo: "No tasks assigned to you yet.",
    in_progress: "No active work right now.",
    full_kitting: "No designs waiting for review.",
    approved: "—",
    sampling: "—",
    done: "Finished designs awaiting fabric will appear here.",
    completed: "Fully completed designs will appear here.",
  };
  const hint =
    role === "designer" && status === "todo" ? (
      <span className="ml-1 text-muted-foreground/80">
        Check the Open Pool above.
      </span>
    ) : null;
  return (
    <div className="flex items-center gap-3 px-4 py-5 text-sm text-muted-foreground">
      <Inbox className="h-4 w-4 text-muted-foreground/70" />
      <span>
        {copy[status]}
        {hint}
      </span>
    </div>
  );
}

// ----------------- sortable header -----------------

function SortableHeader({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={cn("px-3 py-2 text-left font-bold", className)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider transition-colors",
          active ? "text-foreground" : "hover:text-foreground"
        )}
        aria-pressed={active}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ChevronUp className="h-3 w-3 opacity-30" />
        )}
      </button>
    </th>
  );
}

// ----------------- sort helper -----------------

function sortTasks(tasks: TaskWithRelations[], sort: SortConfig) {
  const order = sort.dir === "asc" ? 1 : -1;
  const sorted = [...tasks];
  sorted.sort((a, b) => {
    switch (sort.key) {
      case "code":
        return order * a.task_code.localeCompare(b.task_code);
      case "qty":
        return order * (a.qty - b.qty);
      case "priority": {
        const rank = { urgent: 3, high: 2, normal: 1, low: 0 } as const;
        return (
          order *
          ((rank[b.priority] ?? 0) - (rank[a.priority] ?? 0))
        );
      }
      case "deadline":
      default: {
        const av = a.planned_deadline
          ? new Date(a.planned_deadline).getTime()
          : Number.POSITIVE_INFINITY;
        const bv = b.planned_deadline
          ? new Date(b.planned_deadline).getTime()
          : Number.POSITIVE_INFINITY;
        return order * (av - bv);
      }
    }
  });
  return sorted;
}

// ============================================================================
// Task row
// ============================================================================

interface RowProps {
  task: TaskWithRelations;
  dimmed: boolean;
  entering: boolean;
  /** When true the row is the current keyboard-highlighted row. */
  active: boolean;
  /** Whether the row is in the bulk-selection set. */
  selected: boolean;
  /** True when the viewer is admin/coordinator (renders checkbox cell). */
  canBulk: boolean;
  /** Index of this row within the sorted/visible list (for shift-click). */
  rowIndex: number;
  onToggleSelect: (taskId: string, rowIndex: number, withShift: boolean) => void;
  onClick: () => void;
  onAccept: () => void;
  onSelfAssign: () => void;
  onAdvance: (status: TaskStatus) => void;
  onSubmitReview: () => void;
  onComplete: () => void;
  onFullKitting: () => void;
  onSplit: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCellUpdate: (
    fields: Parameters<ReturnType<typeof useTaskMutations>["updateTask"]>[1]
  ) => Promise<void>;
  designers: { id: string; full_name: string }[];
  /** Kitting data_entry_status for this row, or null if no kitting record
   *  exists. Drives the FK badge color (red=pending, blue=completed). */
  kittingStatus: KittingStatus | null;
  /** Kitting file path (sample-files bucket) so the FK badge can open it. */
  kittingImageUrl: string | null;
  /** Kitting record ID — used to link to the form view. */
  kittingRecordId: string | null;
  /** Team info (design types + designer names) from assignment rows, or null. */
  teamInfo: TeamInfo | null;
  currentUserId: string | null;
  role: UserRole;
  isPending: ReturnType<typeof useTaskMutations>["isPending"];
  /** Column keys the viewer wants visible (must match thead gating). */
  visibleColumns: string[];
}

// ----------------- inline cell editor (Google Sheets style) -----------------

type EditableCellValue = string | number | null;

interface EditableCellProps {
  value: EditableCellValue;
  type?: "text" | "number" | "date" | "textarea" | "select";
  options?: ReadonlyArray<{ value: string; label: string }>;
  canEdit: boolean;
  pending?: boolean;
  onSave: (next: EditableCellValue) => Promise<void> | void;
  placeholder?: string;
  align?: "left" | "right" | "center";
  display?: React.ReactNode;
  maxWidth?: string;
}

function EditableCell({
  value,
  type = "text",
  options,
  canEdit,
  pending,
  onSave,
  placeholder = "—",
  align = "left",
  display,
  maxWidth,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(
    value == null ? "" : String(value)
  );
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  >(null);

  useEffect(() => {
    if (editing) {
      setDraft(value == null ? "" : String(value));
      // Focus + select on next tick so the field is ready immediately.
      const id = window.setTimeout(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        if (
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement
        ) {
          try {
            el.select();
          } catch {
            /* select() not supported on some input types (date, etc.) */
          }
        }
      }, 0);
      return () => window.clearTimeout(id);
    }
    return;
  }, [editing, value]);

  async function commit() {
    const current = value == null ? "" : String(value);
    if (draft === current) {
      setEditing(false);
      return;
    }
    let next: EditableCellValue = draft;
    if (type === "number") {
      if (draft.trim() === "") {
        next = null;
      } else {
        const n = Number(draft);
        if (!Number.isFinite(n)) {
          setEditing(false);
          return;
        }
        next = n;
      }
    } else if (type === "select") {
      next = draft;
    } else {
      next = draft.trim() === "" ? null : draft;
    }
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  const inputClass = cn(
    "block w-full rounded-md border border-primary bg-card px-2 py-1 text-[12px] text-foreground outline-none ring-2 ring-primary/30",
    align === "right" && "text-right",
    align === "center" && "text-center"
  );

  if (!canEdit) {
    return (
      <span
        className={cn(
          "block px-2 py-1 text-[12px]",
          align === "right" && "text-right",
          align === "center" && "text-center",
          maxWidth && "truncate"
        )}
        style={maxWidth ? { maxWidth } : undefined}
      >
        {display ??
          (value == null || value === "" ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            <>{value}</>
          ))}
      </span>
    );
  }

  if (editing) {
    if (type === "select" && options) {
      return (
        <select
          ref={(el) => {
            inputRef.current = el;
          }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          disabled={saving}
          className={inputClass}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    if (type === "textarea") {
      return (
        <textarea
          ref={(el) => {
            inputRef.current = el;
          }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void commit();
            }
          }}
          onClick={(e) => e.stopPropagation()}
          disabled={saving}
          rows={2}
          className={inputClass}
        />
      );
    }
    return (
      <input
        ref={(el) => {
          inputRef.current = el;
        }}
        type={type === "number" ? "number" : type === "date" ? "date" : "text"}
        inputMode={type === "number" ? "numeric" : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        disabled={saving}
        className={inputClass}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!pending && !saving) setEditing(true);
      }}
      disabled={pending || saving}
      title="Click to edit"
      className={cn(
        "block w-full rounded-md border border-transparent px-2 py-1 text-[12px] transition-colors",
        "hover:border-border hover:bg-background/60 focus:border-primary focus:outline-none",
        align === "right" && "text-right",
        align === "center" && "text-center",
        maxWidth && "truncate"
      )}
      style={maxWidth ? { maxWidth } : undefined}
    >
      {display ??
        (value == null || value === "" ? (
          <span className="text-muted-foreground">{placeholder}</span>
        ) : (
          <>{value}</>
        ))}
    </button>
  );
}

/** Reference-file chips for the task table. Each opens a short-lived signed
 *  URL in a new tab. Stops click propagation so it doesn't open the row. */
// Open a storage object in a new tab via a short-lived signed URL.
async function openStorageFile(
  bucket: string,
  storagePath: string | null | undefined,
  emptyMsg = "File path missing."
) {
  if (!storagePath) {
    toast.error(emptyMsg);
    return;
  }
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60 * 5);
  if (error || !data) {
    toast.error("Could not open file.");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

// Reference files live in `design-files`; full-knitting forms in `sample-files`.
const openDesignFile = (path: string | null | undefined) =>
  openStorageFile("design-files", path);
const openFullKittingFile = (path: string | null | undefined) =>
  openStorageFile(
    "sample-files",
    path,
    "Full knitting form hasn't been uploaded yet."
  );

function RefFilesCell({
  files,
}: {
  files: { id: string; file_name: string; storage_url?: string | null }[];
}) {
  if (!files || files.length === 0) {
    return <span className="text-[12px] text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {files.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => void openDesignFile(f.storage_url)}
          title={f.file_name}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="max-w-[90px] truncate">{f.file_name}</span>
        </button>
      ))}
    </div>
  );
}

function TaskRow({
  task,
  dimmed,
  entering,
  active,
  selected,
  canBulk,
  rowIndex,
  onToggleSelect,
  onClick,
  onAccept,
  onSelfAssign,
  onAdvance,
  onSubmitReview,
  onComplete,
  onFullKitting,
  onSplit,
  onEdit,
  onDelete,
  onCellUpdate,
  designers,
  kittingStatus,
  kittingImageUrl,
  kittingRecordId,
  teamInfo,
  currentUserId,
  role,
  isPending,
  visibleColumns,
}: RowProps) {
  const showCol = (key: string) => visibleColumns.includes(key);
  const isMine = currentUserId !== null && task.assigned_to === currentUserId;
  const isUnassigned = !task.assigned_to;
  const isAdmin = isAdminRole(role);
  const canEditCell = isAdmin || isMine;
  const cellPending = isPending("updateTask", task.id);
  const isUrgent = task.priority === "urgent";

  // Scroll the highlighted row into view as the user pages with J/K.
  const rowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (active && rowRef.current) {
      rowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [active]);

  const ctas = getCtasForRow({
    task,
    role,
    isMine,
    isUnassigned,
    isAdmin,
    onAccept,
    onSelfAssign,
    onAdvance,
    onSubmitReview,
    onComplete,
    onFullKitting,
  });

  const opPending = (op: TaskMutationOp) =>
    isPending(op, task.id);

  return (
    <tr
      ref={rowRef}
      tabIndex={0}
      role="button"
      aria-label={`Open ${task.task_code}`}
      aria-selected={active || selected || undefined}
      data-zebra={rowIndex % 2 === 1 ? "alt" : "primary"}
      // Click anywhere on the row → open the task detail popup. Action
      // cells inside (checkbox, ⋮ menu, ctas) stop propagation themselves
      // so they don't trigger this. Keyboard equivalent: Enter / Space.
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group cursor-pointer border-b border-border/40 transition-colors [&>td]:border-r [&>td]:border-border/20 [&>td:last-child]:border-r-0",
        rowIndex % 2 === 1 && "bg-background/40",
        "hover:bg-primary/[0.04] focus-within:bg-primary/[0.05] focus:outline-none",
        // Urgent rows get a red left edge + faint wash so they stand out at a
        // glance (inset shadows — don't fight the zebra/hover backgrounds).
        isUrgent && "row-urgent",
        entering && "animate-highlight-pulse",
        active && "ring-2 ring-inset ring-primary",
        selected && "bg-primary/[0.06]",
        active && !selected && "bg-primary/[0.06]",
        dimmed && "opacity-30 pointer-events-none"
      )}
    >
      {/* Bulk-select checkbox (admin / coordinator only) */}
      {canBulk && (
        <td
          className="w-[32px] px-2 py-1.5 text-center align-middle"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) =>
              onToggleSelect(
                task.id,
                rowIndex,
                (e.nativeEvent as MouseEvent).shiftKey
              )
            }
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select task ${task.task_code}`}
            className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-primary"
          />
        </td>
      )}

      {/* 1a. Briefed (created_at — when task was assigned to pool) */}
      {showCol("date") && (
        <td className="whitespace-nowrap px-3 py-1.5 text-left align-middle text-[12px] font-medium text-foreground">
          {formatDateTime(task.created_at)}
        </td>
      )}
      {/* 1b. Claimed (started_at — when designer claimed the task) */}
      {showCol("claimed") && (
        <td className="whitespace-nowrap px-3 py-1.5 text-left align-middle text-[12px] font-medium text-foreground">
          {task.started_at ? formatDateTime(task.started_at) : "—"}
        </td>
      )}

      {/* All cells below are read-only. Click the row to open the task
          detail popup where everything is editable in one place. Every cell
          is left-aligned + uses consistent padding for a clean grid feel. */}

      {/* 2. Designer */}
      {showCol("designer") && (
      <td className="px-3 py-1.5 text-left align-middle">
        {task.assignee ? (
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2 whitespace-nowrap">
              <Avatar className="h-6 w-6">
                {task.assignee.avatar_url ? (
                  <AvatarImage src={task.assignee.avatar_url} />
                ) : null}
                <AvatarFallback className="text-[9px]">
                  {getInitials(task.assignee.full_name)}
                </AvatarFallback>
              </Avatar>
              <span className="max-w-[120px] truncate text-xs text-foreground">
                {task.assignee.full_name}
              </span>
            </span>
            {task.carry_forwarder && (
              <span className="whitespace-nowrap pl-8 text-[10px] text-muted-foreground" title={`Previously assigned to ${task.carry_forwarder.full_name}`}>
                from {task.carry_forwarder.full_name}
              </span>
            )}
          </div>
        ) : teamInfo && teamInfo.designers.length > 0 ? (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <Users className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="max-w-[160px] truncate text-xs text-foreground">
              {teamInfo.designers.map((d) => d.name).join(", ")}
            </span>
          </span>
        ) : (
          <span className="text-xs italic text-muted-foreground">Open</span>
        )}
      </td>
      )}

      {/* 3. Concept — shows concept name + design types from assignments.
            FK lives in its own FULL KITTING column, not here. */}
      {showCol("concept") && (() => {
        const conceptParts = task.concept ? task.concept.split(",").map((s) => s.trim()).filter(Boolean) : [];
        return (
      <td className="px-3 py-1.5 text-left align-middle">
        {/* Single-line cell — keep concept pills, source badge & design types on
            one row so every row stays the same height (no wrapping). */}
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          {conceptParts.length > 0 ? (
            <div className="flex gap-1">
              {conceptParts.map((p) => (
                <span key={p} className="rounded-md border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[11px] font-medium text-foreground whitespace-nowrap">
                  {p}
                </span>
              ))}
            </div>
          ) : (
            <span className="font-medium text-foreground whitespace-nowrap">{task.concept || "—"}</span>
          )}
          <ExternalOriginBadge source={task.external_source} refId={task.external_ref_id} />
          {teamInfo && teamInfo.designTypes.length > 0 && (
            <span
              className="whitespace-nowrap text-[11px] text-muted-foreground"
              title={teamInfo.designTypes.length > 3 ? teamInfo.designTypes.join(", ") : undefined}
            >
              {teamInfo.designTypes.length <= 3
                ? teamInfo.designTypes.join(", ")
                : `${teamInfo.designTypes.slice(0, 3).join(", ")} +${teamInfo.designTypes.length - 3}`}
            </span>
          )}
          {task.status === "done" && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-success"
              title="Design done — add fabric to complete"
            >
              <Check className="h-2.5 w-2.5" />
              Done
            </span>
          )}
        </div>
      </td>
        );
      })()}

      {/* 4. Description — greedy column: absorbs the table's slack so every
          other column hugs its content. max-w-0 + w-full lets the inner span
          truncate to whatever width is left. */}
      {showCol("description") && (
      <td className="w-full max-w-0 px-3 py-1.5 text-left align-middle text-[12px] font-medium text-foreground">
        <span className="block truncate" title={task.description ?? ""}>
          {task.description || "—"}
        </span>
      </td>
      )}

      {/* 4b. Reference Files */}
      {showCol("files") && (
      <td
        className="w-[160px] px-3 py-1.5 text-left align-middle"
        onClick={(e) => e.stopPropagation()}
      >
        <RefFilesCell files={task.files ?? []} />
      </td>
      )}

      {/* 5. Party Name */}
      {showCol("party_name") && (
      <td className="whitespace-nowrap px-3 py-1.5 text-left align-middle font-medium text-foreground">
        {task.client?.party_name ?? (task.brief_type === "ld" ? "LD Silk Mills" : "—")}
      </td>
      )}

      {/* 6. Fabric — show brief-level fabric, or fall back to completion_fabric.
          Multi-values (comma-joined from MultiCombobox) render as inline pills. */}
      {showCol("fabric") && (() => {
        const raw = task.fabric?.trim() || task.completion_fabric?.trim();
        const parts = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
        return (
          <td className="px-3 py-1.5 text-left align-middle">
            {parts.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {parts.map((p) => (
                  <span key={p} className="rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] text-foreground whitespace-nowrap">
                    {p}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-[12px] text-muted-foreground">—</span>
            )}
          </td>
        );
      })()}

      {/* 8. WhatsApp Group */}
      {showCol("whatsapp_group") && (
      <td className="whitespace-nowrap px-3 py-1.5 text-left align-middle text-[12px] font-medium text-foreground">
        {task.whatsapp_group || "—"}
      </td>
      )}

      {/* 8b. Message Date (whatsapp_received_date) */}
      {showCol("message_date") && (
      <td className="whitespace-nowrap px-3 py-1.5 text-left align-middle text-[12px] font-medium text-foreground">
        {formatDateOnly(task.whatsapp_received_date)}
      </td>
      )}

      {/* 8c. Message Time (whatsapp_received_time) */}
      {showCol("message_time") && (
      <td className="whitespace-nowrap px-3 py-1.5 text-left align-middle text-[12px] tabular-nums font-medium text-foreground">
        {formatTimeOnly(task.whatsapp_received_time)}
      </td>
      )}

      {/* 11. Assigned By */}
      {showCol("assigned_by") && (
      <td className="whitespace-nowrap px-3 py-1.5 text-left align-middle text-[12px] font-medium text-foreground">
        {task.assigned_by || "—"}
      </td>
      )}

      {/* 12. QTY */}
      {showCol("qty") && (
      <td className="whitespace-nowrap px-3 py-1.5 text-left align-middle tabular-nums text-foreground">
        {task.qty}M
      </td>
      )}

      {/* 12b. Planned Deadline — single line to match the other date columns.
          Severity dot + date; the date text only takes a warning/danger colour
          when due-today/overdue so it doesn't shout in the normal case. */}
      {showCol("deadline") && (() => {
        const days = daysUntil(task.planned_deadline);
        const sev = daysSeverity(days);
        const urgent = sev === "overdue" || sev === "today" || sev === "critical";
        return (
          <td className="whitespace-nowrap px-3 py-1.5 text-left align-middle text-[12px]">
            {task.planned_deadline ? (
              <span className="flex items-center gap-1.5 tabular-nums">
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    DAYS_DOT_CLASS[sev]
                  )}
                  aria-hidden
                />
                <span className={urgent ? DAYS_TEXT_CLASS[sev] : "text-foreground"}>
                  {formatDateOnly(task.planned_deadline)}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </td>
        );
      })()}

      {/* 13. Completion Timestamp */}
      {showCol("completion_timestamp") && (
      <td className="w-[150px] whitespace-nowrap px-3 py-1.5 text-left align-middle text-[12px] font-medium text-foreground">
        {task.status === "done" || task.status === "completed"
          ? formatDateTime(task.completion_filled_at ?? task.updated_at)
          : "—"}
      </td>
      )}

      {/* 14. Completed */}
      {showCol("completed") && (
      <td className="whitespace-nowrap px-3 py-1.5 text-left align-middle tabular-nums text-[12px]">
        {task.qty_completed ?? 0}
      </td>
      )}

      {/* 15. Pending (derived) */}
      {showCol("pending") && (
      <td className="whitespace-nowrap px-3 py-1.5 text-left align-middle tabular-nums text-[12px] font-medium text-foreground">
        {Math.max(0, (task.qty ?? 0) - (task.qty_completed ?? 0))}
      </td>
      )}

      {/* Done? checkbox removed — completion is now driven from inside the
          task detail popup. Click the row to open it, then mark complete. */}

      {/* 17. Completed Late — completion date later than the planned deadline. */}
      {showCol("started_late") && (
      <td className="px-3 py-1.5 text-left align-middle">
        {isCompletedLate(task) ? (
          <Badge className="bg-destructive/10 text-destructive border border-destructive/40 px-1.5 py-0 text-[10px]">
            Yes
          </Badge>
        ) : (
          <span className="text-[11px] text-muted-foreground">No</span>
        )}
      </td>
      )}

      {/* 18. Full Kitting — 3-state badge: green (added), amber (pending), or "No" */}
      {showCol("full_kitting") && (() => {
        const fkAdded = isFullKittingAdded(task);
        const fkRequired = task.requires_full_kitting;
        const fkPath = kittingImageUrl ?? task.full_kitting_image_url;
        const isCompleted = kittingStatus === "completed";

        if (!fkRequired && !fkAdded && kittingStatus == null) {
          return (
            <td className="px-3 py-1.5 text-left align-middle">
              <span className="text-[11px] text-muted-foreground">No</span>
            </td>
          );
        }

        if (fkAdded) {
          return (
            <td className="px-3 py-1.5 text-left align-middle">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (fkPath) void openFullKittingFile(fkPath);
                  if (isCompleted && kittingRecordId) {
                    window.open(kittingDetailPath(kittingRecordId), "_blank", "noopener");
                  }
                }}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition-colors",
                  isCompleted
                    ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                    : "border-success/30 bg-success/10 text-success hover:bg-success/20"
                )}
                title={
                  isCompleted
                    ? "DEO digitized — click to open form"
                    : fkPath
                      ? "Full Knitting added — click to open"
                      : "Full Knitting added"
                }
              >
                <Layers className="h-3 w-3" />
                FK ✓
              </button>
            </td>
          );
        }

        return (
          <td className="px-3 py-1.5 text-left align-middle">
            <span
              className="inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning"
              title="Full Knitting required — not yet added"
            >
              <Layers className="h-3 w-3" />
              FK pending
            </span>
          </td>
        );
      })()}

      {/* Action — sticky right edge, single row, never wraps */}
      <td
        className="sticky right-0 bg-card px-3 py-1.5 align-middle shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
          {/* Status CTAs (Accept/Claim/Completed) — icon-only when space tight */}
          {ctas.map((cta) => {
            const Icon = cta.icon;
            const pending = cta.pendingOp ? opPending(cta.pendingOp) : false;
            return (
              <button
                key={cta.label}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  cta.onClick();
                }}
                disabled={pending}
                title={cta.label}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors disabled:opacity-50",
                  CTA_CLASSES[cta.variant]
                )}
              >
                {pending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Icon className="h-3 w-3" />
                )}
                {cta.label}
              </button>
            );
          })}

          {/* ⋮ Dropdown — View / Edit / Split / Full Kitting / Delete */}
          <RowActionMenu
            role={role}
            task={task}
            isMine={isMine}
            onView={onClick}
            onEdit={onEdit}
            onDelete={onDelete}
            onFullKitting={onFullKitting}
            onSplit={onSplit}
          />
        </div>
      </td>
    </tr>
  );
}

// ----------------- CTA decision -----------------

type CtaVariant = "gold" | "ink" | "emerald" | "outline";

interface Cta {
  label: string;
  variant: CtaVariant;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  pendingOp?: "assign" | "selfAssign" | "markDone" | "updateStatus" | "complete";
}

const CTA_CLASSES: Record<CtaVariant, string> = {
  gold: "bg-primary text-foreground hover:bg-primary/90",
  ink: "bg-primary text-white hover:bg-primary/90",
  emerald: "bg-success text-white hover:bg-success/90",
  outline: "border border-border bg-card text-foreground hover:bg-secondary",
};

function getCtasForRow(args: {
  task: TaskWithRelations;
  role: UserRole;
  isMine: boolean;
  isUnassigned: boolean;
  isAdmin: boolean;
  onAccept: () => void;
  onSelfAssign: () => void;
  onAdvance: (s: TaskStatus) => void;
  onSubmitReview: () => void;
  onComplete: () => void;
  onFullKitting: () => void;
}): Cta[] {
  const {
    task,
    role,
    isMine,
    isUnassigned,
    isAdmin,
    onAccept,
    onSelfAssign,
    onAdvance,
    onSubmitReview,
    onComplete,
    onFullKitting,
  } = args;

  switch (task.status) {
    case "pool":
      if (role === "designer" && (isUnassigned || !task.started_at)) {
        return [
          {
            label: "Claim",
            // `ink` = bg-primary + white text (was `gold` = dark text on purple).
            variant: "ink",
            icon: HandPlatter,
            onClick: onSelfAssign,
            pendingOp: "selfAssign",
          },
        ];
      }
      return [];

    case "todo":
      if (isMine || isAdmin) {
        return [
          {
            label: "Start",
            variant: "ink",
            icon: Play,
            onClick: () => onAdvance("in_progress"),
            pendingOp: "updateStatus",
          },
        ];
      }
      return [];

    case "in_progress":
      return [];

    case "full_kitting":
      return [];

    case "done":
      return [];

    // 'completed' is terminal — no row action.
    default:
      return [];
  }
}

// ============================================================================
// Mini progress bar
// ============================================================================

// ============================================================================
// Row action ⋮ dropdown — View, Edit, Delete
// ============================================================================

function RowActionMenu({
  role,
  task,
  isMine,
  onView,
  onEdit,
  onDelete,
  onFullKitting,
  onSplit,
}: {
  role: UserRole;
  task: TaskWithRelations;
  isMine: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFullKitting: () => void;
  onSplit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  const isAdmin = isAdminOrCoordinator(role);
  const canEdit = isAdmin || isMine;
  const canDelete = isAdmin || isMine;

  // Flag-sampling-later (completed tasks). flagSamplingRequired self-invalidates
  // the tasks + samples queries, so the row + Pending Samples badge refresh.
  const navigate = useNavigate();
  const { flagSamplingRequired } = useTaskMutations();
  const [samplingConfirmOpen, setSamplingConfirmOpen] = useState(false);
  const [flaggingSampling, setFlaggingSampling] = useState(false);

  async function handleConfirmSampling() {
    setFlaggingSampling(true);
    const { error } = await flagSamplingRequired(task.id);
    setFlaggingSampling(false);
    setSamplingConfirmOpen(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Added to sampling queue");
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on scroll (the table is scrollable)
  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener("scroll", handler, true);
    return () => window.removeEventListener("scroll", handler, true);
  }, [open]);

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    // Position the portal-rendered menu next to the trigger button
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const menuHeight = 160; // approximate
      const openUp = spaceBelow < menuHeight;
      setPos({
        top: openUp ? rect.top - menuHeight : rect.bottom + 4,
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
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-border hover:bg-secondary hover:text-foreground"
        aria-label="Task actions"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {open &&
        ReactDOM.createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            className="z-[9999] min-w-[150px] overflow-hidden rounded-lg border border-border bg-card py-1 shadow-xl animate-fade-in"
          >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onView();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
          >
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            View Details
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onEdit();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              Edit Task
            </button>
          )}
          {/* Split Task / Manage Split — admin/coordinator only, qty > 1. */}
          {isAdmin && task.qty > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                if (task.is_split) {
                  onView();
                } else {
                  onSplit();
                }
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
            >
              <Scissors className="h-3.5 w-3.5 text-muted-foreground" />
              {task.is_split ? "Manage Split" : "Split Task"}
            </button>
          )}
          {/* Full Kitting — admin/coordinator only. Opens the Stage A dialog
              (upload form photo → kitting record → DEO queue). */}
          {isAdminRole(role) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onFullKitting();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
            >
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              Full Knitting
            </button>
          )}
          {/* Flag sampling later — completed, not-yet-flagged, NON-split tasks.
              Gated on canEdit (owner designer or admin/coordinator) so a
              non-permitted viewer doesn't hit an RLS denial. Split tasks are
              sampled per-portion (each portion's own fabric/design), so the
              parent-level flag is hidden for them. */}
          {canEdit && task.status === "completed" && !task.sampling_required && !task.is_split && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                setSamplingConfirmOpen(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
            >
              <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
              Mark Sampling Required
            </button>
          )}
          {task.status === "completed" && task.sampling_required && (
            // Coordinators/admins can jump to the Sampling queue; designers
            // can't open /sampling (admin/coord-only route → "Access restricted"),
            // so for them this is a non-clickable "already flagged" confirmation.
            isAdmin ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  navigate("/sampling");
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-success transition-colors hover:bg-success/10"
              >
                <FlaskConical className="h-3.5 w-3.5" />
                Sampling Flagged ✓
              </button>
            ) : (
              <div className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-success">
                <FlaskConical className="h-3.5 w-3.5" />
                Sampling Flagged ✓
              </div>
            )
          )}
          {canDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Task
            </button>
          )}
          </div>,
          document.body
        )}

      <ConfirmDialog
        open={samplingConfirmOpen}
        title="Add this task to the sampling queue?"
        description={`"${task.concept || task.task_code || "This task"}" will be flagged for sampling and added to the Sampling queue. The task stays completed.`}
        confirmLabel={flaggingSampling ? "Adding…" : "Add to Sampling"}
        onConfirm={() => void handleConfirmSampling()}
        onCancel={() => setSamplingConfirmOpen(false)}
      />
    </>
  );
}

// FullKnittingCells removed — Full Kitting now opens from the row ⋮ menu
// (see RowActionMenu's "Full Kitting" item). The two table columns it
// rendered are gone; coordinator/admin trigger the Stage A dialog via
// the action menu, which loads existing kitting status on demand.

function MiniProgress({ done, total }: { done: number; total: number }) {
  const pct = Math.min(100, (done / total) * 100);
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <div className="h-1 w-14 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[9px] tabular-nums text-muted-foreground">
        {done}/{total}
      </span>
    </div>
  );
}

// ============================================================================
// Skeleton loader
// ============================================================================

function TableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded bg-secondary" />
        <div className="h-3 w-72 animate-pulse rounded bg-secondary" />
      </div>
      <div className="space-y-4">
        {DASHBOARD_STATUSES.map((status, i) => (
          <div
            key={status}
            className="overflow-hidden rounded-lg border border-border bg-card animate-fade-in"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className={cn("h-[3px]", COLUMN_ACCENT[status])} />
            <div className="flex items-center gap-2 border-b border-border bg-card/50 px-4 py-2.5">
              <span className={cn("h-2.5 w-2.5 rounded-full", COLUMN_DOT[status])} />
              <span className="text-sm font-semibold text-foreground">
                {STATUS_LABELS[status]}
              </span>
            </div>
            <div className="space-y-2 p-3">
              <SkeletonText lines={3} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
