import { useMemo, useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import {
  HandPlatter,
  Loader2,
  MoreVertical,
  Eye,
  Pencil,
  Trash2,
  Inbox,
  Check,
  Paperclip,
  Scissors,
  Users,
  CircleDot,
  Circle,
  Layers,
} from "lucide-react";
import {
  Badge,
  toast,
} from "@/components/ui";
import { usePoolWithGhosts, getMonday } from "@/hooks/useTasks";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { PRIORITY_LABELS, PRIORITY_COLORS } from "@/lib/constants";
import { isAdminOrCoordinator } from "@/lib/permissions";
import { isFullKittingBlocking } from "@/lib/taskHelpers";
import { supabase } from "@/lib/supabase";
import type { TaskWithRelations, UserRole } from "@/types/database";

// ============================================================================
// Types
// ============================================================================

export interface PoolQueueTableProps {
  /** Called when a designer clicks "Claim". queuePosition is 0-based index
   *  in the visual claimable queue (this-week first, carry-over second). */
  onClaimTask: (taskId: string, queuePosition: number) => void;
  /** Called when any row is clicked to open the task detail drawer. */
  onViewTask: (task: TaskWithRelations) => void;
  /** Called when the Edit action is chosen from the row menu. */
  onEditTask?: (task: TaskWithRelations) => void;
  /** Called when the Delete action is chosen from the row menu. */
  onDeleteTask?: (task: TaskWithRelations) => void;
  /** Called when admin clicks "Split Task" from the row menu. */
  onSplitTask?: (task: TaskWithRelations) => void;
  /** The pipeline stepper JSX to render as the table header. */
  headerSlot?: React.ReactNode;
  /** Table density class — "compact" or "comfortable". */
  tableDensity?: string;
}

// ============================================================================
// Helpers
// ============================================================================

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

async function openStorageFile(
  bucket: string,
  storagePath: string | null | undefined,
  emptyMsg = "File not found."
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

const openDesignFile = (path: string | null | undefined) =>
  openStorageFile("design-files", path);

// ============================================================================
// Main component
// ============================================================================

export function PoolQueueTable({
  onClaimTask,
  onViewTask,
  onEditTask,
  onDeleteTask,
  onSplitTask,
  headerSlot,
  tableDensity,
}: PoolQueueTableProps) {
  const { profile, user } = useAuth();
  const role: UserRole = profile?.role ?? "designer";
  const isAdmin = isAdminOrCoordinator(role);
  const isDesigner = role === "designer";

  const { tasks, ghostIds, isLoading, error } = usePoolWithGhosts();

  // Fetch assignment designer names + qty for any task that could be split.
  // Broadened to all tasks with qty > 1 so we catch stale is_split / qty_remaining.
  const [splitAssignments, setSplitAssignments] = useState<Record<string, { name: string; qty: number }[]>>({});
  useEffect(() => {
    const candidateIds = tasks
      .filter((t) => t.qty > 1 || t.is_split || (t.qty_remaining != null && t.qty_remaining < t.qty))
      .map((t) => t.id);
    if (candidateIds.length === 0) { setSplitAssignments({}); return; }
    void supabase
      .from("task_assignments")
      .select("task_id, qty_assigned, designer:profiles!task_assignments_designer_id_fkey(full_name)")
      .in("task_id", candidateIds)
      .then(({ data }) => {
        const map: Record<string, { name: string; qty: number }[]> = {};
        for (const row of data ?? []) {
          const name = (row.designer as any)?.full_name ?? "Unknown";
          if (!map[row.task_id]) map[row.task_id] = [];
          map[row.task_id].push({ name, qty: row.qty_assigned });
        }
        setSplitAssignments(map);
      });
  }, [tasks]);

  // Skip confirmation is now handled by the parent (openClaimOrWarn in KanbanView).

  // Compute the current Monday for section headers
  const currentMonday = useMemo(() => getMonday(new Date()), []);
  const currentMondayStr = currentMonday.toISOString().split("T")[0];

  // Split tasks into "This Week" vs "Carry Over" by the BRIEFED date
  // (created_at) — the date shown in the table — so a task briefed THIS week
  // can never appear under "Carry Over". (The old `pool_week_start` could drift
  // from the visible date, making a this-week task read as last-week's.) These
  // groups are rendered as contiguous sections below, independent of the
  // claim-order sort of `tasks`, so the grouping is always visually correct.
  const { carryOverTasks, thisWeekTasks } = useMemo(() => {
    const carry: TaskWithRelations[] = [];
    const thisWeek: TaskWithRelations[] = [];
    const briefedWeek = (d: string | null | undefined) =>
      d ? getMonday(new Date(d)).toISOString().split("T")[0]! : "";
    for (const task of tasks) {
      const ws = briefedWeek(task.created_at);
      if (ws && ws < currentMondayStr!) carry.push(task);
      else thisWeek.push(task);
    }
    return { carryOverTasks: carry, thisWeekTasks: thisWeek };
  }, [tasks, currentMondayStr]);

  // Effective remaining: prefer live assignment data over potentially-stale qty_remaining.
  function effectiveRemaining(t: TaskWithRelations): number {
    const assigned = splitAssignments[t.id];
    if (assigned && assigned.length > 0) {
      return Math.max(0, t.qty - assigned.reduce((s, d) => s + d.qty, 0));
    }
    return t.qty_remaining ?? t.qty;
  }

  // A task is an "effective ghost" when it's a DB ghost OR fully assigned
  // per live assignment data. Only assignment-based ghosting counts — a task
  // with qty=0 and no assignments is NOT a ghost (just an empty task).
  function isEffectiveGhost(t: TaskWithRelations): boolean {
    if (ghostIds.has(t.id)) return true;
    const assigned = splitAssignments[t.id];
    if (assigned && assigned.length > 0) {
      return assigned.reduce((s, d) => s + d.qty, 0) >= t.qty;
    }
    return false;
  }

  const isClaimable = (t: TaskWithRelations) =>
    !isEffectiveGhost(t) &&
    effectiveRemaining(t) > 0;

  // Visual claimable queue: this-week first, carry-over second (matches render order).
  const claimableQueue = useMemo(() => {
    return [...thisWeekTasks, ...carryOverTasks].filter(isClaimable);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thisWeekTasks, carryOverTasks, splitAssignments, ghostIds]);

  function handleClaimClick(task: TaskWithRelations) {
    const pos = claimableQueue.findIndex((t) => t.id === task.id);
    onClaimTask(task.id, pos);
  }

  // ── Loading / error states ────────────────────────────────────────────
  if (isLoading && tasks.length === 0) {
    return (
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        {headerSlot && (
          <div className="border-b border-border">{headerSlot}</div>
        )}
        <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading pool queue...
        </div>
      </section>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────
  // Render each group as a contiguous section (NOT by array position) — the
  // pool is sorted by claim order, so this-week and carry-over tasks can be
  // interleaved in `tasks`. Grouping them explicitly guarantees a task always
  // appears under the section matching its Briefed date.
  const rows: React.ReactNode[] = [];
  let globalIdx = 0;

  const pushSection = (
    label: string,
    isCarryOver: boolean,
    description: string,
    list: TaskWithRelations[]
  ) => {
    if (list.length === 0) return;
    const activeCount = list.filter((t) => !isEffectiveGhost(t)).length;
    rows.push(
      <tr
        key={`section-${label}`}
        className={cn("border-b border-border", isCarryOver ? "bg-warning/5" : "bg-secondary/30")}
      >
        <td colSpan={99} className="px-3 py-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className={cn(
              "text-[11px] font-bold uppercase tracking-wider",
              isCarryOver ? "text-warning" : "text-foreground"
            )}>
              {label}
            </span>
            <span className="text-[11px] font-normal text-muted-foreground">
              {"·"} {activeCount} to claim
            </span>
            <span className="text-[10px] font-normal normal-case text-muted-foreground/80">
              {description}
            </span>
          </div>
        </td>
      </tr>
    );
    // Clean per-section row number — a continuous 1, 2, 3… per section (no
    // duplicates or gaps like the raw pool_sequence had). Fully-assigned rows
    // are still numbered (they stay greyed via the row styling).
    let n = 0;
    for (const task of list) {
      const isGhost = isEffectiveGhost(task);
      const displayNumber = String(++n);
      const rowIndex = globalIdx++;
      rows.push(
        <PoolRow
          key={task.id}
          task={task}
          isGhost={isGhost}
          isDesigner={isDesigner}
          isAdmin={isAdmin}
          role={role}
          currentUserId={user?.id ?? null}
          rowIndex={rowIndex}
          displayNumber={displayNumber}
          isClaimable={isClaimable(task)}
          onClaim={() => handleClaimClick(task)}
          onView={() => onViewTask(task)}
          onEdit={onEditTask ? () => onEditTask(task) : undefined}
          onDelete={onDeleteTask ? () => onDeleteTask(task) : undefined}
          onSplit={onSplitTask ? () => onSplitTask(task) : undefined}
          assignedDesigners={splitAssignments[task.id]}
        />
      );
    }
  };

  pushSection("This Week", false, "Briefed this week.", thisWeekTasks);
  pushSection("Carry Over", true, "Older tasks carried over from previous weeks.", carryOverTasks);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      {headerSlot && (
        <div className="border-b border-border">{headerSlot}</div>
      )}

      {tasks.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-5 text-sm text-muted-foreground">
          <Inbox className="h-4 w-4 text-muted-foreground/70" />
          <span>No tasks in the open pool.</span>
        </div>
      ) : (
        <div className={cn("overflow-x-auto", tableDensity === "compact" && "table-compact")}>
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Pool queue with sequence numbers</caption>
            <thead>
              <tr className="border-b border-border bg-secondary/60 text-left text-[11px] font-bold uppercase tracking-wider text-foreground whitespace-nowrap [&>th]:border-r [&>th]:border-border/30 [&>th:last-child]:border-r-0">
                <th className="w-[48px] px-2 py-2 text-center font-bold">#</th>
                <th className="px-3 py-2 text-left font-bold">Briefed</th>
                <th className="px-3 py-2 text-left font-bold">Concept</th>
                <th className="w-full px-3 py-2 text-left font-bold">Description</th>
                <th className="px-3 py-2 text-left font-bold">Party Name</th>
                <th className="px-3 py-2 text-left font-bold">Fabric</th>
                <th className="px-3 py-2 text-left font-bold">Reference</th>
                <th className="w-[80px] px-3 py-2 text-left font-bold">QTY</th>
                <th className="px-3 py-2 text-left font-bold">Priority</th>
                <th className="px-3 py-2 text-left font-bold">Status</th>
                <th className="w-[100px] px-3 py-2 text-right font-bold sticky right-0 bg-card shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>{rows}</tbody>
          </table>
        </div>
      )}

      {/* Skip confirmation dialog */}
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Failed to load pool: {error}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// Pool row
// ============================================================================

interface PoolRowProps {
  task: TaskWithRelations;
  isGhost: boolean;
  isDesigner: boolean;
  isAdmin: boolean;
  role: UserRole;
  currentUserId: string | null;
  rowIndex: number;
  /** Clean per-section claim number ("1", "2", … or "—" for fully-assigned). */
  displayNumber: string;
  isClaimable: boolean;
  onClaim: () => void;
  onView: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onSplit?: () => void;
  assignedDesigners?: { name: string; qty: number }[];
}

function PoolRow({
  task,
  isGhost,
  isDesigner,
  isAdmin,
  role,
  currentUserId,
  rowIndex,
  displayNumber,
  isClaimable: rowClaimable,
  onClaim,
  onView,
  onEdit,
  onDelete,
  onSplit,
  assignedDesigners,
}: PoolRowProps) {
  const isUrgent = task.priority === "urgent";
  const isMine = currentUserId !== null && task.assigned_to === currentUserId;

  return (
    <tr
      tabIndex={0}
      role="button"
      aria-label={`Open ${task.task_code}`}
      onClick={onView}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onView();
        }
      }}
      className={cn(
        "group cursor-pointer border-b border-border/40 transition-colors [&>td]:border-r [&>td]:border-border/20 [&>td:last-child]:border-r-0",
        rowIndex % 2 === 1 && "bg-background/40",
        "hover:bg-primary/[0.04] focus-within:bg-primary/[0.05] focus:outline-none",
        // Ghost row styling
        isGhost && "opacity-50 bg-secondary/20 hover:bg-secondary/30"
      )}
    >
      {/* # column — clean per-section claim number (not the raw pool_sequence,
          which had duplicates/gaps). "—" for fully-assigned rows. */}
      <td
        className={cn(
          "w-[48px] px-2 py-1.5 text-center align-middle font-mono text-sm font-bold tabular-nums",
          isGhost
            ? "text-muted-foreground"
            : isUrgent
              ? "bg-destructive/10 text-destructive"
              : "text-foreground"
        )}
      >
        {displayNumber}
      </td>

      {/* Briefed (created_at) */}
      <td className="whitespace-nowrap px-3 py-1.5 text-left align-middle text-[12px] font-medium text-foreground">
        {formatDateTime(task.created_at)}
      </td>

      {/* Concept */}
      <td className="px-3 py-1.5 text-left align-middle">
        <span
          className={cn(
            "font-medium text-foreground",
            isGhost && "line-through"
          )}
        >
          {task.concept || "—"}
          {(task.is_split || (assignedDesigners && assignedDesigners.length > 0) || (task.qty_remaining != null && task.qty_remaining < task.qty)) && (
            <Badge className="ml-1 inline-flex items-center gap-0.5 align-middle text-[8px] bg-primary/10 text-primary border-primary/20 px-1 py-0">Team</Badge>
          )}
          {isFullKittingBlocking(task) && (
            <span className="ml-1 inline-flex items-center gap-0.5 align-middle rounded border border-warning/30 bg-warning/10 px-1 py-0 text-[8px] font-semibold text-warning" title="Full Knitting required — not yet added">
              <Layers className="h-2.5 w-2.5" />FK
            </span>
          )}
        </span>
      </td>

      {/* Description */}
      <td className="w-full max-w-0 px-3 py-1.5 text-left align-middle text-[12px] font-medium text-foreground">
        <span className="block truncate" title={task.description ?? ""}>
          {task.description || "—"}
        </span>
      </td>

      {/* Party Name */}
      <td className="whitespace-nowrap px-3 py-1.5 text-left align-middle font-medium text-foreground">
        {task.client?.party_name ??
          (task.brief_type === "ld" ? "LD Silk Mills" : "—")}
      </td>

      {/* Fabric */}
      <td className="whitespace-nowrap px-3 py-1.5 text-left align-middle">
        {task.fabric?.trim() ? (
          <span className="rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] text-foreground">
            {task.fabric}
          </span>
        ) : (
          <span className="text-[12px] text-muted-foreground">{"—"}</span>
        )}
      </td>

      {/* Reference Files */}
      <td
        className="w-[160px] px-3 py-1.5 text-left align-middle"
        onClick={(e) => e.stopPropagation()}
      >
        <PoolRefFilesCell files={task.files ?? []} />
      </td>

      {/* QTY — use live assignment total when available */}
      <td className="whitespace-nowrap px-3 py-1.5 text-left align-middle tabular-nums text-foreground">
        {(() => {
          const ad = assignedDesigners;
          const sumAssigned = ad && ad.length > 0 ? ad.reduce((s, d) => s + d.qty, 0) : 0;
          const liveRemaining = ad && ad.length > 0 ? Math.max(0, task.qty - sumAssigned) : null;
          const remaining = liveRemaining ?? task.qty_remaining;
          return remaining != null && remaining !== task.qty ? (
            <span>{remaining}/{task.qty}M</span>
          ) : (
            <>{task.qty}M</>
          );
        })()}
      </td>

      {/* Priority */}
      <td className="whitespace-nowrap px-3 py-1.5 text-left align-middle">
        <Badge
          className={cn(
            "text-[10px]",
            PRIORITY_COLORS[task.priority]
          )}
        >
          {PRIORITY_LABELS[task.priority]}
        </Badge>
      </td>

      {/* Status — dynamic column */}
      <td className="whitespace-nowrap px-3 py-1.5 text-left align-middle">
        <PoolStatusCell
          task={task}
          isGhost={isGhost}
          assignedDesigners={assignedDesigners}
        />
      </td>

      {/* Action — sticky right, buttons only */}
      <td
        className="sticky right-0 bg-card px-3 py-1.5 align-middle shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
          {!isGhost && isDesigner && rowClaimable && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClaim();
              }}
              title="Claim this task"
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-primary px-2 text-[11px] font-medium text-white transition-colors hover:bg-primary/90"
            >
              <HandPlatter className="h-3 w-3" />
              Claim
            </button>
          )}
          {!isGhost && (
            <PoolRowActionMenu
              role={role}
              task={task}
              isMine={isMine}
              onView={onView}
              onEdit={onEdit}
              onDelete={onDelete}
              onSplit={onSplit}
            />
          )}
        </div>
      </td>
    </tr>
  );
}

