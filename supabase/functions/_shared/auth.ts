import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Verify the Authorization: Bearer <key> header against external_integrations.
// Returns the integration row if valid + active, else null.
export async function verifyApiKey(
  req: Request,
  supabase: ReturnType<typeof createClient>
) {
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
    // fire-and-forget last_used_at
    supabase
      .from("external_integrations")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id)
      .then(() => {});
  }
  return data || null;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, PUT, PATCH, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
