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
  taskId: string;
  submittedBy: string;
  imageUrl: string;
}) {
  // packing_type is NOT NULL in migration 0013. We default it to 'standard'
  // for new Stage A inserts so callers don't have to think about it — the
  // DEO will overwrite it (or leave it) when they fill the digital form.
  const { data, error } = await supabase
    .from("full_kitting_details")
    .insert({
      task_id: args.taskId,
      submitted_by: args.submittedBy,
      image_url: args.imageUrl,
      data_entry_status: "pending_deo" satisfies KittingDataEntryStatus,
      packing_type: "standard",
    })
    .select()
    .single();
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
