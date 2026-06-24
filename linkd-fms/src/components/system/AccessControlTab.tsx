import { Check, Lock, Minus, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRolePermissions } from "@/hooks/useAccessControl";
import { Card, CardContent, Badge, SkeletonText, toast } from "@/components/ui";
import { isSuperAdmin } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/database";
import {
  ACCESS_MODULES,
  ACCESS_ROLES,
  type AccessFeatureKey,
  isCellEditable,
  isFullAccessRole,
} from "@/lib/accessControl";

// ============================================================================
// AccessControlTab — per-role menu access matrix (RBAC).
//   Rows    = features, grouped by module.
//   Columns = roles. super_admin is locked to full access (recovery path).
//   Cells   = toggle (editable) · locked full · "—" (not applicable to role).
// Toggling writes role_permissions and updates that role's sidebar nav on its
// next load. Route guards stay the hard security floor, so this never locks
// anyone out of a URL they could already reach.
// ============================================================================

const ROLE_BADGE: Record<UserRole, string> = {
  super_admin: "bg-primary text-primary-foreground border-transparent",
  admin: "bg-primary/15 text-primary border-primary/30",
  design_coordinator: "bg-primary/10 text-primary border-primary/20",
  designer: "bg-success/15 text-success border-success/30",
  deo: "bg-warning/20 text-warning border-warning/40",
};

export function AccessControlTab() {
  const { profile } = useAuth();
  const role = profile?.role;
  const canEdit = isSuperAdmin(role) || role === "admin";
  const { resolve, setAccess, isLoading, isSaving } = useRolePermissions();

  async function handleToggle(
    r: UserRole,
    key: AccessFeatureKey,
    current: boolean
  ) {
    if (!canEdit) return;
    const { error } = await setAccess(r, key, !current);
    if (error) toast.error(error);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <ShieldCheck className="h-[18px] w-[18px] text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Access Control</h3>
              <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
                Choose which menus each role sees. <strong>Super Admin</strong> always
                has full access. Changes apply on the role's next page load.
                Toggle a menu off to hide it from that role; <Minus className="inline h-3 w-3 align-[-1px]" /> marks
                menus that don't apply to a role.
              </p>
            </div>
          </div>
          {isSaving && (
            <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
              Saving…
            </span>
          )}
        </CardContent>
      </Card>

      {/* Matrix */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5">
              <SkeletonText lines={6} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-card/30">
                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Menu / Feature
                    </th>
                    {ACCESS_ROLES.map((r) => (
                      <th key={r} className="px-3 py-3 text-center">
                        <Badge
                          className={cn(
                            "border text-[10px] font-semibold",
                            ROLE_BADGE[r]
                          )}
                        >
                          {ROLE_LABELS[r]}
                        </Badge>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ACCESS_MODULES.map((mod) => (
                    <ModuleRows
                      key={mod.key}
                      moduleLabel={mod.label}
                      features={mod.features}
                      resolve={resolve}
                      canEdit={canEdit}
                      onToggle={handleToggle}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ModuleRows({
  moduleLabel,
  features,
  resolve,
  canEdit,
  onToggle,
}: {
  moduleLabel: string;
  features: { key: AccessFeatureKey; label: string; description: string }[];
  resolve: (role: UserRole, key: AccessFeatureKey) => boolean;
  canEdit: boolean;
  onToggle: (role: UserRole, key: AccessFeatureKey, current: boolean) => void;
}) {
  return (
    <>
      <tr className="bg-secondary/40">
        <td
          colSpan={ACCESS_ROLES.length + 1}
          className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {moduleLabel}
        </td>
      </tr>
      {features.map((f) => (
        <tr key={f.key} className="border-b border-border/60 hover:bg-secondary/20">
          <td className="px-4 py-2.5">
            <p className="font-medium text-foreground">{f.label}</p>
            <p className="text-[11px] text-muted-foreground">{f.description}</p>
          </td>
          {ACCESS_ROLES.map((r) => (
            <td key={r} className="px-3 py-2.5 text-center">
              <AccessCell
                role={r}
                featureKey={f.key}
                granted={resolve(r, f.key)}
                canEdit={canEdit}
                onToggle={onToggle}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function AccessCell({
  role,
  featureKey,
  granted,
  canEdit,
  onToggle,
}: {
  role: UserRole;
  featureKey: AccessFeatureKey;
  granted: boolean;
  canEdit: boolean;
  onToggle: (role: UserRole, key: AccessFeatureKey, current: boolean) => void;
}) {
  // super_admin: permanent full access.
  if (isFullAccessRole(role)) {
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary"
        title="Super Admin always has full access"
      >
        <Lock className="h-3 w-3" />
      </span>
    );
  }

  // Not part of this role's surface — page assumes other roles/RLS.
  if (!isCellEditable(role, featureKey)) {
    return <Minus className="mx-auto h-3.5 w-3.5 text-muted-foreground/40" aria-label="Not applicable" />;
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={granted}
      disabled={!canEdit}
      onClick={() => onToggle(role, featureKey, granted)}
      title={granted ? "Granted — click to hide" : "Hidden — click to grant"}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors",
        granted
          ? "border-success/40 bg-success/15 text-success hover:bg-success/25"
          : "border-border bg-secondary text-transparent hover:border-success/40 hover:text-success/40",
        !canEdit && "cursor-not-allowed opacity-60"
      )}
    >
      <Check className="h-3.5 w-3.5" />
    </button>
  );
}
