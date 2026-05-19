// Delete a Supabase auth user by email. The matching `profiles` row is
// removed automatically via ON DELETE CASCADE on profiles.id.
//
//   node scripts/delete-auth-user.mjs <email>
//
// This is destructive — there is no soft-delete fallback. Re-creating the
// user later will mint a new auth uid; their old task assignments / files /
// task_logs (which reference profiles by uid) will keep their original ids
// or fall to NULL where the FK allows (assigned_to is ON DELETE SET NULL).

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

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/delete-auth-user.mjs <email>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 200,
});
if (error) {
  console.error("[list] error", error);
  process.exit(1);
}

const target = data.users.find(
  (u) => u.email?.toLowerCase() === email.toLowerCase()
);
if (!target) {
  console.log(`[skip] no auth user with email ${email}`);
  process.exit(0);
}

const { error: delErr } = await supabase.auth.admin.deleteUser(target.id);
if (delErr) {
  console.error("[delete] error", delErr);
  process.exit(1);
}

console.log(`[deleted] ${email} (id=${target.id})`);
console.log("Profile row was removed by the ON DELETE CASCADE on profiles.id.");
