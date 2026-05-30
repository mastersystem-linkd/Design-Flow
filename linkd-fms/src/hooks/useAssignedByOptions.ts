import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";

// ============================================================================
// useAssignedByOptions — admin/coordinator-managed "Assigned By" rosters.
// ----------------------------------------------------------------------------
// Each form context keeps its own list (Settings → Assigned By, 3 pill tabs):
//   'task'         → New Brief, Edit Task, Submit Concept
//   'full_kitting' → Full Knitting form
//   'sampling'     → Sampling form
//
// `DEFAULT_ASSIGNED_BY` is a fallback so the pickers keep working even if a
// context is empty or migrations 0045/0047 haven't been applied yet.
// ============================================================================

export type AssignedByContext = "task" | "full_kitting" | "sampling";

export const ASSIGNED_BY_CONTEXTS: {
  key: AssignedByContext;
  label: string;
}[] = [
  { key: "task", label: "Tasks" },
  { key: "full_kitting", label: "Full Knitting" },
  { key: "sampling", label: "Sampling" },
];

export interface AssignedByOption {
  id: string;
  name: string;
  context: string;
  sort_order: number | null;
  is_active: boolean;
}

/** Free-text escape-hatch sentinel shared by the pickers. */
export const ASSIGNED_BY_OTHER = "__other__";

/** Fallback roster (matches the migration seed). Used only when a context's
 *  rows are unavailable/empty so dropdowns are never blank. */
export const DEFAULT_ASSIGNED_BY: readonly string[] = [
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

async function fetchAssignedBy(
  context: AssignedByContext,
  activeOnly: boolean
): Promise<AssignedByOption[]> {
  let q = supabase
    .from("assigned_by_options")
    .select("id, name, context, sort_order, is_active")
    .eq("context", context)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/**
 * "Assigned By" roster for a given form context. Returns the full rows (for the
 * Settings LookupSection) plus a convenience `names` array of active labels for
 * the pickers. Falls back to DEFAULT_ASSIGNED_BY when the context is empty or
 * the query errors (e.g. migration not yet applied).
 */
export function useAssignedByOptions(
  context: AssignedByContext = "task",
  { activeOnly = true }: Options = {}
) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.assignedByOptions.list(context, activeOnly),
    queryFn: () => fetchAssignedBy(context, activeOnly),
    // Don't spam retries when the table/column is missing pre-migration.
    retry: false,
  });

  const rows = data ?? [];
  const dbNames = rows.map((r) => r.name);
  const names = dbNames.length > 0 ? dbNames : [...DEFAULT_ASSIGNED_BY];

  return {
    options: rows,
    names,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}
