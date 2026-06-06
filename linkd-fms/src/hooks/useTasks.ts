import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { queryKeys } from "@/lib/queryKeys";
import type {
  TaskPriority,
  TaskStatus,
  TaskWithRelations,
} from "@/types/database";

// ============================================================================
// Types
// ============================================================================

export interface TaskFilters {
  /** Single status or list. If list, uses `IN (...)`. */
  status?: TaskStatus | TaskStatus[];
  /** Filter to a specific assignee user-id. Ignored if `myTasksOnly` is true. */
  assignedTo?: string;
  /** Shorthand for `assignedTo = current user`. Overrides `assignedTo`. */
  myTasksOnly?: boolean;
  clientId?: string;
  /** Spec called for "normal | urgent"; we support all four for flexibility. */
  priority?: TaskPriority;
  /** ILIKE match on `concept` OR `task_code`. */
  search?: string;
  /** Inclusive range on `planned_deadline` (dates only — time is ignored). */
  dateRange?: { from: Date; to: Date };
}

export interface UseTasksResult {
  tasks: TaskWithRelations[];
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => unknown;
}

// ============================================================================
// Query
// ============================================================================

const SELECT_FRAGMENT = `
  *,
  client:clients!tasks_client_id_fkey(id, party_name),
  assignee:profiles!tasks_assigned_to_fkey(id, full_name, role, avatar_url),
  creator:profiles!tasks_created_by_fkey(id, full_name, role, avatar_url),
  carry_forwarder:profiles!tasks_carry_forward_from_fkey(id, full_name),
  files(id, file_name, file_size, storage_url)
`;

