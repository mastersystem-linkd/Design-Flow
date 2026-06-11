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

// ============================================================================
// ext-create-task — Sales ERP pushes design tasks into the pool
// ============================================================================

const PRIORITY_MAP: Record<string, string> = {
  "very urgent": "urgent",
  urgent: "urgent",
};

function mapPriority(p?: string): string {
  if (!p) return "normal";
  return PRIORITY_MAP[p.toLowerCase()] ?? "normal";
}

function mapBriefType(mode?: string): string {
  const m = (mode || "").toLowerCase();
  if (m.includes("linkd")) return "job_work";
  return "ld";
}

function buildDescription(brief: Record<string, unknown> | undefined): string {
  if (!brief) return "";
  const lines: string[] = [];
  if (brief.colour_theme) lines.push(`Colour Theme: ${brief.colour_theme}`);
  if (brief.background_colour) lines.push(`Background: ${brief.background_colour}`);
  if (brief.garment_size) lines.push(`Garment: ${brief.garment_size}`);
  if (brief.motif_size) lines.push(`Motif Size: ${brief.motif_size}`);
  if (brief.concept) lines.push(`Concept: ${brief.concept}`);
  if (brief.apc_received !== undefined) lines.push(`APC: ${brief.apc_received ? "Yes" : "No"}`);
  if (brief.additional_requirement) lines.push(`Additional: ${brief.additional_requirement}`);
  if (brief.received_by) lines.push(`Received by: ${brief.received_by}`);
  return lines.join("\n");
}

async function resolveClient(
  supabase: ReturnType<typeof createClient>,
  name: string,
  briefType: string
): Promise<string | null> {
  if (!name) return null;
  const group = briefType === "job_work" ? "job_work" : "ld";
  const { data: existing } = await supabase
    .from("clients")
    .select("id")
    .ilike("party_name", name)
    .eq("client_group", group)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await supabase
    .from("clients")
    .insert({ party_name: name, client_group: group })
    .select("id")
    .single();
  return created?.id ?? null;
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
  if (!data) throw new Error("No admin profile found for created_by");
  _systemCreatorId = data.id;
  return data.id;
}

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

async function handleFullKitting(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  systemUserId: string,
  fk: Record<string, unknown>,
  partyName: string
): Promise<{ storagePath: string | null; fkRowId: string | null }> {
  let storagePath: string | null = null;

  if (typeof fk.image_url === "string" && fk.image_url) {
    storagePath = await downloadFkImage(supabase, fk.image_url, taskId, systemUserId);
  }

  const hasFormFields = fk.fabric_details || fk.colors || fk.quantity ||
    fk.accessories || fk.special_instructions || fk.packing_type;

  const formPayload = hasFormFields
    ? {
        fabric_details: fk.fabric_details ?? null,
        colors: fk.colors ?? null,
        quantity: fk.quantity ? Number(fk.quantity) : null,
        accessories: fk.accessories ?? null,
        special_instructions: fk.special_instructions ?? null,
        packing_type: fk.packing_type ?? "standard",
      }
    : null;

  const { data: fkRow, error: fkError } = await supabase
    .from("full_kitting_details")
    .insert({
      task_id: taskId,
      sample_id: null,
      submitted_by: systemUserId,
      image_url: storagePath,
      data_entry_status: formPayload ? "completed" : storagePath ? "pending_deo" : "pending_image",
      packing_type: (fk.packing_type as string) || "standard",
      party_name: partyName || null,
      form_date: (fk.form_date as string) || new Date().toISOString().split("T")[0],
      priority: (fk.priority as string) || null,
      form_payload: formPayload,
    })
    .select("id")
    .single();

  if (fkError) {
    return { storagePath: null, fkRowId: null };
  }

  await supabase
    .from("tasks")
    .update({
      requires_full_kitting: true,
      full_kitting_image_url: storagePath,
    })
    .eq("id", taskId);

  return { storagePath, fkRowId: fkRow?.id ?? null };
}

