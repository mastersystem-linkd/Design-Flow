import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { isAdminOrCoordinator } from "@/lib/permissions";
import { sendNotification, sendNotificationToRole } from "@/lib/notifications";
import type {
  Task,
  TaskInsert,
  TaskAssignmentInsert,
  TaskStatus,
  TaskPriority,
  UserRole,
  BriefType,
} from "@/types/database";

// ============================================================================
// Types
// ============================================================================

export type MutationResult<T> = {
  data: T | null;
  error: string | null;
};

/**
 * Caller-supplied fields for creating a task. `created_by` and `task_code`
 * are derived/auto-assigned. `status` is derived from `assigned_to`.
 */
export interface CreateTaskInput {
  /** Required when brief_type='job_work'; ignored / NULL when 'ld'. */
  client_id?: string | null;
  /** 'ld' = internal LinkD work (no party), 'job_work' = external client. */
  brief_type: BriefType;
  concept: string;
  qty: number;
  fabric: string;
  priority?: TaskPriority;
  assigned_to?: string | null;
  planned_deadline?: string | null;
  due_time?: string | null;
  whatsapp_group?: string | null;
  /** When the brief request arrived on WhatsApp. Independent of created_at. */
  whatsapp_received_date?: string | null;
  /** Time-of-day of the WhatsApp message ("HH:MM"). */
  whatsapp_received_time?: string | null;
  description?: string | null;
  notes?: string | null;
  concept_id?: string | null;
  mtr?: number | null;
  assigned_by?: string | null;
  concept_start_date?: string | null;
  requires_full_kitting?: boolean;
  full_kitting_image_url?: string | null;
  full_kitting_notes?: string | null;
}

export interface UseTaskMutations {
  createTask: (input: CreateTaskInput) => Promise<MutationResult<Task>>;
  updateTaskStatus: (
    taskId: string,
    newStatus: TaskStatus
  ) => Promise<MutationResult<Task>>;
  updateQtyCompleted: (
    taskId: string,
    newQty: number
  ) => Promise<MutationResult<Task>>;
  assignTask: (taskId: string, designerId: string) => Promise<MutationResult<Task>>;
  /** Hand off a partially-completed task to another designer or back to the
   *  open pool. Preserves qty_completed / fabric / deadline; stores a required
   *  carry-forward note + the previous designer (carry_forward_*) so the next
   *  person sees a "carried forward" banner. Admin/coordinator action. */
  handoffTask: (
    taskId: string,
    target: HandoffTarget,
    note: string
  ) => Promise<MutationResult<Task>>;
  /** Designer self-assigns a SPECIFIC Pool task. Only if status=pool AND
   *  started_at IS NULL. Legacy per-row claim — the FIFO flow below supersedes
   *  it for designers, but admins/manual paths may still use it. */
  selfAssignTask: (taskId: string) => Promise<MutationResult<Task>>;
  /** Designer claims a SPECIFIC eligible Pool task (chosen from the top of the
   *  FIFO queue) and commits a planned deadline. Blocked if the designer has
   *  any in_progress task. Optimistically locked on status='pool' so two
   *  designers can't grab the same row. Moves the task pool → 'in_progress'. */
  claimPoolTask: (
    taskId: string,
    plannedDeadline: string,
    fabric?: string | null,
    designType?: string | null
  ) => Promise<MutationResult<Task>>;
  /** Read-only peek used by the claim modal: returns the top `limit` eligible
   *  Pool tasks (FIFO + urgent-first) so the designer can pick one, whether the
   *  caller is busy, and the live pool count. Does NOT mutate anything. */
  getNextPoolTasks: (limit?: number) => Promise<{
    tasks: PoolTaskPreview[];
    isBusy: boolean;
    poolCount: number;
  }>;
  /**
   * Mark a task as done with delay_days calculation. 'done' is now an
   * INTERMEDIATE state — design work finished, awaiting completion details
   * (fabric + mtr). Caller opens the PostDoneModal next.
   */
  markTaskDone: (taskId: string) => Promise<MutationResult<Task>>;
  /**
   * Close out a 'done' task with completion fabric + optional mtr, moving it
   * to the terminal 'completed' status. Fabric is required. Optimistically
   * locked on status='done' so it can't double-fire or skip the done step.
   */
  completeTask: (
    taskId: string,
    fabric: string,
    mtr?: number | null
  ) => Promise<MutationResult<Task>>;
  /** Return a task to the open pool with 3 modes:
   *  - reset: zero out progress, send to pool fresh
   *  - split-pool: preserve designer's work as a sub-task, pool remaining
   *  - split-assign: preserve + assign remaining to a specific designer */
  returnToPool: (taskId: string, opts?: ReturnToPoolOpts) => Promise<MutationResult<Task>>;
  /** General field update (concept, description, fabric, qty, deadline, etc.) */
  updateTask: (
    taskId: string,
    fields: UpdateTaskFields
  ) => Promise<MutationResult<Task>>;
  deleteTask: (taskId: string) => Promise<MutationResult<{ id: string }>>;
  /** Per-operation pending flag keyed by `${op}:${id}` (or just `${op}` for create). */
  pending: Readonly<Record<string, boolean>>;
  isPending: (op: TaskMutationOp, id?: string) => boolean;
}

/** Hand-off target: a specific designer, or back to the open pool. */
export type HandoffTarget =
  | { kind: "designer"; designerId: string }
  | { kind: "pool" };

/** How to handle progress when returning a task to the pool. */
export type ReturnToPoolMode = "reset" | "split-pool" | "split-assign";

export interface ReturnToPoolOpts {
  mode: ReturnToPoolMode;
  assignToDesignerId?: string;
}

/** Fields the edit dialog can update. All optional — only changed values sent. */
export interface UpdateTaskFields {
  brief_type?: BriefType;
  concept?: string;
  description?: string | null;
  fabric?: string;
  /** Completion fabric (set at completion). Kept in sync when editing the
   *  fabric of an already-completed task so the completion view matches. */
  completion_fabric?: string | null;
  qty?: number;
  qty_completed?: number;
  mtr?: number | null;
  priority?: TaskPriority;
  planned_deadline?: string | null;
  due_time?: string | null;
  whatsapp_group?: string | null;
  whatsapp_received_date?: string | null;
  whatsapp_received_time?: string | null;
  assigned_to?: string | null;
  assigned_by?: string | null;
  client_id?: string | null;
  notes?: string | null;
  concept_start_date?: string | null;
  requires_full_kitting?: boolean;
  full_kitting_image_url?: string | null;
  full_kitting_notes?: string | null;
}

