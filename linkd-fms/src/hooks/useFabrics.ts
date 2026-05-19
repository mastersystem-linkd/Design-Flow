import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Fabric } from "@/types/database";

interface Options {
  /** When true (default), only is_active rows are returned. */
  activeOnly?: boolean;
}

/**
 * Fabric taxonomy backing the Briefing form's Fabric picker.
 * Sorted by sort_order (nulls last), then name ASC.
 */
export function useFabrics({ activeOnly = true }: Options = {}) {
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    let q = supabase
      .from("fabrics")
      .select("*")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name");
    if (activeOnly) q = q.eq("is_active", true);
    const { data, error: err } = await q;
    if (err) {
      setError(err.message);
      setFabrics([]);
    } else {
      setFabrics(data ?? []);
    }
    setIsLoading(false);
  }, [activeOnly]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { fabrics, isLoading, error, refetch };
}
