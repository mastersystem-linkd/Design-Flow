// ─────────────────────────────────────────────────────────────────────────
// Offline webhook-signature verifier.
//
// Reproduces EXACTLY what supabase/functions/webhook-dispatcher does:
//   body = JSON.stringify(row.payload)   (payload fetched via supabase-js, so
//                                          the JSONB round-trips identically)
//   sig  = HMAC_SHA256(secret, body) as lowercase hex
// …and checks it against the HMAC the Sales ERP says it expects, so you can
// confirm the DB secret is correct BEFORE re-driving any deliveries.
//
// Env required:
//   SUPABASE_URL                e.g. https://jyfwyfpwbbgfpsntubfy.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   sb_secret_… (bypasses RLS to read webhook_outbox)
//   CANDIDATE_SECRET            the whsec_… you intend to store (the ERP's value)
// Env optional:
//   REF_ID        default 9560806a-e7bc-4c5d-b7e6-9c4236bb9d69 (the ERP's proof event)
//   EVENT         default task.completed
//   EXPECT_FULL   expected hex when keyed WITH the whsec_ prefix
//   EXPECT_BARE   expected hex when keyed WITHOUT the prefix
//
// Usage (PowerShell):
//   $env:SUPABASE_URL="https://<ref>.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_…"
//   $env:CANDIDATE_SECRET="whsec_…"
//   node scripts/verify-webhook-signature.mjs
// ─────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.CANDIDATE_SECRET;
const REF_ID = process.env.REF_ID || "9560806a-e7bc-4c5d-b7e6-9c4236bb9d69";
const EVENT = process.env.EVENT || "task.completed";

// Numbers the ERP gave for the proof event (default targets).
const EXPECT_FULL =
  process.env.EXPECT_FULL ||
  "82df4305f585bde9cd55759878d23c5023c2ec193e031ca7cf09993a63014b41";
const EXPECT_BARE =
  process.env.EXPECT_BARE ||
  "cde2620b32b77915ec4d9580fbd7d0b340ac79c93d5846869995e15bc4045903";

if (!URL || !KEY || !SECRET) {
  console.error(
    "Missing env. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CANDIDATE_SECRET."
  );
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const { data, error } = await sb
  .from("webhook_outbox")
  .select("payload")
  .eq("event", EVENT)
  .eq("ref_id", REF_ID)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}
if (!data) {
  console.error(`No webhook_outbox row for event=${EVENT} ref_id=${REF_ID}.`);
  process.exit(1);
}

const body = JSON.stringify(data.payload); // exact bytes the dispatcher signs/sends
const hex = (k) => createHmac("sha256", k).update(body).digest("hex");

const full = hex(SECRET);
const bare = hex(SECRET.replace(/^whsec_/, ""));
const isProof = REF_ID === "9560806a-e7bc-4c5d-b7e6-9c4236bb9d69";

console.log("ref_id          :", REF_ID);
console.log("event           :", EVENT);
console.log("signed body     :", body);
console.log("secret prefix   :", SECRET.slice(0, 12), `(len ${SECRET.length})`);
console.log("");
console.log("HMAC with prefix:", full, isProof ? (full === EXPECT_FULL ? "✅ MATCH" : "❌ no match") : "");
console.log("HMAC bare       :", bare, isProof ? (bare === EXPECT_BARE ? "✅ MATCH" : "❌ no match") : "");

if (isProof) {
  const ok = full === EXPECT_FULL || bare === EXPECT_BARE;
  console.log("");
  console.log(
    ok
      ? "RESULT: ✅ secret is CORRECT — store it (STEP 1), redeploy, then re-drive."
      : "RESULT: ❌ secret does NOT match — get the right whsec_… from the ERP before STEP 1."
  );
  process.exit(ok ? 0 : 2);
}