// ============================================================================
// Main handler
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = getServiceClient();

  const integration = await verifyApiKey(req, supabase);
  if (!integration) return json({ error: "Invalid or inactive API key" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!body.ref_id) return json({ error: "ref_id is required" }, 400);
  if (!body.customer_name) return json({ error: "customer_name is required" }, 400);
  const qty = Number(body.qty);
  if (!qty || qty < 1) return json({ error: "qty must be >= 1" }, 400);

  // Idempotency
  const { data: dupe } = await supabase
    .from("tasks")
    .select("id, task_code, status")
    .eq("external_source", "sales_erp")
    .eq("external_ref_id", String(body.ref_id))
    .maybeSingle();
  if (dupe) {
    return json({
      task_id: dupe.id,
      task_code: dupe.task_code,
      status: dupe.status,
      message: "Task already exists for this ref_id",
    }, 200);
  }

  const briefType = mapBriefType(body.business_mode as string);
  const clientId = await resolveClient(supabase, body.customer_name as string, briefType);

  let createdBy: string;
  try {
    createdBy = await getSystemCreatorId(supabase);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  const brief = body.brief as Record<string, unknown> | undefined;
  const concept = (brief?.concept as string) || (body.customer_name as string) || "Sales ERP Brief";

  const fkData = body.full_kitting as Record<string, unknown> | undefined;
  const requiresFk = fkData ? true : body.requires_full_kitting === true;

  const insertPayload: Record<string, unknown> = {
    brief_type: briefType,
    client_id: briefType === "job_work" ? clientId : null,
    concept,
    qty,
    fabric: "",
    priority: mapPriority(body.priority as string),
    description: buildDescription(brief),
    planned_deadline: body.follow_up_date || null,
    assigned_by: (brief?.assigned_by as string) || "Sales ERP",
    assigned_to: null,
    status: "pool",
    requires_full_kitting: requiresFk,
    created_by: createdBy,
    external_source: "sales_erp",
    external_ref_id: String(body.ref_id),
    external_callback_url: body.callback_url || integration.webhook_url || null,
    external_brief: brief
      ? { ...brief, round_id: body.round_id, widths: body.widths, sample_types: body.sample_types }
      : null,
    whatsapp_received_date: body.received_date || new Date().toISOString().split("T")[0],
    whatsapp_received_time: body.received_time || "12:00",
    whatsapp_group: (brief?.received_via as string) || "Sales ERP",
  };

  if (briefType === "ld" && clientId) insertPayload.client_id = clientId;

  const { data: task, error } = await supabase
    .from("tasks")
    .insert(insertPayload)
    .select("id, task_code, status")
    .single();

  if (error) {
    await supabase.from("integration_events").insert({
      direction: "inbound",
      event: "create-task",
      ref_id: String(body.ref_id),
      status: "error",
      detail: { error: error.message, body },
    });
    return json({ error: error.message }, 500);
  }

  // Handle Full Kitting data if provided
  let fkResult: { storagePath: string | null; fkRowId: string | null } | null = null;
  if (fkData && task) {
    fkResult = await handleFullKitting(supabase, task.id, createdBy, fkData, body.customer_name as string);
  }

  // Log success
  await supabase.from("integration_events").insert({
    direction: "inbound",
    event: "create-task",
    entity_type: "task",
    entity_id: task.id,
    ref_id: String(body.ref_id),
    status: "success",
    detail: {
      customer: body.customer_name,
      qty,
      full_kitting: fkResult
        ? { image_stored: !!fkResult.storagePath, fk_row_id: fkResult.fkRowId }
        : null,
    },
  });

  // Notify admins/coordinators
  try {
    const { data: admins } = await supabase
      .from("profiles")
      .select("id")
      .in("role", ["admin", "design_coordinator"]);
    const fkNote = fkData
      ? fkResult?.storagePath ? " (with Full Kitting)" : " (FK flagged, image pending)"
      : "";
    for (const a of admins || []) {
      await supabase.rpc("notify_user", {
        p_user_id: a.id,
        p_title: "New Task from Sales ERP",
        p_message: `${body.customer_name} — ${qty} designs (${task.task_code})${fkNote}`,
        p_type: "info",
        p_link: "/dashboard",
      });
    }
  } catch (_) {
    /* non-fatal */
  }

  return json({
    task_id: task.id,
    task_code: task.task_code,
    status: task.status,
    requires_full_kitting: requiresFk,
    full_kitting_added: !!fkResult?.fkRowId,
    message: fkData
      ? `Task created with Full Kitting details${fkResult?.storagePath ? " (image stored)" : " (image not stored — will need coordinator upload)"}`
      : "Task created in Design Flow pool",
  }, 201);
});
