import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/components/ui";
import type { UserPreferences } from "@/types/database";

// ============================================================================
// useUserPreferences — per-user table column visibility (DB-backed).
// ----------------------------------------------------------------------------
// Column keys map 1:1 to the real <th>/<td> pairs rendered in KanbanView's
// wide task table. The bulk-select checkbox and the sticky Action column are
// NOT toggleable (always visible) so they're absent from ALL_COLUMNS.
// ============================================================================

// NOTE: only the bulk-select checkbox and the sticky Action column are NOT
// toggleable (always visible) — they're absent from ALL_COLUMNS below. The
// "Reference" column (reference files, key "files") IS toggleable.
export type ColumnKey =
  | "date"
  | "claimed"
  | "designer"
  | "concept"
  | "description"
  | "files"
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
  { key: "date", label: "Briefed" },
  { key: "claimed", label: "Claimed" },
  { key: "designer", label: "Designer" },
  { key: "concept", label: "Concept" },
  { key: "description", label: "Description" },
  { key: "files", label: "Reference" },
  { key: "party_name", label: "Party Name" },
  { key: "fabric", label: "Fabric" },
  { key: "whatsapp_group", label: "WhatsApp Group" },
  { key: "message_date", label: "Received Date" },
  { key: "message_time", label: "Received Time" },
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
  "files",
  "party_name",
  "message_date",
  "message_time",
  "qty",
  "deadline",
];

// ----------------------------------------------------------------------------
// Per-stage column visibility (see §14).
// Column choices persist independently for each pipeline stage. Each stage
// starts from its own default set; once a user tweaks a stage in the Columns
// menu, that stage's selection is remembered.
// ----------------------------------------------------------------------------
export type PipelineStage = "pool" | "in_progress" | "completed";

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  "pool",
  "in_progress",
  "completed",
];

/** In Progress shows the active-work columns by default (designer / fabric /
 *  who assigned it / full-kitting), and drops the completion + message
 *  columns that only matter once a task is closed. */
export const IN_PROGRESS_DEFAULT_COLUMNS: ColumnKey[] = [
  "date",
  "claimed",
  "designer",
  "concept",
  "description",
  "party_name",
  "fabric",
  "whatsapp_group",
  "assigned_by",
  "qty",
  "pending",
  "full_kitting",
];

/** Completed is a terminal view: it keeps the identifying + context columns
 *  and surfaces the completion data (completion timestamp / completed /
 *  completed-late), while dropping message dates, planned deadline, pending,
 *  and full-kitting. */
export const COMPLETED_DEFAULT_COLUMNS: ColumnKey[] = [
  "date",
  "claimed",
  "designer",
  "concept",
  "description",
  "party_name",
  "fabric",
  "whatsapp_group",
  "assigned_by",
  "qty",
  "completion_timestamp",
  "completed",
  "started_late",
];

/** Default visible columns for a given stage. Pool reuses the generic
 *  DEFAULT_COLUMNS; In Progress and Completed have their own tailored sets. */
export function defaultColumnsForStage(stage: PipelineStage): ColumnKey[] {
  if (stage === "in_progress") return [...IN_PROGRESS_DEFAULT_COLUMNS];
  if (stage === "completed") return [...COMPLETED_DEFAULT_COLUMNS];
  return [...DEFAULT_COLUMNS];
}

export type VisibleColumnsByStage = Record<PipelineStage, string[]>;

/** Shape persisted in the `visible_columns` JSONB:
 *  - `current`  — the live per-stage selection (what the table shows).
 *  - `defaults` — the user's *own* per-stage default (the Reset target). A
 *    stage absent here falls back to the built-in `defaultColumnsForStage`. */
export interface StoredColumnPrefs {
  current: VisibleColumnsByStage;
  defaults: Partial<Record<PipelineStage, string[]>>;
}

function freshStageMap(): VisibleColumnsByStage {
  return {
    pool: defaultColumnsForStage("pool"),
    in_progress: defaultColumnsForStage("in_progress"),
    completed: defaultColumnsForStage("completed"),
  };
}

/** Fill any missing stage in a partial map with its built-in default. */
function fillStageMap(partial: unknown): VisibleColumnsByStage {
  const obj =
    partial && typeof partial === "object"
      ? (partial as Record<string, unknown>)
      : {};
  const map = freshStageMap();
  for (const stage of PIPELINE_STAGES) {
    if (Array.isArray(obj[stage])) map[stage] = obj[stage] as string[];
  }
  return map;
}

