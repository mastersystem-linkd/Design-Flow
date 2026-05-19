import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type {
  FullKittingDetail,
  FullKittingDetailInsert,
  PackingType,
} from "@/types/database";

// ============================================================================
// Types
// ============================================================================

export type MutationResult<T> = { data: T | null; error: string | null };

/**
 * Caller-supplied fields for the kitting form. `task_id` and `submitted_by`
 * are derived — the rest come from the form UI.
 */
export interface KittingFormData {
  fabric_details?: string | null;
  colors?: string | null;
  quantity?: number | null;
  accessories?: string | null;
  packing_type: PackingType;
  special_instructions?: string | null;
  file_url?: string | null;
}

export interface UseFullKitting {
  /** Fetch the kitting record for a task. Returns null if none exists. */
  getKittingForTask: (
    taskId: string
  ) => Promise<MutationResult<FullKittingDetail | null>>;

  /**
   * Submit a kitting record AND advance the task to `done`.
   *
   * Sequence:
   *   1. INSERT into full_kitting_details
   *   2. UPDATE tasks SET status = 'done', requires_full_kitting = true
   *
   * If step 1 fails, step 2 is skipped (task stays at its current status).
   * If step 2 fails, step 1 has already persisted — the kitting record
   * exists but the task hasn't advanced. The caller can retry step 2
   * via useTaskMutations.updateTaskStatus().
   */
  submitKitting: (
    taskId: string,
    data: KittingFormData
  ) => Promise<MutationResult<FullKittingDetail>>;

  /** Per-operation pending state. */
  isPending: (op: "get" | "submit", taskId?: string) => boolean;
}

// ============================================================================
// Hook
// ============================================================================

export function useFullKitting(): UseFullKitting {
  const { user } = useAuth();
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const setOpPending = useCallback((key: string, value: boolean) => {
    setPending((prev) => {
      if (value) return { ...prev, [key]: true };
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const isPending = useCallback(
    (op: "get" | "submit", taskId?: string): boolean => {
      const key = taskId ? `${op}:${taskId}` : op;
      return !!pending[key];
    },
    [pending]
  );

  // ── Read ─────────────────────────────────────────────────────────────

  const getKittingForTask = useCallback(
    async (
      taskId: string
    ): Promise<MutationResult<FullKittingDetail | null>> => {
      if (!taskId) return { data: null, error: "taskId is required" };

      const key = `get:${taskId}`;
      setOpPending(key, true);
      try {
        const { data, error } = await supabase
          .from("full_kitting_details")
          .select("*")
          .eq("task_id", taskId)
          .maybeSingle();

        if (error) return { data: null, error: error.message };
        return { data: data ?? null, error: null };
      } finally {
        setOpPending(key, false);
      }
    },
    [setOpPending]
  );

  // ── Submit ───────────────────────────────────────────────────────────

  const submitKitting = useCallback(
    async (
      taskId: string,
      formData: KittingFormData
    ): Promise<MutationResult<FullKittingDetail>> => {
      if (!user) return { data: null, error: "Not authenticated" };
      if (!taskId) return { data: null, error: "taskId is required" };

      const key = `submit:${taskId}`;
      setOpPending(key, true);
      try {
        // ── Step 1: Insert kitting record ──────────────────────────
        const row: FullKittingDetailInsert = {
          task_id: taskId,
          submitted_by: user.id,
          fabric_details: formData.fabric_details?.trim() || null,
          colors: formData.colors?.trim() || null,
          quantity:
            formData.quantity != null && Number.isFinite(formData.quantity)
              ? formData.quantity
              : null,
          accessories: formData.accessories?.trim() || null,
          packing_type: formData.packing_type,
          special_instructions:
            formData.special_instructions?.trim() || null,
          file_url: formData.file_url?.trim() || null,
        };

        const { data: kittingRow, error: insertErr } = await supabase
          .from("full_kitting_details")
          .insert(row)
          .select("*")
          .single();

        if (insertErr) {
          // If the kitting record already exists (unique constraint on
          // task_id), surface a clear message rather than a raw PG error.
          if (insertErr.code === "23505") {
            return {
              data: null,
              error:
                "A kitting record already exists for this task. Refresh and try editing instead.",
            };
          }
          return { data: null, error: insertErr.message };
        }

        // ── Step 2: Advance task to "done" + flag kitting ─────────
        const { error: statusErr } = await supabase
          .from("tasks")
          .update({
            status: "done" as const,
            requires_full_kitting: true,
            full_kitting_submitted_at: new Date().toISOString(),
            full_kitting_submitted_by: user.id,
          })
          .eq("id", taskId);

        if (statusErr) {
          // Kitting was saved but task didn't advance. The caller can
          // retry via useTaskMutations.updateTaskStatus(). We still
          // return the kitting record so the form data isn't lost.
          console.warn(
            "[useFullKitting] kitting saved but task status update failed:",
            statusErr.message
          );
          return {
            data: kittingRow,
            error: `Kitting saved, but task status update failed: ${statusErr.message}. Refresh and advance manually.`,
          };
        }

        return { data: kittingRow, error: null };
      } finally {
        setOpPending(key, false);
      }
    },
    [user, setOpPending]
  );

  return { getKittingForTask, submitKitting, isPending };
}
