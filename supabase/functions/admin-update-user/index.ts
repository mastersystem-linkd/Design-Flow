// ============================================================================
// admin-update-user — Supabase Edge Function (Deno runtime)
// ============================================================================
//
// Companion to `admin-create-user`. Lets an admin / design_coordinator edit
// any team member's:
//   • full_name, role, is_active        → profiles table
//   • created_at (date of joining)      → profiles table
//   • email, password                   → auth.users (via service-role)
//
// Two modes:
//   { user_id, fetch: true }                              → returns current state
//   { user_id, email?, password?, full_name?, role?, ... } → applies updates
//
// The client browser cannot touch auth.users directly (no service-role key
// is ever shipped to the SPA), so every email/password edit MUST go through
// this function.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Role = "admin" | "design_coordinator" | "designer" | "deo";

interface UpdateUserBody {
  user_id?: string;
  fetch?: boolean;
  /** When true, returns { emails: Record<user_id, email> } for every active
   *  auth user. Used by the Team table to render the Email column. */
  list_emails?: boolean;
  email?: string;
  password?: string;
  full_name?: string;
  role?: Role;
  is_active?: boolean;
  created_at?: string; // ISO date — used as "date of joining"
}

const ALLOWED_ROLES: Role[] = ["admin", "design_coordinator", "designer", "deo"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return json({}, 204);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ── 1. Verify caller is admin / coordinator ──────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing Authorization header" }, 401);
  }
  const callerJwt = authHeader.slice("Bearer ".length);

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
  if (callerRole !== "admin" && callerRole !== "design_coordinator") {
    return json(
      { error: "Only admins or design coordinators can edit users" },
      403
    );
  }

  // ── 2. Parse payload ─────────────────────────────────────────────────
  let body: UpdateUserBody;
  try {
    body = (await req.json()) as UpdateUserBody;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ── 3a. List-emails mode — every user, used by the Team table ───────
  if (body.list_emails) {
    // auth.admin.listUsers paginates at 50 by default; bump perPage so a
    // small/medium team comes back in one round-trip. Loop if the team
    // grows beyond a single page.
    const emails: Record<string, string> = {};
    let page = 1;
    const perPage = 1000;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error: listErr } = await admin.auth.admin.listUsers({
        page,
        perPage,
      });
      if (listErr) return json({ error: listErr.message }, 500);
      for (const u of data.users) {
        if (u.email) emails[u.id] = u.email;
      }
      if (data.users.length < perPage) break;
      page += 1;
    }
    return json({ emails });
  }

  const targetId = body.user_id;
  if (!targetId) return json({ error: "user_id is required" }, 400);

  // ── 3b. Fetch mode — return current state ────────────────────────────
  if (body.fetch) {
    const { data: authUser, error: authErr } =
      await admin.auth.admin.getUserById(targetId);
    if (authErr || !authUser?.user) {
      return json({ error: authErr?.message ?? "User not found" }, 404);
    }
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("full_name, role, is_active, created_at, avatar_url")
      .eq("id", targetId)
      .maybeSingle();
    if (profErr) return json({ error: profErr.message }, 500);

    return json({
      id: targetId,
      email: authUser.user.email ?? "",
      full_name: profile?.full_name ?? "",
      role: profile?.role ?? "designer",
      is_active: profile?.is_active ?? true,
      created_at: profile?.created_at ?? null,
      avatar_url: profile?.avatar_url ?? null,
    });
  }

  // ── 4. Update mode ───────────────────────────────────────────────────
  // Validate fields that were supplied.
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const fullName = body.full_name?.trim();
  const role = body.role;
  const isActive = body.is_active;
  const createdAt = body.created_at;

  if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Valid email is required" }, 400);
  }
  if (password !== undefined && password.length > 0 && password.length < 8) {
    return json({ error: "Password must be at least 8 characters" }, 400);
  }
  if (fullName !== undefined && !fullName) {
    return json({ error: "Full name cannot be empty" }, 400);
  }
  if (role !== undefined && !ALLOWED_ROLES.includes(role)) {
    return json({ error: `Role must be one of ${ALLOWED_ROLES.join(", ")}` }, 400);
  }
  if (createdAt !== undefined && Number.isNaN(Date.parse(createdAt))) {
    return json({ error: "Invalid created_at date" }, 400);
  }

  // ── 4a. Auth.users updates ───────────────────────────────────────────
  const authUpdates: { email?: string; password?: string } = {};
  if (email !== undefined) authUpdates.email = email;
  if (password !== undefined && password.length > 0)
    authUpdates.password = password;

  if (Object.keys(authUpdates).length > 0) {
    const { error: authErr } = await admin.auth.admin.updateUserById(
      targetId,
      authUpdates
    );
    if (authErr) {
      return json({ error: `Auth update failed: ${authErr.message}` }, 500);
    }
  }

  // ── 4b. Profile updates ──────────────────────────────────────────────
  const profileUpdates: Record<string, unknown> = {};
  if (fullName !== undefined) profileUpdates.full_name = fullName;
  if (role !== undefined) profileUpdates.role = role;
  if (isActive !== undefined) {
    profileUpdates.is_active = isActive;
    if (isActive) {
      profileUpdates.deactivated_at = null;
      profileUpdates.deactivated_by = null;
    } else {
      profileUpdates.deactivated_at = new Date().toISOString();
      profileUpdates.deactivated_by = callerUser.user.id;
    }
  }
  if (createdAt !== undefined)
    profileUpdates.created_at = new Date(createdAt).toISOString();

  if (Object.keys(profileUpdates).length > 0) {
    const { error: profErr } = await admin
      .from("profiles")
      .update(profileUpdates)
      .eq("id", targetId);
    if (profErr) {
      return json({ error: `Profile update failed: ${profErr.message}` }, 500);
    }
  }

  return json({ ok: true, id: targetId });
}
