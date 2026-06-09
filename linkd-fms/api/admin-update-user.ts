// ============================================================================
// /api/admin-update-user — Vercel serverless function (Node.js runtime)
// ============================================================================
//
// Why this exists:
//   The SPA is hosted on Vercel; admin actions that touch auth.users (email,
//   password, listing emails) require the Supabase service-role key, which
//   must NEVER ship to the browser. This serverless function holds the key
//   server-side and proxies admin operations after verifying the caller is
//   an admin or design_coordinator.
//
// Three modes, dispatched by the request body:
//   { list_emails: true }                          → { emails: {[user_id]: email} }
//   { user_id, fetch: true }                       → { email, full_name, role, ... }
//   { user_id, email?, password?, full_name?, ... }→ applies updates
//
// Required env vars (set in Vercel → Project → Settings → Environment Variables):
//   • SUPABASE_URL                  — same as VITE_SUPABASE_URL
//   • SUPABASE_ANON_KEY             — same as VITE_SUPABASE_ANON_KEY
//   • SUPABASE_SERVICE_ROLE_KEY     — service-role key from Supabase dashboard
// ============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

type Role = "super_admin" | "admin" | "design_coordinator" | "designer" | "deo";

interface RequestBody {
  user_id?: string;
  fetch?: boolean;
  list_emails?: boolean;
  delete?: boolean;
  email?: string;
  password?: string;
  full_name?: string;
  role?: Role;
  is_active?: boolean;
  created_at?: string;
}

const ALLOWED_ROLES: Role[] = ["super_admin", "admin", "design_coordinator", "designer", "deo"];

