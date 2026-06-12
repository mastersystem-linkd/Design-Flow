import type { TaskAssignment } from "@/types/database";

/**
 * Split-task crediting primitives — the single source of truth for attributing
 * a SPLIT task's work to the designers who actually did it.
 *
 * THE RULE (applied everywhere — Task Dashboard, Scorecard):
 *   • SOLO task (`is_split = false`)  → credit `tasks.assigned_to` at task level.
 *   • SPLIT task (`is_split = true`)  → credit each `task_assignments` portion
 *     to its `designer_id`, and SKIP the parent task entirely.
 * Because a task is counted *either* task-level *or* portion-level (never both),
 * there is no double-counting. A designer who did 40 of a 100-design split gets
 * credited for 40 — not 0, not 100.
 *
 * Sales-ERP tasks carry assignments / assigned_to exactly like internal ones, so
 * these helpers credit ERP work identically — no source partiality.
 */

/** The minimal assignment shape the analytics layer needs. */
export type AssignmentCredit = Pick<
  TaskAssignment,
  | "task_id"
  | "designer_id"
  | "status"
  | "qty_assigned"
  | "qty_completed"
  | "planned_deadline"
  | "started_at"
  | "completed_at"
  | "created_at"
>;

const DAY_MS = 86_400_000;

/** A split portion is "completed" only at its terminal status. */
export function assignmentCompleted(a: AssignmentCredit): boolean {
  return a.status === "completed";
}

/**
 * In-progress = actively being worked (NOT yet completed, NOT the interim
 * 'done'/awaiting-fabric state). Mirrors the solo side which counts only
 * `status === 'in_progress'`, so split + solo engagement is symmetric.
 */
export function assignmentActive(a: AssignmentCredit): boolean {
  return a.status === "assigned" || a.status === "in_progress";
}

/**
 * On-time vs the PORTION's OWN deadline (`task_assignments.planned_deadline`),
 * not the parent task's. Day-granularity (YYYY-MM-DD) string compare avoids
 * timezone drift. No deadline or not completed → treated as on-time.
 */
export function assignmentOnTime(a: AssignmentCredit): boolean {
  if (!assignmentCompleted(a) || !a.completed_at || !a.planned_deadline) return true;
  return a.completed_at.slice(0, 10) <= a.planned_deadline.slice(0, 10);
}

/** Days late vs the portion's deadline (0 when on/under deadline, null if N/A). */
export function assignmentLateDays(a: AssignmentCredit): number | null {
  if (!assignmentCompleted(a) || !a.completed_at || !a.planned_deadline) return null;
  const done = new Date(a.completed_at.slice(0, 10)).getTime();
  const dl = new Date(a.planned_deadline.slice(0, 10)).getTime();
  return Math.max(0, Math.round((done - dl) / DAY_MS));
}

/** Cycle days for a completed portion (started → completed). */
export function assignmentCycleDays(a: AssignmentCredit): number | null {
  if (!a.completed_at || !a.started_at) return null;
  const d = (new Date(a.completed_at).getTime() - new Date(a.started_at).getTime()) / DAY_MS;
  return d >= 0 ? Math.round(d * 10) / 10 : null;
}
