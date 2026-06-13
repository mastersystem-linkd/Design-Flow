import { supabase } from "@/lib/supabase";
import { sendNotificationToRole } from "@/lib/notifications";
import { toast } from "@/components/ui";

// The default party for LD (internal) briefs is a real row in the `clients`
// table (LD group), maintained by admins in Settings → Party Name. We read it
// from there instead of baking the label into code, so a rename flows through.
// Cached for the session after the first lookup. Returns null if not seeded yet.
let cachedLdParty: string | null | undefined;
async function resolveDefaultLdParty(): Promise<string | null> {
  if (cachedLdParty !== undefined) return cachedLdParty;
  const { data } = await supabase
    .from("clients")
    .select("party_name")
    .eq("client_group", "ld")
    .ilike("party_name", "ld silk mills")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  cachedLdParty = data?.party_name ?? null;
  return cachedLdParty;
}

export interface PendingSampleInput {
  taskId: string;
  /** → samples.quality. */
  fabric: string | null;
  /** → samples.design_type. */
  designType: string | null;
  createdBy: string;
  /** Short text for the "New Sample Pending" notification. */
  summary: string;
}

/**
 * Create a pending sample from a completed task or a completed split-portion —
 * idempotent. Party name + UID (task code) are resolved from the task via a
 * dedicated SELECT here, NOT taken from the caller: an `UPDATE … .select(embed)`
 * can return an empty embedded `client` relation, which is why party_name was
 * coming through as "—". A "—" party now means the task genuinely has no client
 * (an LD brief).
 *
 * The dedup key is (task_id, fabric, design_type), so a split task whose
 * portions use DIFFERENT fabric/design yields a SEPARATE sample per combination
 * while identical portions collapse to one. Backed at the DB level by the
 * partial UNIQUE index `uq_samples_task_completion` (migration 0070).
 * Best-effort: swallows errors so the caller's primary mutation still succeeds.
 */
export async function createPendingSample(input: PendingSampleInput): Promise<void> {
  const { taskId, fabric, designType, createdBy, summary } = input;
  try {
    // Reliable party + uid from the task via TWO plain queries — NOT an embed.
    // (The samples→task→client nested embed returns a null client even when the
    // task has one, which is why job-work party names came through as "—".)
    const { data: task } = await supabase
      .from("tasks")
      .select("task_code, client_id, brief_type, external_source")
      .eq("id", taskId)
      .maybeSingle();
    const uid = task?.task_code ?? null;
    let partyName: string | null = null;
    if (task?.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("party_name")
        .eq("id", task.client_id)
        .maybeSingle();
      partyName = client?.party_name ?? null;
    }
    // LD (internal) briefs carry no client_id, so resolve their party from the
    // admin-maintained default LD party in the clients table (LD group) instead
    // of a hardcoded string — if the admin renames it, samples follow.
    if (!partyName && task?.brief_type === "ld") {
      partyName = await resolveDefaultLdParty();
    }

    // Soft dedup matching the unique index (COALESCE-to-'' semantics). The
    // index is the hard backstop if a concurrent insert races past this.
    const { data: existing } = await supabase
      .from("samples")
      .select("quality, design_type")
      .eq("task_id", taskId)
      .eq("source", "task_completion");
    const isDup = (existing ?? []).some(
      (s) =>
        (s.quality ?? "") === (fabric ?? "") &&
        (s.design_type ?? "") === (designType ?? "")
    );
    if (isDup) return;

    const { error: insertErr } = await supabase.from("samples").insert({
      task_id: taskId,
      party_name: partyName || "—",
      uid: uid || undefined,
      quality: fabric || null,
      design_type: designType || null,
      order_or_sample: "sample",
      sample_status: "pending",
      source: "task_completion",
      external_source: task?.external_source || null,
      created_by: createdBy,
    });
    if (insertErr) {
      // 23505 = unique violation = the concurrent-race backstop (expected; a
      // sample for this task+fabric+design already exists) — stay silent.
      // Anything else is a REAL failure: surface it (toast + console) so a
      // missing column / stale schema cache / RLS denial is diagnosable instead
      // of silently producing an empty Pending Samples queue. The caller's
      // primary mutation (task completion) already succeeded regardless.
      if ((insertErr as { code?: string }).code !== "23505") {
        console.warn("[createPendingSample] insert failed:", insertErr);
        toast.error(`Task saved, but adding it to Sampling failed: ${insertErr.message}`);
      }
      return;
    }

    // Notify only when a NEW sample was actually created.
    void sendNotificationToRole(
      ["admin", "design_coordinator"],
      "New Sample Pending",
      `Sampling needed: ${summary}`,
      "info",
      "/sampling"
    );
  } catch {
    // non-critical — the caller's primary mutation already succeeded
  }
}
