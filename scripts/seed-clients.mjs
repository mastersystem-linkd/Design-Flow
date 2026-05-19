// Bulk-insert clients from scripts/clients.csv into the public.clients table.
// Idempotent: skips any party_name (case-insensitive) already present in the DB.
//
// Reads .env.local for NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
// Run from the project root:  node scripts/seed-clients.mjs
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "[seed-clients] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------- read + clean CSV ----------
const csvPath = resolve(__dirname, "clients.csv");
const csv = readFileSync(csvPath, "utf8").replace(/^﻿/, "");
const lines = csv.split(/\r?\n/);
const rawNames = lines
  .slice(1) // drop header
  .map((s) => s.trim())
  .filter(Boolean);

// Unwrap CSV-quoted fields (e.g. `"TOO LOVE GENTS ,BOYS"` → `TOO LOVE GENTS ,BOYS`)
// and un-escape any embedded `""` -> `"`. Single-column CSV, so this is enough —
// no need for a full RFC-4180 parser.
function csvUnquote(s) {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/""/g, '"');
  }
  return t;
}

// Dedupe case-insensitively, keep first-seen casing. Normalize internal
// whitespace (collapse multiple spaces → single space).
const seen = new Map(); // lowerKey -> displayName
for (const raw of rawNames) {
  const cleaned = csvUnquote(raw).replace(/\s+/g, " ").trim();
  if (!cleaned) continue;
  const key = cleaned.toLowerCase();
  if (!seen.has(key)) seen.set(key, cleaned);
}
const candidates = [...seen.values()];

console.log(
  `[seed-clients] CSV: ${rawNames.length} rows → ${candidates.length} unique (case-insensitive)`
);

// ---------- skip anything already in the DB ----------
const { data: existing, error: existingErr } = await sb
  .from("clients")
  .select("party_name");
if (existingErr) {
  console.error("[seed-clients] failed to read existing clients:", existingErr.message);
  process.exit(1);
}
const existingSet = new Set(
  (existing ?? []).map((c) => c.party_name.toLowerCase())
);
const toInsert = candidates.filter((n) => !existingSet.has(n.toLowerCase()));

console.log(
  `[seed-clients] DB already has ${existingSet.size} clients; ${toInsert.length} new to insert.`
);

if (toInsert.length === 0) {
  console.log("[seed-clients] nothing to do.");
  process.exit(0);
}

// ---------- bulk insert in batches ----------
const BATCH = 200;
let inserted = 0;
let failed = 0;
for (let i = 0; i < toInsert.length; i += BATCH) {
  const batch = toInsert
    .slice(i, i + BATCH)
    .map((party_name) => ({ party_name }));
  const { error } = await sb.from("clients").insert(batch);
  if (error) {
    console.error(
      `\n[seed-clients] batch ${Math.floor(i / BATCH) + 1} failed:`,
      error.message
    );
    failed += batch.length;
    // keep going — a single bad row shouldn't abort the run
    continue;
  }
  inserted += batch.length;
  process.stdout.write(
    `  inserted ${inserted}/${toInsert.length}\r`
  );
}

console.log(
  `\n[seed-clients] ✓ done — ${inserted} inserted, ${failed} failed.`
);
process.exit(failed > 0 ? 1 : 0);
