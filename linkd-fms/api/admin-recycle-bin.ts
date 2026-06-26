// ============================================================================
// /api/admin-recycle-bin — Vercel serverless function (Node.js runtime)
// ============================================================================
//
// Companion to /api/admin-clear-data. Where that endpoint DELETES, this one
// RECOVERS. Every delete in the app is snapshotted into `deleted_records` by a
// BEFORE DELETE trigger (migration 0087). This route lists those snapshots,
// restores them (re-inserts the rows), or purges them for good.
//
// Super-admin only — matches the Danger Zone / Recycle Bin UI gating.
//
// Request kinds:
//   { kind: "counts" }                      → { activeRecords, activeBatches }
//   { kind: "list" }                         → { batches: BatchSummary[] }
//   { kind: "batch", batch_id }              → { records: RecordRow[] }
//   { kind: "restore", batch_id | ids }      → { restored, files_restored, skipped }
//   { kind: "purge",   batch_id | ids }      → { purged }
//
// Required env vars (Vercel only): SUPABASE_URL, SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY.
// ============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const STORAGE = "__storage__";

// Parents before children — re-insert order so FK references resolve. Any
// table not listed is restored last (after this list).
// NOTE: tasks MUST precede samples (samples.task_id → tasks) and concepts MUST
// precede tasks (tasks.concept_id → concepts).
const RESTORE_ORDER: string[] = [
  "concepts",
  "tasks",
  "samples",
  "task_logs",
  "files",
  "sampling_logs",
  "task_assignments",
  "full_kitting_details",
  "task_comments",
  "salvedge_records",
  "notifications",
  "coordinator_tasks",
];

// GENERATED ALWAYS columns — Postgres rejects an explicit value for these, so
// strip them from the snapshot before re-inserting (they recompute on insert).
const GENERATED_COLS: Record<string, string[]> = {
  samples: ["pending_qty"],
  salvedge_records: ["pending"],
};

// Nullable FK columns we can safely null if a restore hits a dangling
// reference (e.g. a task whose concept wasn't part of the restore set). These
// are all ON DELETE SET NULL columns, so nulling them mirrors what the DB
// itself does when the referenced row is deleted.
const NULLABLE_FKS: Record<string, string[]> = {
  tasks: ["concept_id"],
  samples: ["task_id"],
  coordinator_tasks: ["related_task_id"],
};

interface DeletedRecord {
  id: string;
  table_name: string;
  record_id: string;
  data: Record<string, unknown>;
  deleted_at: string;
  deleted_by: string | null;
  batch_id: number;
  expires_at: string;
  restored_at: string | null;
}