/** Wipe all FK references to a user so auth.admin.deleteUser succeeds.
 *  Strategy:
 *    - Rows owned solely by this user → delete
 *    - Nullable FK columns → set null
 *    - NOT NULL + RESTRICT FK columns (tasks.created_by, files.uploaded_by)
 *      → delete those rows too (they'd be orphaned anyway)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleanupUserReferences(
  admin: any,
  userId: string
): Promise<void> {
  // 1. Delete rows that belong solely to this user
  const deleteTables = [
    { table: "notifications", column: "user_id" },
    { table: "task_comments", column: "user_id" },
    { table: "task_logs", column: "user_id" },
    { table: "task_assignments", column: "designer_id" },
    { table: "user_preferences", column: "user_id" },
    { table: "designer_codes", column: "designer_id" },
    { table: "coordinator_tasks", column: "created_by" },
  ];
  for (const { table, column } of deleteTables) {
    await admin.from(table).delete().eq(column, userId);
  }

  // 2. NOT NULL RESTRICT FKs → must delete (can't null)
  //    Delete files first (files.uploaded_by references profiles ON DELETE RESTRICT)
  await admin.from("files").delete().eq("uploaded_by", userId);
  //    Delete tasks created by this user (tasks.created_by NOT NULL RESTRICT)
  //    First remove child references to those tasks
  const { data: userTasks } = await admin
    .from("tasks")
    .select("id")
    .eq("created_by", userId);
  if (userTasks?.length) {
    const taskIds = userTasks.map((t: { id: string }) => t.id);
    await admin.from("task_comments").delete().in("task_id", taskIds);
    await admin.from("task_logs").delete().in("task_id", taskIds);
    await admin.from("task_assignments").delete().in("task_id", taskIds);
    await admin.from("files").delete().in("task_id", taskIds);
    await admin.from("full_kitting_details").delete().in("task_id", taskIds);
    await admin.from("tasks").delete().in("id", taskIds);
  }

  // 3. Nullable FK columns → set null
  await admin.from("tasks").update({ assigned_to: null }).eq("assigned_to", userId);
  await admin.from("tasks").update({ completion_filled_by: null }).eq("completion_filled_by", userId);
  await admin.from("concepts").update({ designer_id: null }).eq("designer_id", userId);
  await admin.from("salvedge_records").update({ designer_id: null }).eq("designer_id", userId);
  await admin.from("profiles").update({ deactivated_by: null }).eq("deactivated_by", userId);

  // 4. Delete the profile itself
  await admin.from("profiles").delete().eq("id", userId);
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Same-origin in production, but the dev server runs on a different port,
  // so keep CORS permissive. The auth check below is what actually protects
  // the function — CORS is not a security boundary here.
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

  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
    res.status(500).json({
      error:
        "Server misconfigured: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY env vars are required.",
    });
    return;
  }

  // ── 1. Verify the caller is an admin / coordinator ────────────────────
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }
  const callerJwt = authHeader.slice("Bearer ".length);

  const callerClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${callerJwt}` } },
  });

  const { data: callerUser, error: callerErr } = await callerClient.auth.getUser(
    callerJwt
  );
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
  if (callerRole !== "super_admin" && callerRole !== "admin" && callerRole !== "design_coordinator") {
    res.status(403).json({
      error: "Only admins or design coordinators can edit users",
    });
    return;
  }

  // ── 2. Parse body ─────────────────────────────────────────────────────
  // Vercel auto-parses JSON when Content-Type is application/json. Fall
  // back to manual parsing if the framework hands us a string instead.
  let body: RequestBody;
  try {
    body =
      typeof req.body === "string"
        ? (JSON.parse(req.body) as RequestBody)
        : ((req.body ?? {}) as RequestBody);
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ── 3a. List-emails mode ─────────────────────────────────────────────
  if (body.list_emails) {
    const emails: Record<string, string> = {};
    let page = 1;
    const perPage = 1000;
    while (true) {
      const { data, error: listErr } = await admin.auth.admin.listUsers({
        page,
        perPage,
      });
      if (listErr) {
        res.status(500).json({ error: listErr.message });
        return;
      }
      for (const u of data.users) {
        if (u.email) emails[u.id] = u.email;
      }
      if (data.users.length < perPage) break;
      page += 1;
    }
    res.status(200).json({ emails });
    return;
  }

  // ── 3b. Delete by email (orphaned auth users not in profiles) ────────
  if (body.delete && body.email && !body.user_id) {
    const targetEmail = body.email.trim().toLowerCase();
    // Find the auth user by listing and matching email
    const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) {
      res.status(500).json({ error: listErr.message });
      return;
    }
    const authUser = listData.users.find(
      (u) => u.email?.toLowerCase() === targetEmail
    );
    if (!authUser) {
      res.status(404).json({ error: `No auth user found with email ${targetEmail}` });
      return;
    }
    const resolvedId = authUser.id;
    if (resolvedId === callerUser.user.id) {
      res.status(400).json({ error: "You cannot delete your own account" });
      return;
    }
    await cleanupUserReferences(admin, resolvedId);
    const { error: delErr } = await admin.auth.admin.deleteUser(resolvedId);
    if (delErr) {
      res.status(500).json({ error: `Failed to delete auth user: ${delErr.message}` });
      return;
    }
    res.status(200).json({ ok: true, deleted: resolvedId, email: targetEmail });
    return;
  }

  const targetId = body.user_id;
  if (!targetId) {
    res.status(400).json({ error: "user_id is required" });
    return;
  }

  // ── 3b. Fetch mode ───────────────────────────────────────────────────
  if (body.fetch) {
    const { data: authUser, error: authErr } =
      await admin.auth.admin.getUserById(targetId);
    if (authErr || !authUser?.user) {
      res.status(404).json({ error: authErr?.message ?? "User not found" });
      return;
    }
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("full_name, role, is_active, created_at, avatar_url")
      .eq("id", targetId)
      .maybeSingle();
    if (profErr) {
      res.status(500).json({ error: profErr.message });
      return;
    }
    res.status(200).json({
      id: targetId,
      email: authUser.user.email ?? "",
      full_name: profile?.full_name ?? "",
      role: profile?.role ?? "designer",
      is_active: profile?.is_active ?? true,
      created_at: profile?.created_at ?? null,
      avatar_url: profile?.avatar_url ?? null,
    });
    return;
  }

  // ── 3c. Delete mode ──────────────────────────────────────────────────
  if (body.delete) {
    // Prevent self-deletion
    if (targetId === callerUser.user.id) {
      res.status(400).json({ error: "You cannot delete your own account" });
      return;
    }

    await cleanupUserReferences(admin, targetId);

    // Delete auth user
    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    if (delErr) {
      res.status(500).json({ error: `Failed to delete auth user: ${delErr.message}` });
      return;
    }

    res.status(200).json({ ok: true, deleted: targetId });
    return;
  }

  // ── 4. Update mode ───────────────────────────────────────────────────
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const fullName = body.full_name?.trim();
  const role = body.role;
  const isActive = body.is_active;
  const createdAt = body.created_at;

  if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Valid email is required" });
    return;
  }
  if (password !== undefined && password.length > 0 && password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }
  if (fullName !== undefined && !fullName) {
    res.status(400).json({ error: "Full name cannot be empty" });
    return;
  }
  if (role !== undefined && !ALLOWED_ROLES.includes(role)) {
    res
      .status(400)
      .json({ error: `Role must be one of ${ALLOWED_ROLES.join(", ")}` });
    return;
  }
  if (createdAt !== undefined && Number.isNaN(Date.parse(createdAt))) {
    res.status(400).json({ error: "Invalid created_at date" });
    return;
  }

  // 4a. Auth.users updates
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
      res.status(500).json({ error: `Auth update failed: ${authErr.message}` });
      return;
    }
  }

  // 4b. Profile updates
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
      res
        .status(500)
        .json({ error: `Profile update failed: ${profErr.message}` });
      return;
    }
  }

  res.status(200).json({ ok: true, id: targetId });
}
