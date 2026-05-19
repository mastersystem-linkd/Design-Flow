import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { Sample, SampleInsert, SampleUpdate } from "@/types/database";

// ============================================================================
// Types
// ============================================================================

export type MutationResult<T> = { data: T | null; error: string | null };

export interface SampleFilters {
  /** Inclusive date range on created_at. */
  dateRange?: { from: string; to: string };
  /** ILIKE search on party_name. */
  customerName?: string;
  /** Filter by is_completed. */
  status?: "pending" | "completed" | "all";
}

export interface UseSamples {
  samples: Sample[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createSample: (input: SampleInsert) => Promise<MutationResult<Sample>>;
  updateSample: (
    id: string,
    data: SampleUpdate
  ) => Promise<MutationResult<Sample>>;
  deleteSample: (id: string) => Promise<MutationResult<{ id: string }>>;
}

// ============================================================================
// Hook
// ============================================================================

export function useSamples(filters?: SampleFilters): UseSamples {
  const { user } = useAuth();
  const [samples, setSamples] = useState<Sample[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filterKey = JSON.stringify(filters ?? {});

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    let q = supabase
      .from("samples")
      .select("*")
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

    const { data, error: err } = await q;

    if (err) {
      console.error("[useSamples] query error", err);
      setError(err.message);
      setSamples([]);
    } else {
      setSamples((data ?? []) as Sample[]);
    }
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // ── Create ──────────────────────────────────────────────────────────
  const createSample = useCallback(
    async (input: SampleInsert): Promise<MutationResult<Sample>> => {
      if (!user) return { data: null, error: "Not authenticated" };
      if (!input.party_name?.trim())
        return { data: null, error: "Party name is required" };

      const row: SampleInsert = {
        ...input,
        party_name: input.party_name.trim(),
        created_by: user.id,
      };

      const { data, error: err } = await supabase
        .from("samples")
        .insert(row)
        .select("*")
        .single();

      if (err) return { data: null, error: err.message };
      await refetch();
      return { data, error: null };
    },
    [user, refetch]
  );

  // ── Update ──────────────────────────────────────────────────────────
  const updateSample = useCallback(
    async (
      id: string,
      data: SampleUpdate
    ): Promise<MutationResult<Sample>> => {
      if (!user) return { data: null, error: "Not authenticated" };

      const { data: row, error: err } = await supabase
        .from("samples")
        .update(data)
        .eq("id", id)
        .select("*")
        .single();

      if (err) return { data: null, error: err.message };
      await refetch();
      return { data: row, error: null };
    },
    [user, refetch]
  );

  // ── Delete ──────────────────────────────────────────────────────────
  const deleteSample = useCallback(
    async (id: string): Promise<MutationResult<{ id: string }>> => {
      if (!user) return { data: null, error: "Not authenticated" };

      const { error: err } = await supabase
        .from("samples")
        .delete()
        .eq("id", id);

      if (err) return { data: null, error: err.message };
      await refetch();
      return { data: { id }, error: null };
    },
    [user, refetch]
  );

  return {
    samples,
    isLoading,
    error,
    refetch,
    createSample,
    updateSample,
    deleteSample,
  };
}
