import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ConceptCategory } from "@/types/database";

interface Options {
  /** When true (default), only is_active rows are returned. */
  activeOnly?: boolean;
}

/**
 * Concept category taxonomy backing the Briefing form's Concept picker.
 * Sorted by sort_order (nulls last), then name ASC.
 */
export function useConceptCategories({ activeOnly = true }: Options = {}) {
  const [categories, setCategories] = useState<ConceptCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    let q = supabase
      .from("concept_categories")
      .select("*")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name");
    if (activeOnly) q = q.eq("is_active", true);
    const { data, error: err } = await q;
    if (err) {
      setError(err.message);
      setCategories([]);
    } else {
      setCategories(data ?? []);
    }
    setIsLoading(false);
  }, [activeOnly]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { categories, isLoading, error, refetch };
}