type Kind = "counts" | "list" | "batch" | "restore" | "purge";
interface RequestBody {
  kind?: Kind;
  batch_id?: number | string;
  ids?: unknown;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Human label for a snapshot row, derived from its source table. */
function recordLabel(table: string, data: Record<string, unknown>): string {
  const s = (k: string) => (data[k] == null ? "" : String(data[k]));
  switch (table) {
    case "tasks":
      return [s("task_code"), s("concept")].filter(Boolean).join(" · ") || "Task";
    case "samples":
      return [s("uid"), s("party_name")].filter(Boolean).join(" · ") || "Sample";
    case "concepts":
      return [s("concept_code"), s("title")].filter(Boolean).join(" · ") || "Concept";
    case "salvedge_records":
      return [s("challan_no"), s("party_name")].filter(Boolean).join(" · ") || "Salvedge";
    case "task_comments":
      return s("body").slice(0, 60) || "Comment";
    case "notifications":
      return s("title") || "Notification";
    case "coordinator_tasks":
      return [s("requester_name"), s("description").slice(0, 40)].filter(Boolean).join(" · ") || "Coordinator task";
    case "full_kitting_details":
      return s("party_name") || "Full Knitting";
    case "task_assignments":
      return `Portion · qty ${s("qty_assigned")}`;
    case STORAGE:
      return s("name") || s("path") || "File";
    default:
      return table;
  }
}

const TABLE_LABELS: Record<string, string> = {
  tasks: "Tasks",
  samples: "Samples",
  concepts: "Concepts",
  salvedge_records: "Salvedge",
  task_comments: "Comments",
  notifications: "Notifications",
  task_assignments: "Task portions",
  full_kitting_details: "Full Knitting",
  files: "File records",
  task_logs: "Task logs",
  sampling_logs: "Sampling logs",
  coordinator_tasks: "Coordinator tasks",
  [STORAGE]: "Files",
};

// Each archived table rolls up to a user-facing MODULE so the Recycle Bin can
// be organized into sections. A delete and its cascaded children share a batch
// that may span tables; the batch is filed under its highest-priority module.
const MODULE_OF: Record<string, string> = {
  tasks: "Tasks",
  task_logs: "Tasks",
  task_assignments: "Tasks",
  task_comments: "Tasks",
  concepts: "Concepts",
  samples: "Sampling",
  sampling_logs: "Sampling",
  full_kitting_details: "Full Knitting",
  files: "Files",
  [STORAGE]: "Files",
  salvedge_records: "Salvedge",
  coordinator_tasks: "Coordinator Tasks",
  notifications: "Notifications",
};
const MODULE_PRIORITY = [
  "Tasks",
  "Concepts",
  "Sampling",
  "Full Knitting",
  "Salvedge",
  "Coordinator Tasks",
  "Files",
  "Notifications",
  "Other",
];
// Within a batch, which table's record best represents it (for the row label).
const TABLE_PRIORITY = [
  "tasks", "concepts", "samples", "salvedge_records", "coordinator_tasks",
  "full_kitting_details", "files", STORAGE, "task_assignments",
  "sampling_logs", "task_comments", "task_logs", "notifications",
];
const moduleOf = (table: string): string => MODULE_OF[table] ?? "Other";

/** Best-effort removal of expired binned storage blobs + their rows. */
async function purgeExpiredStorage(admin: SupabaseClient): Promise<void> {
  try {
    const { data } = await admin
      .from("deleted_records")
      .select("id, data")
      .eq("table_name", STORAGE)
      .is("restored_at", null)
      .lt("expires_at", new Date().toISOString())
      .limit(500);
    const rows = (data ?? []) as { id: string; data: Record<string, unknown> }[];
    if (rows.length === 0) return;
    const byBucket = new Map<string, string[]>();
    for (const r of rows) {
      const bucket = String(r.data?.bucket ?? "");
      const path = String(r.data?.path ?? "");
      if (!bucket || !path) continue;
      const arr = byBucket.get(bucket) ?? [];
      arr.push(path);
      byBucket.set(bucket, arr);
    }
    for (const [bucket, paths] of byBucket) {
      await admin.storage.from(bucket).remove(paths);
    }
    await admin
      .from("deleted_records")
      .delete()
      .in("id", rows.map((r) => r.id));
  } catch {
    /* opportunistic — never block the main request */
  }
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

  // ── Verify caller is a super-admin ───────────────────────────────────────
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }
  const callerJwt = authHeader.slice("Bearer ".length);
  const callerClient = createClient(SUPABASE_URL, ANON, {
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
  if ((callerProfile?.role as string | undefined) !== "super_admin") {
    res.status(403).json({ error: "Only super admins can use the Recycle Bin." });
    return;
  }

  // ── Parse body ────────────────────────────────────────────────────────────
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
  const nowIso = new Date().toISOString();

  // Resolve the active deleted_records targeted by { batch_id } or { ids }.
  // `activeOnly` bounds the set to the 30-day window the UI shows (used by
  // restore — you can't restore something already expired/being purged). Purge
  // leaves it unbounded since it's deleting the rows anyway.
  async function resolveTargets(
    activeOnly: boolean
  ): Promise<DeletedRecord[] | null> {
    let q = admin
      .from("deleted_records")
      .select("*")
      .is("restored_at", null);
    if (activeOnly) q = q.gte("expires_at", nowIso);
    if (body.batch_id != null) {
      q = q.eq("batch_id", body.batch_id);
    } else if (Array.isArray(body.ids)) {
      const ids = body.ids.filter(
        (i): i is string => typeof i === "string" && UUID_RE.test(i)
      );
      if (ids.length === 0) return null;
      q = q.in("id", ids);
    } else {
      return null;
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as DeletedRecord[];
  }

  try {
    // ── counts ──────────────────────────────────────────────────────────────
    if (body.kind === "counts") {
      await purgeExpiredStorage(admin);
      const { data } = await admin
        .from("deleted_records")
        .select("batch_id")
        .is("restored_at", null)
        .gte("expires_at", nowIso);
      const rows = (data ?? []) as { batch_id: number }[];
      const batches = new Set(rows.map((r) => r.batch_id));
      res.status(200).json({
        activeRecords: rows.length,
        activeBatches: batches.size,
      });
      return;
    }

    // ── list — batch summaries, newest first ──────────────────────────────────
    if (body.kind === "list") {
      await purgeExpiredStorage(admin);
      const { data, error } = await admin
        .from("deleted_records")
        .select("id, table_name, data, deleted_at, deleted_by, batch_id, expires_at")
        .is("restored_at", null)
        .gte("expires_at", nowIso)
        .order("deleted_at", { ascending: false })
        .limit(5000);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Pick<
        DeletedRecord,
        "id" | "table_name" | "data" | "deleted_at" | "deleted_by" | "batch_id" | "expires_at"
      >[];

      // Resolve deleted_by → names.
      const byIds = Array.from(
        new Set(rows.map((r) => r.deleted_by).filter(Boolean))
      ) as string[];
      const nameById: Record<string, string> = {};
      if (byIds.length) {
        const { data: profs } = await admin
          .from("profiles")
          .select("id, full_name")
          .in("id", byIds);
        for (const p of (profs ?? []) as { id: string; full_name: string }[]) {
          nameById[p.id] = p.full_name;
        }
      }

      interface BatchAgg {
        batch_id: number;
        module: string;
        deleted_at: string;
        deleted_by_name: string | null;
        expires_at: string;
        total: number;
        file_count: number;
        breakdown: Record<string, number>;
        tables: Set<string>;
        records: { id: string; table: string; table_label: string; label: string }[];
      }
      const map = new Map<number, BatchAgg>();
      for (const r of rows) {
        let b = map.get(r.batch_id);
        if (!b) {
          b = {
            batch_id: r.batch_id,
            module: "Other",
            deleted_at: r.deleted_at,
            deleted_by_name: r.deleted_by ? nameById[r.deleted_by] ?? null : null,
            expires_at: r.expires_at,
            total: 0,
            file_count: 0,
            breakdown: {},
            tables: new Set<string>(),
            records: [],
          };
          map.set(r.batch_id, b);
        }
        b.total += 1;
        b.tables.add(r.table_name);
        if (r.table_name === STORAGE) b.file_count += 1;
        const label = TABLE_LABELS[r.table_name] ?? r.table_name;
        b.breakdown[label] = (b.breakdown[label] ?? 0) + 1;
        b.records.push({
          id: r.id,
          table: r.table_name,
          table_label: label,
          label: recordLabel(r.table_name, r.data),
        });
        if (r.deleted_at > b.deleted_at) b.deleted_at = r.deleted_at;
      }

      const batches = Array.from(map.values())
        .map((b) => {
          // Primary module = highest-priority module present in the batch.
          b.module =
            MODULE_PRIORITY.find((m) =>
              Array.from(b.tables).some((t) => moduleOf(t) === m)
            ) ?? "Other";
          // Sort records so the most representative one is first.
          b.records.sort(
            (x, y) => TABLE_PRIORITY.indexOf(x.table) - TABLE_PRIORITY.indexOf(y.table)
          );
          const { tables: _t, ...rest } = b;
          void _t;
          return rest;
        })
        .sort((a, b) => (a.deleted_at < b.deleted_at ? 1 : -1));
      res.status(200).json({ batches });
      return;
    }

    // ── batch — drill-down: the records in one batch ──────────────────────────
    if (body.kind === "batch") {
      if (body.batch_id == null) {
        res.status(400).json({ error: "batch_id is required." });
        return;
      }
      const { data, error } = await admin
        .from("deleted_records")
        .select("id, table_name, record_id, data, deleted_at")
        .eq("batch_id", body.batch_id)
        .is("restored_at", null)
        .order("table_name", { ascending: true })
        .limit(5000);
      if (error) throw new Error(error.message);
      const records = (
        (data ?? []) as Pick<
          DeletedRecord,
          "id" | "table_name" | "record_id" | "data" | "deleted_at"
        >[]
      ).map((r) => ({
        id: r.id,
        table_name: r.table_name,
        table_label: TABLE_LABELS[r.table_name] ?? r.table_name,
        record_id: r.record_id,
        label: recordLabel(r.table_name, r.data),
        deleted_at: r.deleted_at,
      }));
      res.status(200).json({ records });
      return;
    }

    // ── restore — re-insert snapshots parents-first ───────────────────────────
    if (body.kind === "restore") {
      const targets = await resolveTargets(true);
      if (targets == null) {
        res.status(400).json({ error: "Provide a batch_id or ids to restore." });
        return;
      }
      if (targets.length === 0) {
        res.status(200).json({ restored: 0, files_restored: 0, skipped: [] });
        return;
      }

      const dbRows = targets.filter((t) => t.table_name !== STORAGE);
      const fileRows = targets.filter((t) => t.table_name === STORAGE);

      // Group DB rows by table.
      const byTable = new Map<string, DeletedRecord[]>();
      for (const r of dbRows) {
        const arr = byTable.get(r.table_name) ?? [];
        arr.push(r);
        byTable.set(r.table_name, arr);
      }
      const orderedTables = [
        ...RESTORE_ORDER.filter((t) => byTable.has(t)),
        ...Array.from(byTable.keys()).filter((t) => !RESTORE_ORDER.includes(t)),
      ];

      let restored = 0;
      const skipped: { table: string; record_id: string; reason: string }[] = [];
      const restoredRecordIds: string[] = [];

      // Cross-cutting trackers:
      //  - taskSnapshotById: re-assert qty/status after assignment restore (#2).
      //  - restoredAssignmentTaskIds: which parents need that re-assert.
      //  - filesSnapshotPaths / restoredFilesPaths: only un-bin a blob whose
      //    files-row was actually restored, so we never resurrect an orphan (#6/#12).
      const taskSnapshotById = new Map<string, Record<string, unknown>>();
      for (const r of byTable.get("tasks") ?? []) {
        if (r.data?.id) taskSnapshotById.set(String(r.data.id), r.data);
      }
      const filesSnapshotPaths = new Set<string>();
      for (const r of byTable.get("files") ?? []) {
        const p = r.data?.storage_url;
        if (p) filesSnapshotPaths.add(String(p));
      }
      const restoredFilesPaths = new Set<string>();
      const restoredAssignmentTaskIds = new Set<string>();

      const strip = (table: string, data: Record<string, unknown>) => {
        const clone = { ...data };
        for (const c of GENERATED_COLS[table] ?? []) delete clone[c];
        return clone;
      };
      const recordSuccess = (table: string, r: DeletedRecord) => {
        restored += 1;
        restoredRecordIds.push(r.id);
        if (table === "files" && r.data?.storage_url)
          restoredFilesPaths.add(String(r.data.storage_url));
        if (table === "task_assignments" && r.data?.task_id)
          restoredAssignmentTaskIds.add(String(r.data.task_id));
      };
      const existsById = async (table: string, id: string): Promise<boolean> => {
        const { data } = await admin
          .from(table)
          .select("id")
          .eq("id", id)
          .maybeSingle();
        return !!data;
      };

      for (const table of orderedTables) {
        const recs = byTable.get(table)!;
        const payload = recs.map((r) => strip(table, r.data));
        // Fast path: insert the whole table's rows at once.
        const { error } = await admin.from(table).insert(payload);
        if (!error) {
          for (const r of recs) recordSuccess(table, r);
          continue;
        }
        // Slow path: per-row, so one bad row (FK gap, etc.) doesn't drop the rest.
        for (const r of recs) {
          let row = strip(table, r.data);
          let { error: e1 } = await admin.from(table).insert(row);
          if (e1 && /foreign key|violates foreign key/i.test(e1.message)) {
            // Null any nullable FK and retry once.
            row = { ...row };
            for (const fk of NULLABLE_FKS[table] ?? []) row[fk] = null;
            const retry = await admin.from(table).insert(row);
            e1 = retry.error;
          }
          if (e1) {
            if (/duplicate key|already exists/i.test(e1.message)) {
              // A unique violation isn't necessarily a re-run. Only treat it as
              // "already restored" if the snapshot's OWN primary key is present.
              // If a DIFFERENT live row now owns a secondary unique key
              // (task_code / uid / concept_code / FK-details task_id|sample_id),
              // leave the snapshot recoverable instead of silently retiring it.
              const id = r.data?.id ? String(r.data.id) : null;
              if (id && (await existsById(table, id))) {
                recordSuccess(table, r);
              } else {
                skipped.push({
                  table,
                  record_id: r.record_id,
                  reason:
                    "a different record now owns this code/key — kept in the bin",
                });
              }
            } else {
              skipped.push({ table, record_id: r.record_id, reason: e1.message });
            }
          } else {
            recordSuccess(table, r);
          }
        }
      }

      // #2 — the recalc trigger recomputed each restored split task's qty/status
      // from its (possibly partial) assignment set. Re-assert the true snapshot
      // values so the restored parent matches its pre-delete state. (Updating
      // tasks does not re-fire the assignment recalc trigger.)
      for (const tid of restoredAssignmentTaskIds) {
        const snap = taskSnapshotById.get(tid);
        if (!snap) continue;
        const update: Record<string, unknown> = {
          qty_completed: snap.qty_completed,
          qty_remaining: snap.qty_remaining,
          is_split: snap.is_split,
        };
        // Re-assert status too — but NOT for ERP-origin tasks. Writing `status`
        // re-fires the outbound ERP webhook (tasks_enqueue_webhook, AFTER UPDATE
        // OF status, 0075), which would send a spurious duplicate callback on
        // restore. recalc already computed a valid status from the restored
        // portions, so skipping the belt-and-suspenders status re-assert for
        // external tasks is safe.
        if (!snap.external_source) update.status = snap.status;
        await admin.from("tasks").update(update).eq("id", tid);
      }

      // Files: the blob was never removed — restoring just un-bins it. But only
      // un-bin a blob whose paired files-row was actually restored (or that has
      // no files-row in this set, i.e. a standalone Files-browser delete), so we
      // never resurrect a file pointing at a row that didn't come back (#6/#12).
      const fileIds: string[] = [];
      for (const r of fileRows) {
        const path = r.record_id;
        const paired = filesSnapshotPaths.has(path);
        if (!paired || restoredFilesPaths.has(path)) {
          fileIds.push(r.id);
        } else {
          skipped.push({
            table: STORAGE,
            record_id: r.record_id,
            reason: "file kept in bin — its database record could not be restored",
          });
        }
      }

      // Mark restored.
      const allRestoredIds = [...restoredRecordIds, ...fileIds];
      if (allRestoredIds.length) {
        await admin
          .from("deleted_records")
          .update({ restored_at: nowIso })
          .in("id", allRestoredIds);
      }

      res.status(200).json({
        restored,
        files_restored: fileIds.length,
        skipped,
      });
      return;
    }

    // ── purge — permanently delete (remove blobs first) ───────────────────────
    if (body.kind === "purge") {
      const targets = await resolveTargets(false);
      if (targets == null) {
        res.status(400).json({ error: "Provide a batch_id or ids to purge." });
        return;
      }
      if (targets.length === 0) {
        res.status(200).json({ purged: 0 });
        return;
      }
      // Remove storage blobs first so we don't orphan them — BUT only if no
      // OTHER active bin row (a different batch) still references the same
      // (bucket, path). Otherwise purging this batch would destroy a blob the
      // other batch still claims to hold (#5 defense-in-depth; 0088 prevents
      // such duplicates going forward, this guards pre-0088 rows).
      const targetIds = new Set(targets.map((t) => t.id));
      const byBucket = new Map<string, string[]>();
      for (const r of targets) {
        if (r.table_name !== STORAGE) continue;
        const bucket = String(r.data?.bucket ?? "");
        const path = String(r.data?.path ?? "");
        if (!bucket || !path) continue;
        const { data: others } = await admin
          .from("deleted_records")
          .select("id")
          .eq("table_name", STORAGE)
          .is("restored_at", null)
          .eq("data->>bucket", bucket)
          .eq("data->>path", path)
          .limit(50);
        const heldElsewhere = ((others ?? []) as { id: string }[]).some(
          (o) => !targetIds.has(o.id)
        );
        if (heldElsewhere) continue; // another batch still needs this blob
        const arr = byBucket.get(bucket) ?? [];
        arr.push(path);
        byBucket.set(bucket, arr);
      }
      for (const [bucket, paths] of byBucket) {
        await admin.storage.from(bucket).remove(paths);
      }
      const { error } = await admin
        .from("deleted_records")
        .delete()
        .in("id", targets.map((t) => t.id));
      if (error) throw new Error(error.message);
      res.status(200).json({ purged: targets.length });
      return;
    }

    res.status(400).json({
      error: "Unknown kind. Must be 'counts', 'list', 'batch', 'restore', or 'purge'.",
    });
  } catch (e) {
    res.status(500).json({
      error: e instanceof Error ? e.message : "Recycle Bin operation failed.",
    });
  }
}