// ============================================================================
// Pool row action menu (simplified for pool context)
// ============================================================================

// ============================================================================
// Pool status cell — dynamic status indicator
// ============================================================================

function PoolStatusCell({
  task,
  isGhost,
  assignedDesigners,
}: {
  task: TaskWithRelations;
  isGhost: boolean;
  assignedDesigners?: { name: string; qty: number }[];
}) {
  const hasAssignments = assignedDesigners && assignedDesigners.length > 0;
  const totalAssigned = hasAssignments
    ? assignedDesigners.reduce((s, d) => s + d.qty, 0)
    : 0;
  // Fully-assigned: either qty_remaining is 0 OR live assignment sum covers the full qty.
  const isFullyAssigned = hasAssignments && (task.qty_remaining === 0 || totalAssigned >= task.qty);
  const isPartial = hasAssignments && !isFullyAssigned;
  const tooltipLines = hasAssignments
    ? assignedDesigners.map((d) => `${d.name} — ${d.qty} designs`)
    : [];

  // Ghost: fully claimed by a single designer
  if (isGhost && !hasAssignments) {
    return (
      <div
        className="group/status relative inline-flex items-center gap-1.5 rounded-md border border-success/20 bg-success/5 px-2 py-1"
        title={`Claimed by ${task.assignee?.full_name ?? "—"}`}
      >
        <Check className="h-3 w-3 text-success" />
        <span className="text-[11px] font-medium text-success">Claimed</span>
        <HoverTooltip lines={[`${task.assignee?.full_name ?? "Unknown"} — full task`]} />
      </div>
    );
  }

  // Fully assigned (team task, qty_remaining = 0)
  if (isFullyAssigned) {
    return (
      <div
        className="group/status relative inline-flex items-center gap-1.5 rounded-md border border-success/20 bg-success/5 px-2 py-1"
      >
        <Users className="h-3 w-3 text-success" />
        <span className="text-[11px] font-medium text-success">Fully Assigned</span>
        {tooltipLines.length > 0 && <HoverTooltip lines={tooltipLines} />}
      </div>
    );
  }

  // Partially assigned (some designers claimed, remaining qty > 0)
  if (isPartial) {
    return (
      <div
        className="group/status relative inline-flex items-center gap-1.5 rounded-md border border-warning/20 bg-warning/5 px-2 py-1"
      >
        <CircleDot className="h-3 w-3 text-warning" />
        <div className="flex flex-col">
          <span className="text-[11px] font-medium text-warning">Partial</span>
          <span className="text-[9px] tabular-nums text-muted-foreground">
            {totalAssigned}/{task.qty} claimed
          </span>
        </div>
        {tooltipLines.length > 0 && <HoverTooltip lines={tooltipLines} />}
      </div>
    );
  }

  // Open — no one has claimed anything yet
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2 py-1">
      <Circle className="h-3 w-3 text-primary" />
      <span className="text-[11px] font-medium text-primary">Open</span>
    </div>
  );
}

