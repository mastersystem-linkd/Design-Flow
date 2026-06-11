import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// ── Inline shared helpers (Dashboard deploy can't resolve _shared/) ──

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyApiKey(req: Request, supabase: ReturnType<typeof createClient>) {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const hash = await sha256Hex(token);
  const { data } = await supabase
    .from("external_integrations")
    .select("*")
    .eq("api_key_hash", hash)
    .eq("is_active", true)
    .maybeSingle();
  if (data) {
    supabase
      .from("external_integrations")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id)
      .then(() => {});
  }
  return data || null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, GET, PUT, PATCH, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Helpers ──

async function downloadFkImage(
  supabase: ReturnType<typeof createClient>,
  imageUrl: string,
  taskId: string,
  systemUserId: string
): Promise<string | null> {
  try {
    const resp = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const storagePath = `${systemUserId}/kitting/${taskId}-erp-fk.${ext}`;
    const { error } = await supabase.storage
      .from("sample-files")
      .upload(storagePath, blob, { contentType, upsert: true });
    if (error) return null;
    return storagePath;
  } catch {
    return null;
  }
}

let _systemCreatorId: string | null = null;
async function getSystemCreatorId(supabase: ReturnType<typeof createClient>): Promise<string> {
  if (_systemCreatorId) return _systemCreatorId;
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .in("role", ["admin", "super_admin"])
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (!data) throw new Error("No admin profile found");
  _systemCreatorId = data.id;
  return data.id;
}

