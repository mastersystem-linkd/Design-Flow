import type { UserRole } from "@/types/database";
import { ROUTES } from "@/lib/routes";

// ============================================================================
// Access Control — the master permission dictionary + per-role defaults.
// ----------------------------------------------------------------------------
// A "feature" is a navigable menu area (1:1 with a sidebar item / route). The
// Settings → Access Control matrix lets super_admin/admin tailor which features
// each role sees in its sidebar.
//
// Resolution (see useAccessControl):
//   super_admin → always full access (locked, not editable)
//   else        → role_permissions.granted if a row exists, else the default
//                 below (which mirrors the current per-role sidebar nav).
//
// This governs NAV VISIBILITY only. Route-level `allowedRoles` guards remain
// the hard security floor — so defaults == today's behavior, no lockouts.
// ============================================================================

export type AccessFeatureKey =
  | "dashboards"
  | "all_tasks"
  | "concepts"
  | "orders"
  | "sampling"
  | "salvedge"
  | "coordinator_tasks"
  | "kitting"
  | "files"
  | "scorecards"
  | "settings";

export interface AccessFeature {
  key: AccessFeatureKey;
  label: string;
  description: string;
  route: string;
}

export interface AccessModule {
  key: string;
  label: string;
  features: AccessFeature[];
}

/** Master dictionary — grouped by module (drives the matrix UI headers). */
export const ACCESS_MODULES: AccessModule[] = [
  {
    key: "overview",
    label: "Overview",
    features: [
      { key: "dashboards", label: "Dashboards", description: "Task & concept analytics", route: ROUTES.taskDashboard },
    ],
  },
  {
    key: "workflow",
    label: "Workflow",
    features: [
      { key: "all_tasks", label: "All Tasks / My Board", description: "Task pipeline board", route: ROUTES.dashboard },
      { key: "concepts", label: "Concepts", description: "Concept submission & approval", route: ROUTES.concepts },
    ],
  },
  {
    key: "operations",
    label: "Operations",
    features: [
      { key: "orders", label: "Orders", description: "Orders (placeholder)", route: ROUTES.orders },
      { key: "sampling", label: "Sampling", description: "Sampling hub", route: ROUTES.sampling },
      { key: "salvedge", label: "Salvedge", description: "Fabric distribution", route: ROUTES.salvedge },
      { key: "coordinator_tasks", label: "Coordinator Tasks", description: "Personal to-do list", route: ROUTES.coordinatorTasks },
      { key: "kitting", label: "Knitting Queue", description: "DEO digitization queue", route: ROUTES.kitting },
    ],
  },
  {
    key: "resources",
    label: "Resources",
    features: [
      { key: "files", label: "Files", description: "File browser", route: ROUTES.files },
      { key: "scorecards", label: "Scorecards", description: "Designer scorecards", route: ROUTES.scorecards },
    ],
  },
  {
    key: "administration",
    label: "Administration",
    features: [
      { key: "settings", label: "Settings & Admin", description: "This settings area", route: ROUTES.system },
    ],
  },
];

export const ACCESS_FEATURES: AccessFeature[] = ACCESS_MODULES.flatMap((m) => m.features);
export const ACCESS_FEATURE_KEYS: AccessFeatureKey[] = ACCESS_FEATURES.map((f) => f.key);

/** Roles shown as columns in the matrix, top tier → bottom. */
export const ACCESS_ROLES: UserRole[] = [
  "super_admin",
  "admin",
  "design_coordinator",
  "designer",
  "deo",
];

/** Roles that always have full access and can't be edited (recovery path). */
export function isFullAccessRole(role: UserRole): boolean {
  return role === "super_admin";
}

// Built-in defaults, derived from the current per-role sidebar nav
// (Sidebar.getNavGroups). These are the fallback when role_permissions has no
// row for a (role, feature) — so an empty/partial table == today's menus.
const DEFAULTS: Record<UserRole, AccessFeatureKey[]> = {
  super_admin: [...ACCESS_FEATURE_KEYS],
  admin: [
    "dashboards", "all_tasks", "concepts", "orders", "sampling", "salvedge",
    "coordinator_tasks", "files", "scorecards", "settings",
  ],
  design_coordinator: [
    "dashboards", "all_tasks", "concepts", "orders", "sampling", "salvedge",
    "coordinator_tasks", "files", "scorecards", "settings",
  ],
  designer: ["dashboards", "all_tasks", "concepts", "salvedge", "files"],
  deo: ["kitting"],
};

export const DEFAULT_ROLE_ACCESS: Record<UserRole, Set<AccessFeatureKey>> =
  Object.fromEntries(
    ACCESS_ROLES.map((r) => [r, new Set(DEFAULTS[r])])
  ) as Record<UserRole, Set<AccessFeatureKey>>;

/** Is this feature granted to this role by default (pre-customization)? */
export function defaultGranted(role: UserRole, key: AccessFeatureKey): boolean {
  if (isFullAccessRole(role)) return true;
  return DEFAULT_ROLE_ACCESS[role]?.has(key) ?? false;
}

/**
 * Is this (role, feature) cell editable in the matrix?
 * - super_admin: never (locked full access).
 * - others: only features that are part of the role's default surface. Pages
 *   assume specific roles/RLS, so we let admins RESTRICT a role's own menus,
 *   not graft pages a role was never designed for.
 */
export function isCellEditable(role: UserRole, key: AccessFeatureKey): boolean {
  if (isFullAccessRole(role)) return false;
  return DEFAULT_ROLE_ACCESS[role]?.has(key) ?? false;
}
