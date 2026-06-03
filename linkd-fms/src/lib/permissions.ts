import type { UserRole } from "@/types/database";

/**
 * Centralized capability checks. Use these instead of inline role
 * comparisons so adding/renaming a role in the future is a one-file edit.
 *
 * Tier hierarchy (top → bottom):
 *   super_admin        — full power + exclusive Danger Zone access
 *   admin              — full power, including concept approval + role mgmt
 *   design_coordinator — admin powers EXCEPT concept approval + role changes
 *   designer           — submit work, claim from pool, edit own assignments
 */

/** Super-admin only — exclusive Danger Zone access. */
export function isSuperAdmin(role: UserRole | null | undefined): boolean {
  return role === "super_admin";
}

/** Admin-level access (super_admin + admin + design_coordinator). */
export function isAdmin(role: UserRole | null | undefined): boolean {
  return role === "super_admin" || role === "admin" || role === "design_coordinator";
}

/** `super_admin` OR `admin` OR `design_coordinator`. */
export function isAdminOrCoordinator(
  role: UserRole | null | undefined
): boolean {
  return role === "super_admin" || role === "admin" || role === "design_coordinator";
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
  return role === "super_admin" || role === "admin" || role === "design_coordinator" || role === "designer";
}

/** Submitting a concept — all roles can submit. */
export function canSubmitConcept(role: UserRole | null | undefined): boolean {
  return role === "super_admin" || role === "admin" || role === "design_coordinator" || role === "designer";
}

/** Changing other users' roles — super_admin + admin only. */
export function canChangeUserRoles(role: UserRole | null | undefined): boolean {
  return role === "super_admin" || role === "admin";
}

/** Soft-deleting / reverting tasks — admin + coordinator. */
export const canManageTaskLifecycle = isAdminOrCoordinator;

/** Creating new briefs — all roles except DEO. */
export function canCreateBriefs(role: UserRole | null | undefined): boolean {
  return role === "super_admin" || role === "admin" || role === "design_coordinator" || role === "designer";
}

/** Logging sampling completion — admin + coordinator. */
export const canLogSampling = isAdminOrCoordinator;

/** Moving a task backward in the pipeline (revisions etc.) — admin + coordinator. */
export const canMoveTaskBackward = isAdminOrCoordinator;

/** Danger Zone access — super_admin only. */
export function canAccessDangerZone(role: UserRole | null | undefined): boolean {
  return role === "super_admin";
}
