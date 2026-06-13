// ═══════════════════════════════════════════════════════════════
// webhook-dispatcher — Self-contained for Supabase Dashboard deploy
// Processes the webhook_outbox: delivers pending webhooks with
// HMAC-SHA256 signing, exponential backoff, and dead-lettering.
// ═══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function hmacSign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body)
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async () => {
  const supabase = getServiceClient();

  const { data: pending } = await supabase
    .from("webhook_outbox")
    .select("*")
    .eq("status", "pending")
    .lte("next_retry_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(50);

  if (!pending?.length)
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });

  const { data: integration } = await supabase
    .from("external_integrations")
    .select("webhook_secret")
    .eq("is_active", true)
    .not("webhook_secret", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const secret = integration?.webhook_secret ?? "";

  if (!secret) {
    // No signing secret → every delivery would be unsigned, the receiver 401s,
    // and the row burns all retries until it dead-letters. Skip the run loudly
    // instead of shipping an empty X-Signature; leave pending rows untouched.
    await supabase.from("integration_events").insert({
      direction: "outbound",
      event: "webhook.dispatch_skipped",
      status: "error",
      detail: { reason: "no active integration with a webhook_secret" },
    });
    return new Response(
      JSON.stringify({
        processed: 0,
        skipped: pending.length,
        reason: "no webhook secret",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  let sent = 0;
  let failed = 0;

  for (const row of pending) {
    const body = JSON.stringify(row.payload);
    let ok = false;
    let errMsg = "";

    try {
      const signature = await hmacSign(secret, body);
      const res = await fetch(row.target_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": signature,
          "X-Event": row.event,
        },
        body,
      });
      ok = res.ok;
      if (!ok) errMsg = `HTTP ${res.status}`;
    } catch (e) {
      errMsg = String(e);
    }

    const now = new Date().toISOString();

    if (ok) {
      await supabase
        .from("webhook_outbox")
        .update({
          status: "sent",
          sent_at: now,
          attempts: row.attempts + 1,
          last_attempt_at: now,
        })
        .eq("id", row.id);

      await supabase.from("integration_events").insert({
        direction: "outbound",
        event: row.event,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        ref_id: row.ref_id,
        status: "success",
      });
      sent++;
    } else {
      const attempts = row.attempts + 1;
      const isDead = attempts >= row.max_attempts;
      const backoffMin = Math.pow(2, attempts);

      await supabase
        .from("webhook_outbox")
        .update({
          status: isDead ? "failed" : "pending",
          attempts,
          last_attempt_at: now,
          last_error: errMsg,
          next_retry_at: isDead
            ? null
            : new Date(Date.now() + backoffMin * 60000).toISOString(),
        })
        .eq("id", row.id);

      if (isDead) {
        await supabase.from("integration_events").insert({
          direction: "outbound",
          event: row.event,
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          ref_id: row.ref_id,
          status: "error",
          detail: { error: errMsg, attempts },
        });
      }
      failed++;
    }
  }

  return new Response(
    JSON.stringify({ processed: pending.length, sent, failed }),
    { headers: { "Content-Type": "application/json" } }
  );
});
