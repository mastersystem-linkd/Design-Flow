import type { UserRole } from "@/types/database";

/** Canonical route paths. Use these constants instead of string literals. */
export const ROUTES = {
  login: "/login",
  onboarding: "/onboarding",
  home: "/home",
  dashboard: "/dashboard",
  briefNew: "/brief/new",
  concepts: "/concepts",
  orders: "/orders",
  sampling: "/sampling",
  analytics: "/analytics",
  team: "/team",
  notifications: "/notifications",
  taskDashboard: "/task-dashboard",
  scorecards: "/scorecards",
  salvedge: "/salvedge",
  system: "/system",
  profile: "/profile",
  files: "/files",
  kitting: "/kitting",
} as const;

/** Helper for the dynamic `/scorecards/:designerId` route. */
export function scorecardDetailPath(designerId: string): string {
  return `${ROUTES.scorecards}/${designerId}`;
}

/** Helper for the dynamic `/kitting/:recordId` route used by the DEO. */
export function kittingDetailPath(recordId: string): string {
  return `${ROUTES.kitting}/${recordId}`;
}

/**
 * The default landing page for each role after sign-in. All roles land on
 * the home dashboard overview.
 */
export function roleHomePath(role: UserRole): string {
  switch (role) {
    case "super_admin":
    case "admin":
    case "design_coordinator":
    case "designer":
      return ROUTES.taskDashboard;
    case "deo":
      // DEO lands directly on the kitting queue — that's the entirety of
      // their workflow per the spec (view assigned kitting forms, digitize).
      return ROUTES.kitting;
  }
}
