// ============================================================================
// /api/admin-clear-data — Vercel serverless function (Node.js runtime)
// ============================================================================
//
// Why this exists:
//   Danger Zone in the SPA needs to wipe transactional tables (tasks,
//   concepts, samples, salvedge_records, notifications, files, …) when
//   admins / coordinators clean up test data or do year-end resets. RLS
//   on most of those tables only allows is_admin() to DELETE, so when a
//   coordinator clicked the button the request returned 200 OK with 0
//   rows affected — silent failure, "All transactional data cleared"
//   toast even though nothing was cleared.
//
//   Fix: route deletes through this endpoint. It verifies the caller is
//   admin OR coordinator via their JWT and then runs the delete with
//   the service-role key, which bypasses RLS entirely. The two-step
//   confirmation in the UI is still the actual safety net.
//
// Request:
//   { kind: "clear-table", table: <ClearableTable> }
//   { kind: "clear-all" }                                — wipes every
//                                                          transactional
//                                                          table in
//                                                          dependency-safe
//                                                          order
//   { kind: "clear-notifs" }                             — alias for
//                                                          { clear-table,
//                                                            table: "notifications" }
//
// Response:
//   { cleared: number, perTable?: Record<string, number> }
//
// Required env vars (Vercel only):
//   • SUPABASE_URL                — same as VITE_SUPABASE_URL
//   • SUPABASE_ANON_KEY           — same as VITE_SUPABASE_ANON_KEY
//   • SUPABASE_SERVICE_ROLE_KEY   — bypasses RLS for the delete itself
// ============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

// Allowed table names — locked down here so a malicious caller can't
// pass `auth.users` or `profiles` and wipe accounts. Keep in lockstep
// with the `ClearableTable` union in DangerZoneTab.tsx.
const CLEARABLE_TABLES = [
  "tasks",
  "task_logs",
  "task_comments",
  "concepts",
  "samples",
  "salvedge_records",
  "notifications",
  "files",
  "full_kitting_details",
  "sampling_logs",
] as const;
type ClearableTable = (typeof CLEARABLE_TABLES)[number];

// Dependency-safe wipe order — children with FK dependents go first so
// cascade doesn't fight us. Mirrors CLEAR_ALL_ORDER in DangerZoneTab.tsx.
const CLEAR_ALL_ORDER: ClearableTable[] = [
  "task_logs",
  "task_comments",
  "files",
  "sampling_logs",
  "notifications",
  "full_kitting_details",
  "samples",
  "salvedge_records",
  "concepts",
  "tasks",
];

const NIL_ID = "00000000-0000-0000-0000-000000000000";

type ClearKind = "clear-table" | "clear-all" | "clear-notifs";
interface RequestBody {
  kind?: ClearKind;
  table?: string;
}

function isClearableTable(value: unknown): value is ClearableTable {
  return (
    typeof value === "string" &&
    (CLEARABLE_TABLES as readonly string[]).includes(value)
  );
}

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

  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !ANON || !SERVICE_ROLE) {
    res.status(500).json({
      error:
        "Server misconfigured: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY env vars are required.",
    });
    return;
  }

  // ── Verify caller is admin or coordinator ────────────────────────────
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
  const role = callerProfile?.role as string | undefined;
  if (role !== "admin" && role !== "design_coordinator") {
    res.status(403).json({
      error: "Only admins or design coordinators can clear data",
    });
    return;
  }

  // ── Parse body ────────────────────────────────────────────────────────
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

  // Helper: delete every row except the impossible sentinel id. Service-
  // role bypasses RLS so this matches "delete everything in this table".
  // `missing` flags a table that doesn't exist in THIS deployment's schema
  // (schema can drift between environments) — the caller treats that as a
  // skip, not a fatal error, so one stray name can't break the whole wipe.
  async function wipe(
    table: ClearableTable
  ): Promise<{ deleted: number; error: string | null; missing: boolean }> {
    // Snapshot count first so we can return what was actually wiped (the
    // delete itself doesn't echo a row count back through PostgREST).
    const { count: before } = await admin
      .from(table)
      .select("*", { count: "exact", head: true });
    const { error } = await admin.from(table).delete().neq("id", NIL_ID);
    if (error) {
      const missing =
        error.code === "42P01" || // Postgres: undefined_table
        error.code === "PGRST205" || // PostgREST: table not in schema cache
        /does not exist|could not find the table|schema cache/i.test(
          error.message
        );
      return { deleted: 0, error: error.message, missing };
    }
    return { deleted: before ?? 0, error: null, missing: false };
  }

  // ── Dispatch ──────────────────────────────────────────────────────────
  if (body.kind === "clear-notifs") {
    const { deleted, error } = await wipe("notifications");
    if (error) {
      res.status(500).json({ error: `Failed to clear notifications: ${error}` });
      return;
    }
    res.status(200).json({ cleared: deleted });
    return;
  }

  if (body.kind === "clear-table") {
    if (!isClearableTable(body.table)) {
      res.status(400).json({
        error: `'table' must be one of: ${CLEARABLE_TABLES.join(", ")}`,
      });
      return;
    }
    const { deleted, error } = await wipe(body.table);
    if (error) {
      res.status(500).json({ error: `Failed to clear ${body.table}: ${error}` });
      return;
    }
    res.status(200).json({ cleared: deleted });
    return;
  }

  if (body.kind === "clear-all") {
    const perTable: Record<string, number> = {};
    const errors: Record<string, string> = {};
    let total = 0;
    for (const table of CLEAR_ALL_ORDER) {
      const { deleted, error, missing } = await wipe(table);
      // A table that simply doesn't exist in this deployment is a no-op,
      // not a failure — record 0 and move on. A real error (FK violation,
      // permission, timeout) is collected so we can report exactly which
      // table broke without aborting the rest of the wipe.
      if (error && !missing) {
        errors[table] = error;
        continue;
      }
      perTable[table] = deleted;
      total += deleted;
    }
    // Reset the per-year task_code counter so codes restart at NN=01.
    // task_counters has a composite PK (year), not a UUID id, so wipe()
    // can't be used here.
    await admin.from("task_counters" as never).delete().neq("year", -1);
    res.status(200).json({
      cleared: total,
      perTable,
      ...(Object.keys(errors).length ? { errors } : {}),
    });
    return;
  }

  res.status(400).json({
    error: `Unknown kind. Must be 'clear-table', 'clear-all', or 'clear-notifs'.`,
  });
}
