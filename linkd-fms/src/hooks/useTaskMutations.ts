import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { isAdminOrCoordinator } from "@/lib/permissions";
import { sendNotification, sendNotificationToRole } from "@/lib/notifications";
import type {
  Task,
  TaskInsert,
  TaskStatus,
  TaskPriority,
  UserRole,
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
  client_id: string;
  concept: string;
  qty: number;
  fabric: string;
  priority?: TaskPriority;
  assigned_to?: string | null;
  planned_deadline?: string | null;
  due_time?: string | null;
  whatsapp_group?: string | null;
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
  /** Designer self-assigns from Pool. Only if status=pool AND started_at IS NULL. */
  selfAssignTask: (taskId: string) => Promise<MutationResult<Task>>;
  /**
   * Mark a task as done with delay_days calculation.
   * Returns the updated task; caller decides whether to open the kitting modal.
   */
  markTaskDone: (taskId: string) => Promise<MutationResult<Task>>;
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

/** Fields the edit dialog can update. All optional — only changed values sent. */
export interface UpdateTaskFields {
  concept?: string;
  description?: string | null;
  fabric?: string;
  qty?: number;
  qty_completed?: number;
  mtr?: number | null;
  priority?: TaskPriority;
  planned_deadline?: string | null;
  due_time?: string | null;
  whatsapp_group?: string | null;
  assigned_to?: string | null;
  assigned_by?: string | null;
  client_id?: string;
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
  | "selfAssign"
  | "markDone"
  | "delete";

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
      if (!input.client_id?.trim()) {
        return { data: null, error: "client_id is required" };
      }
      if (!input.concept?.trim()) {
        return { data: null, error: "concept is required" };
      }
      if (!input.fabric?.trim()) {
        return { data: null, error: "fabric is required" };
      }
      if (!Number.isFinite(input.qty) || input.qty <= 0) {
        return { data: null, error: "qty must be a positive number" };
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
        client_id: input.client_id,
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
        if (newQty > current.qty) {
          return {
            data: null,
            error: `qty_completed (${newQty}) cannot exceed total qty (${current.qty})`,
          };
        }

        // Decide whether to auto-advance status.
        const update: { qty_completed: number; status?: TaskStatus } = {
          qty_completed: newQty,
        };
        const currentStatus = current.status as TaskStatus;

        if (newQty === current.qty) {
          // Finished kitting → move to full_kitting (if not already past it).
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
          .select("status, task_code, concept, qty, concept_start_date")
          .eq("id", taskId)
          .single();
        if (fetchErr) return { data: null, error: fetchErr.message };
        if (!current) return { data: null, error: "Task not found" };

        const update: {
          assigned_to: string;
          status?: TaskStatus;
          task_code?: string;
          assigned_at?: string;
          started_at?: string;
          started_late?: boolean;
        } = {
          assigned_to: designerId,
        };
        if (current.status === "pool") {
          const nowIso = new Date().toISOString();
          update.status = "in_progress";
          update.assigned_at = nowIso;
          update.started_at = nowIso;
          update.started_late = computeStartedLate(
            current.concept_start_date,
            nowIso
          );
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

        const { data, error } = await supabase
          .from("tasks")
          .update(update)
          .eq("id", taskId)
          .select("*")
          .single();
        if (error) return { data: null, error: error.message };

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
            assigned_by: profile.full_name,
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
        void sendNotificationToRole(
          ["admin", "design_coordinator"],
          "Task Claimed from Pool",
          `${profile.full_name} claimed ${newCode} from the pool`,
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

        // Notify admins + coordinators that a task crossed the finish line.
        void sendNotificationToRole(
          ["admin", "design_coordinator"],
          "Task Completed",
          `${profile.full_name} completed ${data.task_code ?? taskId}`,
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
    selfAssignTask,
    markTaskDone,
    updateTask,
    deleteTask,
    pending,
    isPending,
  };
}
