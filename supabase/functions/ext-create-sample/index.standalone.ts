// ═══════════════════════════════════════════════════════════════
// ext-create-sample — Self-contained for Supabase Dashboard deploy
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

async function resolveClient(
  supabase: ReturnType<typeof createClient>,
  name: string,
  group: string
): Promise<string | null> {
  if (!name) return null;

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

  // Idempotency: return existing sample for this ref_id
  const { data: dupe } = await supabase
    .from("samples")
    .select("id, uid, sample_status")
    .eq("external_source", "sales_erp")
    .eq("external_ref_id", String(body.ref_id))
    .maybeSingle();
  if (dupe) {
    return json({
      sample_id: dupe.id,
      uid: dupe.uid,
      status: dupe.sample_status,
      message: "Sample already exists for this ref_id",
    }, 200);
  }

  const customerName = String(body.customer_name);
  const group = String(body.business_mode || "").toLowerCase().includes("linkd")
    ? "job_work"
    : "ld";

  await resolveClient(supabase, customerName, group);

  const sampleTypes = Array.isArray(body.sample_types) ? body.sample_types : [];

  const insertPayload: Record<string, unknown> = {
    party_name: customerName,
    quality: body.fabric || null,
    design_type: sampleTypes.length > 0 ? String(sampleTypes[0]) : null,
    printed_mtr: Number(body.actual_meters) || Number(body.estimated_meters) || 0,
    sample_status: "pending",
    source: "sales_erp",
    order_or_sample: "sample",
    requirement: body.requirement || null,
    assigned_by: (body.assigned_by as string) || "Sales ERP",
    external_source: "sales_erp",
    external_ref_id: String(body.ref_id),
    external_callback_url: body.callback_url || integration.webhook_url || null,
    external_brief: {
      fabric_source: body.fabric_source ?? null,
      design_count: body.design_count ?? null,
      widths: body.widths ?? null,
      sample_types: body.sample_types ?? null,
      erp_sample_id: body.erp_sample_id ?? null,
      estimated_meters: body.estimated_meters ?? null,
      actual_meters: body.actual_meters ?? null,
    },
  };

  const { data: sample, error } = await supabase
    .from("samples")
    .insert(insertPayload)
    .select("id, uid, sample_status")
    .single();

  if (error) {
    await supabase.from("integration_events").insert({
      direction: "inbound", event: "create-sample", ref_id: String(body.ref_id),
      status: "error", detail: { error: error.message, body },
    });
    return json({ error: error.message }, 500);
  }

  await supabase.from("integration_events").insert({
    direction: "inbound", event: "create-sample", entity_type: "sample",
    entity_id: sample.id, ref_id: String(body.ref_id), status: "success",
    detail: { customer: customerName },
  });

  try {
    const { data: admins } = await supabase
      .from("profiles").select("id")
      .in("role", ["admin", "design_coordinator"]);
    for (const a of admins || []) {
      await supabase.rpc("notify_user", {
        p_user_id: a.id,
        p_title: "New Sample from Sales ERP",
        p_message: `${customerName} — pending sample (${sample.uid})`,
        p_type: "info",
        p_link: "/sampling",
      });
    }
  } catch (_) { /* non-fatal */ }

  return json({
    sample_id: sample.id,
    uid: sample.uid,
    status: sample.sample_status,
    message: "Sample created as pending in Design Flow",
  }, 201);
});
