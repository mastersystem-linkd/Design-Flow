import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { queryKeys } from "@/lib/queryKeys";
import type {
  Sample,
  SampleInsert,
  SampleUpdate,
  FileRecord,
  Profile,
} from "@/types/database";

// ============================================================================
// Types
// ============================================================================

export type MutationResult<T> = { data: T | null; error: string | null };

/**
 * The linked-task summary embedded on each Sample. Kept tiny on purpose —
 * full task details should be fetched on-demand via `useTaskDetail` when the
 * sample row is expanded. This shape is what the table preview / form picker
 * need and nothing more.
 */
export interface SampleLinkedTask {
  id: string;
  task_code: string | null;
  concept: string | null;
  status: string;
  description: string | null;
  assigned_to: string | null;
  client_id: string | null;
  qty: number | null;
  qty_completed: number | null;
  fabric: string | null;
  whatsapp_group: string | null;
  whatsapp_received_date: string | null;
  whatsapp_received_time: string | null;
  assigned_by: string | null;
  created_at: string | null;
  started_at: string | null;
  planned_deadline: string | null;
  started_late: boolean | null;
  client: { party_name: string } | null;
  assignee: { full_name: string; avatar_url: string | null } | null;
}

/** Sample row joined with its linked task. `task` is null when no task_id. */
export interface SampleWithTask extends Sample {
  task: SampleLinkedTask | null;
}

/** File record joined with its uploader profile. */
export interface TaskFileWithUploader extends FileRecord {
  uploader: Pick<Profile, "full_name" | "avatar_url"> | null;
}

export interface SampleFilters {
  /** Inclusive date range on created_at. */
  dateRange?: { from: string; to: string };
  /** ILIKE search on party_name. */
  customerName?: string;
  /** Filter by is_completed. */
  status?: "pending" | "completed" | "all";
  /** Provenance filter — single value or array for the Pending Samples tab. */
  source?: "manual" | "task_completion" | "sales_erp" | ("task_completion" | "sales_erp")[];
  /** Lifecycle status filter (pending / in_progress / completed). */
  sampleStatus?: "pending" | "in_progress" | "completed";
  /** Hide pending auto-created samples (task_completion + sales_erp) — they
   *  live in the Pending tab until processed. Used by the main Samples tab. */
  excludePendingTaskSamples?: boolean;
}

export interface UseSamples {
  samples: SampleWithTask[];
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => unknown;
  createSample: (input: SampleInsert) => Promise<MutationResult<Sample>>;
  updateSample: (
    id: string,
    data: SampleUpdate
  ) => Promise<MutationResult<Sample>>;
  deleteSample: (id: string) => Promise<MutationResult<{ id: string }>>;
}

interface SamplesBundle {
  samples: SampleWithTask[];
  totalCount: number;
}

// ============================================================================
// Query
// ============================================================================

// The shape we ask PostgREST for. The relationship aliases need the actual FK
// constraint names: samples_task_id_fkey (added in 0019) and the existing
// tasks→clients / tasks→profiles relationships used elsewhere.
//
// If migration 0019 hasn't been applied, the embedded `task:tasks!...` clause
// triggers a "relationship not found" error from PostgREST. We catch that and
// fall back to a plain select so the page still renders during deploys.
const FULL_SAMPLE_SELECT = `
  *,
  task:tasks!samples_task_id_fkey(
    id,
    task_code,
    concept,
    status,
    description,
    assigned_to,
    client_id,
    qty,
    qty_completed,
    fabric,
    whatsapp_group,
    whatsapp_received_date,
    whatsapp_received_time,
    assigned_by,
    created_at,
    started_at,
    planned_deadline,
    started_late,
    client:clients!tasks_client_id_fkey(party_name),
    assignee:profiles!tasks_assigned_to_fkey(full_name, avatar_url)
  )
`;

function isMissingRelationshipError(message: string): boolean {
  // PostgREST "Could not find a relationship between..." error code is PGRST200.
  return (
    message.includes("PGRST200") ||
    message.includes("Could not find a relationship") ||
    message.includes("samples_task_id_fkey")
  );
}

