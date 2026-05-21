import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { ConceptCategory } from "@/types/database";

interface Options {
  /** When true (default), only is_active rows are returned. */
  activeOnly?: boolean;
}

async function fetchConceptCategories(
  activeOnly: boolean
): Promise<ConceptCategory[]> {
  let q = supabase
    .from("concept_categories")
    .select("*")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/**
 * Concept category taxonomy backing the Briefing form's Concept picker.
 * Sorted by sort_order (nulls last), then name ASC.
 */
export function useConceptCategories({ activeOnly = true }: Options = {}) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.categories.list(activeOnly),
    queryFn: () => fetchConceptCategories(activeOnly),
  });
  return {
    categories: data ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}
