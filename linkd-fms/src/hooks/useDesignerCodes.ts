import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DesignerCode, Profile } from "@/types/database";

type ProfileLite = Pick<Profile, "id" | "full_name" | "role" | "avatar_url">;

export interface DesignerCodeWithProfile extends DesignerCode {
  profile: ProfileLite | null;
}

export interface UseDesignerCodesResult {
  /** Flat list — every row from designer_codes, with the joined profile attached. */
  codes: DesignerCodeWithProfile[];
  /** Keyed by profile_id — handy when rendering per-designer in a team table. */
  codesByProfile: Map<string, DesignerCodeWithProfile[]>;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Lists every designer code joined with the owner profile. Returns both the
 * flat array and a `Map<profile_id, codes[]>` for convenience.
 */
export function useDesignerCodes(): UseDesignerCodesResult {
  const [codes, setCodes] = useState<DesignerCodeWithProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("designer_codes")
      .select(
        "*, profile:profiles!designer_codes_profile_id_fkey(id, full_name, role, avatar_url)"
      )
      .order("joining_date", { ascending: true });
    if (err) {
      console.error("[useDesignerCodes] query error", err);
      setError(err.message);
      setCodes([]);
    } else {
      setCodes((data ?? []) as unknown as DesignerCodeWithProfile[]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const codesByProfile = useMemo(() => {
    const map = new Map<string, DesignerCodeWithProfile[]>();
    for (const c of codes) {
      const bucket = map.get(c.profile_id) ?? [];
      bucket.push(c);
      map.set(c.profile_id, bucket);
    }
    return map;
  }, [codes]);

  return { codes, codesByProfile, isLoading, error, refetch };
}
