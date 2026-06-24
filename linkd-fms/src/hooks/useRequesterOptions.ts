import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";

// ============================================================================
// useRequesterOptions — admin/coordinator-managed "Requester" roster used by
// the Coordinator Tasks "Log New Request" form. Single list (Requester only
// exists on that form). Managed from Settings → Dropdowns → Coordinator Tasks;
// mirrors the received_by_options / assigned_by_options lookups.
//
// DEFAULT_REQUESTERS is a fallback so the picker keeps working even if the
// table is empty or migration 0079 hasn't been applied yet.
// REQUESTER_OTHER is the free-text escape-hatch sentinel for the picker.
// ============================================================================

export interface RequesterOption {
  id: string;
  name: string;
  sort_order: number | null;
  is_active: boolean;
}

/** Free-text escape-hatch sentinel for the Requester picker. */
export const REQUESTER_OTHER = "__other__";

export const DEFAULT_REQUESTERS: readonly string[] = [
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

async function fetchRequesters(
  activeOnly: boolean
): Promise<RequesterOption[]> {
  let q = supabase
    .from("requester_options")
    .select("id, name, sort_order, is_active")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export function useRequesterOptions({ activeOnly = true }: Options = {}) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.requesterOptions.list(activeOnly),
    queryFn: () => fetchRequesters(activeOnly),
    // Don't spam retries when the table is missing pre-migration.
    retry: false,
  });

  const rows = data ?? [];
  const dbNames = rows.map((r) => r.name);
  const names = dbNames.length > 0 ? dbNames : [...DEFAULT_REQUESTERS];

  return {
    options: rows,
    names,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}
