// Seed designer_codes. Idempotent — upserts on the unique `code` column, so
// re-running updates the dates/status of existing rows without duplicating.
//
//   node scripts/seed-designer-codes.mjs
//
// Requires migration 0007_designer_codes.sql to be applied first.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const text = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Designer code rows. Multiple entries can point at the same email (e.g.
 * Kavita Rane holds 3 codes — same person, three sample identifiers).
 *
 * Date interpretation (from the source spreadsheet):
 *   - Dates with a day component > 12 are unambiguous (MM/DD/YYYY or DD/MM/YYYY
 *     dictated by which slot exceeds 12).
 *   - Ambiguous dates default to DD/MM/YYYY (Indian convention) since the
 *     source data appears to be Indian-formatted.
 *   - leaving_date "31/12/2099" was a placeholder for "no exit scheduled" and
 *     is stored as NULL.
 */
const ROWS = [
  // From original 1/7/2025 (DD/MM/YYYY)
  { email: "krupeshlate12@gmail.com",  code: "U",   joining_date: "2025-07-01" },
  // 01/03/2024
  { email: "bhoirketan07@gmail.com",   code: "V",   joining_date: "2024-03-01" },
  // 11/05/2023
  { email: "kavitarane80@gmail.com",   code: "S",   joining_date: "2023-05-11" },
  // 1/1/2026
  { email: "nikita888sahu@gmail.com",  code: "W",   joining_date: "2026-01-01" },
  // 1/8/2025
  { email: "manavlinkd@gmail.com",     code: "R",   joining_date: "2025-08-01" },
  // 10/11/2025
  { email: "sk8660081@gmail.com",      code: "T",   joining_date: "2025-11-10" },
];

// ----------------------------------------------------------------- helpers

async function buildEmailMap() {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) throw error;
  const map = new Map();
  for (const u of data.users) {
    if (u.email) map.set(u.email.toLowerCase(), u.id);
  }
  return map;
}

// ----------------------------------------------------------------- main

console.log("[designer_codes] resolving emails → profile ids…");
const emailToId = await buildEmailMap();

const inserts = [];
const failures = [];

for (const r of ROWS) {
  const profileId = emailToId.get(r.email.toLowerCase());
  if (!profileId) {
    failures.push({ ...r, reason: "no auth user with that email" });
    console.error(`[skip] ${r.email} (${r.code}) — no auth user`);
    continue;
  }
  inserts.push({
    profile_id: profileId,
    code: r.code,
    joining_date: r.joining_date,
    leaving_date: null,
    status: "active",
  });
}

if (inserts.length === 0) {
  console.error("Nothing to insert. Aborting.");
  process.exit(1);
}

console.log(`[designer_codes] upserting ${inserts.length} rows…`);
const { data, error } = await supabase
  .from("designer_codes")
  .upsert(inserts, { onConflict: "code" })
  .select("code, joining_date, status");

if (error) {
  console.error("[error]", error);
  process.exit(1);
}

console.log("");
console.log(`✓ Upserted ${data.length} designer code(s):`);
for (const d of data) {
  console.log(`  ${d.code.padEnd(14)} joined ${d.joining_date}  ${d.status}`);
}

if (failures.length) {
  console.log("");
  console.log(`⚠ ${failures.length} row(s) skipped:`);
  for (const f of failures) {
    console.log(`  ${f.email}  (code ${f.code})  — ${f.reason}`);
  }
  process.exitCode = 1;
}
