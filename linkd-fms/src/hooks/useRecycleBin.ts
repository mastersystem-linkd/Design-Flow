// ============================================================================
// useRecycleBin — read + restore/purge the deleted-records bin
// ============================================================================
//
// Talks to /api/admin-recycle-bin (super-admin only). The bin groups deletes
// into restore points by batch_id (one Danger Zone clear, or one task + its
// cascaded children = one batch). See migration 0087 + api/admin-recycle-bin.ts.
// ============================================================================

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { callAdminApi } from "@/lib/adminApi";
import { queryKeys } from "@/lib/queryKeys";
import { DATA_RESTORED_EVENT } from "@/lib/recycleFiles";

export interface RecycleBatch {
  batch_id: number;
  deleted_at: string;
  deleted_by_name: string | null;
  expires_at: string;
  total: number;
  file_count: number;
  /** table label → count, e.g. { Samples: 46, "Full Knitting": 9 }. */
  breakdown: Record<string, number>;
}

export interface RecycleRecord {
  id: string;
  table_name: string;
  table_label: string;
  record_id: string;
  label: string;
  deleted_at: string;
}

export interface RestoreResult {
  restored: number;
  files_restored: number;
  skipped: { table: string; record_id: string; reason: string }[];
}

// Caches that a restore can revive — invalidate them all so restored rows
// reappear without a manual refresh.
const REVIVE_KEYS = [
  queryKeys.tasks.all,
  queryKeys.samples.all,
  queryKeys.concepts.all,
  queryKeys.taskAssignments.all,
  queryKeys.recycleBin.all,
] as const;

export function useRecycleBin() {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: queryKeys.recycleBin.list,
    queryFn: async (): Promise<RecycleBatch[]> => {
      const { data, error } = await callAdminApi<{ batches: RecycleBatch[] }>(
        "admin-recycle-bin",
        { kind: "list" }
      );
      if (error) throw new Error(error.message);
      return data?.batches ?? [];
    },
    staleTime: 10_000,
  });

  /** Lazily fetch the records inside one batch (for the expand drill-down). */
  const fetchBatch = useCallback(
    async (batchId: number): Promise<RecycleRecord[]> => {
      const { data, error } = await callAdminApi<{ records: RecycleRecord[] }>(
        "admin-recycle-bin",
        { kind: "batch", batch_id: batchId }
      );
      if (error) throw new Error(error.message);
      return data?.records ?? [];
    },
    []
  );

  const invalidate = useCallback(() => {
    for (const k of REVIVE_KEYS) {
      void queryClient.invalidateQueries({ queryKey: k });
    }
    // Nudge the non-React-Query hooks (Files / Salvedge / Coordinator /
    // Notifications) to refetch so restored rows reappear without a refresh.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(DATA_RESTORED_EVENT));
    }
  }, [queryClient]);

  const restoreMut = useMutation({
    mutationFn: async (
      target: { batch_id: number } | { ids: string[] }
    ): Promise<RestoreResult> => {
      const { data, error } = await callAdminApi<RestoreResult>(
        "admin-recycle-bin",
        { kind: "restore", ...target }
      );
      if (error) throw new Error(error.message);
      return data ?? { restored: 0, files_restored: 0, skipped: [] };
    },
    onSuccess: invalidate,
  });

  const purgeMut = useMutation({
    mutationFn: async (
      target: { batch_id: number } | { ids: string[] }
    ): Promise<{ purged: number }> => {
      const { data, error } = await callAdminApi<{ purged: number }>(
        "admin-recycle-bin",
        { kind: "purge", ...target }
      );
      if (error) throw new Error(error.message);
      return data ?? { purged: 0 };
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.recycleBin.all }),
  });

  /** Restore — returns { data, error } (never throws), per project convention. */
  const restore = useCallback(
    async (
      target: { batch_id: number } | { ids: string[] }
    ): Promise<{ data: RestoreResult | null; error: string | null }> => {
      try {
        const data = await restoreMut.mutateAsync(target);
        return { data, error: null };
      } catch (e) {
        return { data: null, error: e instanceof Error ? e.message : "Restore failed" };
      }
    },
    [restoreMut]
  );

  const purge = useCallback(
    async (
      target: { batch_id: number } | { ids: string[] }
    ): Promise<{ data: { purged: number } | null; error: string | null }> => {
      try {
        const data = await purgeMut.mutateAsync(target);
        return { data, error: null };
      } catch (e) {
        return { data: null, error: e instanceof Error ? e.message : "Purge failed" };
      }
    },
    [purgeMut]
  );

  return {
    batches: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error ? (listQuery.error as Error).message : null,
    refetch: listQuery.refetch,
    fetchBatch,
    restore,
    purge,
    isRestoring: restoreMut.isPending,
    isPurging: purgeMut.isPending,
  };
}
