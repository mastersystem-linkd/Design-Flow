// ============================================================================
// admin-create-user — Supabase Edge Function (Deno runtime)
// ============================================================================
//
// Why this exists:
//   The previous flow in `TeamView` called `supabase.auth.signUp()` from the
//   browser. That has two problems:
//     1) `signUp` SIGNS IN the new user — the admin who clicked "Create"
//        loses their own session and gets logged in as the user they just
//        added. Catastrophic UX.
//     2) If the project requires email confirmation, the new user can't
//        sign in until they click the verification link.
//
//   This function:
//     • Verifies the caller is an admin or design_coordinator.
//     • Uses the service-role key to call `auth.admin.createUser` with
//       `email_confirm: true` — no email round-trip, user can sign in
//       immediately.
//     • Inserts the profile row with the chosen role + name.
//     • Leaves the caller's session completely untouched.
//
// Auth:
//   The caller's JWT (sent via Authorization: Bearer header) is used ONLY
//   to verify they're allowed to create users. Once that check passes, the
//   actual creation uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS and
//   has access to the auth admin API.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Role = "super_admin" | "admin" | "design_coordinator" | "designer" | "deo";

interface CreateUserBody {
  email: string;
  password: string;
  full_name: string;
  role: Role;
}

const ALLOWED_ROLES: Role[] = ["super_admin", "admin", "design_coordinator", "designer", "deo"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Permissive CORS so the SPA can call us. Production should narrow.
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

export default async function handler(req: Request): Promise<Response> {
  // CORS preflight
  if (req.method === "OPTIONS") return json({}, 204);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ── 1. Verify the caller is an admin or coordinator ───────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing Authorization header" }, 401);
  }
  const callerJwt = authHeader.slice("Bearer ".length);

  // Create an anon client bound to the caller's JWT so we can fetch their
  // profile under RLS — same as their own browser would see.
  const callerClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${callerJwt}` } },
  });

  const { data: callerUser, error: callerErr } =
    await callerClient.auth.getUser(callerJwt);
  if (callerErr || !callerUser?.user) {
    return json({ error: "Invalid session" }, 401);
  }

  const { data: callerProfile } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", callerUser.user.id)
    .maybeSingle();

  const callerRole = callerProfile?.role;
  if (callerRole !== "super_admin" && callerRole !== "admin" && callerRole !== "design_coordinator") {
    return json(
      { error: "Only admins or design coordinators can create users" },
      403
    );
  }

  // ── 2. Parse + validate payload ───────────────────────────────────────
  let body: CreateUserBody;
  try {
    body = (await req.json()) as CreateUserBody;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const fullName = (body.full_name ?? "").trim();
  const role = body.role;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Valid email is required" }, 400);
  }
  if (password.length < 8) {
    return json({ error: "Password must be at least 8 characters" }, 400);
  }
  if (!fullName) {
    return json({ error: "Full name is required" }, 400);
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return json({ error: `Role must be one of ${ALLOWED_ROLES.join(", ")}` }, 400);
  }

  // ── 3. Create the auth user with email pre-confirmed ──────────────────
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip the verification email — corporate flow
    user_metadata: { full_name: fullName, role },
  });
  if (createErr || !created.user) {
    return json(
      { error: createErr?.message ?? "Failed to create auth user" },
      500
    );
  }
  const newUserId = created.user.id;

  // ── 4. Ensure the profile row has the right role + name ───────────────
  // The `handle_new_user` trigger may have already inserted a row with a
  // default role (e.g. "designer" — older versions only honour admin or
  // designer from metadata). Upsert to force the canonical state.
  const { error: profileErr } = await admin
    .from("profiles")
    .upsert(
      {
        id: newUserId,
        full_name: fullName,
        role,
        is_active: true,
      },
      { onConflict: "id" }
    );
  if (profileErr) {
    // Auth user created but profile failed — roll back the auth user so
    // we don't leave an orphan that can sign in but has no profile.
    await admin.auth.admin.deleteUser(newUserId);
    return json(
      { error: `Profile creation failed: ${profileErr.message}` },
      500
    );
  }

  return json({
    id: newUserId,
    email,
    full_name: fullName,
    role,
  });
}
