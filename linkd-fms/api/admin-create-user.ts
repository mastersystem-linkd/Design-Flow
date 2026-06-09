// ============================================================================
// /api/admin-create-user — Vercel serverless function (Node.js runtime)
// ============================================================================
//
// Creates a new auth user + profile row. Replaces the Supabase Edge Function
// of the same name so deployment is automatic via Vercel git push.
//
// Required env vars (Vercel → Project → Settings → Environment Variables):
//   • SUPABASE_URL
//   • SUPABASE_ANON_KEY
//   • SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

type Role = "super_admin" | "admin" | "design_coordinator" | "designer" | "deo";

interface CreateUserBody {
  email: string;
  password: string;
  full_name: string;
  role: Role;
}

const ALLOWED_ROLES: Role[] = ["super_admin", "admin", "design_coordinator", "designer", "deo"];

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, x-client-info, apikey, content-type"
  );
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE) {
    res.status(500).json({ error: "Server misconfigured — missing env vars" });
    return;
  }

  // ── 1. Verify the caller is admin / super_admin / coordinator ─────────
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }
  const callerJwt = authHeader.slice("Bearer ".length);

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${callerJwt}` } },
  });

  const { data: callerUser, error: callerErr } =
    await callerClient.auth.getUser(callerJwt);
  if (callerErr || !callerUser?.user) {
    res.status(401).json({ error: "Invalid session" });
    return;
  }

  const { data: callerProfile } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", callerUser.user.id)
    .maybeSingle();

  const callerRole = callerProfile?.role as Role | undefined;
  if (
    callerRole !== "super_admin" &&
    callerRole !== "admin" &&
    callerRole !== "design_coordinator"
  ) {
    res.status(403).json({
      error: "Only admins or design coordinators can create users",
    });
    return;
  }

  // ── 2. Parse + validate payload ───────────────────────────────────────
  const body = req.body as CreateUserBody;
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const fullName = (body.full_name ?? "").trim();
  const role = body.role;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Valid email is required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }
  if (!fullName) {
    res.status(400).json({ error: "Full name is required" });
    return;
  }
  if (!ALLOWED_ROLES.includes(role)) {
    res
      .status(400)
      .json({ error: `Role must be one of ${ALLOWED_ROLES.join(", ")}` });
    return;
  }

  // ── 3. Create the auth user with email pre-confirmed ──────────────────
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: created, error: createErr } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
  if (createErr || !created.user) {
    res
      .status(500)
      .json({ error: createErr?.message ?? "Failed to create auth user" });
    return;
  }
  const newUserId = created.user.id;

  // ── 4. Ensure the profile row has the right role + name ───────────────
  const { error: profileErr } = await admin
    .from("profiles")
    .upsert(
      { id: newUserId, full_name: fullName, role, is_active: true },
      { onConflict: "id" }
    );
  if (profileErr) {
    await admin.auth.admin.deleteUser(newUserId);
    res
      .status(500)
      .json({ error: `Profile creation failed: ${profileErr.message}` });
    return;
  }

  res.status(200).json({
    id: newUserId,
    email,
    full_name: fullName,
    role,
  });
}
