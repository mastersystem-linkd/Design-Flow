// Seed sample clients + tasks so the Kanban view has something to show.
// Idempotent: clients are upserted; tasks are skipped if any already exist.
//
//   node scripts/seed-data.mjs

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
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Harshali Bhopale (admin) — see scripts/seed-user.mjs
const HARSHALI_ID = "4585a3ca-da18-4d6c-aead-36a759dfa574";

// ---------------------------------------------------------------- clients
const CLIENTS = [
  { party_name: "Reliance Retail" },
  { party_name: "Trent Westside" },
  { party_name: "Aditya Birla Fashion" },
  { party_name: "Pantaloons" },
];

console.log("[clients] upserting…");
const { data: clientRows, error: clientErr } = await supabase
  .from("clients")
  .upsert(CLIENTS, { onConflict: "party_name" })
  .select("id, party_name");

if (clientErr) {
  console.error("[clients] error", clientErr);
  process.exit(1);
}
const byName = Object.fromEntries(clientRows.map((c) => [c.party_name, c.id]));
console.log(`[clients] OK — ${clientRows.length} rows`);

// ---------------------------------------------------------------- tasks
const { count: existingTasks } = await supabase
  .from("tasks")
  .select("id", { count: "exact", head: true });

if (existingTasks && existingTasks > 0) {
  console.log(`[tasks] skip — ${existingTasks} tasks already exist`);
  process.exit(0);
}

const today = new Date();
const addDays = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const TASKS = [
  { client: "Reliance Retail", concept: "Floral block print SS24", qty: 200, fabric: "Cotton voile", priority: "high", status: "pool", deadline: addDays(14) },
  { client: "Trent Westside", concept: "Geometric stripe casual", qty: 150, fabric: "Linen", priority: "normal", status: "pool", deadline: addDays(21) },
  { client: "Aditya Birla Fashion", concept: "Tropical leaf print", qty: 400, fabric: "Rayon", priority: "urgent", status: "todo", deadline: addDays(7), assigned: true },
  { client: "Pantaloons", concept: "Paisley ethnic wear", qty: 300, qty_completed: 80, fabric: "Silk", priority: "high", status: "in_progress", deadline: addDays(10), assigned: true },
  { client: "Reliance Retail", concept: "Abstract watercolor", qty: 250, qty_completed: 125, fabric: "Cotton poplin", priority: "normal", status: "in_progress", deadline: addDays(12), assigned: true },
  { client: "Trent Westside", concept: "Vintage botanical", qty: 180, qty_completed: 180, fabric: "Cotton voile", priority: "normal", status: "full_kitting", deadline: addDays(18), assigned: true },
  { client: "Aditya Birla Fashion", concept: "Modern checkered", qty: 220, qty_completed: 220, fabric: "Linen blend", priority: "normal", status: "approved", deadline: addDays(25), assigned: true },
  { client: "Pantaloons", concept: "Indigo dye batik", qty: 175, qty_completed: 175, fabric: "Cotton", priority: "high", status: "sampling", deadline: addDays(30), assigned: true },
];

const taskRows = TASKS.map((t) => ({
  client_id: byName[t.client],
  concept: t.concept,
  qty: t.qty,
  qty_completed: t.qty_completed ?? 0,
  fabric: t.fabric,
  priority: t.priority,
  status: t.status,
  assigned_to: t.assigned ? HARSHALI_ID : null,
  planned_deadline: t.deadline,
  created_by: HARSHALI_ID,
}));

console.log(`[tasks] inserting ${taskRows.length} demo tasks…`);
const { data: inserted, error: taskErr } = await supabase
  .from("tasks")
  .insert(taskRows)
  .select("task_code, concept, status");

if (taskErr) {
  console.error("[tasks] error", taskErr);
  process.exit(1);
}

console.log(`[tasks] OK — ${inserted.length} tasks created:`);
for (const t of inserted) {
  console.log(`  ${t.task_code} — ${t.concept}  [${t.status}]`);
}
