/**
 * Update existing users: reset passwords + fix roles.
 * Run: node scripts/update-users.mjs
 *
 * Uses the admin API to update auth passwords and upserts profile roles.
 */

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

const USERS = [
  { email: "harshali.linkd@gmail.com",                  password: "Harshali123", full_name: "Harshali Bhopale",  role: "admin" },
  { email: "maheshgavhane150@gmail.com",                password: "Mahesh123",   full_name: "Mahesh Ghawane",    role: "admin" },
  { email: "aditya.linkd@gmail.com",                    password: "Aditya123",   full_name: "Aditya Lohar",      role: "admin" },
  { email: "amandeolinkd@gmail.com",                    password: "Aman123",     full_name: "Aman Ahmed",        role: "admin" },
  { email: "naushi.linkdprints@gmail.com",              password: "Naushi123",   full_name: "Naushi Ma'am",      role: "admin" },
  { email: "designcoordinator.linkdprints@gmail.com",   password: "Supriya123",  full_name: "Supriya",           role: "design_coordinator" },
  { email: "krupeshlate12@gmail.com",                   password: "krupesh123",  full_name: "Krupesh Late",      role: "designer" },
  { email: "bhoirketan07@gmail.com",                    password: "Ketan123",    full_name: "Ketan Bhoir",       role: "designer" },
  { email: "kavitarane80@gmail.com",                    password: "Kavita123",   full_name: "Kavita Rane",       role: "designer" },
  { email: "nikita888sahu@gmail.com",                   password: "Nikita123",   full_name: "Nikita Sahu",       role: "designer" },
  { email: "manavlinkd@gmail.com",                      password: "Manav123",    full_name: "Manav Khandale",    role: "designer" },
  { email: "sk8660081@gmail.com",                       password: "Shadab123",   full_name: "Shadab Khan",       role: "designer" },
];

async function main() {
  // List all existing auth users
  const { data: authData, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) { console.error("Failed to list users:", listErr); process.exit(1); }

  const authUsers = authData.users;

  for (const u of USERS) {
    const existing = authUsers.find(
      (a) => a.email?.toLowerCase() === u.email.toLowerCase()
    );

    if (!existing) {
      console.log(`[skip] ${u.email} — not found in auth (run seed-user.mjs first)`);
      continue;
    }

    // Update password
    const { error: pwErr } = await supabase.auth.admin.updateUserById(existing.id, {
      password: u.password,
    });
    if (pwErr) {
      console.error(`[error] ${u.email} password update failed:`, pwErr.message);
    } else {
      console.log(`[password] ${u.email} → updated`);
    }

    // Update role in profiles
    const { error: roleErr } = await supabase
      .from("profiles")
      .upsert(
        { id: existing.id, full_name: u.full_name, role: u.role },
        { onConflict: "id" }
      );
    if (roleErr) {
      console.error(`[error] ${u.email} role update failed:`, roleErr.message);
    } else {
      console.log(`[role] ${u.email} → ${u.role}`);
    }
  }

  console.log("\nDone! All users updated.");
}

main().catch((e) => { console.error(e); process.exit(1); });
