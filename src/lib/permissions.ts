import type { UserRole } from "@/types/database";

export type Capability =
  | "tasks:create"
  | "tasks:update_any"
  | "tasks:update_own"
  | "tasks:delete"
  | "tasks:assign"
  | "tasks:log_sampling"
  | "clients:create"
  | "clients:update"
  | "clients:delete"
  | "files:upload"
  | "files:delete_any"
  | "users:view"
  | "users:manage_roles"
  | "logs:view";

const ROLE_CAPABILITIES: Record<UserRole, ReadonlySet<Capability>> = {
  super_admin: new Set<Capability>([
    "tasks:create",
    "tasks:update_any",
    "tasks:update_own",
    "tasks:delete",
    "tasks:assign",
    "tasks:log_sampling",
    "clients:create",
    "clients:update",
    "clients:delete",
    "files:upload",
    "files:delete_any",
    "users:view",
    "users:manage_roles",
    "logs:view",
  ]),
  admin: new Set<Capability>([
    "tasks:create",
    "tasks:update_any",
    "tasks:update_own",
    "tasks:delete",
    "tasks:assign",
    "tasks:log_sampling",
    "clients:create",
    "clients:update",
    "clients:delete",
    "files:upload",
    "files:delete_any",
    "users:view",
    "users:manage_roles",
    "logs:view",
  ]),
  designer: new Set<Capability>([
    "tasks:create",
    "tasks:update_own",
    "clients:create",
    "files:upload",
    "logs:view",
  ]),
  production: new Set<Capability>([
    "tasks:update_own",
    "tasks:log_sampling",
    "files:upload",
  ]),
};

export function can(role: UserRole | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role].has(capability);
}

export function canAny(
  role: UserRole | null | undefined,
  capabilities: readonly Capability[]
): boolean {
  return capabilities.some((c) => can(role, c));
}

export type NavSection =
  | "dashboard"
  | "tasks"
  | "clients"
  | "files"
  | "users"
  | "settings";

const ROLE_NAV: Record<UserRole, ReadonlySet<NavSection>> = {
  super_admin: new Set<NavSection>([
    "dashboard",
    "tasks",
    "clients",
    "files",
    "users",
    "settings",
  ]),
  admin: new Set<NavSection>([
    "dashboard",
    "tasks",
    "clients",
    "files",
    "users",
    "settings",
  ]),
  designer: new Set<NavSection>([
    "dashboard",
    "tasks",
    "clients",
    "files",
    "settings",
  ]),
  production: new Set<NavSection>(["dashboard", "tasks", "files", "settings"]),
};

export function canAccess(
  role: UserRole | null | undefined,
  section: NavSection
): boolean {
  if (!role) return false;
  return ROLE_NAV[role].has(section);
}

export const ROLE_RANK: Record<UserRole, number> = {
  production: 1,
  designer: 2,
  admin: 3,
  super_admin: 4,
};

export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}