export type TaskMutationOp =
  | "create"
  | "updateStatus"
  | "updateQty"
  | "updateTask"
  | "assign"
  | "handoff"
  | "returnToPool"
  | "selfAssign"
  | "claimNext"
  | "markDone"
  | "complete"
  | "delete";

/** A pool task with just enough joined data for the claim-preview modal.
 *  We only pull `party_name` from the client (no id) — keep it narrow. */
export interface PoolTaskPreview extends Task {
  client: { party_name: string } | null;
}

/** Priority sort weight for FIFO claim ordering (lower = claimed first).
 *  Defined once so claimPoolTask and getNextPoolTasks sort identically. */
const POOL_PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/** FIFO comparator: urgent-first, then oldest requirement_received_at, then
 *  oldest created_at. Shared by the claim + preview paths. */
function comparePoolFifo(
  a: { priority: string; requirement_received_at: string | null; created_at: string },
  b: { priority: string; requirement_received_at: string | null; created_at: string }
): number {
  const pa = POOL_PRIORITY_ORDER[a.priority] ?? 2;
  const pb = POOL_PRIORITY_ORDER[b.priority] ?? 2;
  if (pa !== pb) return pa - pb;
  const ra = new Date(a.requirement_received_at || a.created_at).getTime();
  const rb = new Date(b.requirement_received_at || b.created_at).getTime();
  if (ra !== rb) return ra - rb;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

// ============================================================================
// Status transition rules
// ============================================================================

const STATUS_ORDER: readonly TaskStatus[] = [
  "pool",
  "todo",
  "in_progress",
  "full_kitting",
  "approved",
  "sampling",
  "done",
] as const;

function isForwardTransition(from: TaskStatus, to: TaskStatus): boolean {
  return STATUS_ORDER.indexOf(to) > STATUS_ORDER.indexOf(from);
}

function canMoveBackward(role: UserRole | null | undefined): boolean {
  return isAdminOrCoordinator(role);
}

function isAdminRole(role: UserRole | null | undefined): boolean {
  return isAdminOrCoordinator(role);
}

// ============================================================================
// Task code generation
// ============================================================================
// Format: DF {NN}-{designerLetter}{MMYY}-{con4}-{qty}M
//   e.g. DF 01-S0526-FLOR-200M  (1st task of the year, designer S, May 2026,
//                                Floral concept, 200 m)
//        DF 02-K0526-ABST-50M
//        DF 09-P0526-CONC-2M    (Pool / unassigned → "P")
//
// {NN} is the DB trigger's per-year sequence (resets each January). Uniqueness
// is guaranteed by that prefix, so no collision fallback is needed.

function abbrev4(s: string | null | undefined, fallback = "XXXX"): string {
  if (!s) return fallback;
  const cleaned = s.replace(/[^A-Za-z]/g, "").toUpperCase();
  if (!cleaned) return fallback;
  return cleaned.slice(0, 4);
}

function extractSeq(taskCode: string | null | undefined): string {
  if (!taskCode) return "0000";
  // grab the LAST run of digits in the code (ORD-YYYY-NNNN puts it at the end)
  const m = taskCode.match(/(\d+)(?!.*\d)/);
  return m ? m[1].padStart(4, "0") : "0000";
}

/** Render the raw 4-digit sequence as a min-2-digit visible number. */
function formatSeqShort(seq: string): string {
  const n = parseInt(seq, 10);
  if (!Number.isFinite(n)) return "00";
  return n < 100 ? String(n).padStart(2, "0") : String(n);
}

/** Return the current month + year as a 4-digit "MMYY" string. */
function currentMonthYear(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  return `${mm}${yy}`;
}

interface BuildTaskCodeInput {
  designerLetter: string; // single uppercase letter, or "P" for Pool
  seq: string; // raw 4-digit per-year sequence (e.g. "0009")
  concept: string | null | undefined;
  qty: number;
}

function buildTaskCode({
  designerLetter,
  seq,
  concept,
  qty,
}: BuildTaskCodeInput): string {
  const d = (designerLetter || "P").toUpperCase().slice(0, 1);
  const con = abbrev4(concept);
  const q = Math.max(0, Math.round(qty));
  return `DF ${formatSeqShort(seq)}-${d}${currentMonthYear()}-${con}-${q}M`;
}

/**
 * Build a "already claimed by X on <datetime>" message for a task that lost a
 * claim race. Reads the current assignee + assigned_at fresh so the message
 * reflects who actually won. Falls back gracefully when data is missing.
 */
async function fetchClaimedByMessage(taskId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from("tasks")
      .select(
        "assigned_at, assignee:profiles!tasks_assigned_to_fkey(full_name)"
      )
      .eq("id", taskId)
      .maybeSingle();
    const name =
      (data as { assignee?: { full_name?: string } } | null)?.assignee
        ?.full_name ?? "another designer";
    const when = data?.assigned_at
      ? new Date(data.assigned_at).toLocaleString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : null;
    return when
      ? `This task was already claimed by ${name} on ${when}.`
      : `This task was already claimed by ${name}.`;
  } catch {
    return "This task was just claimed by someone else. Try again.";
  }
}

async function fetchDesignerLetter(
  designerId: string | null | undefined
): Promise<string> {
  if (!designerId) return "P";
  const { data, error } = await supabase
    .from("designer_codes")
    .select("code")
    .eq("profile_id", designerId)
    .order("code", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data?.code) return "X";
  return data.code.slice(0, 1).toUpperCase();
}

/**
 * Detects codes whose designer letter is "P" (Pool / unassigned). These are
 * the only ones we'll regenerate on assignment — once a code carries a real
 * designer letter we leave it alone.
 * Matches both the new "DF NN-P####-..." format and the legacy "P####-..."
 * pre-DF format, so existing pool tasks created before this rename still get
 * relettered when accepted.
 */