// ============================================================================
// ext-update-task — ERP pushes updates to an existing task
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "PUT" && req.method !== "PATCH")
    return json({ error: "Method not allowed — use PUT or PATCH" }, 405);

  const supabase = getServiceClient();

  const integration = await verifyApiKey(req, supabase);
  if (!integration) return json({ error: "Invalid or inactive API key" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const refId = body.ref_id ? String(body.ref_id) : null;
  const taskId = body.task_id ? String(body.task_id) : null;
  if (!refId && !taskId)
    return json({ error: "ref_id or task_id is required" }, 400);

  // deno-lint-ignore no-explicit-any
  let q: any = supabase
    .from("tasks")
    .select("id, task_code, status, requires_full_kitting, full_kitting_image_url, external_ref_id, external_callback_url, client:clients!tasks_client_id_fkey(party_name)")
    .eq("external_source", "sales_erp");
  if (refId) {
    q = q.eq("external_ref_id", refId);
  } else {
    q = q.eq("id", taskId!);
  }
  const { data: task, error: lookupErr } = await q.maybeSingle();

  if (lookupErr) return json({ error: lookupErr.message }, 500);
  if (!task)
    return json({ error: `Task not found for ${refId ? `ref_id=${refId}` : `task_id=${taskId}`}` }, 404);

  let systemUserId: string;
  try {
    systemUserId = await getSystemCreatorId(supabase);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  const updates: Record<string, unknown> = {};
  const changes: string[] = [];

  // ── Simple field updates ──
  if (body.priority !== undefined) {
    const p = String(body.priority).toLowerCase();
    updates.priority = p === "urgent" || p === "very urgent" ? "urgent" : "normal";
    changes.push("priority");
  }
  if (typeof body.description === "string") {
    updates.description = body.description;
    changes.push("description");
  }
  if (body.brief !== undefined) {
    updates.external_brief = body.brief;
    changes.push("external_brief");
  }
  if (typeof body.callback_url === "string") {
    updates.external_callback_url = body.callback_url || null;
    changes.push("callback_url");
  }

  // ── Full Kitting handling ──
  const fkData = body.full_kitting as Record<string, unknown> | undefined;
  let fkResult: { storagePath: string | null; fkRowId: string | null } | null = null;

  if (fkData) {
    updates.requires_full_kitting = true;
    changes.push("requires_full_kitting");

    const { data: existingFk } = await supabase
      .from("full_kitting_details")
      .select("id, image_url")
      .eq("task_id", task.id)
      .maybeSingle();

    let storagePath: string | null = null;

    if (typeof fkData.image_url === "string" && fkData.image_url) {
      storagePath = await downloadFkImage(supabase, fkData.image_url, task.id, systemUserId);
    }

    const hasFormFields = fkData.fabric_details || fkData.colors || fkData.quantity ||
      fkData.accessories || fkData.special_instructions || fkData.packing_type;

    const formPayload = hasFormFields
      ? {
          fabric_details: fkData.fabric_details ?? null,
          colors: fkData.colors ?? null,
          quantity: fkData.quantity ? Number(fkData.quantity) : null,
          accessories: fkData.accessories ?? null,
          special_instructions: fkData.special_instructions ?? null,
          packing_type: fkData.packing_type ?? "standard",
        }
      : null;

    if (existingFk) {
      const fkUpdate: Record<string, unknown> = {};
      if (storagePath) fkUpdate.image_url = storagePath;
      if (formPayload) {
        fkUpdate.form_payload = formPayload;
        fkUpdate.data_entry_status = "completed";
      }
      if (fkData.priority) fkUpdate.priority = fkData.priority;
      if (fkData.form_date) fkUpdate.form_date = fkData.form_date;

      if (Object.keys(fkUpdate).length > 0) {
        await supabase.from("full_kitting_details").update(fkUpdate).eq("id", existingFk.id);
      }
      fkResult = { storagePath: storagePath || existingFk.image_url, fkRowId: existingFk.id };
      changes.push("full_kitting_updated");
    } else {
      // deno-lint-ignore no-explicit-any
      const partyName = (task.client as any)?.party_name || null;
      const { data: fkRow, error: fkError } = await supabase
        .from("full_kitting_details")
        .insert({
          task_id: task.id,
          sample_id: null,
          submitted_by: systemUserId,
          image_url: storagePath,
          data_entry_status: formPayload ? "completed" : storagePath ? "pending_deo" : "pending_image",
          packing_type: (fkData.packing_type as string) || "standard",
          party_name: partyName,
          form_date: (fkData.form_date as string) || new Date().toISOString().split("T")[0],
          priority: (fkData.priority as string) || null,
          form_payload: formPayload,
        })
        .select("id")
        .single();

      if (!fkError && fkRow) {
        fkResult = { storagePath, fkRowId: fkRow.id };
        changes.push("full_kitting_added");
      } else {
        changes.push("full_kitting_insert_failed");
      }
    }

    if (fkResult?.storagePath) {
      updates.full_kitting_image_url = fkResult.storagePath;
    }
  }

  // ── Apply task updates ──
  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await supabase.from("tasks").update(updates).eq("id", task.id);
    if (updateErr) {
      await supabase.from("integration_events").insert({
        direction: "inbound",
        event: "update-task",
        entity_type: "task",
        entity_id: task.id,
        ref_id: task.external_ref_id,
        status: "error",
        detail: { error: updateErr.message, changes },
      });
      return json({ error: updateErr.message }, 500);
    }
  }

  // Log success
  await supabase.from("integration_events").insert({
    direction: "inbound",
    event: "update-task",
    entity_type: "task",
    entity_id: task.id,
    ref_id: task.external_ref_id,
    status: "success",
    detail: {
      changes,
      full_kitting: fkResult
        ? { image_stored: !!fkResult.storagePath, fk_row_id: fkResult.fkRowId }
        : null,
    },
  });

  // Notify admins/coordinators about FK addition
  if (fkResult?.fkRowId && changes.includes("full_kitting_added")) {
    try {
      const { data: admins } = await supabase
        .from("profiles")
        .select("id")
        .in("role", ["admin", "design_coordinator"]);
      for (const a of admins || []) {
        await supabase.rpc("notify_user", {
          p_user_id: a.id,
          p_title: "Full Kitting from Sales ERP",
          p_message: `FK details added for ${task.task_code} via Sales ERP`,
          p_type: "info",
          p_link: "/dashboard",
        });
      }
    } catch (_) {
      /* non-fatal */
    }
  }

  return json(
    {
      task_id: task.id,
      task_code: task.task_code,
      status: task.status,
      changes,
      full_kitting_added: changes.includes("full_kitting_added") || changes.includes("full_kitting_updated"),
      message: `Task updated: ${changes.join(", ")}`,
    },
    200
  );
});