async function fetchSamples(
  filters: SampleFilters | undefined,
  pagination: { from: number; to: number } | undefined
): Promise<SamplesBundle> {
  function buildQuery(selectFragment: string) {
    let q = supabase
      .from("samples")
      .select(selectFragment, { count: "exact" })
      .order("created_at", { ascending: false });

    if (filters?.dateRange) {
      q = q
        .gte("created_at", filters.dateRange.from)
        .lte("created_at", filters.dateRange.to + "T23:59:59Z");
    }
    if (filters?.customerName) {
      q = q.ilike("party_name", `%${filters.customerName}%`);
    }
    if (filters?.status === "pending") {
      q = q.eq("is_completed", false);
    } else if (filters?.status === "completed") {
      q = q.eq("is_completed", true);
    }
    if (filters?.source) {
      if (Array.isArray(filters.source)) {
        q = q.in("source", filters.source);
      } else {
        q = q.eq("source", filters.source);
      }
    }
    if (filters?.sampleStatus) {
      q = q.eq("sample_status", filters.sampleStatus);
    }
    if (filters?.excludePendingTaskSamples) {
      // Hide pending auto-created samples (task_completion + sales_erp) —
      // they live in the Pending tab until processed.
      q = q.or("sample_status.neq.pending,source.eq.manual");
    }
    if (pagination) {
      q = q.range(pagination.from, pagination.to);
    }
    return q;
  }

  let { data, error, count } = await buildQuery(FULL_SAMPLE_SELECT);

  // 0019 fallback — render without the task join until the migration lands.
  if (error && isMissingRelationshipError(error.message)) {
    console.warn(
      "[useSamples] samples.task_id relation missing — falling back to flat select. " +
        "Apply migration 0019_samples_task_link to enable the embedded task."
    );
    const flat = await buildQuery("*");
    data = flat.data;
    error = flat.error;
    count = flat.count;
  }

  if (error) {
    console.error("[useSamples] query error", error);
    throw error;
  }

  const samples = ((data ?? []) as unknown as SampleWithTask[]).map((row) => ({
    ...row,
    // Defensive: when the fallback ran, task is undefined — normalise to null
    // so consumers can rely on the field existing.
    task: row.task ?? null,
  }));

  // PostgREST nested embeds through nullable FKs can return null for the
  // client even when the task has a client_id. Patch those in a single
  // batch query so `task.client.party_name` is always resolved.
  const missingClientIds = new Set<string>();
  for (const s of samples) {
    const t = s.task as (SampleLinkedTask & { client_id?: string | null }) | null;
    if (t?.client_id && !t.client?.party_name) {
      missingClientIds.add(t.client_id);
    }
  }
  if (missingClientIds.size > 0) {
    const { data: clients } = await supabase
      .from("clients")
      .select("id, party_name")
      .in("id", Array.from(missingClientIds));
    if (clients) {
      const clientMap = new Map(clients.map((c) => [c.id, c.party_name]));
      for (const s of samples) {
        const t = s.task as (SampleLinkedTask & { client_id?: string | null }) | null;
        if (t?.client_id && !t.client?.party_name) {
          const name = clientMap.get(t.client_id);
          if (name) {
            t.client = { party_name: name };
          }
        }
      }
    }
  }

  return { samples, totalCount: count ?? samples.length };
}

// ============================================================================
// On-demand task-file fetch (used by ProductionView when expanding a sample)
// ============================================================================

/**
 * Fetch all files attached to a task, newest first, with the uploader's
 * profile joined in. Returns [] when the task has no files or on any error
 * (we never want a file-list failure to block the sample drawer rendering).
 *
 * Storage URLs in `storage_url` are bucket-relative paths — UI consumers
 * pass them through `supabase.storage.from(...).createSignedUrl()` to render
 * thumbnails / downloads.
 */
