// Bulk-load scripts/fabrics.csv into public.fabrics.
// Idempotent (skips rows whose `name` already exists, case-insensitive).
//
// Requires migration 0011_lookup_tables applied first.
// Run from project root:   node scripts/seed-fabrics.mjs
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
  console.error("[seed-fabrics] missing supabase env vars");
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function csvUnquote(s) {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/""/g, '"');
  }
  return t;
}

const csv = readFileSync(
  resolve(__dirname, "fabrics.csv"),
  "utf8"
).replace(/^﻿/, "");
const lines = csv.split(/\r?\n/);
const raw = lines.slice(1).map((s) => s.trim()).filter(Boolean);

const seen = new Map();
for (const r of raw) {
  const cleaned = csvUnquote(r).replace(/\s+/g, " ").trim();
  if (!cleaned) continue;
  const key = cleaned.toLowerCase();
  if (!seen.has(key)) seen.set(key, cleaned);
}
const candidates = [...seen.values()];

console.log(
  `[seed-fabrics] CSV: ${raw.length} rows → ${candidates.length} unique`
);

const { data: existing, error: existingErr } = await sb
  .from("fabrics")
  .select("name");
if (existingErr) {
  console.error("[seed-fabrics] read existing failed:", existingErr.message);
  process.exit(1);
}
const existingSet = new Set((existing ?? []).map((r) => r.name.toLowerCase()));
const toInsert = candidates.filter((n) => !existingSet.has(n.toLowerCase()));

console.log(
  `[seed-fabrics] DB has ${existingSet.size}; ${toInsert.length} new to insert.`
);

if (toInsert.length === 0) {
  console.log("[seed-fabrics] nothing to do.");
  process.exit(0);
}

const BATCH = 200;
let inserted = 0;
let failed = 0;
for (let i = 0; i < toInsert.length; i += BATCH) {
  const batch = toInsert.slice(i, i + BATCH).map((name) => ({ name }));
  const { error } = await sb.from("fabrics").insert(batch);
  if (error) {
    console.error(
      `\n[seed-fabrics] batch ${Math.floor(i / BATCH) + 1} failed:`,
      error.message
    );
    failed += batch.length;
    continue;
  }
  inserted += batch.length;
  process.stdout.write(`  inserted ${inserted}/${toInsert.length}\r`);
}

console.log(
  `\n[seed-fabrics] ✓ done — ${inserted} inserted, ${failed} failed.`
);
process.exit(failed > 0 ? 1 : 0);
