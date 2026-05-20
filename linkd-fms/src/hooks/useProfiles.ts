import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Profile, UserRole } from "@/types/database";

interface Options {
  /** If set, only profiles whose role is in this list are returned. */
  roles?: UserRole[];
}

/** Lists profiles, optionally filtered by role. Ordered by full_name. */
export function useProfiles({ roles }: Options = {}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rolesKey = roles ? roles.slice().sort().join(",") : "";

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    let q = supabase.from("profiles").select("*").order("full_name");
    if (roles && roles.length) {
      q = q.in("role", roles);
    }
    const { data, error: err } = await q;
    if (err) {
      setError(err.message);
      setProfiles([]);
    } else {
      setProfiles(data ?? []);
    }
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesKey]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { profiles, totalCount: profiles.length, isLoading, error, refetch };
}
