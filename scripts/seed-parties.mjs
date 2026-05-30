// Bulk-insert party names from a two-column CSV (Job Work, LD) into
// public.clients, tagging each with the correct client_group.
//
// Idempotent: skips any (party_name, client_group) already present
// (case-insensitive). A name may live in BOTH groups (requires migration
// 0042_clients_group_unique applied first).
//
// Reads .env.local for NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
// CSV path defaults to scripts/parties.csv; pass another path as arg 1.
//
//   node scripts/seed-parties.mjs ["path/to/file.csv"]
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- env ----------
const env = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "[seed-parties] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}
const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------- read CSV ----------
const csvPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(__dirname, "parties.csv");
const csv = readFileSync(csvPath, "utf8").replace(/^﻿/, "");

// Minimal RFC-4180 parser: handles quoted fields, "" escapes, and commas /
// newlines inside quotes. Returns an array of records (each an array of cells).
function parseCsv(text) {
  const records = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r") {
      // ignore — handled by \n
    } else if (ch === "\n") {
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  // trailing cell / row (no final newline)
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    records.push(row);
  }
  return records;
}

const records = parseCsv(csv);
const header = (records[0] ?? []).map((h) => h.trim().toLowerCase());
const jobIdx = header.findIndex((h) => h.includes("job"));
const ldIdx = header.findIndex((h) => h === "ld" || h.includes("ld"));
// Fall back to column order if the header isn't recognised.
const jobCol = jobIdx >= 0 ? jobIdx : 0;
const ldCol = ldIdx >= 0 ? ldIdx : 1;

// ---------- dedup within each group (case-insensitive, keep first-seen) ----------
function collect(colIndex) {
  const seen = new Map(); // lowerKey -> displayName
  for (let r = 1; r < records.length; r++) {
    const raw = (records[r][colIndex] ?? "").replace(/\s+/g, " ").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!seen.has(key)) seen.set(key, raw);
  }
  return [...seen.values()];
}

const jobWork = collect(jobCol);
const ld = collect(ldCol);
console.log(
  `[seed-parties] CSV: ${jobWork.length} Job Work + ${ld.length} LD unique names`
);

// ---------- skip rows already present (per group) ----------
const { data: existing, error: exErr } = await sb
  .from("clients")
  .select("party_name, client_group");
if (exErr) {
  console.error("[seed-parties] failed to read existing clients:", exErr.message);
  process.exit(1);
}
const existingSet = new Set(
  (existing ?? []).map((c) => `${c.client_group}::${c.party_name.toLowerCase()}`)
);

function toRows(names, group) {
  return names
    .filter((n) => !existingSet.has(`${group}::${n.toLowerCase()}`))
    .map((party_name) => ({ party_name, client_group: group }));
}
const rows = [...toRows(jobWork, "job_work"), ...toRows(ld, "ld")];
console.log(
  `[seed-parties] DB has ${existingSet.size} party rows; ${rows.length} new to insert.`
);
if (rows.length === 0) {
  console.log("[seed-parties] nothing to do.");
  process.exit(0);
}

// ---------- batched insert ----------
const BATCH = 200;
let inserted = 0;
let failed = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  // Upsert-ignore on the per-group unique (added in migration 0042) so a stray
  // duplicate can never abort a whole batch.
  const { error } = await sb
    .from("clients")
    .upsert(batch, {
      onConflict: "party_name,client_group",
      ignoreDuplicates: true,
    });
  if (error) {
    console.error(
      `\n[seed-parties] batch ${Math.floor(i / BATCH) + 1} failed: ${error.message}`
    );
    failed += batch.length;
    continue;
  }
  inserted += batch.length;
  process.stdout.write(`  inserted ${inserted}/${rows.length}\r`);
}
console.log(`\n[seed-parties] ✓ done — ${inserted} inserted, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
