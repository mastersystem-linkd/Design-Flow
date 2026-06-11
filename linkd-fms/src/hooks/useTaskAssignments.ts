import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { queryKeys } from "@/lib/queryKeys";
import {
  sendNotification,
  sendNotificationToMany,
  sendNotificationToRole,
} from "@/lib/notifications";
import { createPendingSample } from "@/lib/createPendingSample";
import type { TaskAssignmentWithDesigner, TaskStatus } from "@/types/database";

// ── Interfaces ──────────────────────────────────────────────────────────────

interface SplitInput {
  designerId: string;
  qty: number;
  deadline?: string;
  designType: string;
  fabric: string;
}

interface ClaimPortionInput {
  qty: number;
  deadline: string;
  designType: string;
  fabric: string;
}

interface UpdateDetailsInput {
  deadline?: string;
  designType?: string;
  fabric?: string;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useTaskAssignments(taskId: string | null) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const key = queryKeys.taskAssignments.detail(taskId ?? "");

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (!taskId) return [];
      const { data: rows, error: err } = await supabase
        .from("task_assignments")
        .select(
          "*, designer:profiles!task_assignments_designer_id_fkey(id, full_name, avatar_url, role), assigner:profiles!task_assignments_assigned_by_fkey(full_name)"
        )
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (err) throw err;
      return (rows ?? []) as TaskAssignmentWithDesigner[];
    },
    enabled: !!taskId,
    staleTime: 60_000,
  });

  const assignments = data ?? [];
  const totalAssigned = assignments.reduce((s, a) => s + a.qty_assigned, 0);
  const totalCompleted = assignments.reduce((s, a) => s + a.qty_completed, 0);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    void queryClient.invalidateQueries({ queryKey: ["pool-with-ghosts"] });
  }, [queryClient, key]);

  const designerName = profile?.full_name ?? "A designer";

  // Helper: fetch lightweight task info for notification messages.
  async function fetchTaskInfo(tId: string) {
    const { data: t } = await supabase
      .from("tasks")
      .select("task_code, concept, status, qty, fabric, whatsapp_group, client:clients!tasks_client_id_fkey(party_name)")
      .eq("id", tId)
      .single();
    return t;
  }

  function taskSummary(t: {
    concept?: string | null;
    qty?: number | null;
    fabric?: string | null;
    whatsapp_group?: string | null;
    client?: { party_name?: string } | null;
  }): string {
    const parts = [
      t.concept || null,
      t.client?.party_name || null,
      t.qty ? `Qty: ${t.qty}` : null,
      t.fabric || null,
      t.whatsapp_group || null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "Task";
  }

  // Helper: insert a task_logs entry (fire-and-forget).
  function logActivity(
    tId: string,
    note: string,
    statusTo: TaskStatus = "in_progress",
    statusFrom?: TaskStatus,
  ) {
    void supabase.from("task_logs").insert({
      task_id: tId,
      changed_by: user?.id ?? "",
      status_to: statusTo,
      status_from: statusFrom ?? null,
      note,
    });
  }

  // ── splitTask ─────────────────────────────────────────────────────────────

  const splitTask = useCallback(
    async (tId: string, splits: SplitInput[]) => {
      if (!user) return { error: "Not authenticated" };

      const inserts = splits.map((s) => ({
        task_id: tId,
        designer_id: s.designerId,
        assigned_by: user.id,
        qty_assigned: s.qty,
        planned_deadline: s.deadline || null,
        design_type: s.designType.trim(),
        completion_fabric: s.fabric.trim(),
        status: "assigned" as const,
      }));

      const { error: err } = await supabase
        .from("task_assignments")
        .insert(inserts);
      if (err) return { error: err.message };

      const taskInfo = await fetchTaskInfo(tId);
      const code = taskInfo?.task_code ?? "a task";

      // Notify each designer with rich context
      const summary = taskInfo ? taskSummary(taskInfo) : code;
      for (const s of splits) {
        void sendNotification(
          s.designerId,
          "Task Assignment",
          `You've been assigned ${s.qty} designs (${s.designType}): ${summary}`,
          "info",
          "/dashboard"
        );
      }
      // Fetch designer names for the log
      const { data: designerProfiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", splits.map((s) => s.designerId));
      const nameMap = new Map((designerProfiles ?? []).map((p) => [p.id, p.full_name]));
      const parts = splits.map((s) => `${nameMap.get(s.designerId) ?? "Designer"} (${s.qty})`);
      logActivity(tId, `Task split: ${parts.join(", ")}`, "in_progress", "pool");

      invalidate();
      return { error: null };
    },
    [user, invalidate]
  );

  // ── claimPortion ──────────────────────────────────────────────────────────

  const claimPortion = useCallback(
    async (tId: string, input: ClaimPortionInput) => {
      if (!user) return { error: "Not authenticated" };

      // Client-side pool-remaining pre-check (DB trigger is the hard backstop).
      const { data: taskRow } = await supabase
        .from("tasks")
        .select("qty, task_code, concept")
        .eq("id", tId)
        .single();
      if (taskRow) {
        const { data: siblings } = await supabase
          .from("task_assignments")
          .select("qty_assigned, designer_id")
          .eq("task_id", tId);
        // A designer can hold only ONE portion per task (unique index). If they
        // already have one, point them to Resize instead of a raw DB error.
        if ((siblings ?? []).some((r) => r.designer_id === user.id)) {
          return {
            error: "You already have a portion on this task. Use “Resize” in the task to change your quantity.",
          };
        }
        const alreadyAssigned = (siblings ?? []).reduce(
          (s, r) => s + r.qty_assigned,
          0
        );
        const poolRemaining = taskRow.qty - alreadyAssigned;
        if (input.qty > poolRemaining) {
          return {
            error: `Only ${poolRemaining} design${poolRemaining === 1 ? "" : "s"} left in the pool`,
          };
        }
      }

      const { error: err } = await supabase.from("task_assignments").insert({
        task_id: tId,
        designer_id: user.id,
        assigned_by: user.id,
        qty_assigned: input.qty,
        planned_deadline: input.deadline || null,
        design_type: input.designType.trim(),
        completion_fabric: input.fabric.trim(),
        status: "assigned" as const,
      });
      if (err) {
        // Unique violation (raced past the pre-check) = already has a portion.
        if ((err as { code?: string }).code === "23505") {
          return { error: "You already have a portion on this task. Use “Resize” to change your quantity." };
        }
        return { error: err.message };
      }

      // Parent status (is_split, status, qty_remaining) is set by the
      // recalc_task_from_assignments trigger — do NOT compute it here.

      // Notify admins + coordinators about the claim.
      const claimInfo = await fetchTaskInfo(tId);
      const claimSummary = claimInfo ? taskSummary(claimInfo) : (taskRow?.concept ?? "a task");
      void sendNotificationToRole(
        ["admin", "design_coordinator"],
        "Claim Joined",
        `${designerName} claimed ${input.qty} designs (${input.designType}): ${claimSummary}`,
        "info",
        "/dashboard"
      );

      logActivity(tId, `${designerName} claimed ${input.qty} designs${input.designType ? ` (${input.designType})` : ""}`);

      invalidate();
      return { error: null };
    },
    [user, designerName, invalidate]
  );

  // ── reduceMyClaim ─────────────────────────────────────────────────────────
  // A designer who claimed the WHOLE task as an individual decides to keep only
  // part of it (e.g. 10 of 20) and release the rest to the pool — turning a full
  // claim into a split AFTER the fact. Produces the SAME end-state as if they had
  // originally claimed a portion: their kept work becomes a task_assignment and
  // the remainder surfaces in the pool via `qty_remaining > 0` (the recalc trigger
  // sets that). The released qty is then claimable by anyone via the normal
  // claimPortion flow — the rest of the workflow stays untouched.
  const reduceMyClaim = useCallback(
    async (tId: string, keepQty: number) => {
      if (!user) return { error: "Not authenticated" };
      const keep = Math.floor(keepQty);
      if (!Number.isFinite(keep) || keep < 1) {
        return { error: "Enter how many designs you want to keep (at least 1)." };
      }

      // Light client-side pre-check for friendly errors + the notification copy.
      // The RPC is the AUTHORITATIVE guard and runs the insert + parent update
      // atomically as SECURITY DEFINER — a designer can't null their own
      // tasks.assigned_to under RLS, and a non-atomic two-step would orphan the
      // assignment on a mid-way failure (migration 0076).
      const { data: t } = await supabase
        .from("tasks")
        .select("qty, qty_completed, concept, task_code")
        .eq("id", tId)
        .maybeSingle();
      if (t) {
        if (keep >= t.qty) {
          return { error: `Keep fewer than ${t.qty} to release some to the pool.` };
        }
        const done = t.qty_completed ?? 0;
        if (keep < done) {
          return { error: `You've already completed ${done} — you can't keep fewer than that.` };
        }
      }

      const { error: rpcErr } = await supabase.rpc("split_my_claim", {
        p_task_id: tId,
        p_keep: keep,
      });
      if (rpcErr) return { error: rpcErr.message };

      const released = t ? t.qty - keep : 0;
      void sendNotificationToRole(
        ["admin", "design_coordinator"],
        "Task Split",
        `${designerName} kept ${keep} designs${t ? ` and released ${released} to the pool` : ""}: ${t?.concept ?? t?.task_code ?? "a task"}`,
        "info",
        "/dashboard"
      );
      logActivity(tId, `${designerName} split the task — kept ${keep}${t ? `, released ${released} to the pool` : ""}`);

      invalidate();
      return { error: null };
    },
    [user, designerName, invalidate]
  );

  // ── updateAssignmentClaim (resize via RPC) ────────────────────────────────

  const updateAssignmentClaim = useCallback(
    async (assignmentId: string, newQty: number) => {
      const { error: err } = await supabase.rpc("update_assignment_claim", {
        p_id: assignmentId,
        p_new_qty: newQty,
      });
      if (err) return { error: err.message };

      // Notify admins + coordinators about the resize.
      const row = assignments.find((a) => a.id === assignmentId);
      if (row && taskId) {
        const taskInfo = await fetchTaskInfo(taskId);
        const summary = taskInfo ? taskSummary(taskInfo) : "a task";
        const name = row.designer?.full_name ?? designerName;
        const oldQty = row.qty_assigned;

        if (newQty === 0) {
          void sendNotificationToRole(
            ["admin", "design_coordinator"],
            "Claim Released",
            `${name} released their portion back to pool: ${summary}`,
            "info",
            "/dashboard"
          );
          logActivity(taskId, `${name} released ${oldQty} designs back to pool`);
        } else {
          void sendNotificationToRole(
            ["admin", "design_coordinator"],
            "Claim Resized",
            `${name} resized claim ${oldQty} → ${newQty}: ${summary}`,
            "info",
            "/dashboard"
          );
          logActivity(taskId, `${name} resized claim: ${oldQty} → ${newQty} designs`);
        }
      }

      invalidate();
      return { error: null };
    },
    [assignments, taskId, designerName, invalidate]
  );

  // ── updateAssignmentDetails ───────────────────────────────────────────────

  const updateAssignmentDetails = useCallback(
    async (assignmentId: string, input: UpdateDetailsInput) => {
      const patch: Record<string, unknown> = {};
      if (input.deadline !== undefined)
        patch.planned_deadline = input.deadline || null;
      if (input.designType !== undefined)
        patch.design_type = input.designType.trim() || null;
      if (input.fabric !== undefined)
        patch.completion_fabric = input.fabric.trim() || null;

      if (Object.keys(patch).length === 0) return { error: null };

      const { error: err } = await supabase
        .from("task_assignments")
        .update(patch)
        .eq("id", assignmentId);
      if (err) return { error: err.message };
      invalidate();
      return { error: null };
    },
    [invalidate]
  );

  // ── updateAssignmentQty (progress tracking) ───────────────────────────────

  const updateAssignmentQty = useCallback(
    async (assignmentId: string, qtyCompleted: number) => {
      const { error: err } = await supabase
        .from("task_assignments")
        .update({ qty_completed: qtyCompleted })
        .eq("id", assignmentId);
      if (err) return { error: err.message };

      const row = assignments.find((a) => a.id === assignmentId);
      if (row && taskId) {
        const name = row.designer?.full_name ?? designerName;
        logActivity(taskId, `${name} updated progress: ${qtyCompleted}/${row.qty_assigned} designs`);
      }

      invalidate();
      return { error: null };
    },
    [assignments, taskId, designerName, invalidate]
  );

  // ── completePortion ───────────────────────────────────────────────────────

  const completePortion = useCallback(
    async (
      assignmentId: string,
      fabricOverride?: string,
      designTypeOverride?: string,
      samplingRequired?: boolean
    ) => {
      const row = assignments.find((a) => a.id === assignmentId);
      if (!row) return { error: "Assignment not found" };
      // Allow completing with AT LEAST the assigned qty (extra is fine); only
      // block when they've done LESS than assigned.
      if (row.qty_completed < row.qty_assigned) {
        return {
          error: `Cannot complete: only ${row.qty_completed}/${row.qty_assigned} done. Finish your assigned quantity (or Resize your claim) first.`,
        };
      }
      // FK gate: check parent task before allowing portion completion.
      {
        const { data: parentCheck } = await supabase
          .from("tasks")
          .select("requires_full_kitting, full_kitting_image_url, full_kitting_details!full_kitting_details_task_id_fkey(id)")
          .eq("id", row.task_id)
          .maybeSingle();
        if (parentCheck?.requires_full_kitting && !parentCheck.full_kitting_image_url && !parentCheck.full_kitting_details) {
          return { error: "Full Knitting details must be added before completing this portion." };
        }
      }

      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        status: "completed",
        completed_at: now,
        completion_filled_at: now,
      };
      if (fabricOverride?.trim()) {
        patch.completion_fabric = fabricOverride.trim();
      }
      if (designTypeOverride?.trim()) {
        patch.design_type = designTypeOverride.trim();
      }

      const { error: err } = await supabase
        .from("task_assignments")
        .update(patch)
        .eq("id", assignmentId)
        .in("status", ["assigned", "in_progress", "done"]);
      if (err) return { error: err.message };

      // Fetch task info for notification messages.
      const tId = row.task_id;
      const taskInfo = await fetchTaskInfo(tId);
      const summary = taskInfo ? taskSummary(taskInfo) : "a task";
      const portionType = row.design_type ?? "designs";

      // Notify admins + coordinators: portion completed.
      const portionDesigner = row.designer?.full_name ?? "Designer";
      void sendNotificationToRole(
        ["admin", "design_coordinator"],
        "Portion Completed",
        `${portionDesigner} completed ${row.qty_assigned} (${portionType}): ${summary}`,
        "success",
        "/dashboard"
      );

      logActivity(tId, `${portionDesigner} completed sub-task: ${row.qty_assigned} designs (${portionType})`, "completed", "in_progress");

      // Per-portion sample when this designer flagged sampling. Uses THIS
      // portion's fabric + design, so a split task with different fabric/design
      // across portions yields separate samples (deduped by task+fabric+design).
      if (samplingRequired) {
        await createPendingSample({
          taskId: tId,
          fabric: fabricOverride?.trim() || row.completion_fabric || null,
          designType: designTypeOverride?.trim() || row.design_type || null,
          createdBy: user?.id ?? "",
          summary,
        });
        // Refresh the Sampling page (Pending tab) so the new sample appears.
        void queryClient.invalidateQueries({ queryKey: queryKeys.samples.all });
      }

      // Finalize the parent task via RPC (SECURITY DEFINER — works for any role).
      // The recalc trigger should set status='completed' but doesn't stamp
      // completed_at. The RPC handles both, and acts as a safety net if the
      // trigger didn't fire at all.
      await supabase.rpc("finalize_parent_task", { p_task_id: tId });

      // Re-read to see if the parent is now completed (for notifications).
      const { data: allPortions } = await supabase
        .from("task_assignments")
        .select("designer_id, status")
        .eq("task_id", tId);

      const everyPortionCompleted = allPortions && allPortions.length > 0 &&
        allPortions.every((p) => p.status === "completed");

      if (everyPortionCompleted) {
        // Notify admins + coordinators.
        void sendNotificationToRole(
          ["admin", "design_coordinator"],
          "Task Fully Completed",
          `All portions completed: ${summary}`,
          "success",
          "/dashboard"
        );

        // Notify every contributing designer.
        if (allPortions && allPortions.length > 0) {
          const designerIds = [
            ...new Set(allPortions.map((p) => p.designer_id)),
          ];
          void sendNotificationToMany(
            designerIds,
            "Task Fully Completed",
            `All portions completed — great teamwork! ${summary}`,
            "success",
            "/dashboard"
          );
        }
      }

      invalidate();
      return { error: null };
    },
    [assignments, invalidate, user, queryClient]
  );

  // ── markPortionDone (back-compat, not used by new UI) ─────────────────────

  const markPortionDone = useCallback(
    async (assignmentId: string) => {
      const { error: err } = await supabase
        .from("task_assignments")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("id", assignmentId);
      if (err) return { error: err.message };
      invalidate();
      return { error: null };
    },
    [invalidate]
  );

  // ── removeAssignment ──────────────────────────────────────────────────────

  const removeAssignment = useCallback(
    async (assignmentId: string) => {
      const row = assignments.find((a) => a.id === assignmentId);
      const { error: err } = await supabase
        .from("task_assignments")
        .delete()
        .eq("id", assignmentId);
      if (err) return { error: err.message };

      if (row && taskId) {
        const name = row.designer?.full_name ?? "Designer";
        logActivity(taskId, `${name}'s assignment removed (${row.qty_assigned} designs)`);
      }

      invalidate();
      return { error: null };
    },
    [assignments, taskId, invalidate]
  );

  // ── Return ────────────────────────────────────────────────────────────────

  return {
    assignments,
    totalAssigned,
    totalCompleted,
    isLoading,
    error: error instanceof Error ? error.message : null,
    splitTask,
    claimPortion,
    reduceMyClaim,
    updateAssignmentClaim,
    updateAssignmentDetails,
    updateAssignmentQty,
    completePortion,
    markPortionDone,
    removeAssignment,
    refetch: invalidate,
  };
}
