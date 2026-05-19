// DESTRUCTIVE: Wipes all transactional data + storage objects so the system
// can start fresh. Preserves users, clients, fabrics, concept_categories,
// designer_codes. Resets the task_counters sequence.
//
// Run from the project root:  node scripts/reset-data.mjs
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

console.log("[reset] starting transactional wipe");

// -------- TRANSACTIONAL TABLES (child → parent order) --------
// task_logs and files have FK to tasks; sampling_logs has FK to tasks too.
// Delete children first so the cascade is clean.
const TRANSACTIONAL_TABLES = [
  "task_logs",
  "files",
  "sampling_logs",
  "samples",
  "salvedge_records",
  "tasks",
  "concepts",
];

const counts = {};
for (const table of TRANSACTIONAL_TABLES) {
  // count before
  const { count: before } = await sb
    .from(table)
    .select("*", { count: "exact", head: true });
  // delete all rows (using gt() on a guaranteed-present timestamp column)
  // gen_random_uuid() exists in every row; trick: use neq on a UUID that won't match
  const { error } = await sb
    .from(table)
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) {
    console.error(`[reset] failed to wipe ${table}:`, error.message);
    process.exit(1);
  }
  const { count: after } = await sb
    .from(table)
    .select("*", { count: "exact", head: true });
  counts[table] = { before: before ?? 0, after: after ?? 0 };
  console.log(`  ✓ ${table.padEnd(20)} ${before ?? 0} → ${after ?? 0}`);
}

// -------- task_counters reset --------
// `task_counters` is the per-year counter table feeding ORD-YYYY-NNNN.
// Resetting it means new tasks created next will get sequence "0001" again,
// so the new format renders as "DF 01-...".
{
  const { error } = await sb
    .from("task_counters")
    .delete()
    .neq("year", -1); // any row
  if (error) {
    console.warn("[reset] task_counters wipe failed (may not be a public-schema table):", error.message);
  } else {
    console.log("  ✓ task_counters         reset");
  }
}

// -------- STORAGE BUCKETS --------
const BUCKETS = [
  "design-files",
  "sample-files",
  "sampling-proofs",
  "proof-photos",
  "task-files",
  "avatars",
];

console.log("\n[reset] clearing storage buckets");
for (const bucket of BUCKETS) {
  let totalRemoved = 0;
  let keepListing = true;
  while (keepListing) {
    const { data: items, error } = await sb.storage
      .from(bucket)
      .list("", { limit: 1000 });
    if (error) {
      console.warn(`  ! ${bucket.padEnd(20)} list failed: ${error.message}`);
      break;
    }
    if (!items || items.length === 0) {
      keepListing = false;
      break;
    }

    // The list-at-root only returns top-level entries. For each one that's a
    // folder (no metadata.size), recurse into it.
    const filesToRemove = [];
    const folders = [];
    for (const it of items) {
      if (it.metadata && it.metadata.size !== undefined) {
        filesToRemove.push(it.name);
      } else {
        folders.push(it.name);
      }
    }

    // Remove top-level files
    if (filesToRemove.length) {
      const { error: rmErr } = await sb.storage
        .from(bucket)
        .remove(filesToRemove);
      if (rmErr) {
        console.warn(`  ! ${bucket} remove failed: ${rmErr.message}`);
      } else {
        totalRemoved += filesToRemove.length;
      }
    }

    // Recurse into folders (typical layout is {user_id}/...)
    for (const folder of folders) {
      let folderRemoved = 0;
      const stack = [folder];
      while (stack.length) {
        const path = stack.pop();
        const { data: nested, error: nestedErr } = await sb.storage
          .from(bucket)
          .list(path, { limit: 1000 });
        if (nestedErr || !nested) continue;
        const nestedFiles = [];
        for (const n of nested) {
          if (n.metadata && n.metadata.size !== undefined) {
            nestedFiles.push(`${path}/${n.name}`);
          } else {
            stack.push(`${path}/${n.name}`);
          }
        }
        if (nestedFiles.length) {
          const { error: nestedRmErr } = await sb.storage
            .from(bucket)
            .remove(nestedFiles);
          if (!nestedRmErr) folderRemoved += nestedFiles.length;
        }
      }
      totalRemoved += folderRemoved;
    }

    // If we only saw folders (no top-level files), and we've now drained them, stop.
    if (filesToRemove.length === 0) keepListing = false;
  }
  console.log(`  ✓ ${bucket.padEnd(20)} removed ${totalRemoved} object(s)`);
}

// -------- PRESERVED COUNTS (sanity check) --------
console.log("\n[reset] preserved data (NOT touched):");
const PRESERVED = [
  "profiles",
  "clients",
  "fabrics",
  "concept_categories",
  "designer_codes",
];
for (const table of PRESERVED) {
  const { count } = await sb
    .from(table)
    .select("*", { count: "exact", head: true });
  console.log(`  • ${table.padEnd(20)} ${count ?? 0} rows`);
}

console.log("\n[reset] ✓ done.");
