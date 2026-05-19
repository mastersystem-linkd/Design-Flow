import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
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
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// ============================================================================
// Query
// ============================================================================

const SELECT_FRAGMENT = `
  *,
  client:clients!tasks_client_id_fkey(id, party_name),
  assignee:profiles!tasks_assigned_to_fkey(id, full_name, role, avatar_url),
  creator:profiles!tasks_created_by_fkey(id, full_name, role, avatar_url),
  files(id, file_name)
`;

/** Strip out characters that would break PostgREST's `.or()` syntax. */
function sanitizeSearchTerm(term: string): string {
  return term.trim().replace(/[,()*]/g, " ").replace(/\s+/g, " ").trim();
}

function toIsoDate(d: Date): string {
  // YYYY-MM-DD — matches Postgres `date` column format.
  return d.toISOString().slice(0, 10);
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Fetch tasks (with client + assignee + creator joined in one round-trip).
 *
 * The hook re-runs whenever the *value* of any filter changes (compared via
 * a stable JSON key), so the caller doesn't need to memoize the filters
 * object — passing a fresh `{ status: 'pool' }` on every render is fine.
 *
 * Soft-deleted tasks (`deleted_at IS NOT NULL`) are filtered out by RLS for
 * non-admins; admins see them implicitly.
 *
 * Default sort: priority DESC (so urgent first — `task_priority` enum was
 * declared low → urgent in the schema), then planned_deadline ASC nulls-last
 * (soonest deadline next), then created_at DESC.
 */
export function useTasks(filters?: TaskFilters): UseTasksResult {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable key for the dep array — Date objects serialised via the replacer.
  // Same JSON string ⇒ same dep, so useCallback returns the same fetchTasks
  // even if `filters` is a fresh object reference each render.
  const filterKey = JSON.stringify(filters ?? {}, (_, v) =>
    v instanceof Date ? v.toISOString() : v
  );

  const fetchTasks = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    let q = supabase.from("tasks").select(SELECT_FRAGMENT);

    // --- status ---
    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        if (filters.status.length > 0) q = q.in("status", filters.status);
      } else {
        q = q.eq("status", filters.status);
      }
    }

    // --- assignment ---
    // myTasksOnly wins over assignedTo (caller-intent: "my tasks" is explicit).
    if (filters?.myTasksOnly) {
      if (!user?.id) {
        // No user yet — return empty without hitting the network.
        setTasks([]);
        setIsLoading(false);
        return;
      }
      q = q.eq("assigned_to", user.id);
    } else if (filters?.assignedTo) {
      q = q.eq("assigned_to", filters.assignedTo);
    }

    // --- other equality filters ---
    if (filters?.clientId) q = q.eq("client_id", filters.clientId);
    if (filters?.priority) q = q.eq("priority", filters.priority);

    // --- search (concept name OR task_code) ---
    if (filters?.search) {
      const term = sanitizeSearchTerm(filters.search);
      if (term) {
        q = q.or(`concept.ilike.%${term}%,task_code.ilike.%${term}%`);
      }
    }

    // --- date range on planned_deadline ---
    if (filters?.dateRange) {
      q = q
        .gte("planned_deadline", toIsoDate(filters.dateRange.from))
        .lte("planned_deadline", toIsoDate(filters.dateRange.to));
    }

    // --- sort ---
    // task_priority enum order: low < normal < high < urgent, so DESC = urgent first.
    q = q
      .order("priority", { ascending: false })
      .order("planned_deadline", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    const { data, error: queryError } = await q;

    if (queryError) {
      console.error("[useTasks] query error", queryError);
      setError(queryError.message);
      setTasks([]);
    } else {
      // The aliased-FK select returns the joined relations as single objects
      // (not arrays) because each FK is many-to-one. Cast through unknown
      // because Supabase's generated types can't infer aliased joins.
      setTasks((data ?? []) as unknown as TaskWithRelations[]);
    }
    setIsLoading(false);
    // We intentionally depend on `filterKey` (a string) rather than `filters`
    // (an object whose reference flips on every parent render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, user?.id]);

  useEffect(() => {
    let cancelled = false;
    void fetchTasks().catch((e) => {
      if (cancelled) return;
      console.error("[useTasks] unexpected", e);
      setError(e instanceof Error ? e.message : "Unknown error");
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchTasks]);

  // ── Realtime subscription ─────────────────────────────────────────
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel("tasks-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => { void fetchTasks(); }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [fetchTasks]);

  return { tasks, isLoading, error, refetch: fetchTasks };
}
