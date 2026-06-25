import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { sendNotificationToRole } from "@/lib/notifications";
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
 *
 * File handling:
 *   - `files` is the new multi-file array (post-migration 0020).
 *   - `file_url` stays as a single path for back-compat — the hook mirrors
 *     `files[0]` into it on insert so legacy readers (older drawers,
 *     dashboards) keep working without changes.
 *   - If the caller passes only `file_url`, the hook normalises it into
 *     `files: [file_url]` automatically.
 */
export interface KittingFormData {
  fabric_details?: string | null;
  colors?: string | null;
  quantity?: number | null;
  accessories?: string | null;
  packing_type: PackingType;
  special_instructions?: string | null;
  /** Single-file convenience field — kept so existing callers don't break. */
  file_url?: string | null;
  /** All attached storage paths (preferred input shape, post-0020). */
  files?: string[] | null;
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
  const { user, profile } = useAuth();
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
        // Normalise the file inputs. The form may pass `files: string[]`
        // (preferred) or just `file_url` (legacy). Either way we end up with
        // a clean array; the first entry mirrors into `file_url` so older
        // surfaces that still read the single-path column see something.
        const fileList: string[] = (() => {
          if (Array.isArray(formData.files)) {
            return formData.files.filter(
              (f): f is string => typeof f === "string" && f.trim().length > 0
            );
          }
          const single = formData.file_url?.trim();
          return single ? [single] : [];
        })();
        const primaryFileUrl = fileList[0] ?? null;

        // ── Step 1: Insert kitting record ──────────────────────────
        const baseRow: FullKittingDetailInsert = {
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
          file_url: primaryFileUrl,
        };
        const rowWithFiles: FullKittingDetailInsert = {
          ...baseRow,
          files: fileList,
        };

        // Try the post-0020 shape first. If `files` doesn't exist yet
        // (migration not applied), PostgREST returns "column ... does not
        // exist" — we retry without the column so the user can still save
        // kitting details during a deploy window.
        let kittingRow: FullKittingDetail | null = null;
        let insertErr: { code?: string; message: string } | null = null;
        {
          const res = await supabase
            .from("full_kitting_details")
            .insert(rowWithFiles)
            .select("*")
            .single();
          kittingRow = res.data as FullKittingDetail | null;
          insertErr = res.error;
        }
        if (
          insertErr &&
          (insertErr.message.includes("files") ||
            insertErr.message.includes("schema cache"))
        ) {
          const retry = await supabase
            .from("full_kitting_details")
            .insert(baseRow)
            .select("*")
            .single();
          kittingRow = retry.data as FullKittingDetail | null;
          insertErr = retry.error;
        }

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

        // Best-effort fanout: admins + coordinators get pinged that the
        // kitting form is in. The task code lookup is cheap (single column)
        // and falls back to the raw id if absent. Failure is silent — we
        // don't want notification trouble to undo a successful kitting save.
        try {
          const { data: taskInfo } = await supabase
            .from("tasks")
            .select("task_code")
            .eq("id", taskId)
            .maybeSingle();
          const code = taskInfo?.task_code ?? taskId;
          const submitterName = profile?.full_name ?? "A designer";
          void sendNotificationToRole(
            // Admins only — coordinators' feed is actionable-only (FK-needed is sent separately).
            ["admin"],
            "Full Kitting Submitted",
            `${submitterName} submitted kitting for ${code}`,
            "info",
            "/dashboard"
          );
        } catch {
          // best-effort
        }

        return { data: kittingRow, error: null };
      } finally {
        setOpPending(key, false);
      }
    },
    [user, profile, setOpPending]
  );

  return { getKittingForTask, submitKitting, isPending };
}
