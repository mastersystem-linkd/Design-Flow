import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { Fabric } from "@/types/database";

interface Options {
  /** When true (default), only is_active rows are returned. */
  activeOnly?: boolean;
}

async function fetchFabrics(activeOnly: boolean): Promise<Fabric[]> {
  let q = supabase
    .from("fabrics")
    .select("*")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/**
 * Fabric taxonomy backing the Briefing form's Fabric picker.
 * Sorted by sort_order (nulls last), then name ASC.
 */
export function useFabrics({ activeOnly = true }: Options = {}) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.fabrics.list(activeOnly),
    queryFn: () => fetchFabrics(activeOnly),
  });
  return {
    fabrics: data ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}
