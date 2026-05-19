// One-off: create auth users + set their profile rows.
// Run: node scripts/seed-user.mjs
//
// Existing users are detected by email and left untouched (auth-side); their
// profile row is upserted to match the desired full_name + role.
//
// NEW users get an auto-generated 12-char password if `password` is omitted.
// Credentials are printed to stdout for newly created users only — re-runs
// won't print spurious passwords.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
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

/** Strong-enough random password — no look-alike characters. */
function generatePassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

// ----------------------------------------------------------------- users
// Roles: only 'admin' and 'designer' (post-migration 0006).
const USERS = [
  // Existing user — keep her original password.
  {
    email: "harshali.linkd@gmail.com",
    password: "Harshali123",
    full_name: "Harshali Bhopale",
    role: "admin",
  },

  // ----- Admins -----
  { email: "maheshgavhane150@gmail.com",         password: "Mahesh123",   full_name: "Mahesh Ghawane",  role: "admin" },
  { email: "aditya.linkd@gmail.com",             password: "Aditya123",   full_name: "Aditya Lohar",    role: "admin" },
  { email: "amandeolinkd@gmail.com",             password: "Aman123",     full_name: "Aman Ahmed",      role: "admin" },
  { email: "naushi.linkdprints@gmail.com",       password: "Naushi123",   full_name: "Naushi Ma'am",    role: "admin" },

  // ----- Design Coordinator -----
  { email: "designcoordinator.linkdprints@gmail.com", password: "Supriya123", full_name: "Supriya", role: "design_coordinator" },

  // ----- Designers -----
  { email: "krupeshlate12@gmail.com",            password: "krupesh123",  full_name: "Krupesh Late",    role: "designer" },
  { email: "bhoirketan07@gmail.com",             password: "Ketan123",    full_name: "Ketan Bhoir",     role: "designer" },
  { email: "kavitarane80@gmail.com",             password: "Kavita123",   full_name: "Kavita Rane",     role: "designer" },
  { email: "nikita888sahu@gmail.com",            password: "Nikita123",   full_name: "Nikita Sahu",     role: "designer" },
  { email: "manavlinkd@gmail.com",               password: "Manav123",    full_name: "Manav Khandale",  role: "designer" },
  { email: "sk8660081@gmail.com",                password: "Shadab123",   full_name: "Shadab Khan",     role: "designer" },
];

// ----------------------------------------------------------------- helpers

async function findExistingByEmail(email) {
  // The admin listUsers endpoint paginates; for ~10s of users one page is plenty.
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) throw error;
  return (
    data.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    ) ?? null
  );
}

async function upsertProfile(userId, full_name, role) {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      { id: userId, full_name, role },
      { onConflict: "id" }
    );
  if (error) throw error;
}

/**
 * Returns { wasCreated, userId, password? }.
 * password is only present when a new user was created (random or specified).
 */
async function ensureUser(u) {
  const existing = await findExistingByEmail(u.email);
  if (existing) {
    await upsertProfile(existing.id, u.full_name, u.role);
    return { wasCreated: false, userId: existing.id };
  }

  const password = u.password ?? generatePassword();
  const { data, error } = await supabase.auth.admin.createUser({
    email: u.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: u.full_name, role: u.role },
  });
  if (error) throw error;
  await upsertProfile(data.user.id, u.full_name, u.role);
  return { wasCreated: true, userId: data.user.id, password };
}

// ----------------------------------------------------------------- main

const created = [];
const skipped = [];
const failed = [];

for (const u of USERS) {
  try {
    const res = await ensureUser(u);
    if (res.wasCreated) {
      created.push({ ...u, password: res.password });
      console.log(`[created] ${u.email}  (${u.full_name} / ${u.role})`);
    } else {
      skipped.push(u);
      console.log(`[exists]  ${u.email}  (${u.full_name} / ${u.role}) — profile synced`);
    }
  } catch (e) {
    failed.push({ ...u, error: e?.message ?? String(e) });
    console.error(`[error]   ${u.email}: ${e?.message ?? e}`);
  }
}

// ----------------------------------------------------------------- summary

console.log("");
console.log(`Created: ${created.length}  Existing: ${skipped.length}  Failed: ${failed.length}`);

if (created.length) {
  console.log("");
  console.log("=== New credentials (share these with each user securely) ===");
  console.log("");
  const padE = Math.max(...created.map((c) => c.email.length));
  const padN = Math.max(...created.map((c) => c.full_name.length));
  for (const c of created) {
    console.log(
      `  ${c.email.padEnd(padE)}  |  ${c.full_name.padEnd(padN)}  |  ${c.role.padEnd(8)}  |  ${c.password}`
    );
  }
  console.log("");
  console.log("Tip: pipe this run to a file for safe copy: ");
  console.log("     node scripts/seed-user.mjs > credentials.txt");
}

if (failed.length) {
  process.exitCode = 1;
}
