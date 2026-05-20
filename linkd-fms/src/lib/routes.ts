import type { UserRole } from "@/types/database";

/** Canonical route paths. Use these constants instead of string literals. */
export const ROUTES = {
  login: "/login",
  onboarding: "/onboarding",
  home: "/home",
  dashboard: "/dashboard",
  briefNew: "/brief/new",
  concepts: "/concepts",
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
} as const;

/** Helper for the dynamic `/scorecards/:designerId` route. */
export function scorecardDetailPath(designerId: string): string {
  return `${ROUTES.scorecards}/${designerId}`;
}

/**
 * The default landing page for each role after sign-in. All roles land on
 * the home dashboard overview.
 */
export function roleHomePath(role: UserRole): string {
  switch (role) {
    case "admin":
    case "design_coordinator":
    case "designer":
      return ROUTES.taskDashboard;
  }
}
