import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { Profile, UserRole } from "@/types/database";

interface Options {
  /** If set, only profiles whose role is in this list are returned. */
  roles?: UserRole[];
}

async function fetchProfiles(roles: UserRole[] | undefined): Promise<Profile[]> {
  let q = supabase.from("profiles").select("*").order("full_name");
  if (roles && roles.length) {
    q = q.in("role", roles);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** Lists profiles, optionally filtered by role. Ordered by full_name. */
export function useProfiles({ roles }: Options = {}) {
  // Stable key — sorted + joined so callers passing new array refs reuse cache.
  const rolesKey = roles ? roles.slice().sort().join(",") : "";
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.profiles.byRole(rolesKey),
    queryFn: () => fetchProfiles(roles),
  });
  const profiles = data ?? [];
  return {
    profiles,
    totalCount: profiles.length,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}
