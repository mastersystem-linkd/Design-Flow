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
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The timestamp column each table is filtered/deleted by for date-range ops.
// SERVER-derived (never trust a client-supplied column) so a range delete can't
// be aimed at an arbitrary column. Mirrors `orderCol` in DangerZoneTab.tsx.
const TABLE_DATE_COL: Record<ClearableTable, string> = {
  tasks: "created_at",
  task_logs: "timestamp",
  task_comments: "created_at",
  concepts: "created_at",
  samples: "created_at",
  salvedge_records: "created_at",
  notifications: "created_at",
  files: "uploaded_at",
  full_kitting_details: "created_at",
  sampling_logs: "logged_at",
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}/;
/**
 * Normalize an inclusive [from, to] date range to ISO timestamp bounds.
 * A bare YYYY-MM-DD is widened to the whole UTC day. Returns null if neither
 * bound is a valid date — range ops MUST have at least one bound so they can
 * never degrade into "delete everything".
 */
function rangeBounds(
  from?: string,
  to?: string
): { gte?: string; lte?: string } | null {
  const out: { gte?: string; lte?: string } = {};
  if (from) {
    if (!DATE_ONLY_RE.test(from)) return null;
    out.gte = from.length === 10 ? `${from}T00:00:00.000Z` : from;
  }
  if (to) {
    if (!DATE_ONLY_RE.test(to)) return null;
    out.lte = to.length === 10 ? `${to}T23:59:59.999Z` : to;
  }
  if (!out.gte && !out.lte) return null;
  return out;
}

type ClearKind =
  | "clear-table"
  | "clear-all"
  | "clear-notifs"
  | "counts"
  | "list-rows"
  | "delete-rows"
  | "count-range"
  | "delete-range"
  | "count-all-range"
  | "delete-all-range";
