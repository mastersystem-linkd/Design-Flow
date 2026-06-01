import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/hooks/useAuth";
import type { UserPreferences } from "@/types/database";

// ============================================================================
// useUserPreferences — per-user table column visibility (DB-backed).
// ----------------------------------------------------------------------------
// Column keys map 1:1 to the real <th>/<td> pairs rendered in KanbanView's
// wide task table. The bulk-select checkbox and the sticky Action column are
// NOT toggleable (always visible) so they're absent from ALL_COLUMNS.
// ============================================================================

// NOTE: the "Reference" column (reference files) is NOT toggleable — it is
// always rendered as its own column in KanbanView (like the Action column), so
// it's intentionally absent from ALL_COLUMNS / DEFAULT_COLUMNS below.
export type ColumnKey =
  | "date"
  | "designer"
  | "concept"
  | "description"
  | "party_name"
  | "fabric"
  | "whatsapp_group"
  | "message_date"
  | "message_time"
  | "assigned_by"
  | "qty"
  | "deadline"
  | "completion_timestamp"
  | "completed"
  | "pending"
  | "started_late"
  | "full_kitting";

/** Every toggleable column, in render order, with its header label. */
export const ALL_COLUMNS: readonly { key: ColumnKey; label: string }[] = [
  { key: "date", label: "Date/Time" },
  { key: "designer", label: "Designer" },
  { key: "concept", label: "Concept" },
  { key: "description", label: "Description" },
  { key: "party_name", label: "Party Name" },
  { key: "fabric", label: "Fabric" },
  { key: "whatsapp_group", label: "WhatsApp Group" },
  { key: "message_date", label: "Message Date" },
  { key: "message_time", label: "Message Time" },
  { key: "assigned_by", label: "Assigned By" },
  { key: "qty", label: "QTY" },
  { key: "deadline", label: "Planned Deadline" },
  { key: "completion_timestamp", label: "Completion Timestamp" },
  { key: "completed", label: "Completed" },
  { key: "pending", label: "Pending" },
  // Key stays "started_late" (legacy) to preserve saved prefs; the column now
  // means "completed after the planned deadline".
  { key: "started_late", label: "Completed Late" },
  { key: "full_kitting", label: "Full Kitting" },
] as const;

/** Sensible starting view for a wide board: when, who, what, for whom,
 *  how much, by when. Users can Show All or hide further from the menu. */
export const DEFAULT_COLUMNS: ColumnKey[] = [
  "date",
  "designer",
  "concept",
  "party_name",
  "message_date",
  "message_time",
  "qty",
  "deadline",
];

/** Columns that can never be hidden together — keeps at least one identifying
 *  column on screen so a row is never anonymous. */
export const REQUIRED_ONE_OF: ColumnKey[] = ["concept", "party_name"];

async function fetchOrCreatePreferences(
  userId: string
): Promise<UserPreferences> {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  // No row yet — create one seeded with the default column set.
  const { data: created, error: insertErr } = await supabase
    .from("user_preferences")
    .insert({ user_id: userId, visible_columns: DEFAULT_COLUMNS })
    .select("*")
    .single();
  if (insertErr) throw insertErr;
  return created;
}

export type TableDensity = "comfortable" | "compact";

export function useUserPreferences() {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const queryClient = useQueryClient();
  const key = queryKeys.userPreferences.detail(userId ?? "anon");

  const { data, isPending } = useQuery({
    queryKey: key,
    queryFn: () => fetchOrCreatePreferences(userId as string),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });

  const updateColumns = useMutation({
    mutationFn: async (columns: string[]) => {
      if (!userId) throw new Error("Not signed in");
      const { error } = await supabase
        .from("user_preferences")
        .update({
          visible_columns: columns,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (error) throw error;
      return columns;
    },
    onMutate: async (columns) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<UserPreferences>(key);
      if (prev) {
        queryClient.setQueryData<UserPreferences>(key, {
          ...prev,
          visible_columns: columns,
        });
      }
      return { prev };
    },
    onError: (_err, _columns, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const updateDensity = useMutation({
    mutationFn: async (density: TableDensity) => {
      if (!userId) throw new Error("Not signed in");
      const { error } = await supabase
        .from("user_preferences")
        .update({
          table_density: density,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (error) throw error;
      return density;
    },
    onMutate: async (density) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<UserPreferences>(key);
      if (prev) {
        queryClient.setQueryData<UserPreferences>(key, {
          ...prev,
          table_density: density,
        });
      }
      return { prev };
    },
    onError: (_err, _d, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const visibleColumns =
    (data?.visible_columns as string[] | undefined) ?? DEFAULT_COLUMNS;

  const tableDensity: TableDensity =
    (data?.table_density as TableDensity | undefined) === "compact"
      ? "compact"
      : "comfortable";

  return {
    visibleColumns,
    tableDensity,
    isLoading: !!userId && isPending,
    setVisibleColumns: (columns: string[]) => updateColumns.mutate(columns),
    setTableDensity: (d: TableDensity) => updateDensity.mutate(d),
    isSaving: updateColumns.isPending || updateDensity.isPending,
  };
}
