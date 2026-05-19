import { can, canAccess, type Capability, type NavSection } from "@/lib/permissions";
import type { UserRole } from "@/types/database";

type Props = {
  role: UserRole | null | undefined;
  capability?: Capability;
  section?: NavSection;
  fallback?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Renders children only if the role satisfies the given capability/section.
 * Pure presentation — server enforcement lives in RLS + requireCapability().
 */
export function RoleGate({
  role,
  capability,
  section,
  fallback = null,
  children,
}: Props) {
  let allowed = true;
  if (capability) allowed = allowed && can(role, capability);
  if (section) allowed = allowed && canAccess(role, section);
  return <>{allowed ? children : fallback}</>;
}
