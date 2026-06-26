import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { DATA_RESTORED_EVENT } from "@/lib/recycleFiles";
import type { CoordinatorTask } from "@/types/database";

type MutationResult<T> = { data: T | null; error: string | null };

export function useCoordinatorTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<CoordinatorTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("coordinator_tasks")
      .select("*")
      .order("created_at", { ascending: false });
    if (err) {
      setError(err.message);
      setTasks([]);
    } else {
      setTasks((data ?? []) as CoordinatorTask[]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Re-pull after a Recycle Bin restore so recovered to-dos reappear.
  useEffect(() => {
    const h = () => void refetch();
    window.addEventListener(DATA_RESTORED_EVENT, h);
    return () => window.removeEventListener(DATA_RESTORED_EVENT, h);
  }, [refetch]);

  const createTask = useCallback(
    async (input: {
      requester_name: string;
      description: string;
      requested_at?: string;
      notes?: string | null;
    }): Promise<MutationResult<CoordinatorTask>> => {
      if (!user) return { data: null, error: "Not authenticated" };
      const { data, error: err } = await supabase
        .from("coordinator_tasks")
        .insert({
          ...input,
          created_by: user.id,
        })
        .select("*")
        .single();
      if (err) return { data: null, error: err.message };
      await refetch();
      return { data: data as CoordinatorTask, error: null };
    },
    [user, refetch]
  );

  const updateTask = useCallback(
    async (
      id: string,
      updates: Partial<{
        requester_name: string;
        description: string;
        is_completed: boolean;
        completed_at: string | null;
        notes: string | null;
      }>
    ): Promise<MutationResult<CoordinatorTask>> => {
      if (!user) return { data: null, error: "Not authenticated" };
      const { data, error: err } = await supabase
        .from("coordinator_tasks")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();
      if (err) return { data: null, error: err.message };
      await refetch();
      return { data: data as CoordinatorTask, error: null };
    },
    [user, refetch]
  );

  const deleteTask = useCallback(
    async (id: string): Promise<MutationResult<{ id: string }>> => {
      if (!user) return { data: null, error: "Not authenticated" };
      const { error: err } = await supabase
        .from("coordinator_tasks")
        .delete()
        .eq("id", id);
      if (err) return { data: null, error: err.message };
      await refetch();
      return { data: { id }, error: null };
    },
    [user, refetch]
  );

  const toggleComplete = useCallback(
    async (id: string, completed: boolean): Promise<MutationResult<CoordinatorTask>> => {
      return updateTask(id, {
        is_completed: completed,
        completed_at: completed ? new Date().toISOString() : null,
      });
    },
    [updateTask]
  );

  return { tasks, isLoading, error, refetch, createTask, updateTask, deleteTask, toggleComplete };
}
