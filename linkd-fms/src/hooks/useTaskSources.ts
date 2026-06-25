import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import { WHATSAPP_GROUPS } from "@/lib/whatsappGroups";

// ============================================================================
// useTaskSources — admin/coordinator-managed "Task Source" roster used by the
// brief "Group" picker (New Brief + Edit Task). Replaces the hardcoded list in
// lib/whatsappGroups.ts, which is kept ONLY as a fallback so the picker never
// goes blank if the table is empty or migration 0086 hasn't been applied.
//
// `is_whatsapp` drives the green WhatsApp icon in the picker (toggled per row
// from Settings → Dropdowns → Tasks → Task Source). Mirrors the other lookups.
// ============================================================================

export interface TaskSourceOption {
  id: string;
  name: string;
  is_whatsapp: boolean;
  sort_order: number | null;
  is_active: boolean;
}

interface Options {
  /** When true (default), only is_active rows are returned. */
  activeOnly?: boolean;
}

async function fetchTaskSources(activeOnly: boolean): Promise<TaskSourceOption[]> {
  let q = supabase
    .from("task_sources")
    .select("id, name, is_whatsapp, sort_order, is_active")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export function useTaskSources({ activeOnly = true }: Options = {}) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.taskSources.list(activeOnly),
    queryFn: () => fetchTaskSources(activeOnly),
    retry: false,
  });

  const rows = data ?? [];

  // Picker options ({ name, is_whatsapp }). Fall back to the legacy hardcoded
  // catalogue when the table is empty / pre-migration so the brief form's Group
  // picker is never blank. The Settings editor uses `rows` (raw DB), not this.
  const options: { name: string; is_whatsapp: boolean }[] =
    rows.length > 0
      ? rows.map((r) => ({ name: r.name, is_whatsapp: r.is_whatsapp }))
      : WHATSAPP_GROUPS.map((g) => ({ name: g.name, is_whatsapp: g.isWhatsApp }));

  const names = options.map((o) => o.name);
  const whatsappNames = new Set(
    options.filter((o) => o.is_whatsapp).map((o) => o.name)
  );
  /** Whether a source name should show the WhatsApp icon / require a message time. */
  const isWhatsApp = (name: string) => whatsappNames.has(name);

  return {
    /** Raw DB rows — used by the Settings editor (LookupSection). */
    rows,
    /** Picker options with WhatsApp flag, with hardcoded fallback. */
    options,
    names,
    isWhatsApp,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}