/** Portal-based hover tooltip — escapes overflow-x-auto containers. */
function HoverTooltip({ lines }: { lines: string[] }) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  function handleEnter() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.top + rect.height / 2,
      left: rect.left - 8,
    });
    setShow(true);
  }

  return (
    <>
      <span
        ref={triggerRef}
        className="absolute inset-0"
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
      />
      {show &&
        ReactDOM.createPortal(
          <div
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              transform: "translate(-100%, -50%)",
            }}
            className="z-[9999] min-w-[180px] rounded-lg border border-border bg-white px-3 py-2 shadow-xl dark:bg-zinc-900 dark:border-zinc-700 animate-fade-in"
          >
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "#888" }}>
              Designers
            </p>
            {lines.map((l, i) => (
              <p key={i} className="whitespace-nowrap text-[11px] font-medium" style={{ color: "#111" }}>
                {l}
              </p>
            ))}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full">
              <div className="border-y-[6px] border-l-[6px] border-y-transparent border-l-white dark:border-l-zinc-900" />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

// ============================================================================
// Pool row action menu (simplified for pool context)
// ============================================================================

function PoolRowActionMenu({
  role,
  task,
  isMine,
  onView,
  onEdit,
  onDelete,
  onSplit,
}: {
  role: UserRole;
  task: TaskWithRelations;
  isMine: boolean;
  onView: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onSplit?: () => void;
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
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const menuHeight = 120;
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
            {canEdit && onEdit && (
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
            {canDelete && onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            )}
            {isAdmin && onSplit && task.qty > 1 && (
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
          </div>,
          document.body
        )}
    </>
  );
}

// ============================================================================
// Reference files cell (duplicated locally to avoid importing from KanbanView)
// ============================================================================

function PoolRefFilesCell({
  files,
}: {
  files: { id: string; file_name: string; storage_url?: string | null }[];
}) {
  if (!files || files.length === 0) {
    return <span className="text-[12px] text-muted-foreground">{"—"}</span>;
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
