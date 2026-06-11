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

// ============================================================================
// ext-create-sample — Sales ERP pushes sample requests into Design Flow
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
  if (!body.customer_name)
    return json({ error: "customer_name is required" }, 400);

  // Idempotency: return existing sample for this ref_id
  const { data: dupe } = await supabase
    .from("samples")
    .select("id, uid, sample_status")
    .eq("external_source", "sales_erp")
    .eq("external_ref_id", String(body.ref_id))
    .maybeSingle();
  if (dupe) {
    return json(
      {
        sample_id: dupe.id,
        uid: dupe.uid,
        status: dupe.sample_status,
        message: "Sample already exists for this ref_id",
      },
      200
    );
  }

  const customerName = String(body.customer_name);
  const group = String(body.business_mode || "")
    .toLowerCase()
    .includes("linkd")
    ? "job_work"
    : "ld";

  await resolveClient(supabase, customerName, group);

  let systemUserId: string;
  try {
    systemUserId = await getSystemCreatorId(supabase);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  const sampleTypes = Array.isArray(body.sample_types)
    ? body.sample_types
    : [];

  // Sample development data (FK equivalent for samples)
  const devData = body.sample_development as Record<string, unknown> | undefined;
  const hasDevData = !!devData;

  const insertPayload: Record<string, unknown> = {
    party_name: customerName,
    quality: body.fabric || (devData?.fabric_type as string) || null,
    design_type:
      sampleTypes.length > 0 ? String(sampleTypes[0]) : null,
    printed_mtr: Number(body.actual_meters) || Number(body.estimated_meters) || 0,
    sample_status: "pending",
    source: "sales_erp",
    order_or_sample: "sample",
    requirement: body.requirement || null,
    assigned_by: (body.assigned_by as string) || "Sales ERP",
    requires_full_kitting: hasDevData || body.requires_full_kitting === true,
    external_source: "sales_erp",
    external_ref_id: String(body.ref_id),
    external_callback_url:
      body.callback_url || integration.webhook_url || null,
    external_brief: {
      fabric_source: body.fabric_source ?? null,
      design_count: body.design_count ?? devData?.design_count ?? null,
      widths: body.widths ?? devData?.fabric_widths ?? null,
      sample_types: body.sample_types ?? devData?.sample_types ?? null,
      erp_sample_id: body.erp_sample_id ?? null,
      estimated_meters: body.estimated_meters ?? devData?.estimated_meters ?? null,
      actual_meters: body.actual_meters ?? devData?.actual_meters ?? null,
    },
  };

  const { data: sample, error } = await supabase
    .from("samples")
    .insert(insertPayload)
    .select("id, uid, sample_status")
    .single();

  if (error) {
    await supabase.from("integration_events").insert({
      direction: "inbound",
      event: "create-sample",
      ref_id: String(body.ref_id),
      status: "error",
      detail: { error: error.message, body },
    });
    return json({ error: error.message }, 500);
  }

  // Handle sample development (FK) data if provided
  let fkResult: { fkRowId: string | null } | null = null;
  if (hasDevData && sample) {
    const devWidths = Array.isArray(devData.fabric_widths) ? devData.fabric_widths : [];
    const devTypes = Array.isArray(devData.sample_types) ? devData.sample_types : [];
    const devDesignCount = Number(devData.design_count) || 0;
    const devEstimate = devDesignCount * Math.max(devWidths.length, 1) * Math.max(devTypes.length, 1);

    const formPayload = {
      design_count: devDesignCount,
      fabric_type: (devData.fabric_type as string) || body.fabric || null,
      fabric_widths: devWidths,
      sample_types: devTypes,
      estimated_meters: devEstimate,
      actual_meters: devData.actual_meters ? Number(devData.actual_meters) : null,
    };

    const { data: fkRow, error: fkError } = await supabase
      .from("full_kitting_details")
      .insert({
        task_id: null,
        sample_id: sample.id,
        submitted_by: systemUserId,
        image_url: "development-form-only",
        data_entry_status: "completed",
        packing_type: "standard",
        party_name: customerName,
        form_date: new Date().toISOString().split("T")[0],
        priority: null,
        form_payload: formPayload,
      })
      .select("id")
      .single();

    if (!fkError && fkRow) {
      fkResult = { fkRowId: fkRow.id };
    }
  }

  // Log success
  await supabase.from("integration_events").insert({
    direction: "inbound",
    event: "create-sample",
    entity_type: "sample",
    entity_id: sample.id,
    ref_id: String(body.ref_id),
    status: "success",
    detail: {
      customer: customerName,
      has_development: hasDevData,
      fk_row_id: fkResult?.fkRowId ?? null,
    },
  });

  // Notify admins/coordinators about new pending sample
  try {
    const { data: admins } = await supabase
      .from("profiles")
      .select("id")
      .in("role", ["admin", "design_coordinator"]);
    const devNote = hasDevData
      ? fkResult?.fkRowId ? " (with development details)" : " (development data failed to save)"
      : "";
    for (const a of admins || []) {
      await supabase.rpc("notify_user", {
        p_user_id: a.id,
        p_title: "New Sample from Sales ERP",
        p_message: `${customerName} — pending sample (${sample.uid})${devNote}`,
        p_type: "info",
        p_link: "/sampling",
      });
    }
  } catch (_) {
    /* non-fatal */
  }

  return json(
    {
      sample_id: sample.id,
      uid: sample.uid,
      status: sample.sample_status,
      development_added: !!fkResult?.fkRowId,
      message: hasDevData
        ? `Sample created with development details${fkResult?.fkRowId ? "" : " (FK row failed — coordinator can fill manually)"}`
        : "Sample created as pending in Design Flow",
    },
    201
  );
});