/** Strip out characters that would break PostgREST's `.or()` syntax. */
function sanitizeSearchTerm(term: string): string {
  return term.trim().replace(/[,()*]/g, " ").replace(/\s+/g, " ").trim();
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchTasks(
  filters: TaskFilters | undefined,
  userId: string | undefined
): Promise<TaskWithRelations[]> {
  // Caller asked for "my tasks" but we don't have a user yet — return empty
  // rather than firing a wide query.
  if (filters?.myTasksOnly && !userId) return [];

  let q = supabase.from("tasks").select(SELECT_FRAGMENT);

  if (filters?.status) {
    if (Array.isArray(filters.status)) {
      if (filters.status.length > 0) q = q.in("status", filters.status);
    } else {
      q = q.eq("status", filters.status);
    }
  }

  if (filters?.myTasksOnly && userId) {
    // Include tasks directly assigned AND tasks where this user has a split assignment
    const { data: assignmentTaskIds } = await supabase
      .from("task_assignments")
      .select("task_id")
      .eq("designer_id", userId);
    const splitIds = (assignmentTaskIds ?? []).map((a) => a.task_id);
    if (splitIds.length > 0) {
      q = q.or(`assigned_to.eq.${userId},id.in.(${splitIds.join(",")})`);
    } else {
      q = q.eq("assigned_to", userId);
    }
  } else if (filters?.assignedTo) {
    q = q.eq("assigned_to", filters.assignedTo);
  }

  if (filters?.clientId) q = q.eq("client_id", filters.clientId);
  if (filters?.priority) q = q.eq("priority", filters.priority);

  if (filters?.search) {
    const term = sanitizeSearchTerm(filters.search);
    if (term) {
      q = q.or(`concept.ilike.%${term}%,task_code.ilike.%${term}%`);
    }
  }

  if (filters?.dateRange) {
    q = q
      .gte("planned_deadline", toIsoDate(filters.dateRange.from))
      .lte("planned_deadline", toIsoDate(filters.dateRange.to));
  }

  // task_priority enum order: low < normal < high < urgent → DESC = urgent first.
  q = q
    .order("priority", { ascending: false })
    .order("planned_deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  const { data, error } = await q;
  if (error) {
    console.error("[useTasks] query error", error);
    throw error;
  }
  return (data ?? []) as unknown as TaskWithRelations[];
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Fetch tasks (with client + assignee + creator joined in one round-trip).
 *
 * Backed by React Query — the filters object is serialised into the query key
 * so changing filters automatically refetches and switching back hits the cache.
 *
 * A Realtime subscription on the `tasks` table invalidates every task query
 * whenever the row set changes, so live updates still propagate.
 */
export function useTasks(filters?: TaskFilters): UseTasksResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Serialise the filters into a stable string so equal filter objects with
  // different references reuse the same cache entry.
  const filterKey = JSON.stringify(filters ?? {}, (_, v) =>
    v instanceof Date ? v.toISOString() : v
  );
  const userKey = filters?.myTasksOnly ? user?.id ?? "" : "any";

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.tasks.list({ filterKey, userKey }),
    queryFn: () => fetchTasks(filters, user?.id),
  });

  // Realtime: any change to `tasks` rows nukes the cache for every task query
  // (list + detail). React Query then refetches the active subscribers.
  useEffect(() => {
    const channel = supabase
      .channel("tasks-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const tasks = data ?? [];
  return {
    tasks,
    totalCount: tasks.length,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}

// ============================================================================
// Pool with ghost rows
// ============================================================================

/** Return the Monday (00:00 local) of the ISO week containing `date`. */
export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun … 6=Sat
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface PoolWithGhostsResult {
  /** Active pool tasks + ghost (recently-claimed) tasks, sorted by pool_sequence. */
  tasks: TaskWithRelations[];
  /** IDs of ghost rows (claimed, no longer in pool). */
  ghostIds: Set<string>;
  isLoading: boolean;
  error: string | null;
  refetch: () => unknown;
}

/**
 * Fetches both active pool tasks and "ghost" rows — tasks that were recently
 * claimed from the pool but should still be visible (greyed-out) to show the
 * queue's progression. Ghost = task where `pool_sequence IS NOT NULL`,
 * `status != 'pool'`, and `pool_week_start >= previous Monday`.
 */
export function usePoolWithGhosts(): PoolWithGhostsResult {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["pool-with-ghosts"],
    queryFn: async () => {
      const monday = getMonday(new Date());
      const prevMonday = new Date(monday);
      prevMonday.setDate(prevMonday.getDate() - 7);
      const prevMondayStr = prevMonday.toISOString().split("T")[0];

      // Active pool tasks + partially-assigned tasks with remaining qty
      const { data: active, error: activeErr } = await supabase
        .from("tasks")
        .select(SELECT_FRAGMENT)
        .or("status.eq.pool,qty_remaining.gt.0")
        .order("pool_sequence", { ascending: true });

      if (activeErr) throw activeErr;

      // Ghost rows — claimed this week or last week
      const { data: ghosts, error: ghostErr } = await supabase
        .from("tasks")
        .select(SELECT_FRAGMENT)
        .neq("status", "pool")
        .not("pool_sequence", "is", null)
        .gte("pool_week_start", prevMondayStr!)
        .order("pool_sequence", { ascending: true });

      if (ghostErr) throw ghostErr;

      // Deduplicate: a task with qty_remaining > 0 appears in both queries.
      const activeIds = new Set((active ?? []).map((t: { id: string }) => t.id));
      const uniqueGhosts = (ghosts ?? []).filter(
        (t: { id: string }) => !activeIds.has(t.id)
      );

      const all = [...(active ?? []), ...uniqueGhosts]
        .sort(
          (a, b) => (a.pool_sequence ?? 999) - (b.pool_sequence ?? 999)
        ) as unknown as TaskWithRelations[];

      // Ghost = not in the active set (already excluded above)
      const ghostIdSet = new Set(
        uniqueGhosts.map((t: { id: string }) => t.id)
      );

      return { tasks: all, ghostIds: ghostIdSet };
    },
    staleTime: 30_000,
  });

  // Realtime: invalidate when task rows change so the pool stays fresh.
  useEffect(() => {
    const channel = supabase
      .channel("pool-ghosts-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["pool-with-ghosts"],
          });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useMemo(
    () => ({
      tasks: data?.tasks ?? [],
      ghostIds: data?.ghostIds ?? new Set<string>(),
      isLoading,
      error: error instanceof Error ? error.message : null,
      refetch,
    }),
    [data, isLoading, error, refetch]
  );
}
