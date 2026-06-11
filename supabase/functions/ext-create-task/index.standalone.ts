// ═══════════════════════════════════════════════════════════════
// ext-create-task — Self-contained for Supabase Dashboard deploy
// ═══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// ── Shared auth helpers (inlined from _shared/auth.ts) ──

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
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Function-specific logic ──

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

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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

  // Idempotency: return existing task for this ref_id
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
    requires_full_kitting: false,
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
      direction: "inbound", event: "create-task", ref_id: String(body.ref_id),
      status: "error", detail: { error: error.message, body },
    });
    return json({ error: error.message }, 500);
  }

  await supabase.from("integration_events").insert({
    direction: "inbound", event: "create-task", entity_type: "task",
    entity_id: task.id, ref_id: String(body.ref_id), status: "success",
    detail: { customer: body.customer_name, qty },
  });

  try {
    const { data: admins } = await supabase
      .from("profiles").select("id")
      .in("role", ["admin", "design_coordinator"]);
    for (const a of admins || []) {
      await supabase.rpc("notify_user", {
        p_user_id: a.id,
        p_title: "New Task from Sales ERP",
        p_message: `${body.customer_name} — ${qty} designs (${task.task_code})`,
        p_type: "info",
        p_link: "/dashboard",
      });
    }
  } catch (_) { /* non-fatal */ }

  return json({
    task_id: task.id,
    task_code: task.task_code,
    status: task.status,
    message: "Task created in Design Flow pool",
  }, 201);
});