/** Keep only the stages that carry an explicit array (used for `defaults`). */
function pickStageArrays(
  partial: unknown
): Partial<Record<PipelineStage, string[]>> {
  const obj =
    partial && typeof partial === "object"
      ? (partial as Record<string, unknown>)
      : {};
  const out: Partial<Record<PipelineStage, string[]>> = {};
  for (const stage of PIPELINE_STAGES) {
    if (Array.isArray(obj[stage])) out[stage] = obj[stage] as string[];
  }
  return out;
}

/** Coerce whatever is stored into the `{ current, defaults }` shape, tolerating
 *  three historical formats:
 *    1. legacy flat `string[]`  → becomes the Pool current view (no defaults)
 *    2. flat per-stage map      → becomes `current` (no custom defaults)
 *    3. `{ current, defaults }` → used as-is. */
function normalizeStored(stored: unknown): StoredColumnPrefs {
  if (
    stored &&
    typeof stored === "object" &&
    !Array.isArray(stored) &&
    "current" in (stored as object)
  ) {
    const s = stored as Record<string, unknown>;
    return {
      current: fillStageMap(s.current),
      defaults: pickStageArrays(s.defaults),
    };
  }
  if (Array.isArray(stored)) {
    const current = freshStageMap();
    current.pool = [...(stored as string[])];
    return { current, defaults: {} };
  }
  return { current: fillStageMap(stored), defaults: {} };
}

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

  // No row yet — create one seeded with the per-stage default column sets and
  // no custom defaults (built-in defaults apply until the user pins their own).
  const seed: StoredColumnPrefs = { current: freshStageMap(), defaults: {} };
  const { data: created, error: insertErr } = await supabase
    .from("user_preferences")
    .insert({
      user_id: userId,
      visible_columns: seed as unknown as Record<string, unknown>,
    })
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

  // Writes the whole `{ current, defaults }` object. Callers compute the next
  // value from the cached prefs so unrelated stages/keys are preserved.
  const updatePrefs = useMutation({
    mutationFn: async (next: StoredColumnPrefs) => {
      if (!userId) throw new Error("Not signed in");
      const { error } = await supabase
        .from("user_preferences")
        .update({
          visible_columns: next as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (error) throw error;
      return next;
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<UserPreferences>(key);
      if (prev) {
        queryClient.setQueryData<UserPreferences>(key, {
          ...prev,
          visible_columns: next as unknown as UserPreferences["visible_columns"],
        });
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
      console.error("[useUserPreferences] save failed:", err);
      toast.error("Column preferences couldn't be saved. Please try again.");
    },
  });

  /** Read the freshest prefs from the cache so chained updates don't clobber. */
  const readPrefs = () =>
    normalizeStored(
      queryClient.getQueryData<UserPreferences>(key)?.visible_columns
    );

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
  });

  const prefs = normalizeStored(data?.visible_columns);

  const tableDensity: TableDensity =
    (data?.table_density as TableDensity | undefined) === "compact"
      ? "compact"
      : "comfortable";

  return {
    /** Full per-stage current column map. */
    visibleColumnsByStage: prefs.current,
    /** Columns visible for one stage. */
    getVisibleColumns: (stage: PipelineStage) => prefs.current[stage],
    /** The Reset target for a stage — the user's own saved default if they've
     *  pinned one, else the built-in default. */
    getDefaultColumns: (stage: PipelineStage): string[] =>
      prefs.defaults[stage] ?? defaultColumnsForStage(stage),
    /** True when the user has pinned a personal default for this stage. */
    hasCustomDefault: (stage: PipelineStage) =>
      Array.isArray(prefs.defaults[stage]),
    tableDensity,
    isLoading: !!userId && isPending,
    /** Persist the column set for a single stage; other stages are untouched. */
    setVisibleColumns: (stage: PipelineStage, columns: string[]) => {
      const cur = readPrefs();
      updatePrefs.mutate({
        current: { ...cur.current, [stage]: columns },
        defaults: cur.defaults,
      });
    },
    /** Pin the stage's current selection as the user's personal default. */
    setDefaultColumns: (stage: PipelineStage) => {
      const cur = readPrefs();
      updatePrefs.mutate({
        current: cur.current,
        defaults: { ...cur.defaults, [stage]: [...cur.current[stage]] },
      });
    },
    setTableDensity: (d: TableDensity) => updateDensity.mutate(d),
    isSaving: updatePrefs.isPending || updateDensity.isPending,
  };
}
