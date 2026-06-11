// ═══════════════════════════════════════════════════════════════
// ext-status — Self-contained for Supabase Dashboard deploy
// Sales ERP polls task/sample status via GET
// ═══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// ── Shared auth helpers (inlined) ──

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
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const supabase = getServiceClient();

  const integration = await verifyApiKey(req, supabase);
  if (!integration) return json({ error: "Invalid or inactive API key" }, 401);

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id");
  const refId = url.searchParams.get("ref_id");

  if (!type || !["task", "sample"].includes(type))
    return json({ error: "type must be task or sample" }, 400);
  if (!id && !refId)
    return json({ error: "id or ref_id is required" }, 400);

  if (type === "task") {
    let q = supabase
      .from("tasks")
      .select(
        "id, task_code, status, qty, qty_completed, completion_fabric, completed_at, assigned_to, external_ref_id, assignee:profiles!tasks_assigned_to_fkey(full_name)"
      );
    if (id) {
      q = q.eq("id", id);
    } else {
      q = q.eq("external_ref_id", refId!).eq("external_source", "sales_erp");
    }
    const { data, error } = await q.maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "Not found" }, 404);

    return json({
      id: data.id,
      code: data.task_code,
      ref_id: data.external_ref_id,
      status: data.status,
      qty: data.qty,
      qty_completed: data.qty_completed,
      assigned_to: (data.assignee as any)?.full_name || null,
      completed_at: data.completed_at,
      fabric: data.completion_fabric,
    });
  }

  // type === "sample"
  let q = supabase
    .from("samples")
    .select(
      "id, uid, sample_status, party_name, quality, design_type, printed_mtr, is_completed, completion_timestamp, external_ref_id"
    );
  if (id) {
    q = q.eq("id", id);
  } else {
    q = q.eq("external_ref_id", refId!).eq("external_source", "sales_erp");
  }
  const { data, error } = await q.maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: "Not found" }, 404);

  return json({
    id: data.id,
    uid: data.uid,
    ref_id: data.external_ref_id,
    status: data.sample_status,
    party_name: data.party_name,
    fabric: data.quality,
    design_type: data.design_type,
    printed_mtr: data.printed_mtr,
    is_completed: data.is_completed,
    completed_at: data.completion_timestamp,
  });
});
