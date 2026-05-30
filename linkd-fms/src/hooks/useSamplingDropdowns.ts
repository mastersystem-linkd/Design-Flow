import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";

// ============================================================================
// useSamplingDropdowns — managed dropdown lists for the Sampling form:
//   requirement · sampling_done_by · fusing_operator
// One field-scoped table (sampling_dropdowns). Fetched once and grouped by
// field. Managed from Settings → Dropdowns → Sampling.
//
// DEFAULT_* fallbacks keep the pickers working if the table is empty or
// migration 0050 hasn't been applied yet.
// ============================================================================

export type SamplingField =
  | "requirement"
  | "sampling_done_by"
  | "fusing_operator";

export interface SamplingDropdownRow {
  id: string;
  field: string;
  name: string;
  sort_order: number | null;
  is_active: boolean;
}

const EMPTY: SamplingDropdownRow[] = [];

async function fetchSamplingDropdowns(
  activeOnly: boolean
): Promise<SamplingDropdownRow[]> {
  let q = supabase
    .from("sampling_dropdowns")
    .select("id, field, name, sort_order, is_active")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

interface Options {
  activeOnly?: boolean;
}

/**
 * Returns the Sampling dropdown lists grouped by field. `rowsByField` feeds the
 * Settings LookupSections; `names` feeds the form pickers.
 */
export function useSamplingDropdowns({ activeOnly = true }: Options = {}) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.samplingDropdowns.list(activeOnly),
    queryFn: () => fetchSamplingDropdowns(activeOnly),
    retry: false,
  });

  const rows = data ?? EMPTY;

  const rowsByField = useMemo(() => {
    const out: Record<SamplingField, SamplingDropdownRow[]> = {
      requirement: [],
      sampling_done_by: [],
      fusing_operator: [],
    };
    for (const r of rows) {
      if (r.field in out) out[r.field as SamplingField].push(r);
    }
    return out;
  }, [rows]);

  const names = useMemo(
    () => ({
      requirement: rowsByField.requirement.map((r) => r.name),
      sampling_done_by: rowsByField.sampling_done_by.map((r) => r.name),
      fusing_operator: rowsByField.fusing_operator.map((r) => r.name),
    }),
    [rowsByField]
  );

  return {
    rowsByField,
    names,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}
