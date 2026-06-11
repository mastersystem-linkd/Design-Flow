import { supabase } from "@/lib/supabase";
import { sendNotificationToRole } from "@/lib/notifications";

/**
 * A designer ACTUALLY claimed a task whose Full Knitting details aren't added
 * yet (they chose "Continue Without Full Knitting" and then committed to the
 * claim). Drop a to-do into the coordinator's task list — hard-linked to the
 * task via `related_task_id` — AND notify coordinators.
 *
 * Called only from the claim SUCCESS path (never on the intent), so a designer
 * who backs out of the form never reaches the coordinator. The to-do is deduped
 * per task inside the RPC, so re-claims don't pile up duplicates.
 *
 * Both calls are best-effort — they never block or fail the claim flow.
 */
export async function flagFkPendingToCoordinator(
  taskId: string,
  taskCode: string,
  designerName: string
): Promise<void> {
  try {
    await supabase.rpc("create_fk_coordinator_task", {
      p_task_id: taskId,
      p_task_code: taskCode,
      p_designer_name: designerName,
    });
  } catch {
    // non-critical — the claim still proceeds
  }
  try {
    await sendNotificationToRole(
      ["admin", "design_coordinator"],
      "Full Knitting Needed",
      `${designerName} started working on ${taskCode} without Full Knitting details — please add them.`,
      "warning",
      "/coordinator-tasks"
    );
  } catch {
    // non-critical
  }
}

/**
 * The coordinator just added Full Knitting details for a task. Auto-close any
 * open "Add Full Knitting details for …" to-do for that task (Pending → Done)
 * so the coordinator's list stays honest without a manual tick. Best-effort.
 *
 * The matching designer notification ("Full Knitting added — you can now
 * complete") is fired separately by the upload flow (KittingStageADialog).
 */
export async function completeFkCoordinatorTask(
  taskId: string,
  taskCode: string
): Promise<void> {
  try {
    await supabase.rpc("complete_fk_coordinator_task", {
      p_task_id: taskId,
      p_task_code: taskCode,
    });
  } catch {
    // non-critical — FK details are still saved
  }
}
