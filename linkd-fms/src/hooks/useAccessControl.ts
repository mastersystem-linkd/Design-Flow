import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types/database";
import {
  type AccessFeatureKey,
  defaultGranted,
  isFullAccessRole,
} from "@/lib/accessControl";

// ============================================================================
// useAccessControl — role-based menu access (RBAC).
// ----------------------------------------------------------------------------
// Reads the role_permissions table and resolves each (role, feature) to an
// effective grant. Resolution is ALWAYS synchronous via built-in defaults, so
// the UI never flashes or locks out while the table loads (or if it's missing
// pre-migration): the table only supplies OVERRIDES on top of the defaults.
//
//   resolve(role, key) =
//     super_admin                  → true   (locked full access)
//     explicit row in table        → row.granted
//     otherwise                    → defaultGranted(role, key)
// ============================================================================

interface RolePermissionRow {
  role: UserRole;
  permission_key: string;
  granted: boolean;
}

async function fetchRolePermissions(): Promise<RolePermissionRow[]> {
  const { data, error } = await supabase
    .from("role_permissions")
    .select("role, permission_key, granted");
  if (error) throw error;
  return (data ?? []) as RolePermissionRow[];
}

/**
 * Full matrix resolver + editor. Used by the Settings → Access Control tab and
 * (via useMyAccess) by the sidebar.
 */
export function useRolePermissions() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.rolePermissions.all,
    queryFn: fetchRolePermissions,
    // Don't spam retries when the table is missing pre-migration — defaults
    // keep the app fully usable.
    retry: false,
    staleTime: 60_000,
  });

  // role → key → granted (explicit overrides only)
  const overrides = useMemo(() => {
    const map = new Map<UserRole, Map<string, boolean>>();
    for (const row of data ?? []) {
      if (!map.has(row.role)) map.set(row.role, new Map());
      map.get(row.role)!.set(row.permission_key, row.granted);
    }
    return map;
  }, [data]);

  const resolve = useCallback(
    (role: UserRole, key: AccessFeatureKey): boolean => {
      if (isFullAccessRole(role)) return true;
      const explicit = overrides.get(role)?.get(key);
      return explicit ?? defaultGranted(role, key);
    },
    [overrides]
  );

  const mutation = useMutation({
    mutationFn: async (vars: {
      role: UserRole;
      key: AccessFeatureKey;
      granted: boolean;
    }) => {
      const { error: err } = await supabase
        .from("role_permissions")
        .upsert(
          {
            role: vars.role,
            permission_key: vars.key,
            granted: vars.granted,
            updated_by: profile?.id ?? null,
          },
          { onConflict: "role,permission_key" }
        );
      if (err) throw err;
    },
    // Optimistic — flip the cell instantly, roll back on error.
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.rolePermissions.all });
      const prev = queryClient.getQueryData<RolePermissionRow[]>(
        queryKeys.rolePermissions.all
      );
      queryClient.setQueryData<RolePermissionRow[]>(
        queryKeys.rolePermissions.all,
        (old) => {
          const rows = (old ?? []).filter(
            (r) => !(r.role === vars.role && r.permission_key === vars.key)
          );
          rows.push({ role: vars.role, permission_key: vars.key, granted: vars.granted });
          return rows;
        }
      );
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(queryKeys.rolePermissions.all, ctx.prev);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.rolePermissions.all });
    },
  });

  /** Set a cell. Returns { error } and never throws (toast-ready). */
  const setAccess = useCallback(
    async (
      role: UserRole,
      key: AccessFeatureKey,
      granted: boolean
    ): Promise<{ error: string | null }> => {
      try {
        await mutation.mutateAsync({ role, key, granted });
        return { error: null };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Failed to update access" };
      }
    },
    [mutation]
  );

  return {
    resolve,
    setAccess,
    isLoading,
    isSaving: mutation.isPending,
    error: error instanceof Error ? error.message : null,
  };
}

/**
 * Effective access for the CURRENT user. `can(key)` powers sidebar nav
 * filtering. Falls back to "designer" when the profile hasn't loaded yet.
 */
export function useMyAccess() {
  const { profile } = useAuth();
  const role: UserRole = profile?.role ?? "designer";
  const { resolve, isLoading } = useRolePermissions();
  const can = useCallback(
    (key: AccessFeatureKey) => resolve(role, key),
    [resolve, role]
  );
  return { can, role, isLoading };
}