interface RequestBody {
  kind?: ClearKind;
  table?: string;
  /** For `delete-rows` — the exact row ids to delete (and ONLY those). */
  ids?: unknown;
  /** For `list-rows` — select columns / order column / row cap. */
  cols?: string;
  orderCol?: string;
  limit?: number;
  /** For `list-rows` / `count-range` / `delete-range` — inclusive date bounds
   *  (YYYY-MM-DD or full ISO). Filters on the table's server-derived date col. */
  from?: string;
  to?: string;
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
  // Super-admin only — matches the Danger Zone UI gate (the only caller). The
  // endpoint bypasses RLS via the service-role key, so it must not be reachable
  // by admins/coordinators who can't see the Danger Zone tab.
  const role = callerProfile?.role as string | undefined;
  if (role !== "super_admin") {
    res.status(403).json({
      error: "Only super admins can clear data",
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
    // Run the whole wipe in ONE transaction (migration 0088) so the Recycle
    // Bin archive trigger stamps a single batch_id ⇒ one restore point that can
    // be restored parents-first. This RPC deliberately does NOT reset
    // task_counters: resetting it left the counter at 0 while restored tasks
    // still held ORD-YYYY-0001…, so the next new task collided on task_code and
    // failed. A monotonic counter is harmless.
    // Call directly on `admin` (not a detached variable) to keep `this`.
    const { data, error } = (await admin.rpc(
      "fn_clear_all_transactional" as never
    )) as unknown as { data: unknown; error: { message: string } | null };
    if (error) {
      res.status(500).json({ error: `Failed to clear all data: ${error.message}` });
      return;
    }
    const result = (data ?? {}) as {
      cleared?: number;
      perTable?: Record<string, number>;
    };
    res.status(200).json({
      cleared: result.cleared ?? 0,
      perTable: result.perTable ?? {},
    });
    return;
  }

  // ── counts — TRUE per-table row counts via service-role, so the Danger
  //    Zone UI shows what will ACTUALLY be deleted (RLS-scoped client counts
  //    under-report tables like notifications, hiding other users' rows). ──
  if (body.kind === "counts") {
    const counts: Record<string, number> = {};
    for (const t of CLEARABLE_TABLES) {
      const { count } = await admin.from(t).select("*", { count: "exact", head: true });
      counts[t] = count ?? 0;
    }
    res.status(200).json({ counts });
    return;
  }

  // ── list-rows — read rows via service-role so the expandable record list
  //    shows EVERY row (not just the caller's RLS-visible subset). ──
  if (body.kind === "list-rows") {
    if (!isClearableTable(body.table)) {
      res.status(400).json({
        error: `'table' must be one of: ${CLEARABLE_TABLES.join(", ")}`,
      });
      return;
    }
    const cols = typeof body.cols === "string" && body.cols.trim() ? body.cols : "id";
    const orderCol = typeof body.orderCol === "string" && body.orderCol ? body.orderCol : "id";
    const limit = typeof body.limit === "number" && body.limit > 0 ? Math.min(body.limit, 500) : 200;
    // Filters (gte/lte) MUST precede transforms (order/limit) for PostgREST.
    let lq = admin.from(body.table).select(cols);
    if (body.from || body.to) {
      const r = rangeBounds(body.from, body.to);
      if (!r) {
        res.status(400).json({ error: "Invalid date range." });
        return;
      }
      const dateCol = TABLE_DATE_COL[body.table];
      if (r.gte) lq = lq.gte(dateCol, r.gte);
      if (r.lte) lq = lq.lte(dateCol, r.lte);
    }
    const { data, error } = await lq.order(orderCol, { ascending: false }).limit(limit);
    if (error) {
      res.status(500).json({ error: `Failed to list ${body.table}: ${error.message}` });
      return;
    }
    res.status(200).json({ rows: data ?? [] });
    return;
  }

  // ── count-range — how many rows fall in [from, to] on the table's date
  //    column. Server-side count, so it scales to millions of rows. ──
  if (body.kind === "count-range") {
    if (!isClearableTable(body.table)) {
      res.status(400).json({
        error: `'table' must be one of: ${CLEARABLE_TABLES.join(", ")}`,
      });
      return;
    }
    const r = rangeBounds(body.from, body.to);
    if (!r) {
      res.status(400).json({ error: "Provide a valid from and/or to date." });
      return;
    }
    const dateCol = TABLE_DATE_COL[body.table];
    let cq = admin.from(body.table).select("*", { count: "exact", head: true });
    if (r.gte) cq = cq.gte(dateCol, r.gte);
    if (r.lte) cq = cq.lte(dateCol, r.lte);
    const { count, error } = await cq;
    if (error) {
      res.status(500).json({ error: `Failed to count ${body.table}: ${error.message}` });
      return;
    }
    res.status(200).json({ count: count ?? 0 });
    return;
  }

  // ── delete-range — delete every row in [from, to] on the table's date
  //    column. Pure server-side DELETE … WHERE col BETWEEN … — no rows are
  //    loaded into memory, so it handles thousands/millions of rows. Requires
  //    at least one bound (rangeBounds enforces this), so it can never become
  //    an unbounded "delete everything". ──
  if (body.kind === "delete-range") {
    if (!isClearableTable(body.table)) {
      res.status(400).json({
        error: `'table' must be one of: ${CLEARABLE_TABLES.join(", ")}`,
      });
      return;
    }
    const r = rangeBounds(body.from, body.to);
    if (!r) {
      res.status(400).json({ error: "Provide a valid from and/or to date to delete a range." });
      return;
    }
    const dateCol = TABLE_DATE_COL[body.table];
    let dq = admin.from(body.table).delete({ count: "exact" });
    if (r.gte) dq = dq.gte(dateCol, r.gte);
    if (r.lte) dq = dq.lte(dateCol, r.lte);
    const { error, count } = await dq;
    if (error) {
      res.status(500).json({ error: `Failed to delete range from ${body.table}: ${error.message}` });
      return;
    }
    res.status(200).json({ cleared: count ?? 0 });
    return;
  }

  // ── count-all-range — total rows in [from, to] across EVERY transactional
  //    table (each on its own date column). Server-side, scales. ──
  if (body.kind === "count-all-range") {
    const r = rangeBounds(body.from, body.to);
    if (!r) {
      res.status(400).json({ error: "Provide a valid from and/or to date." });
      return;
    }
    let total = 0;
    const perTable: Record<string, number> = {};
    for (const t of CLEAR_ALL_ORDER) {
      const dateCol = TABLE_DATE_COL[t];
      let cq = admin.from(t).select("*", { count: "exact", head: true });
      if (r.gte) cq = cq.gte(dateCol, r.gte);
      if (r.lte) cq = cq.lte(dateCol, r.lte);
      const { count } = await cq;
      perTable[t] = count ?? 0;
      total += count ?? 0;
    }
    res.status(200).json({ count: total, perTable });
    return;
  }

  // ── delete-all-range — delete rows in [from, to] across EVERY transactional
  //    table. Child-first order (CLEAR_ALL_ORDER) so FK cascades don't fight.
  //    Pure server-side DELETE … WHERE date BETWEEN …, never loads rows. Does
  //    NOT reset the task-code counter (that's only for a full wipe). ──
  if (body.kind === "delete-all-range") {
    const r = rangeBounds(body.from, body.to);
    if (!r) {
      res.status(400).json({ error: "Provide a valid from and/or to date to delete a range." });
      return;
    }
    let total = 0;
    const perTable: Record<string, number> = {};
    const errors: Record<string, string> = {};
    for (const t of CLEAR_ALL_ORDER) {
      const dateCol = TABLE_DATE_COL[t];
      let dq = admin.from(t).delete({ count: "exact" });
      if (r.gte) dq = dq.gte(dateCol, r.gte);
      if (r.lte) dq = dq.lte(dateCol, r.lte);
      const { error, count } = await dq;
      if (error) {
        const missing =
          error.code === "42P01" ||
          error.code === "PGRST205" ||
          /does not exist|could not find the table|schema cache/i.test(error.message);
        if (!missing) errors[t] = error.message;
        continue;
      }
      perTable[t] = count ?? 0;
      total += count ?? 0;
    }
    res.status(200).json({
      cleared: total,
      perTable,
      ...(Object.keys(errors).length ? { errors } : {}),
    });
    return;
  }

  // ── delete-rows — delete ONLY the specified ids (data-integrity critical:
  //    a selected-row delete must never wipe more than was selected). ──
  if (body.kind === "delete-rows") {
    if (!isClearableTable(body.table)) {
      res.status(400).json({
        error: `'table' must be one of: ${CLEARABLE_TABLES.join(", ")}`,
      });
      return;
    }
    const ids = Array.isArray(body.ids)
      ? (body.ids.filter(
          (id): id is string => typeof id === "string" && UUID_RE.test(id)
        ))
      : [];
    if (ids.length === 0) {
      res.status(400).json({ error: "No valid row ids provided to delete." });
      return;
    }
    const { error, count } = await admin
      .from(body.table)
      .delete({ count: "exact" })
      .in("id", ids);
    if (error) {
      res.status(500).json({ error: `Failed to delete from ${body.table}: ${error.message}` });
      return;
    }
    res.status(200).json({ cleared: count ?? 0 });
    return;
  }

  res.status(400).json({
    error:
      "Unknown kind. Must be 'clear-table', 'clear-all', 'clear-notifs', 'counts', 'list-rows', or 'delete-rows'.",
  });
}
