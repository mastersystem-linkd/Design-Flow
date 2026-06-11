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
// ext-update-sample — ERP pushes updates to an existing sample
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
  const sampleId = body.sample_id ? String(body.sample_id) : null;
  if (!refId && !sampleId)
    return json({ error: "ref_id or sample_id is required" }, 400);

  // deno-lint-ignore no-explicit-any
  let q: any = supabase
    .from("samples")
    .select("id, uid, sample_status, party_name, quality, external_ref_id, external_callback_url, requires_full_kitting")
    .eq("external_source", "sales_erp");
  if (refId) {
    q = q.eq("external_ref_id", refId);
  } else {
    q = q.eq("id", sampleId!);
  }
  const { data: sample, error: lookupErr } = await q.maybeSingle();

  if (lookupErr) return json({ error: lookupErr.message }, 500);
  if (!sample)
    return json({ error: `Sample not found for ${refId ? `ref_id=${refId}` : `sample_id=${sampleId}`}` }, 404);

  let systemUserId: string;
  try {
    systemUserId = await getSystemCreatorId(supabase);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  const updates: Record<string, unknown> = {};
  const changes: string[] = [];

  // ── Simple field updates ──
  if (typeof body.fabric === "string") {
    updates.quality = body.fabric;
    changes.push("fabric");
  }
  if (body.actual_meters !== undefined) {
    updates.printed_mtr = Number(body.actual_meters) || 0;
    changes.push("actual_meters");
  }
  if (typeof body.requirement === "string") {
    updates.requirement = body.requirement;
    changes.push("requirement");
  }
  if (typeof body.callback_url === "string") {
    updates.external_callback_url = body.callback_url || null;
    changes.push("callback_url");
  }
  if (body.brief !== undefined) {
    updates.external_brief = body.brief;
    changes.push("external_brief");
  }

  // ── Sample Development (FK) handling ──
  const devData = body.sample_development as Record<string, unknown> | undefined;
  let fkResult: { fkRowId: string | null } | null = null;

  if (devData) {
    updates.requires_full_kitting = true;
    changes.push("requires_full_kitting");

    const devWidths = Array.isArray(devData.fabric_widths) ? devData.fabric_widths : [];
    const devTypes = Array.isArray(devData.sample_types) ? devData.sample_types : [];
    const devDesignCount = Number(devData.design_count) || 0;
    const devEstimate = devDesignCount * Math.max(devWidths.length, 1) * Math.max(devTypes.length, 1);

    const formPayload = {
      design_count: devDesignCount,
      fabric_type: (devData.fabric_type as string) || body.fabric || sample.quality || null,
      fabric_widths: devWidths,
      sample_types: devTypes,
      estimated_meters: devEstimate,
      actual_meters: devData.actual_meters ? Number(devData.actual_meters) : null,
    };

    // Check for existing FK row
    const { data: existingFk } = await supabase
      .from("full_kitting_details")
      .select("id")
      .eq("sample_id", sample.id)
      .maybeSingle();

    if (existingFk) {
      const { error: fkErr } = await supabase
        .from("full_kitting_details")
        .update({
          form_payload: formPayload,
          data_entry_status: "completed",
          party_name: sample.party_name || null,
          form_date: new Date().toISOString().split("T")[0],
        })
        .eq("id", existingFk.id);

      if (!fkErr) {
        fkResult = { fkRowId: existingFk.id };
        changes.push("development_updated");
      } else {
        changes.push("development_update_failed");
      }
    } else {
      const { data: fkRow, error: fkError } = await supabase
        .from("full_kitting_details")
        .insert({
          task_id: null,
          sample_id: sample.id,
          submitted_by: systemUserId,
          image_url: "development-form-only",
          data_entry_status: "completed",
          packing_type: "standard",
          party_name: sample.party_name || null,
          form_date: new Date().toISOString().split("T")[0],
          priority: null,
          form_payload: formPayload,
        })
        .select("id")
        .single();

      if (!fkError && fkRow) {
        fkResult = { fkRowId: fkRow.id };
        changes.push("development_added");
      } else {
        changes.push("development_insert_failed");
      }
    }

    // Update fabric on sample if provided in development data
    if (devData.fabric_type && !updates.quality) {
      updates.quality = devData.fabric_type;
      changes.push("fabric");
    }
  }

  // ── Apply sample updates ──
  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await supabase.from("samples").update(updates).eq("id", sample.id);
    if (updateErr) {
      await supabase.from("integration_events").insert({
        direction: "inbound",
        event: "update-sample",
        entity_type: "sample",
        entity_id: sample.id,
        ref_id: sample.external_ref_id,
        status: "error",
        detail: { error: updateErr.message, changes },
      });
      return json({ error: updateErr.message }, 500);
    }
  }

  // Log success
  await supabase.from("integration_events").insert({
    direction: "inbound",
    event: "update-sample",
    entity_type: "sample",
    entity_id: sample.id,
    ref_id: sample.external_ref_id,
    status: "success",
    detail: {
      changes,
      development: fkResult
        ? { fk_row_id: fkResult.fkRowId }
        : null,
    },
  });

  // Notify admins/coordinators about development data addition
  if (fkResult?.fkRowId && changes.includes("development_added")) {
    try {
      const { data: admins } = await supabase
        .from("profiles")
        .select("id")
        .in("role", ["admin", "design_coordinator"]);
      for (const a of admins || []) {
        await supabase.rpc("notify_user", {
          p_user_id: a.id,
          p_title: "Sample Development from Sales ERP",
          p_message: `Development details added for ${sample.uid} via Sales ERP`,
          p_type: "info",
          p_link: "/sampling",
        });
      }
    } catch (_) {
      /* non-fatal */
    }
  }

  return json(
    {
      sample_id: sample.id,
      uid: sample.uid,
      status: sample.sample_status,
      changes,
      development_added: changes.includes("development_added") || changes.includes("development_updated"),
      message: changes.length > 0
        ? `Sample updated: ${changes.join(", ")}`
        : "No changes applied",
    },
    200
  );
});
