import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { DATA_RESTORED_EVENT } from "@/lib/recycleFiles";
import type { SalvedgeRecord } from "@/types/database";

type SalvedgeInsert = {
  designer_id?: string | null;
  challan_no: string;
  party_name: string;
  qty: number;
  completed_qty?: number;
  is_completed?: boolean;
  additional_comments?: string | null;
  created_by?: string | null;
};

type SalvedgeUpdate = Partial<SalvedgeInsert>;

export type MutationResult<T> = { data: T | null; error: string | null };

export function useSalvedge() {
  const { user } = useAuth();
  const [records, setRecords] = useState<SalvedgeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("salvedge_records")
      .select("*")
      .order("created_at", { ascending: false });
    if (err) {
      setError(err.message);
      setRecords([]);
    } else {
      setRecords((data ?? []) as SalvedgeRecord[]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { void refetch(); }, [refetch]);

  // Re-pull after a Recycle Bin restore so recovered records reappear.
  useEffect(() => {
    const h = () => void refetch();
    window.addEventListener(DATA_RESTORED_EVENT, h);
    return () => window.removeEventListener(DATA_RESTORED_EVENT, h);
  }, [refetch]);

  const createRecord = useCallback(
    async (input: SalvedgeInsert): Promise<MutationResult<SalvedgeRecord>> => {
      if (!user) return { data: null, error: "Not authenticated" };
      const { data, error: err } = await supabase
        .from("salvedge_records")
        .insert({ ...input, created_by: user.id })
        .select("*")
        .single();
      if (err) return { data: null, error: err.message };
      await refetch();
      return { data, error: null };
    },
    [user, refetch]
  );

  const updateRecord = useCallback(
    async (id: string, updates: SalvedgeUpdate): Promise<MutationResult<SalvedgeRecord>> => {
      if (!user) return { data: null, error: "Not authenticated" };
      const { data, error: err } = await supabase
        .from("salvedge_records")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();
      if (err) return { data: null, error: err.message };
      await refetch();
      return { data, error: null };
    },
    [user, refetch]
  );

  const deleteRecord = useCallback(
    async (id: string): Promise<MutationResult<{ id: string }>> => {
      if (!user) return { data: null, error: "Not authenticated" };
      const { error: err } = await supabase
        .from("salvedge_records")
        .delete()
        .eq("id", id);
      if (err) return { data: null, error: err.message };
      await refetch();
      return { data: { id }, error: null };
    },
    [user, refetch]
  );

  return { records, isLoading, error, refetch, createRecord, updateRecord, deleteRecord };
}