export async function getTaskFiles(
  taskId: string
): Promise<TaskFileWithUploader[]> {
  if (!taskId) return [];
  const { data, error } = await supabase
    .from("files")
    .select(
      "*, uploader:profiles!files_uploaded_by_fkey(full_name, avatar_url)"
    )
    .eq("task_id", taskId)
    .order("uploaded_at", { ascending: false });
  if (error) {
    console.error("[getTaskFiles] query error", error);
    return [];
  }
  return (data ?? []) as unknown as TaskFileWithUploader[];
}

/**
 * Convenience: fetch every sample linked to a given task. Used by the
 * reverse-lookup section in TaskDetailDrawer.
 */
export async function getSamplesForTask(taskId: string): Promise<Sample[]> {
  if (!taskId) return [];
  const { data, error } = await supabase
    .from("samples")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[getSamplesForTask] query error", error);
    return [];
  }
  return (data ?? []) as Sample[];
}

// ============================================================================
// Hook
// ============================================================================

export function useSamples(
  filters?: SampleFilters,
  pagination?: { from: number; to: number }
): UseSamples {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const filterKey = JSON.stringify(filters ?? {});
  const pageKey = pagination ? `${pagination.from}-${pagination.to}` : "";

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.samples.list({ filterKey, pageKey }),
    queryFn: () => fetchSamples(filters, pagination),
  });

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.samples.all });
  }, [queryClient]);

  // ── Create ──────────────────────────────────────────────────────────
  const createSample = useCallback(
    async (input: SampleInsert): Promise<MutationResult<Sample>> => {
      if (!user) return { data: null, error: "Not authenticated" };
      if (!input.party_name?.trim())
        return { data: null, error: "Party name is required" };

      // task_id flows through unchanged — the SampleInsert type now accepts it.
      // Whitespace-only strings get normalised away so an empty form field
      // doesn't write the literal "" into a uuid column.
      const taskId = input.task_id?.toString().trim() || null;
      const row: SampleInsert = {
        ...input,
        party_name: input.party_name.trim(),
        created_by: user.id,
        task_id: taskId,
      };

      const { data: inserted, error: err } = await supabase
        .from("samples")
        .insert(row)
        .select("*")
        .single();

      if (err) {
        // Pre-0019 schema: silently drop task_id and retry so the user can
        // still log samples while the migration hasn't shipped yet.
        if (
          err.message?.includes("column") &&
          err.message?.includes("task_id")
        ) {
          const { task_id: _omitted, ...withoutTaskId } = row;
          const retry = await supabase
            .from("samples")
            .insert(withoutTaskId)
            .select("*")
            .single();
          if (retry.error) return { data: null, error: retry.error.message };
          invalidateAll();
          return { data: retry.data, error: null };
        }
        return { data: null, error: err.message };
      }
      invalidateAll();
      return { data: inserted, error: null };
    },
    [user, invalidateAll]
  );

  // ── Update ──────────────────────────────────────────────────────────
  const updateSample = useCallback(
    async (
      id: string,
      patch: SampleUpdate
    ): Promise<MutationResult<Sample>> => {
      if (!user) return { data: null, error: "Not authenticated" };

      // Same trim-then-nullify on task_id as the create path.
      const normalised: SampleUpdate = { ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "task_id")) {
        normalised.task_id = patch.task_id?.toString().trim() || null;
      }

      const { data: row, error: err } = await supabase
        .from("samples")
        .update(normalised)
        .eq("id", id)
        .select("*")
        .single();

      if (err) return { data: null, error: err.message };
      invalidateAll();
      return { data: row, error: null };
    },
    [user, invalidateAll]
  );

  // ── Delete ──────────────────────────────────────────────────────────
  const deleteSample = useCallback(
    async (id: string): Promise<MutationResult<{ id: string }>> => {
      if (!user) return { data: null, error: "Not authenticated" };

      const { error: err } = await supabase.from("samples").delete().eq("id", id);

      if (err) return { data: null, error: err.message };
      invalidateAll();
      return { data: { id }, error: null };
    },
    [user, invalidateAll]
  );

  return {
    samples: data?.samples ?? [],
    totalCount: data?.totalCount ?? 0,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
    createSample,
    updateSample,
    deleteSample,
  };
}