function isPoolCode(taskCode: string | null | undefined): boolean {
  if (!taskCode) return false;
  return /^(DF \d+-)?P\d{3,}-/i.test(taskCode);
}

/**
 * Did the designer claim/start this task after its planned kickoff?
 * `claimedAtIso` is an ISO timestamp; `conceptStartDate` is a yyyy-MM-dd
 * string (the form uses <input type="date">). Compares date-only, so a
 * same-day claim is on time. Returns false when no kickoff date is set.
 */
function computeStartedLate(
  conceptStartDate: string | null | undefined,
  claimedAtIso: string
): boolean {
  if (!conceptStartDate) return false;
  const claimDate = claimedAtIso.slice(0, 10); // yyyy-MM-dd
  return claimDate > conceptStartDate;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Mutations for the `tasks` table. Each returns `{ data, error }` — never
 * throws. The hook also tracks per-op pending state so consumers can show
 * spinners / disabled UI.
 *
 * ## Optimistic UI pattern
 *
 * The hook does NOT manage a task list — that belongs to the caller. To do
 * optimistic updates:
 *
 *   const [tasks, setTasks] = useState<Task[]>([...]);
 *   const { updateTaskStatus } = useTaskMutations();
 *
 *   async function move(id: string, status: TaskStatus) {
 *     const snapshot = tasks;
 *     setTasks(curr =>
 *       curr.map(t => t.id === id ? { ...t, status } : t)
 *     );
 *     const { data, error } = await updateTaskStatus(id, status);
 *     if (error) {
 *       setTasks(snapshot);           // rollback
 *       toast.error(error);
 *     } else if (data) {
 *       setTasks(curr =>
 *         curr.map(t => t.id === id ? data : t)  // reconcile w/ server
 *       );
 *     }
 *   }
 */
export function useTaskMutations(): UseTaskMutations {
  const { profile } = useAuth();
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const setOpPending = useCallback((key: string, value: boolean) => {
    setPending((prev) => {
      if (value) return { ...prev, [key]: true };
      // remove the key when done so the map stays small
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  // --------------------------------------------------------------------
  // createTask
  // --------------------------------------------------------------------
  const createTask = useCallback<UseTaskMutations["createTask"]>(
    async (input) => {
      if (!profile) {
        return { data: null, error: "Not authenticated" };
      }
      // client_id is required only for Job Work briefs — LD briefs are
      // internal and intentionally carry no party (client_id is null).
      if (input.brief_type === "job_work" && !input.client_id?.trim()) {
        return { data: null, error: "Pick a Job Work party." };
      }
      if (input.qty != null && input.qty < 0) {
        return { data: null, error: "qty cannot be negative" };
      }

      const assigned = input.assigned_to ?? null;
      // Simplified pipeline: assigned briefs go straight to In Progress;
      // unassigned briefs sit in the Pool until claimed.
      const status: TaskStatus = assigned ? "in_progress" : "pool";
      const nowIso = new Date().toISOString();

      const requiresFullKitting = input.requires_full_kitting === true;
      const fullKittingImageUrl = input.full_kitting_image_url ?? null;
      if (requiresFullKitting && !fullKittingImageUrl) {
        return {
          data: null,
          error: "Full kitting requires an image upload",
        };
      }

      const fullKittingSubmittedAt =
        requiresFullKitting && fullKittingImageUrl
          ? new Date().toISOString()
          : null;
      const fullKittingSubmittedBy =
        requiresFullKitting && fullKittingImageUrl ? profile.id : null;

      const row: TaskInsert = {
        // brief_type drives whether client_id is required (DB CHECK enforces it).
        brief_type: input.brief_type,
        client_id: input.brief_type === "job_work" ? input.client_id ?? null : null,
        concept_id: input.concept_id ?? null,
        concept: input.concept,
        qty: input.qty,
        fabric: input.fabric,
        priority: input.priority ?? "normal",
        status,
        assigned_to: assigned,
        // Stamp assignment + start timestamps for assigned briefs so the
        // task is treated as actively in flight, not freshly created.
        assigned_at: assigned ? nowIso : null,
        started_at: assigned ? nowIso : null,
        planned_deadline: input.planned_deadline ?? null,
        due_time: input.due_time ?? null,
        whatsapp_group: input.whatsapp_group ?? null,
        whatsapp_received_date: input.whatsapp_received_date ?? null,
        whatsapp_received_time: input.whatsapp_received_time ?? null,
        description: input.description ?? null,
        notes: input.notes ?? null,
        mtr: input.mtr ?? null,
        assigned_by: input.assigned_by ?? null,
        concept_start_date: input.concept_start_date ?? null,
        started_late: assigned
          ? computeStartedLate(input.concept_start_date ?? null, nowIso)
          : false,
        requires_full_kitting: requiresFullKitting,
        full_kitting_image_url: fullKittingImageUrl,
        full_kitting_notes: input.full_kitting_notes ?? null,
        full_kitting_submitted_at: fullKittingSubmittedAt,
        full_kitting_submitted_by: fullKittingSubmittedBy,
        created_by: profile.id,
      };

      setOpPending("create", true);
      try {
        const { data, error } = await supabase
          .from("tasks")
          .insert(row)
          .select("*")
          .single();
        if (error) return { data: null, error: error.message };
        if (!data) return { data: null, error: "Insert returned no row" };

        // Replace the trigger-generated ORD-YYYY-NNNN code with the encoded
        // format. The per-year sequence (NNNN) becomes the leading "DF NN".
        const seq = extractSeq(data.task_code);
        const designerLetter = await fetchDesignerLetter(assigned);
        const newCode = buildTaskCode({
          designerLetter,
          seq,
          concept: data.concept,
          qty: data.qty,
        });

        if (newCode === data.task_code) return { data, error: null };

        const { data: renamed, error: renameErr } = await supabase
          .from("tasks")
          .update({ task_code: newCode })
          .eq("id", data.id)
          .select("*")
          .single();
        if (renameErr || !renamed) {
          // Rename failed — task exists with the legacy code, surface a warning
          // but don't fail the whole creation.
          console.warn(
            "[createTask] task created but task_code rename failed:",
            renameErr?.message
          );
          return { data, error: null };
        }
        return { data: renamed, error: null };
      } finally {
        setOpPending("create", false);
      }
    },
    [profile, setOpPending]
  );

  // --------------------------------------------------------------------
  // updateTaskStatus
  // --------------------------------------------------------------------
  const updateTaskStatus = useCallback<UseTaskMutations["updateTaskStatus"]>(
    async (taskId, newStatus) => {
      if (!profile) return { data: null, error: "Not authenticated" };
      if (!STATUS_ORDER.includes(newStatus)) {
        return { data: null, error: `Invalid status: ${newStatus}` };
      }

      const key = `updateStatus:${taskId}`;
      setOpPending(key, true);
      try {
        // Fetch current status to validate the transition.
        const { data: current, error: fetchErr } = await supabase
          .from("tasks")
          .select("status")
          .eq("id", taskId)
          .single();
        if (fetchErr) return { data: null, error: fetchErr.message };
        if (!current) return { data: null, error: "Task not found" };

        const from = current.status as TaskStatus;
        if (from === newStatus) {
          // No-op — just return the row.
          const { data } = await supabase
            .from("tasks")
            .select("*")
            .eq("id", taskId)
            .single();
          return { data: data ?? null, error: null };
        }

        const forward = isForwardTransition(from, newStatus);
        if (!forward && !canMoveBackward(profile.role)) {
          return {
            data: null,
            error: `Cannot move a task from "${from}" to "${newStatus}". Only admins may reverse a task.`,
          };
        }

        // The DB trigger handles task_logs + started_at / kitted_at stamps.
        const { data, error } = await supabase
          .from("tasks")
          .update({ status: newStatus })
          .eq("id", taskId)
          .select("*")
          .single();
        if (error) return { data: null, error: error.message };
        return { data, error: null };
      } finally {
        setOpPending(key, false);
      }
    },
    [profile, setOpPending]
  );

  // --------------------------------------------------------------------
  // updateQtyCompleted
  // --------------------------------------------------------------------
  const updateQtyCompleted = useCallback<UseTaskMutations["updateQtyCompleted"]>(
    async (taskId, newQty) => {
      if (!profile) return { data: null, error: "Not authenticated" };
      if (!Number.isFinite(newQty) || newQty < 0) {
        return { data: null, error: "qty must be a non-negative number" };
      }

      const key = `updateQty:${taskId}`;
      setOpPending(key, true);
      try {
        const { data: current, error: fetchErr } = await supabase
          .from("tasks")
          .select("qty, status")
          .eq("id", taskId)
          .single();
        if (fetchErr) return { data: null, error: fetchErr.message };
        if (!current) return { data: null, error: "Task not found" };

        // Decide whether to auto-advance status.
        const update: { qty_completed: number; status?: TaskStatus } = {
          qty_completed: newQty,
        };
        const currentStatus = current.status as TaskStatus;

        if (newQty >= current.qty && current.qty > 0) {
          // Finished kitting (or extra) → move to full_kitting (if not already past it).
          if (
            STATUS_ORDER.indexOf(currentStatus) <
            STATUS_ORDER.indexOf("full_kitting")
          ) {
            update.status = "full_kitting";
          }
        } else if (newQty > 0) {
          // Partial → ensure work has started.
          if (currentStatus === "pool" || currentStatus === "todo") {
            update.status = "in_progress";
          }
        }

        const { data, error } = await supabase
          .from("tasks")
          .update(update)
          .eq("id", taskId)
          .select("*")
          .single();
        if (error) return { data: null, error: error.message };
        void supabase.from("task_logs").insert({
          task_id: taskId,
          status_to: data?.status ?? currentStatus,
          changed_by: profile.id,
          note: `Progress updated: ${newQty} of ${current.qty}`,
        });
        return { data, error: null };
      } finally {
        setOpPending(key, false);
      }
    },
    [profile, setOpPending]
  );

  // --------------------------------------------------------------------
  // assignTask
  // --------------------------------------------------------------------
  const assignTask = useCallback<UseTaskMutations["assignTask"]>(
    async (taskId, designerId) => {
      if (!profile) return { data: null, error: "Not authenticated" };
      if (!designerId?.trim()) {
        return { data: null, error: "designerId is required" };
      }

      const key = `assign:${taskId}`;
      setOpPending(key, true);
      try {
        const { data: current, error: fetchErr } = await supabase
          .from("tasks")
          .select("status, task_code, concept, qty, concept_start_date, assigned_to")
          .eq("id", taskId)
          .single();
        if (fetchErr) return { data: null, error: fetchErr.message };
        if (!current) return { data: null, error: "Task not found" };

        // Was this an "accept from pool" action? If so we'll optimistically
        // lock on status='pool' below so a concurrent designer claim can't be
        // silently overwritten.
        const acceptingFromPool = current.status === "pool";

        const update: {
          assigned_to: string;
          status?: TaskStatus;
          task_code?: string;
          assigned_at?: string;
          started_at?: string;
          started_late?: boolean;
          carry_forward_from?: string | null;
          carry_forward_at?: string | null;
        } = {
          assigned_to: designerId,
        };
        if (acceptingFromPool) {
          const nowIso = new Date().toISOString();
          update.status = "in_progress";
          update.assigned_at = nowIso;
          update.started_at = nowIso;
          update.started_late = computeStartedLate(
            current.concept_start_date,
            nowIso
          );
        }

        // Track previous designer when reassigning (not accepting from pool)
        if (!acceptingFromPool && current.assigned_to && current.assigned_to !== designerId) {
          update.carry_forward_from = current.assigned_to as string;
          update.carry_forward_at = new Date().toISOString();
        }

        // If the existing code carries the "P" (Pool) designer letter, swap
        // it for the assigned designer's letter — but only once. Codes that
        // already include a real designer letter stay stable through
        // reassignment.
        if (isPoolCode(current.task_code)) {
          const designerLetter = await fetchDesignerLetter(designerId);
          const seq = extractSeq(current.task_code);
          update.task_code = buildTaskCode({
            designerLetter,
            seq,
            concept: current.concept,
            qty: current.qty,
          });
        }

        let q = supabase.from("tasks").update(update).eq("id", taskId);
        // Optimistic lock: only claim if the task is STILL in the pool. Skips
        // the guard for ordinary reassignments (where status isn't 'pool').
        if (acceptingFromPool) q = q.eq("status", "pool");
        const { data, error } = await q.select("*").maybeSingle();
        if (error) return { data: null, error: error.message };
        if (!data) {
          // Pool-accept lost the race — someone claimed it first.
          const msg = acceptingFromPool
            ? await fetchClaimedByMessage(taskId)
            : "Couldn't update this task. Refresh and try again.";
          return { data: null, error: msg };
        }

        // Notify assigned designer
        if (data && designerId !== profile.id) {
          void sendNotification(
            designerId,
            "Task Assigned",
            `You've been assigned task ${data.task_code ?? taskId}.`,
            "info",
            "/dashboard"
          );
        }

        // Notify previous designer when their task is reassigned
        const prevId = current.assigned_to as string | null;
        if (prevId && prevId !== designerId && prevId !== profile.id) {
          void sendNotification(
            prevId,
            "Task Reassigned",
            `${data.task_code ?? "A task"} has been reassigned to another designer.`,
            "warning",
            "/dashboard"
          );
        }

        return { data, error: null };
      } finally {
        setOpPending(key, false);
      }
    },
    [profile, setOpPending]
  );

  // --------------------------------------------------------------------
  // handoffTask — admin/coordinator hands a partially-done task to another
  // designer or back to the open pool, WITH a required carry-forward note.
  // Progress (qty_completed, fabric, deadline, files) is preserved; only the
  // owner + carry_forward_* context change.
  // --------------------------------------------------------------------
  const handoffTask = useCallback<UseTaskMutations["handoffTask"]>(
    async (taskId, target, note) => {
      if (!profile) return { data: null, error: "Not authenticated" };
      const reason = note?.trim();
      if (!reason) return { data: null, error: "A carry-forward note is required." };
      if (target.kind === "designer" && !target.designerId?.trim()) {
        return { data: null, error: "Pick a designer to hand off to." };
      }

      const key = `handoff:${taskId}`;
      setOpPending(key, true);
      try {
        const { data: current, error: fetchErr } = await supabase
          .from("tasks")
          .select("status, task_code, concept, qty, qty_completed, assigned_to, is_split")
          .eq("id", taskId)
          .single();
        if (fetchErr) return { data: null, error: fetchErr.message };
        if (!current) return { data: null, error: "Task not found" };

        const prevAssignee = (current.assigned_to as string | null) ?? null;
        const nowIso = new Date().toISOString();

        const update: {
          carry_forward_note: string;
          carry_forward_from: string | null;
          carry_forward_at: string;
          assigned_to?: string | null;
          status?: TaskStatus;
          assigned_at?: string;
          task_code?: string;
          qty_completed?: number;
        } = {
          carry_forward_note: reason,
          carry_forward_from: prevAssignee,
          carry_forward_at: nowIso,
        };

        if (target.kind === "designer") {
          if (target.designerId === prevAssignee) {
            return { data: null, error: "That designer already holds this task." };
          }
          // Keep the ORIGINAL task_code (stable through hand-off, per spec).
          update.assigned_to = target.designerId;
          update.status = "in_progress";
          update.assigned_at = nowIso;
        } else {
          // Return to the open pool — rebrand the code to the Pool letter.
          // Progress is reset (qty_completed zeroed) so the task starts fresh.
          update.assigned_to = null;
          update.status = "pool";
          update.qty_completed = 0;
          const seq = extractSeq(current.task_code);
          update.task_code = buildTaskCode({
            designerLetter: "P",
            seq,
            concept: current.concept,
            qty: current.qty,
          });
        }

        const { data, error } = await supabase
          .from("tasks")
          .update(update)
          .eq("id", taskId)
          .select("*")
          .maybeSingle();
        if (error) return { data: null, error: error.message };
        if (!data) {
          return {
            data: null,
            error: "Couldn't hand off this task. Refresh and try again.",
          };
        }

        // Activity log — shows in the task's timeline.
        void supabase.from("task_logs").insert({
          task_id: taskId,
          status_from: current.status as TaskStatus,
          status_to: (update.status as TaskStatus) ?? (current.status as TaskStatus),
          changed_by: profile.id,
          note:
            target.kind === "designer"
              ? `Handed off — ${reason}`
              : `Returned to pool — ${reason}`,
        });

        // Notify the receiving designer (pool hand-offs have no single owner).
        if (target.kind === "designer" && target.designerId !== profile.id) {
          void sendNotification(
            target.designerId,
            "Task carried forward to you",
            `${data.task_code ?? "A task"} was handed to you (${data.qty_completed}/${data.qty} done). Note: ${reason}`,
            "info",
            "/dashboard"
          );
        }

        // Notify the original designer that their task was returned to pool or handed off.
        if (prevAssignee && prevAssignee !== profile.id) {
          void sendNotification(
            prevAssignee,
            target.kind === "designer" ? "Task Handed Off" : "Task Returned to Pool",
            target.kind === "designer"
              ? `${data.task_code ?? "A task"} was handed to another designer. Note: ${reason}`
              : `${data.task_code ?? "A task"} was returned to the open pool. Note: ${reason}`,
            "warning",
            "/dashboard"
          );
        }

        return { data, error: null };
      } finally {
        setOpPending(key, false);
      }
    },
    [profile, setOpPending]
  );

  // --------------------------------------------------------------------
  // returnToPool — Return a task to the pool with 3 modes:
  //   reset:        zero progress, send to pool fresh
  //   split-pool:   preserve designer's work as sub-task, pool remaining
  //   split-assign: preserve + assign remaining to a specific designer
  // --------------------------------------------------------------------
  const returnToPool = useCallback(
    async (taskId: string, opts?: ReturnToPoolOpts) => {
      if (!profile) return { data: null, error: "Not authenticated" };

      const mode = opts?.mode ?? "reset";
      const key = `returnToPool:${taskId}`;
      setOpPending(key, true);
      try {
        const { data: current, error: fetchErr } = await supabase
          .from("tasks")
          .select("status, task_code, concept, qty, qty_completed, assigned_to, is_split")
          .eq("id", taskId)
          .single();
        if (fetchErr) return { data: null, error: fetchErr.message };
        if (!current) return { data: null, error: "Task not found" };

        const prevAssignee = (current.assigned_to as string | null) ?? null;
        const qtyDone = current.qty_completed ?? 0;
        const nowIso = new Date().toISOString();

        // ── Split modes: preserve original designer's work as a sub-task ──
        if (mode === "split-pool" || mode === "split-assign") {
          if (!prevAssignee) {
            return { data: null, error: "No previous designer to preserve work for." };
          }
          if (qtyDone <= 0) {
            return { data: null, error: "No progress to preserve." };
          }

          const inserts: TaskAssignmentInsert[] = [
            {
              task_id: taskId,
              designer_id: prevAssignee,
              assigned_by: profile.id,
              qty_assigned: qtyDone,
              qty_completed: qtyDone,
              status: "completed",
              completed_at: nowIso,
              completion_filled_at: nowIso,
            },
          ];

          if (mode === "split-assign" && opts?.assignToDesignerId) {
            const remaining = current.qty - qtyDone;
            if (remaining <= 0) {
              return { data: null, error: "No remaining qty to assign." };
            }
            inserts.push({
              task_id: taskId,
              designer_id: opts.assignToDesignerId,
              assigned_by: profile.id,
              qty_assigned: remaining,
              qty_completed: 0,
              status: "assigned",
            });
          }

          const { error: splitErr } = await supabase
            .from("task_assignments")
            .insert(inserts);
          if (splitErr) {
            return { data: null, error: `Failed to create sub-tasks: ${splitErr.message}` };
          }
        }

        // ── Reset / Split-pool: send to pool ──
        if (mode === "reset" || mode === "split-pool") {
          const seq = extractSeq(current.task_code);
          const poolCode = buildTaskCode({
            designerLetter: "P",
            seq,
            concept: current.concept,
            qty: current.qty,
          });

          const { data, error } = await supabase
            .from("tasks")
            .update({
              assigned_to: null,
              status: "pool" as TaskStatus,
              task_code: poolCode,
              ...(mode === "reset" ? { qty_completed: 0 } : {}),
            })
            .eq("id", taskId)
            .select("*")
            .maybeSingle();
          if (error) return { data: null, error: error.message };
          if (!data) return { data: null, error: "Couldn't return to pool." };

          void supabase.from("task_logs").insert({
            task_id: taskId,
            status_from: current.status as TaskStatus,
            status_to: "pool" as TaskStatus,
            changed_by: profile.id,
            note: mode === "reset"
              ? "Returned to pool — progress reset"
              : `Returned to pool — ${qtyDone}/${current.qty} preserved as sub-task`,
          });

          if (prevAssignee && prevAssignee !== profile.id) {
            const code = current.task_code ?? "A task";
            void sendNotification(
              prevAssignee,
              mode === "reset" ? "Task Returned to Pool" : "Task Split — Your Progress Saved",
              mode === "reset"
                ? `${code} was returned to pool. Your progress was reset.`
                : `Your ${qtyDone} designs on ${code} were saved. The remaining ${current.qty - qtyDone} are back in the pool.`,
              mode === "reset" ? "warning" : "info",
              "/dashboard"
            );
          }

          return { data, error: null };
        }

        // ── Split-assign: clear assigned_to (task is now multi-designer) ──
        const { data, error } = await supabase
          .from("tasks")
          .update({ assigned_to: null })
          .eq("id", taskId)
          .select("*")
          .maybeSingle();
        if (error) return { data: null, error: error.message };

        void supabase.from("task_logs").insert({
          task_id: taskId,
          status_from: current.status as TaskStatus,
          status_to: "in_progress" as TaskStatus,
          changed_by: profile.id,
          note: `Split: ${qtyDone} preserved for original designer, remaining assigned to new designer`,
        });

        if (prevAssignee && prevAssignee !== profile.id) {
          const code = current.task_code ?? "A task";
          void sendNotification(
            prevAssignee,
            "Task Split — Your Progress Saved",
            `Your ${qtyDone} designs on ${code} were saved. Remaining assigned to another designer.`,
            "info",
            "/dashboard"
          );
        }

        if (opts?.assignToDesignerId) {
          const remaining = current.qty - qtyDone;
          void sendNotification(
            opts.assignToDesignerId,
            "Task Assignment",
            `You've been assigned ${remaining} designs on ${current.task_code ?? "a task"}`,
            "info",
            "/dashboard"
          );
        }

        return { data, error: null };
      } finally {
        setOpPending(key, false);
      }
    },
    [profile, setOpPending]
  );

  // --------------------------------------------------------------------
  // selfAssignTask — Designer claims a Pool task
  // --------------------------------------------------------------------
  const selfAssignTask = useCallback<UseTaskMutations["selfAssignTask"]>(
    async (taskId) => {
      if (!profile) return { data: null, error: "Not authenticated" };

      const key = `selfAssign:${taskId}`;
      setOpPending(key, true);
      try {
        // Fetch current state to validate
        const { data: current, error: fetchErr } = await supabase
          .from("tasks")
          .select(
            "status, started_at, assigned_to, task_code, concept, qty, concept_start_date"
          )
          .eq("id", taskId)
          .single();
        if (fetchErr) return { data: null, error: fetchErr.message };
        if (!current) return { data: null, error: "Task not found" };

        if (current.status !== "pool") {
          return {
            data: null,
            error: "Task can only be claimed from the Pool.",
          };
        }
        if (current.started_at) {
          return {
            data: null,
            error: "Task has already been started by someone else.",
          };
        }

        const previousAssignee = current.assigned_to;
        const designerLetter = await fetchDesignerLetter(profile.id);
        const seq = extractSeq(current.task_code);
        const newCode = buildTaskCode({
          designerLetter,
          seq,
          concept: current.concept,
          qty: current.qty,
        });

        const nowIso = new Date().toISOString();
        const { data, error } = await supabase
          .from("tasks")
          .update({
            assigned_to: profile.id,
            assigned_at: nowIso,
            started_at: nowIso,
            started_late: computeStartedLate(
              current.concept_start_date,
              nowIso
            ),
            status: "in_progress" as const,
            task_code: newCode,
          })
          .eq("id", taskId)
          .select("*")
          .single();

        if (error) return { data: null, error: error.message };

        // Best-effort: notify previous assignee if there was one
        if (previousAssignee && previousAssignee !== profile.id) {
          try {
            void sendNotification(
              previousAssignee,
              "Task reassigned",
              `Task ${newCode} was claimed by ${profile.full_name}.`,
              "info",
              "/dashboard"
            );
          } catch {
            // Non-critical — don't fail the mutation
          }
        }

        // Inform admins + coordinators that the pool just shrunk by one —
        // gives them visibility into who's pulling work without polling.
        const details = [
          data.concept ? `Design: ${data.concept}` : null,
          data.qty ? `Qty: ${data.qty}` : null,
          data.planned_deadline ? `Deadline: ${new Date(data.planned_deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : null,
          data.priority === "urgent" ? "⚡ Urgent" : null,
        ].filter(Boolean).join(" · ");
        void sendNotificationToRole(
          ["admin", "design_coordinator"],
          "Task Claimed from Pool",
          `${profile.full_name} claimed "${data.concept || "Task"}" — ${details}`,
          "info",
          "/dashboard"
        );

        return { data, error: null };
      } finally {
        setOpPending(key, false);
      }
    },
    [profile, setOpPending]
  );

  // --------------------------------------------------------------------
  // getNextPoolTasks — read-only peek for the claim modal (top N choices)
  // --------------------------------------------------------------------
  const getNextPoolTasks = useCallback<UseTaskMutations["getNextPoolTasks"]>(
    async (limit = 3) => {
      if (!profile) return { tasks: [], isBusy: false, poolCount: 0 };

      // Live pool count: unclaimed pool tasks + partially-assigned tasks with remaining qty
      const { count: poolCount } = await supabase
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .or("and(status.eq.pool,assigned_to.is.null),qty_remaining.gt.0");
      const total = poolCount ?? 0;

      if (total === 0) {
        return { tasks: [], isBusy: false, poolCount: 0 };
      }

      // Pull claimable tasks: standard pool + tasks with remaining qty.
      const { data: poolTasks } = await supabase
        .from("tasks")
        .select("*, client:clients(party_name)")
        .or("and(status.eq.pool,assigned_to.is.null),qty_remaining.gt.0");

      if (!poolTasks || poolTasks.length === 0) {
        return { tasks: [], isBusy: false, poolCount: 0 };
      }

      const sorted = [...(poolTasks as unknown as PoolTaskPreview[])].sort(
        comparePoolFifo
      );
      // Urgent-first, then oldest — the designer picks one of the top `limit`.
      return {
        tasks: sorted.slice(0, Math.max(1, limit)),
        isBusy: false,
        poolCount: sorted.length,
      };
    },
    [profile]
  );

  // --------------------------------------------------------------------
  // claimPoolTask — claim a SPECIFIC pool task with busy-check + deadline
  // --------------------------------------------------------------------
  const claimPoolTask = useCallback<UseTaskMutations["claimPoolTask"]>(
    async (taskId, plannedDeadline, fabric, designType) => {
      if (!profile) return { data: null, error: "Not authenticated" };
      if (!plannedDeadline) {
        return { data: null, error: "Pick a planned deadline first." };
      }
      const fab = (fabric ?? "").trim();
      const dt = (designType ?? "").trim();

      const key = "claimNext";
      setOpPending(key, true);
      try {
        // STEP B — fetch the chosen task; it must still be unclaimed.
        const { data: target, error: targetError } = await supabase
          .from("tasks")
          .select("*")
          .eq("id", taskId)
          .maybeSingle();
        if (targetError) return { data: null, error: targetError.message };
        if (!target || target.status !== "pool" || target.assigned_to) {
          // Someone grabbed it between the modal load and this click.
          const msg = await fetchClaimedByMessage(taskId);
          return { data: null, error: msg };
        }
        const chosen = target as Task;

        // STEP C — assign (optimistic lock on status='pool')
        const designerLetter = await fetchDesignerLetter(profile.id);
        const newCode = buildTaskCode({
          designerLetter,
          seq: extractSeq(chosen.task_code),
          concept: chosen.concept,
          qty: chosen.qty,
        });

        const nowIso = new Date().toISOString();
        const { data: claimed, error: claimError } = await supabase
          .from("tasks")
          .update({
            assigned_to: profile.id,
            assigned_at: nowIso,
            started_at: nowIso,
            started_late: computeStartedLate(chosen.concept_start_date, nowIso),
            planned_deadline: plannedDeadline,
            // pool → 'in_progress' directly. Claiming IS starting — there is
            // no separate Pending stage. The busy-check above therefore caps
            // a designer at one active task at a time.
            status: "in_progress" as const,
            task_code: newCode,
            ...(fab ? { fabric: fab } : {}),
            ...(dt ? { concept: dt } : {}),
          })
          .eq("id", chosen.id)
          .eq("status", "pool") // only if still unclaimed
          .select("*")
          .maybeSingle();

        if (claimError) return { data: null, error: claimError.message };
        if (!claimed) {
          // Lost the race — the row left 'pool' between our read and write.
          // Surface who grabbed it (and when) instead of a generic message.
          const msg = await fetchClaimedByMessage(chosen.id);
          return { data: null, error: msg };
        }

        // STEP D — notify coordinators (best-effort)
        try {
          void sendNotificationToRole(
            ["admin", "design_coordinator"],
            "Task Claimed from Pool",
            `${profile.full_name} claimed "${claimed.concept || "Task"}"${claimed.task_code ? ` (${claimed.task_code})` : ""}`,
            "info",
            "/dashboard"
          );
        } catch {
          // non-critical
        }

        return { data: claimed, error: null };
      } finally {
        setOpPending(key, false);
      }
    },
    [profile, setOpPending]
  );

  // --------------------------------------------------------------------
  // markTaskDone — Calculates delay_days and stamps completed_at
  // --------------------------------------------------------------------
  const markTaskDone = useCallback<UseTaskMutations["markTaskDone"]>(
    async (taskId) => {
      if (!profile) return { data: null, error: "Not authenticated" };

      const key = `markDone:${taskId}`;
      setOpPending(key, true);
      try {
        // Fetch assigned_at to compute delay
        const { data: current, error: fetchErr } = await supabase
          .from("tasks")
          .select("assigned_at, status")
          .eq("id", taskId)
          .single();
        if (fetchErr) return { data: null, error: fetchErr.message };
        if (!current) return { data: null, error: "Task not found" };

        const completedAt = new Date();
        let delayDays: number | null = null;

        if (current.assigned_at) {
          const assignedAt = new Date(current.assigned_at);
          delayDays = Math.floor(
            (completedAt.getTime() - assignedAt.getTime()) /
              (1000 * 60 * 60 * 24)
          );
        }

        const { data, error } = await supabase
          .from("tasks")
          .update({
            status: "done" as const,
            completed_at: completedAt.toISOString(),
            delay_days: delayDays,
          })
          .eq("id", taskId)
          .select("*")
          .single();

        if (error) return { data: null, error: error.message };

        const doneDetails = [
          data.concept ? `Design: ${data.concept}` : null,
          data.qty ? `Qty: ${data.qty}` : null,
          data.qty_completed ? `Done: ${data.qty_completed}` : null,
        ].filter(Boolean).join(" · ");
        void sendNotification(
          profile.id,
          "Task Completed",
          `You completed "${data.concept || "Task"}" — ${doneDetails}. Great work!`,
          "success",
          "/dashboard"
        );

        void sendNotificationToRole(
          ["admin", "design_coordinator"],
          "Task Completed",
          `${profile.full_name} completed "${data.concept || "Task"}" — ${doneDetails}`,
          "success",
          "/dashboard"
        );

        return { data, error: null };
      } finally {
        setOpPending(key, false);
      }
    },
    [profile, setOpPending]
  );

  // --------------------------------------------------------------------
  // completeTask — done → completed with fabric + mtr
  // --------------------------------------------------------------------
  const completeTask = useCallback<UseTaskMutations["completeTask"]>(
    async (taskId, fabric, mtr) => {
      if (!profile) return { data: null, error: "Not authenticated" };
      const fab = (fabric ?? "").trim();
      if (!fab) {
        return { data: null, error: "Fabric is required to complete this task." };
      }

      const key = `complete:${taskId}`;
      setOpPending(key, true);
      try {
        const { data, error } = await supabase
          .from("tasks")
          .update({
            status: "completed" as const,
            completion_fabric: fab,
            completion_mtr: mtr ?? null,
            completion_filled_by: profile.id,
            completion_filled_at: new Date().toISOString(),
          })
          .eq("id", taskId)
          .eq("status", "done") // only valid from the 'done' intermediate state
          .select("*")
          .maybeSingle();

        if (error) return { data: null, error: error.message };
        if (!data) {
          return {
            data: null,
            error: "This task isn't in the Done state (it may already be completed).",
          };
        }

        // Notify coordinators that a task is fully closed out.
        try {
          void sendNotificationToRole(
            ["admin", "design_coordinator"],
            "Task Fully Completed",
            `${profile.full_name} completed "${data.concept || "Task"}" — Fabric: ${fab} · Qty: ${data.qty}`,
            "success",
            "/dashboard"
          );
        } catch {
          // non-critical
        }

        return { data, error: null };
      } finally {
        setOpPending(key, false);
      }
    },
    [profile, setOpPending]
  );

  // --------------------------------------------------------------------
  // updateTask — General field update (edit dialog)
  // --------------------------------------------------------------------
  const updateTask = useCallback<UseTaskMutations["updateTask"]>(
    async (taskId, fields) => {
      if (!profile) return { data: null, error: "Not authenticated" };

      const key = `updateTask:${taskId}`;
      setOpPending(key, true);
      try {
        // .maybeSingle() instead of .single() — when RLS hides the row from
        // SELECT (e.g. a designer tries to update a task they don't own),
        // PostgREST returns the "Cannot coerce the result to a single JSON
        // object" error from .single(). maybeSingle returns null without
        // throwing, and we surface a clear permission message ourselves.
        const { data, error } = await supabase
          .from("tasks")
          .update(fields)
          .eq("id", taskId)
          .select("*")
          .maybeSingle();
        if (error) return { data: null, error: error.message };
        if (!data) {
          return {
            data: null,
            error: "You don't have permission to update this task.",
          };
        }
        return { data, error: null };
      } finally {
        setOpPending(key, false);
      }
    },
    [profile, setOpPending]
  );

  // --------------------------------------------------------------------
  // deleteTask (soft delete — only admin/super_admin)
  // --------------------------------------------------------------------
  const deleteTask = useCallback<UseTaskMutations["deleteTask"]>(
    async (taskId) => {
      if (!profile) return { data: null, error: "Not authenticated" };
      if (!isAdminRole(profile.role)) {
        return { data: null, error: "Only admins can delete tasks" };
      }

      const key = `delete:${taskId}`;
      setOpPending(key, true);
      try {
        // Hard delete — removes the task and cascades to task_logs + files.
        // Soft-delete (setting deleted_at) was the old approach but left
        // ghost rows visible to admins; a real DELETE is cleaner for this
        // internal tool.
        const { error } = await supabase
          .from("tasks")
          .delete()
          .eq("id", taskId);
        if (error) return { data: null, error: error.message };
        return { data: { id: taskId }, error: null };
      } finally {
        setOpPending(key, false);
      }
    },
    [profile, setOpPending]
  );

  // --------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------
  const isPending = useCallback(
    (op: TaskMutationOp, id?: string) => {
      const key = id ? `${op}:${id}` : op;
      return !!pending[key];
    },
    [pending]
  );

  return {
    createTask,
    updateTaskStatus,
    updateQtyCompleted,
    assignTask,
    handoffTask,
    returnToPool,
    selfAssignTask,
    claimPoolTask,
    getNextPoolTasks,
    markTaskDone,
    completeTask,
    updateTask,
    deleteTask,
    pending,
    isPending,
  };
}
