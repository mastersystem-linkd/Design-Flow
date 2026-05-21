import { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
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
  Pencil,
  Trash2,
  Eye,
  RefreshCw,
  Download,
  Keyboard,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import { useProfiles } from "@/hooks/useProfiles";
import { useTaskMutations, type TaskMutationOp } from "@/hooks/useTaskMutations";
import { TaskDetailDrawer } from "@/components/tasks/TaskDetailDrawer";
import { KeyboardShortcutsDialog } from "@/components/ui/KeyboardShortcutsDialog";
import {
  useKeyboardShortcuts,
  type Shortcut,
} from "@/hooks/useKeyboardShortcuts";
import { FullKittingModal } from "@/components/tasks/FullKittingModal";
import { FullKittingDrawer } from "@/components/tasks/FullKittingDrawer";
import { EditTaskDialog } from "@/components/tasks/EditTaskDialog";
import { NewBriefDialog } from "@/views/BriefingView";
import {
  Badge,
  Button,
  SkeletonText,
  SearchInput,
  EmptyState,
  ConfirmDialog,
  ExportDialog,
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
import { ROUTES } from "@/lib/routes";
import { cn, formatDate } from "@/lib/utils";
import { isAdminOrCoordinator } from "@/lib/permissions";

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

/** Time-only (HH:MM, 24-hour) component of a timestamp. */
function formatTimeOfDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
import type {
  TaskStatus,
  TaskWithRelations,
  UserRole,
} from "@/types/database";

function isAdminRole(role: UserRole | null | undefined): boolean {
  return isAdminOrCoordinator(role);
}

type FilterTab = "mine" | "all" | "urgent";

/**
 * Statuses shown on /dashboard. Only 4 tabs — full_kitting is handled
 * internally (tasks auto-advance through it). `approved` and `sampling`
 * live elsewhere.
 */
const DASHBOARD_STATUSES: readonly TaskStatus[] = [
  "pool",
  "todo",
  "in_progress",
  "done",
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
// Top-level view
// ============================================================================

export function KanbanView() {
  const { profile, user } = useAuth();
  const { tasks, isLoading, error, refetch } = useTasks();
  const {
    assignTask,
    updateTaskStatus,
    selfAssignTask,
    markTaskDone,
    updateTask,
    deleteTask: deleteTaskMutation,
    isPending,
  } = useTaskMutations();
  const { profiles: designers } = useProfiles({
    roles: ["designer"],
  });

  const role: UserRole = profile?.role ?? "designer";
  const isAdmin = isAdminRole(role);

  // URL params support deep-linking from dashboard KPI cards. We read once on
  // mount (or whenever the search-string changes) and seed the filter/state.
  // Local UI mutations don't write back — the URL is treated as the entry
  // intent, not a live mirror of the user's clicks.
  const [searchParams] = useSearchParams();
  const urlStatus = searchParams.get("status") as TaskStatus | null;
  const urlFilter = searchParams.get("filter") as FilterTab | null;
  const urlOverdue = searchParams.get("overdue") === "1";
  const urlFrom = searchParams.get("from"); // ISO yyyy-mm-dd
  const urlTo = searchParams.get("to");
  const urlDesigner = searchParams.get("designer"); // profile id

  const [filter, setFilter] = useState<FilterTab>(
    urlFilter ?? defaultFilterForRole(role)
  );
  const [statusTab, setStatusTab] = useState<TaskStatus>(
    urlStatus ?? defaultStatusTabForRole(role)
  );
  const [designerFilter, setDesignerFilter] = useState<string>(urlDesigner ?? "");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStatus, urlFilter, urlOverdue, urlFrom, urlTo, urlDesigner]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [kittingTask, setKittingTask] = useState<TaskWithRelations | null>(null);
  const [editTask, setEditTask] = useState<TaskWithRelations | null>(null);
  const [deleteTask, setDeleteTask] = useState<TaskWithRelations | null>(null);
  const [fkDrawerTask, setFkDrawerTask] = useState<TaskWithRelations | null>(null);
  const [newBriefOpen, setNewBriefOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

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
    setRefreshing(false);
  }

  const taskExportColumns: CsvColumn<TaskWithRelations>[] = [
    { key: "task_code", label: "Task Code" },
    { key: "concept", label: "Concept" },
    { key: "client", label: "Client", transform: (v) => (v as any)?.party_name ?? "" },
    { key: "fabric", label: "Fabric" },
    { key: "assignee", label: "Designer", transform: (v) => (v as any)?.full_name ?? "Unassigned" },
    { key: "status", label: "Status" },
    { key: "priority", label: "Priority" },
    { key: "assigned_at", label: "Assigned Date" },
    { key: "planned_deadline", label: "Deadline" },
    { key: "completed_at", label: "Completed Date" },
    { key: "delay_days", label: "Delay Days", transform: (v) => v != null ? String(v) : "" },
    { key: "qty", label: "Qty (m)", transform: (v) => v != null ? String(v) : "" },
    { key: "qty_completed", label: "Completed", transform: (v) => v != null ? String(v) : "" },
    { key: "requires_full_kitting", label: "Full Knitting" },
    { key: "mtr", label: "Mtr", transform: (v) => v != null ? String(v) : "" },
  ];

  // One sort config per status section.
  const [sorts, setSorts] = useState<Record<TaskStatus, SortConfig>>(() => ({
    pool: DEFAULT_SORT,
    todo: DEFAULT_SORT,
    in_progress: DEFAULT_SORT,
    full_kitting: DEFAULT_SORT,
    approved: DEFAULT_SORT, // unused but keeps the record total
    sampling: DEFAULT_SORT, // unused
    done: { key: "deadline", dir: "desc" },
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
  }, [tasks, filter, user?.id, role, isAdmin, designerFilter, overdueOnly, dateRange]);

  /** Search MATCHES — used for opacity dimming, not filtering. */
  const matchesSearch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return new Set<string>();
    const matches = new Set<string>();
    for (const t of scoped) {
      const haystack = [
        t.task_code,
        t.concept,
        t.client?.party_name ?? "",
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
    };
    for (const t of scoped) {
      // Merge full_kitting tasks into the "In Progress" tab
      if (t.status === "full_kitting") {
        map.in_progress.push(t);
      } else {
        map[t.status].push(t);
      }
    }
    return map;
  }, [scoped]);

  /**
   * Sorted tasks for the currently visible tab, mirroring what
   * `TaskTableSection` renders. Used by keyboard shortcuts (J/K/Enter) to
   * map `activeRowIndex` back to a real task.
   */
  const visibleTasks = useMemo(
    () => sortTasks(grouped[statusTab] ?? [], sorts[statusTab]),
    [grouped, statusTab, sorts]
  );

  const myStats = useMemo(() => {
    if (!user?.id) return { active: 0, done: 0, total: 0 };
    const mine = tasks.filter((t) => t.assigned_to === user.id);
    return {
      total: mine.length,
      active: mine.filter((t) =>
        ["todo", "in_progress", "full_kitting"].includes(t.status)
      ).length,
      done: mine.filter((t) => t.status === "done").length,
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

  /** Designer self-assigns from the Pool. */
  async function handleSelfAssign(task: TaskWithRelations) {
    const { error } = await selfAssignTask(task.id);
    if (error) {
      toast.error(error);
      return;
    }
    await refetch();
    markEntering(task.id);
    toast.success("Task claimed! It's on your board now.");
  }

  async function handleAdvance(task: TaskWithRelations, next: TaskStatus) {
    // If advancing to 'done', use markTaskDone (calculates delay_days) then
    // open the FullKittingModal to ask about kitting.
    if (next === "done") {
      const { data, error } = await markTaskDone(task.id);
      if (error) {
        toast.error(error);
        return;
      }
      await refetch();
      markEntering(task.id);
      // Open the kitting modal — pass the UPDATED task (with completed_at etc.)
      setKittingTask(data ? { ...task, ...data } : task);
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
    const hasFile = (task.files?.length ?? 0) > 0;
    if (!hasFile) {
      toast.info("Upload your design file before submitting.");
      setSelectedTaskId(task.id);
      return;
    }
    void handleAdvance(task, "full_kitting");
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
    // Tab shortcuts: 1 → first status, 2 → second, etc.
    DASHBOARD_STATUSES.forEach((status, idx) => {
      list.push({
        key: String(idx + 1),
        category: "Tabs",
        description: `Switch to ${STATUS_LABELS[status]}`,
        handler: () => setStatusTab(status),
      });
    });
    return list;
  }, [visibleTasks, activeRowIndex, selectedTaskId]);

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

  // ----------------- Loading state -----------------
  if (isLoading && tasks.length === 0) {
    return <TableSkeleton />;
  }

  const totalCount = scoped.length;
  const hasAny = totalCount > 0;

  return (
    <div className="space-y-5">
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
        onRefresh={handleRefresh}
        isRefreshing={refreshing}
        onExport={isAdmin ? () => setExportOpen(true) : undefined}
        onNewBrief={() => setNewBriefOpen(true)}
        onOpenShortcuts={() => setShortcutsHelpOpen(true)}
      />

      {/* Deep-link filter chips. Shown only when arriving from a dashboard
          KPI/badge click — gives the user a visible "this list is filtered"
          signal + a one-click clear. Without this, an overdue/date-range
          filter silently shrinks the table and looks like missing data. */}
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
          <StatusTabs
            value={statusTab}
            onChange={setStatusTab}
            counts={DASHBOARD_STATUSES.reduce(
              (acc, s) => ({ ...acc, [s]: grouped[s]?.length ?? 0 }),
              {} as Record<TaskStatus, number>
            )}
          />
          <TaskTableSection
            key={statusTab}
            status={statusTab}
            tasks={grouped[statusTab]}
            sort={sorts[statusTab]}
            onSortChange={(k) => updateSort(statusTab, k)}
            search={search}
            matchesSearch={matchesSearch}
            enteringIds={enteringIds}
            activeRowIndex={activeRowIndex}
            onSelectTask={setSelectedTaskId}
            onAccept={handleAccept}
            onSelfAssign={handleSelfAssign}
            onAdvance={handleAdvance}
            onSubmitReview={handleSubmitForReview}
            onEdit={setEditTask}
            onDelete={setDeleteTask}
            onFullKitting={setFkDrawerTask}
            currentUserId={user?.id ?? null}
            role={role}
            isPending={isPending}
            canBulk={canBulk}
            selectedIds={selectedIds}
            onToggleRow={toggleRowSelection}
            onToggleAll={toggleAllVisible}
          />
        </>
      )}

      <TaskDetailDrawer
        taskId={selectedTaskId}
        open={!!selectedTaskId}
        onOpenChange={(o) => !o && setSelectedTaskId(null)}
        onChange={() => void refetch()}
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

      <FullKittingDrawer
        task={fkDrawerTask}
        open={!!fkDrawerTask}
        onOpenChange={(o) => !o && setFkDrawerTask(null)}
        onSaved={() => {
          setFkDrawerTask(null);
          void refetch();
        }}
      />

      <NewBriefDialog
        open={newBriefOpen}
        onOpenChange={setNewBriefOpen}
        onCreated={() => void refetch()}
      />
    </div>
  );
}

// ============================================================================
// Top bar
// ============================================================================

interface TopBarProps {
  role: UserRole;
  myStats: { active: number; done: number; total: number };
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
  onRefresh: () => void;
  isRefreshing: boolean;
  onExport?: () => void;
  onNewBrief: () => void;
  onOpenShortcuts: () => void;
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
  onRefresh,
  isRefreshing,
  onExport,
  onNewBrief,
  onOpenShortcuts,
}: TopBarProps) {
  const canCreate = isAdminOrCoordinator(role);

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:flex-1">
        <div className="md:max-w-sm md:flex-1">
          <SearchInput
            ref={searchInputRef}
            value={search}
            onChange={setSearch}
            placeholder="Search task ID, concept, client, or designer…"
          />
        </div>
        <FilterTabs
          value={filter}
          onChange={setFilter}
          urgentCount={urgentCount}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenShortcuts}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          title="Keyboard shortcuts (?)"
          aria-label="Open keyboard shortcuts"
        >
          <Keyboard className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
        </button>
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Export CSV"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        )}
        {isAdmin ? (
          <select
            value={designerFilter}
            onChange={(e) => setDesignerFilter(e.target.value)}
            className="h-9 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Filter by designer"
          >
            <option value="">All designers</option>
            {designers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </select>
        ) : (
          <StatCluster stats={myStats} />
        )}
        {canCreate && (
          <Button size="sm" className="gap-2" onClick={onNewBrief}>
            <Plus className="h-4 w-4" />
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
  { value: "todo", label: "To-Do" },
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
  stats: { active: number; done: number; total: number };
}) {
  return (
    <div className="flex gap-4 rounded-md border border-border bg-card px-4 py-2">
      <Stat label="Active" value={stats.active} />
      <VDivider />
      <Stat label="Done" value={stats.done} />
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
}: {
  value: FilterTab;
  onChange: (v: FilterTab) => void;
  urgentCount: number;
}) {
  const TABS: { id: FilterTab; label: string }[] = [
    { id: "mine", label: "My Tasks" },
    { id: "all", label: "All Tasks" },
    { id: "urgent", label: "Urgent Only" },
  ];
  return (
    <div className="inline-flex flex-wrap gap-1.5">
      {TABS.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
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
                  active ? "bg-card animate-pulse" : "bg-destructive"
                )}
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Status tabs (single-section switcher)
// ============================================================================

function StatusTabs({
  value,
  onChange,
  counts,
}: {
  value: TaskStatus;
  onChange: (s: TaskStatus) => void;
  counts: Record<TaskStatus, number>;
}) {
  return (
    <div
      role="tablist"
      aria-label="Task status"
      className="flex flex-wrap gap-1.5 border-b border-border pb-0"
    >
      {DASHBOARD_STATUSES.map((s) => {
        const active = s === value;
        const count = counts[s] ?? 0;
        return (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(s)}
            className={cn(
              "relative inline-flex items-center gap-2 rounded-t-md border border-b-0 px-3.5 py-2 text-sm font-medium transition-colors -mb-px",
              active
                ? "border-border bg-card text-foreground"
                : "border-transparent bg-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <span
              className={cn("h-2 w-2 rounded-full", COLUMN_DOT[s])}
              aria-hidden
            />
            {STATUS_LABELS[s]}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                active
                  ? "bg-primary text-white"
                  : "bg-secondary text-muted-foreground"
              )}
            >
              {count}
            </span>
            {active && (
              <span
                className={cn(
                  "absolute inset-x-0 -top-px h-[2px]",
                  COLUMN_ACCENT[s]
                )}
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
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
  onEdit: (t: TaskWithRelations) => void;
  onDelete: (t: TaskWithRelations) => void;
  onFullKitting: (t: TaskWithRelations) => void;
  currentUserId: string | null;
  role: UserRole;
  isPending: ReturnType<typeof useTaskMutations>["isPending"];
}

function TaskTableSection(props: SectionProps) {
  const { status, tasks, sort, canBulk, selectedIds, onToggleAll } = props;
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
      {/* Accent stripe */}
      <div className={cn("h-[3px]", COLUMN_ACCENT[status])} aria-hidden />

      {/* Header */}
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

      {/* Body — mobile: stacked cards. md+: wide horizontal-scrolling table. */}
      {tasks.length === 0 ? (
        <EmptySectionRow status={status} role={props.role} />
      ) : isMobile ? (
        <MobileCardList rows={sorted} sectionProps={props} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[2800px] text-sm">
            <caption className="sr-only">Tasks organized by status</caption>
            <thead>
              <tr className="border-b border-border bg-card/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">
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
                <th className="px-3 py-2 font-medium">Date/Time</th>
                <th className="px-3 py-2 font-medium">Designer</th>
                <th className="px-3 py-2 font-medium">Concept</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">Party Name</th>
                <th className="px-3 py-2 font-medium">Fabric</th>
                <SortableHeader
                  label="Mtr"
                  active={sort.key === "qty"}
                  dir={sort.dir}
                  onClick={() => props.onSortChange("qty")}
                  className="w-[70px] px-3 py-2"
                />
                <th className="px-3 py-2 font-medium">WhatsApp Group</th>
                <th className="w-[120px] px-3 py-2 font-medium">Date</th>
                <th className="w-[80px] px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Assigned By</th>
                <th className="w-[80px] px-3 py-2 font-medium">QTY</th>
                <SortableHeader
                  label="Due Date"
                  active={sort.key === "deadline"}
                  dir={sort.dir}
                  onClick={() => props.onSortChange("deadline")}
                  className="w-[130px] px-3 py-2"
                />
                <th className="px-3 py-2 font-medium">Completion Timestamp</th>
                <th className="w-[80px] px-3 py-2 font-medium">Completed</th>
                <th className="w-[80px] px-3 py-2 font-medium">Pending</th>
                <th className="w-[70px] px-3 py-2 font-medium">Done?</th>
                <th className="w-[90px] px-3 py-2 font-medium">Started Late</th>
                <th className="w-[80px] px-3 py-2 font-medium">Full Knitting</th>
                <th className="px-3 py-2 font-medium">FK Form</th>
                <th className="w-[180px] px-3 py-2 text-right font-medium sticky right-0 bg-card/30">
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
                  onFullKitting={() => props.onFullKitting(task)}
                  onEdit={() => props.onEdit(task)}
                  onDelete={() => props.onDelete(task)}
                  currentUserId={props.currentUserId}
                  role={props.role}
                  isPending={props.isPending}
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
  in_progress: "Work underway.",
  full_kitting: "Waiting on admin review.",
  approved: "",
  sampling: "",
  done: "Wrapped up.",
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
    <ul className="flex flex-col gap-2 p-3">
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
    onFullKitting: () => onFullKitting(task),
  });

  return (
    <li
      onClick={() => onSelectTask(task.id)}
      className={cn(
        "rounded-xl border border-border bg-card p-3 transition-colors",
        "hover:bg-card/80 active:bg-card/60 cursor-pointer",
        selected && "bg-primary/[0.04] ring-1 ring-primary/40",
        isUrgent && !selected && "border-destructive/30"
      )}
    >
      {/* Row 1 — concept name + priority chip */}
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
        <p className="line-clamp-1 flex-1 text-sm font-medium text-foreground">
          {task.concept || task.task_code}
        </p>
        <Badge
          className={cn(
            "shrink-0 text-[10px]",
            PRIORITY_COLORS[task.priority]
          )}
        >
          {PRIORITY_LABELS[task.priority]}
        </Badge>
      </div>

      {/* Row 2 — client · fabric */}
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {task.client?.party_name ?? "—"}
        {task.fabric && <> · {task.fabric}</>}
      </p>

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
    done: "Completed designs will appear here.",
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
    <th className={cn("font-medium", className)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 transition-colors",
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
  onFullKitting: () => void;
  onEdit: () => void;
  onDelete: () => void;
  currentUserId: string | null;
  role: UserRole;
  isPending: ReturnType<typeof useTaskMutations>["isPending"];
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
  onFullKitting,
  onEdit,
  onDelete,
  currentUserId,
  role,
  isPending,
}: RowProps) {
  const isMine = currentUserId !== null && task.assigned_to === currentUserId;
  const isUnassigned = !task.assigned_to;
  const isAdmin = isAdminRole(role);
  const fileCount = task.files?.length ?? 0;
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
    onFullKitting,
  });

  const opPending = (op: TaskMutationOp) =>
    isPending(op, task.id);

  return (
    <tr
      ref={rowRef}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      aria-selected={active || selected || undefined}
      className={cn(
        "group cursor-pointer border-b border-border/60 transition-colors",
        "hover:bg-card/60 focus:bg-card/60 focus:outline-none",
        entering && "animate-highlight-pulse",
        active && "ring-2 ring-inset ring-primary",
        // Bulk-selection tint (separate from the keyboard active ring so both
        // can coexist visually).
        selected && "bg-primary/[0.04]",
        // Keep the soft tint when keyboard-active but not bulk-selected.
        active && !selected && "bg-primary/[0.04]",
        dimmed && "opacity-30 pointer-events-none"
      )}
    >
      {/* Bulk-select checkbox (admin / coordinator only) */}
      {canBulk && (
        <td
          className="w-[32px] px-2 py-3 text-center align-middle"
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

      {/* 1. Date/Time (created_at) */}
      <td className="whitespace-nowrap px-3 py-3 align-middle text-[12px] text-muted-foreground">
        {formatDateTime(task.created_at)}
      </td>

      {/* 2. Designer */}
      <td className="px-3 py-3 align-middle whitespace-nowrap">
        {task.assignee ? (
          <div className="flex items-center gap-2">
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
          </div>
        ) : (
          <span className="text-xs italic text-muted-foreground">Open</span>
        )}
      </td>

      {/* 3. Concept */}
      <td className="px-3 py-3 align-middle">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="font-medium text-foreground">{task.concept}</span>
          {fileCount > 0 && (
            <span
              className="flex items-center gap-0.5 text-[10px] text-muted-foreground"
              title={`${fileCount} file${fileCount === 1 ? "" : "s"}`}
            >
              <Paperclip className="h-3 w-3" />
              {fileCount}
            </span>
          )}
        </div>
      </td>

      {/* 4. Description */}
      <td className="px-3 py-3 align-middle text-[12px] text-muted-foreground">
        <span className="block max-w-[260px] truncate" title={task.description ?? ""}>
          {task.description || "—"}
        </span>
      </td>

      {/* 5. Party Name */}
      <td className="px-3 py-3 align-middle text-muted-foreground whitespace-nowrap">
        {task.client?.party_name ?? "—"}
      </td>

      {/* 6. Fabric */}
      <td className="px-3 py-3 align-middle whitespace-nowrap">
        <span className="rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] text-foreground">
          {task.fabric}
        </span>
      </td>

      {/* 7. Mtr */}
      <td className="px-3 py-3 align-middle tabular-nums text-[12px]">
        {task.mtr != null ? task.mtr : "—"}
      </td>

      {/* 8. WhatsApp Group */}
      <td className="px-3 py-3 align-middle text-[12px] text-muted-foreground whitespace-nowrap">
        {task.whatsapp_group || "—"}
      </td>

      {/* 9. Date — when the coordinator added the task (created_at) */}
      <td className="whitespace-nowrap px-3 py-3 align-middle text-[12px]">
        {formatDate(task.created_at)}
      </td>

      {/* 10. Time — when the coordinator added the task (created_at) */}
      <td className="px-3 py-3 align-middle tabular-nums text-[12px] text-muted-foreground whitespace-nowrap">
        {formatTimeOfDay(task.created_at)}
      </td>

      {/* 11. Assigned By */}
      <td className="px-3 py-3 align-middle text-[12px] text-muted-foreground whitespace-nowrap">
        {task.assigned_by || "—"}
      </td>

      {/* 12. QTY */}
      <td className="px-3 py-3 align-middle tabular-nums text-foreground whitespace-nowrap">
        {task.qty}M
      </td>

      {/* 12b. Due Date */}
      <td className="px-3 py-3 align-middle whitespace-nowrap">
        <DeadlineCell deadline={task.planned_deadline} />
      </td>

      {/* 13. Completion Timestamp */}
      <td className="px-3 py-3 align-middle text-[12px] text-muted-foreground whitespace-nowrap">
        {task.status === "done" ? formatDateTime(task.updated_at) : "—"}
      </td>

      {/* 14. How many Completed */}
      <td className="px-3 py-3 align-middle tabular-nums text-[12px]">
        {task.qty_completed ?? 0}
      </td>

      {/* 15. Pending */}
      <td className="px-3 py-3 align-middle tabular-nums text-[12px]">
        {Math.max(0, (task.qty ?? 0) - (task.qty_completed ?? 0))}
      </td>

      {/* 16. Tickbox if completed */}
      <td className="px-3 py-3 align-middle text-center">
        {task.status === "done" ? (
          <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-success bg-success text-white">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        ) : (
          <span className="inline-block h-4 w-4 rounded border border-border" />
        )}
      </td>

      {/* 17. Started Late */}
      <td className="px-3 py-3 align-middle">
        {task.started_late ? (
          <Badge className="bg-destructive/10 text-destructive border border-destructive/40 px-1.5 py-0 text-[10px]">
            Yes
          </Badge>
        ) : (
          <span className="text-[11px] text-muted-foreground">No</span>
        )}
      </td>

      {/* 19 + 20. Full Knitting toggle + FK Form (shared optimistic state)
          `canEdit` gates the editable <select>: per RLS, designers can only
          update tasks they're assigned to (or created). Letting them toggle
          a row they don't own triggers the "Cannot coerce" RLS error in the
          UPDATE→SELECT chain. Admins/coordinators see the toggle everywhere. */}
      <FullKnittingCells
        task={task}
        isAdmin={isAdmin}
        canEdit={isAdmin || isMine}
        onFullKitting={onFullKitting}
      />

      {/* Action (sticky to right edge) */}
      <td
        className="px-3 py-3 align-middle text-right sticky right-0 bg-card/95 backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
          {/* Status CTAs (Accept/Start/Submit/Completed/Claim) */}
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
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
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

          {/* ⋮ Dropdown — Edit / Delete / View */}
          <RowActionMenu
            role={role}
            onView={onClick}
            onEdit={onEdit}
            onDelete={onDelete}
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
  pendingOp?: "assign" | "selfAssign" | "markDone" | "updateStatus";
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
    onFullKitting,
  } = args;

  switch (task.status) {
    case "pool":
      // Admin uses "Accept" (assigns via dropdown). Designers use "Claim".
      if (isAdmin && isUnassigned) {
        return [
          {
            label: "Accept",
            variant: "gold",
            icon: HandPlatter,
            onClick: onAccept,
            pendingOp: "assign",
          },
        ];
      }
      // Designer can self-assign if task is unassigned or started_at is null
      if (role === "designer" && (isUnassigned || !task.started_at)) {
        return [
          {
            label: "Claim",
            variant: "gold",
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
      if (isMine || isAdmin) {
        return [
          {
            label: "Completed",
            variant: "gold",
            icon: Send,
            onClick: onSubmitReview,
            pendingOp: "updateStatus",
          },
        ];
      }
      return [];

    case "full_kitting":
      if (isAdmin) {
        // Concept-track briefs need the Approve / Request Revision pair —
        // they're in the "Design Approval" stage of the concept pipeline.
        // Regular tasks just have a single "Completed" CTA.
        const isConceptTrack =
          (task.concept ?? "").trim().toLowerCase() === "concepts";
        if (isConceptTrack) {
          return [
            {
              label: "Approve",
              variant: "emerald",
              icon: Check,
              onClick: () => onAdvance("done"),
              pendingOp: "updateStatus",
            },
            {
              label: "Revise",
              variant: "outline",
              icon: ArrowRight,
              onClick: () => onAdvance("in_progress"),
              pendingOp: "updateStatus",
            },
          ];
        }
        return [
          {
            label: "Completed",
            variant: "emerald",
            icon: Check,
            onClick: () => onAdvance("done"),
            pendingOp: "updateStatus",
          },
        ];
      }
      return [];

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
  onView,
  onEdit,
  onDelete,
}: {
  role: UserRole;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  const canEdit = isAdminOrCoordinator(role);
  const canDelete = isAdminOrCoordinator(role);

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
        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Task actions"
      >
        <MoreVertical className="h-4 w-4" />
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
    </>
  );
}

// ============================================================================
// Full Knitting cell — toggle + conditional sub-fields
// ============================================================================

// ── Full Knitting toggle + FK Form (renders 2 <td> elements with shared state) ──

function FullKnittingCells({
  task,
  isAdmin,
  canEdit,
  onFullKitting,
}: {
  task: TaskWithRelations;
  isAdmin: boolean;
  /**
   * Whether the current user is allowed to update this task's full_kitting
   * fields. False for designers viewing a teammate's or pool task — they
   * should see the value but not get an editable control that would error
   * on submit (RLS hides the SELECT-after-UPDATE row → "Cannot coerce").
   */
  canEdit: boolean;
  onFullKitting: () => void;
}) {
  const { updateTask } = useTaskMutations();
  const [toggling, setToggling] = useState(false);
  const [localYes, setLocalYes] = useState<boolean | null>(null);

  const isYes = localYes ?? !!task.requires_full_kitting;

  useEffect(() => { setLocalYes(null); }, [task.requires_full_kitting]);

  async function handleToggle(value: string) {
    const newVal = value === "yes";
    if (newVal === isYes) return;

    setLocalYes(newVal);
    setToggling(true);

    if (newVal) {
      const { error } = await updateTask(task.id, { requires_full_kitting: true });
      if (error) { setLocalYes(null); toast.error(error); }
    } else {
      const { error } = await updateTask(task.id, {
        requires_full_kitting: false,
        full_kitting_image_url: null,
        full_kitting_notes: null,
      });
      if (error) { setLocalYes(null); toast.error(error); }
    }
    setToggling(false);
  }

  return (
    <>
      {/* Full Knitting toggle (editable only when user owns the task or is admin) */}
      <td className="px-3 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
        {canEdit ? (
          <select
            value={isYes ? "yes" : "no"}
            onChange={(e) => void handleToggle(e.target.value)}
            disabled={toggling}
            className={cn(
              "h-7 rounded-md border px-1.5 text-[11px] font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-ring",
              isYes
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground",
              toggling && "opacity-50"
            )}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        ) : (
          <span
            className={cn(
              "inline-flex h-7 items-center rounded-md border px-2 text-[11px] font-medium",
              isYes
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-secondary/40 text-muted-foreground"
            )}
            title="Only the task's assignee or an admin can change this."
          >
            {isYes ? "Yes" : "No"}
          </span>
        )}
      </td>

      {/* FK Form — appears instantly when Yes; shows saved data if submitted */}
      <td className="px-3 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
        {isYes ? (
          <div className="space-y-1 animate-fade-in">
            {/* Show saved notes summary if any */}
            {task.full_kitting_notes && (
              <span
                className="block max-w-[180px] truncate text-[10px] text-muted-foreground"
                title={task.full_kitting_notes}
              >
                {task.full_kitting_notes}
              </span>
            )}
            {/* Show file indicator if uploaded */}
            {task.full_kitting_image_url && (
              <span className="inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-[10px] text-success border border-success/30">
                <Check className="h-3 w-3" />
                File attached
              </span>
            )}
            {/* Knitting Form button — non-owners get a read-only "View"
                variant only when a kitting record exists; otherwise hidden. */}
            {canEdit ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onFullKitting(); }}
                className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary transition-colors hover:bg-primary/20"
              >
                <Plus className="h-3 w-3" />
                {task.full_kitting_submitted_at ? "View / Edit" : "Knitting Form"}
              </button>
            ) : task.full_kitting_submitted_at ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onFullKitting(); }}
                className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-secondary/80"
              >
                View
              </button>
            ) : null}
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground">—</span>
        )}
      </td>
    </>
  );
}

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
