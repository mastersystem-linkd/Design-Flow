import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";

// ============================================================================
// useReceivedByOptions — admin/coordinator-managed "Received By" roster used by
// the Full Knitting form. Single list (Received By only exists on that form).
// Managed from Settings → Received By; mirrors the other lookups.
//
// DEFAULT_RECEIVED_BY is a fallback so the picker keeps working even if the
// table is empty or migration 0049 hasn't been applied yet.
// ============================================================================

export interface ReceivedByOption {
  id: string;
  name: string;
  sort_order: number | null;
  is_active: boolean;
}

export const DEFAULT_RECEIVED_BY: readonly string[] = [
  "Anand Sir",
  "Eldee",
  "Gaurav Sir",
  "Hiren",
  "Jiten",
  "Laxmikant Sir",
  "Nandu Desai",
  "Naushi Ma'am",
  "Raghav Sir",
  "Ramesh Sawant",
  "Self",
  "Shubham",
  "Shukla",
  "Supriya Sonawane",
] as const;

interface Options {
  /** When true (default), only is_active rows are returned. */
  activeOnly?: boolean;
}

async function fetchReceivedBy(
  activeOnly: boolean
): Promise<ReceivedByOption[]> {
  let q = supabase
    .from("received_by_options")
    .select("id, name, sort_order, is_active")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export function useReceivedByOptions({ activeOnly = true }: Options = {}) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.receivedByOptions.list(activeOnly),
    queryFn: () => fetchReceivedBy(activeOnly),
    retry: false,
  });

  const rows = data ?? [];
  const dbNames = rows.map((r) => r.name);
  const names = dbNames.length > 0 ? dbNames : [...DEFAULT_RECEIVED_BY];

  return {
    options: rows,
    names,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}
