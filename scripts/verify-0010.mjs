// Verify migration 0010 — checks new tables, generated columns, bucket.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

let ok = true;
function report(name, passed, detail = "") {
  ok = ok && passed;
  console.log(`  ${passed ? "✓" : "✗"} ${name}${detail ? "  " + detail : ""}`);
}

console.log("\n[verify 0010]\n");

// 1. samples table exists + RLS query works for service_role (bypasses RLS)
{
  const { data, error } = await sb.from("samples").select("id", { count: "exact", head: true });
  report("samples table queryable", !error, error?.message ?? "(no rows yet — that's fine)");
}

// 2. salvedge_records table exists
{
  const { error } = await sb.from("salvedge_records").select("id", { count: "exact", head: true });
  report("salvedge_records table queryable", !error, error?.message ?? "");
}

// 3. New tasks columns are queryable
{
  const { error } = await sb
    .from("tasks")
    .select("id, mtr, requires_full_kitting, started_late, concept_start_date, assigned_by, full_kitting_image_url")
    .limit(1);
  report("tasks new columns present", !error, error?.message ?? "");
}

// 4. sample-files bucket exists
{
  const { data } = await sb.storage.listBuckets();
  const bucket = data?.find((b) => b.id === "sample-files");
  report("sample-files bucket exists", !!bucket,
    bucket ? `(size_limit=${bucket.file_size_limit ?? "n/a"})` : "");
}

// 5. Test generated columns by inserting a sample row + seeing pending_qty
{
  const { data, error } = await sb
    .from("samples")
    .insert({
      party_name: "_test_party_",
      total_fabrics_received: 100,
      printed_mtr: 30,
    })
    .select("id, total_fabrics_received, printed_mtr, pending_qty")
    .single();
  if (error) {
    report("samples.pending_qty generated column", false, error.message);
  } else {
    const expectedPending = 70;
    const actual = data.pending_qty;
    report(
      "samples.pending_qty computed correctly",
      actual === expectedPending,
      `(${data.total_fabrics_received} - ${data.printed_mtr} = ${actual}, expected ${expectedPending})`
    );
    // cleanup
    await sb.from("samples").delete().eq("id", data.id);
  }
}

// 6. Test salvedge auto-complete trigger
{
  const { data, error } = await sb
    .from("salvedge_records")
    .insert({
      challan_no: "_test_chl_",
      party_name: "_test_party_",
      qty: 50,
      completed_qty: 50, // triggers auto-complete
    })
    .select("id, qty, completed_qty, pending, is_completed, completion_timestamp")
    .single();
  if (error) {
    report("salvedge auto-complete trigger", false, error.message);
  } else {
    report(
      "salvedge pending = qty - completed_qty",
      data.pending === 0,
      `(${data.qty} - ${data.completed_qty} = ${data.pending})`
    );
    report(
      "salvedge auto_complete trigger fires when completed_qty >= qty",
      data.is_completed === true && data.completion_timestamp != null,
      `(is_completed=${data.is_completed}, ts=${data.completion_timestamp})`
    );
    await sb.from("salvedge_records").delete().eq("id", data.id);
  }
}

console.log("");
console.log(ok ? "✓ All 0010 checks passed." : "✗ One or more checks FAILED.");
process.exitCode = ok ? 0 : 1;
