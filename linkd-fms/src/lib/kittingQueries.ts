// ---------------------------------------------------------------------------
// Server-side helpers for the Full Kitting workflow.
// These are plain async functions (not React hooks) so they can be called
// from anywhere — drawer submit handlers, DEO queue page, edit dialogs, etc.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import {
  priorityToEnum,
  type KittingDataEntryStatus,
} from "@/lib/kitting";
import type { KittingFormValues } from "@/components/tasks/FullKittingFormFields";

// ───────────────────────────────────────────────────────────────────────────
// 1. Coordinator initiates Stage A — record + image, no payload yet.
//    UNIQUE(task_id) means one row per task; if the coordinator re-uploads,
//    swap insert() for upsert({ onConflict: 'task_id' }).
// ───────────────────────────────────────────────────────────────────────────
export async function initiateKitting(args: {
  /** Exactly one of taskId / sampleId must be set. The DB enforces this
   *  with a CHECK constraint (full_kitting_details_link_xor). */
  taskId?: string;
  sampleId?: string;
  submittedBy: string;
  imageUrl: string;
  /** Source's party name — seeds the FK row so admins can identify it
   *  before the DEO digitizes. The DEO's form submission overwrites it. */
  partyName?: string | null;
  /** Date the source was created (yyyy-mm-dd). Stamped so the FK row sorts
   *  by intake date even while still pending. */
  formDate?: string | null;
}) {
  if (!args.taskId && !args.sampleId) {
    return { data: null, error: "initiateKitting requires taskId or sampleId" };
  }
  if (args.taskId && args.sampleId) {
    return { data: null, error: "initiateKitting cannot link to both task and sample" };
  }
  // packing_type is NOT NULL in migration 0013. We default it to 'standard'
  // for new Stage A inserts so callers don't have to think about it — the
  // DEO will overwrite it (or leave it) when they fill the digital form.
  const { data, error } = await supabase
    .from("full_kitting_details")
    .insert({
      task_id: args.taskId ?? null,
      sample_id: args.sampleId ?? null,
      submitted_by: args.submittedBy,
      image_url: args.imageUrl,
      data_entry_status: "pending_deo" satisfies KittingDataEntryStatus,
      packing_type: "standard",
      party_name: args.partyName?.trim() || null,
      form_date: args.formDate || null,
    })
    .select()
    .single();
  if (error) return { data: null, error: error.message };

  // When linked to a task, flag the task itself so the FK badge (red → blue)
  // and the task-drawer FK preview reflect it. At brief time createTask already
  // sets these; this is what makes the "added later via ⋮ → Full Knitting" path
  // light up the badge too. Best-effort — the FK row already exists either way.
  if (args.taskId) {
    await supabase
      .from("tasks")
      .update({
        requires_full_kitting: true,
        full_kitting_image_url: args.imageUrl,
      })
      .eq("id", args.taskId);
  }

  return { data, error: null };
}

// ───────────────────────────────────────────────────────────────────────────
// 1b. Fetch existing kitting row for a sample.
// ───────────────────────────────────────────────────────────────────────────
export async function getKittingBySample(sampleId: string) {
  const { data, error } = await supabase
    .from("full_kitting_details")
    .select("*")
    .eq("sample_id", sampleId)
    .maybeSingle();
  return { data, error: error?.message ?? null };
}

// ───────────────────────────────────────────────────────────────────────────
// 2. DEO claims a record — flip pending_deo → in_progress.
//    The .eq("data_entry_status", "pending_deo") guard is a poor-man's
//    optimistic lock: if another DEO grabbed it first, this update affects
//    zero rows and we surface a friendly "already claimed" message.
// ───────────────────────────────────────────────────────────────────────────
export async function claimKitting(recordId: string) {
  const { data, error } = await supabase
    .from("full_kitting_details")
    .update({ data_entry_status: "in_progress" satisfies KittingDataEntryStatus })
    .eq("id", recordId)
    .eq("data_entry_status", "pending_deo")
    .select()
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Already claimed by another DEO" };
  return { data, error: null };
}

// ───────────────────────────────────────────────────────────────────────────
// 3. DEO submits the digitized form.
//    The trigger from 0021 (set_kitting_completed_status_trg) auto-sets
//    data_entry_status='completed' + stamps completed_at whenever
//    form_payload arrives — we don't need to set it manually.
// ───────────────────────────────────────────────────────────────────────────
export async function submitKittingForm(args: {
  recordId: string;
  completedBy: string;
  values: KittingFormValues;
}) {
  const { error } = await supabase
    .from("full_kitting_details")
    .update({
      form_payload: args.values as unknown as Record<string, unknown>,
      party_name: args.values.partyName.trim() || null,
      form_date: args.values.date || null,
      priority: priorityToEnum(args.values.priority),
      completed_by: args.completedBy,
    })
    .eq("id", args.recordId);
  return { error: error?.message ?? null };
}

// ───────────────────────────────────────────────────────────────────────────
// 4. Fetch the DEO queue (pending + in_progress only).
// ───────────────────────────────────────────────────────────────────────────
export async function fetchDeoQueue() {
  const { data, error } = await supabase
    .from("deo_kitting_queue")
    .select("*")
    .order("created_at", { ascending: true });
  return { data: data ?? [], error: error?.message ?? null };
}

// ───────────────────────────────────────────────────────────────────────────
// 5. Fetch existing kitting for a task (for the View/Edit drawer).
//    maybeSingle() — UNIQUE(task_id) guarantees ≤ 1 row; null = none yet.
// ───────────────────────────────────────────────────────────────────────────
export async function getKittingByTask(taskId: string) {
  const { data, error } = await supabase
    .from("full_kitting_details")
    .select("*")
    .eq("task_id", taskId)
    .maybeSingle();
  return { data, error: error?.message ?? null };
}
