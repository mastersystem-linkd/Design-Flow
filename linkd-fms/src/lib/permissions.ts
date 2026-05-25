import type { UserRole } from "@/types/database";

/**
 * Centralized capability checks. Use these instead of inline role
 * comparisons so adding/renaming a role in the future is a one-file edit.
 *
 * Tier hierarchy (top → bottom):
 *   admin              — full power, including concept approval + role mgmt
 *   design_coordinator — admin powers EXCEPT concept approval + role changes
 *   designer           — submit work, claim from pool, edit own assignments
 */

/** Admin-level access. Includes `design_coordinator` who now has full admin powers. */
export function isAdmin(role: UserRole | null | undefined): boolean {
  return role === "admin" || role === "design_coordinator";
}

/** `admin` OR `design_coordinator`. Use for all "elevated" task / brief /
 *  sampling / client management checks. */
export function isAdminOrCoordinator(
  role: UserRole | null | undefined
): boolean {
  return role === "admin" || role === "design_coordinator";
}

/** Just `design_coordinator`. Rarely needed on its own. */
export function isCoordinator(role: UserRole | null | undefined): boolean {
  return role === "design_coordinator";
}

/** Just `designer`. */
export function isDesigner(role: UserRole | null | undefined): boolean {
  return role === "designer";
}

// ============================================================================
// Capability-specific aliases (more readable at call sites)
// ============================================================================

/** Approving / rejecting concepts — admin + coordinator. */
export const canReviewConcepts = isAdmin;

/** Viewing the /concepts page — all roles can view now. */
export function canViewConcepts(role: UserRole | null | undefined): boolean {
  return role === "admin" || role === "design_coordinator" || role === "designer";
}

/** Submitting a concept — all roles can submit. */
export function canSubmitConcept(role: UserRole | null | undefined): boolean {
  return role === "admin" || role === "design_coordinator" || role === "designer";
}

/** Changing other users' roles — admin only, prevents self-promotion. */
export const canChangeUserRoles = isAdmin;

/** Soft-deleting / reverting tasks — admin + coordinator. */
export const canManageTaskLifecycle = isAdminOrCoordinator;

/** Creating new briefs — all roles. Designers can log their own tasks from My Board;
 *  RLS still enforces that `created_by` is the caller and forbids tombstoning. */
export function canCreateBriefs(role: UserRole | null | undefined): boolean {
  return role === "admin" || role === "design_coordinator" || role === "designer";
}

/** Logging sampling completion — admin + coordinator. */
export const canLogSampling = isAdminOrCoordinator;

/** Moving a task backward in the pipeline (revisions etc.) — admin + coordinator. */
export const canMoveTaskBackward = isAdminOrCoordinator;
