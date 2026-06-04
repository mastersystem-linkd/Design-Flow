import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellOff,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Loader2,
  ChevronRight,
  Search,
  X,
  FolderOpen,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { callAdminApi } from "@/lib/adminApi";
import { useAuth } from "@/hooks/useAuth";
import { useFiles } from "@/hooks/useFiles";
import {
  Card,
  CardContent,
  Badge,
  Button,
  Input,
  Label,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  toast,
} from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";

type ClearableTable =
  | "task_logs"
  | "files"
  | "full_kitting_details"
  | "task_comments"
  | "tasks"
  | "concepts"
  | "samples"
  | "salvedge_records"
  | "notifications"
  | "sampling_logs";

interface TableSpec {
  key: string;
  table: ClearableTable;
  label: string;
  description: string;
  dependents?: string[];
  selectCols: string;
  orderCol: string;
  displayFn: (row: Record<string, unknown>) => string;
  dateFn: (row: Record<string, unknown>) => string;
}

const TABLE_SPECS: TableSpec[] = [
  {
    key: "task_logs",
    table: "task_logs",
    label: "Task Logs",
    description: "Per-task activity audit trail.",
    selectCols: "id, task_id, status_from, status_to, note, timestamp",
    orderCol: "timestamp",
    displayFn: (r) => `${r.status_from ?? "—"} → ${r.status_to ?? "—"}${r.note ? ` · ${String(r.note).slice(0, 40)}` : ""}`,
    dateFn: (r) => String(r.timestamp ?? ""),
  },
  {
    key: "files",
    table: "files",
    label: "Task Files",
    description: "File metadata (storage objects are NOT deleted).",
    selectCols: "id, file_name, task_id, uploaded_at",
    orderCol: "uploaded_at",
    displayFn: (r) => String(r.file_name ?? "file"),
    dateFn: (r) => String(r.uploaded_at ?? ""),
  },
  {
    key: "full_kitting_details",
    table: "full_kitting_details",
    label: "Full Knitting",
    description: "Structured knitting form submissions.",
    selectCols: "id, task_id, sample_id, created_at",
    orderCol: "created_at",
    displayFn: (r) => r.task_id ? `Task ${String(r.task_id).slice(0, 8)}` : `Sample ${String(r.sample_id ?? "").slice(0, 8)}`,
    dateFn: (r) => String(r.created_at ?? ""),
  },
  {
    key: "task_comments",
    table: "task_comments",
    label: "Task Comments",
    description: "Discussion thread on each task.",
    selectCols: "id, body, task_id, created_at",
    orderCol: "created_at",
    displayFn: (r) => String(r.body ?? "").slice(0, 60) || "comment",
    dateFn: (r) => String(r.created_at ?? ""),
  },
  {
    key: "tasks",
    table: "tasks",
    label: "Tasks",
    description: "All design briefs / tasks.",
    dependents: ["task_logs", "files", "full_kitting_details", "task_comments"],
    selectCols: "id, task_code, concept, status, created_at",
    orderCol: "created_at",
    displayFn: (r) => `${r.task_code ?? ""} · ${r.concept ?? "task"}`.trim(),
    dateFn: (r) => String(r.created_at ?? ""),
  },
  {
    key: "concepts",
    table: "concepts",
    label: "Concepts",
    description: "Concept submissions and reviews.",
    selectCols: "id, concept_code, title, md_status, created_at",
    orderCol: "created_at",
    displayFn: (r) => `${r.concept_code ?? ""} · ${r.title ?? "concept"}`.trim(),
    dateFn: (r) => String(r.created_at ?? ""),
  },
  {
    key: "samples",
    table: "samples",
    label: "Samples",
    description: "Sampling records.",
    selectCols: "id, uid, party_name, created_at",
    orderCol: "created_at",
    displayFn: (r) => `${r.uid ?? ""} · ${r.party_name ?? "sample"}`.trim(),
    dateFn: (r) => String(r.created_at ?? ""),
  },
  {
    key: "salvedge_records",
    table: "salvedge_records",
    label: "Salvedge",
    description: "Challan-based fabric distribution.",
    selectCols: "id, challan_no, party_name, created_at",
    orderCol: "created_at",
    displayFn: (r) => `${r.challan_no ?? ""} · ${r.party_name ?? "record"}`.trim(),
    dateFn: (r) => String(r.created_at ?? ""),
  },
  {
    key: "notifications",
    table: "notifications",
    label: "Notifications",
    description: "In-app notification rows.",
    selectCols: "id, title, type, created_at",
    orderCol: "created_at",
    displayFn: (r) => String(r.title ?? r.type ?? "notification"),
    dateFn: (r) => String(r.created_at ?? ""),
  },
  {
    key: "sampling_logs",
    table: "sampling_logs",
    label: "Sampling Logs",
    description: "Legacy sampling event log.",
    selectCols: "id, task_id, meters_printed, logged_at",
    orderCol: "logged_at",
    displayFn: (r) => `${r.meters_printed ?? 0}m · task ${String(r.task_id ?? "").slice(0, 8)}`,
    dateFn: (r) => String(r.logged_at ?? ""),
  },
];

const CLEAR_ALL_ORDER: string[] = [
  "task_logs", "files", "full_kitting_details", "task_comments",
  "tasks", "concepts", "samples", "salvedge_records", "notifications", "sampling_logs",
];

type TableKey = (typeof TABLE_SPECS)[number]["key"];

export function DangerZoneTab() {
  const { profile } = useAuth();
  // Wiping ALL uploaded files (storage objects + their DB rows) is the most
  // destructive action in the app, so it's restricted to super-admins.
  const isSuper = profile?.role === "super_admin";
  const { files, deleteFiles, refetch: refetchFiles } = useFiles();

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countsLoading, setCountsLoading] = useState(true);
  const [busyTable, setBusyTable] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const [stage1, setStage1] = useState<
    | { kind: "clear-notifs" }
    | { kind: "clear-table"; spec: TableSpec }
    | { kind: "clear-all" }
    | { kind: "delete-selected"; spec: TableSpec; ids: string[] }
    | { kind: "delete-files" }
    | null
  >(null);
  const [stage2, setStage2] = useState<typeof stage1>(null);
  const [verifyInput, setVerifyInput] = useState("");

  const fetchCounts = useCallback(async () => {
    setCountsLoading(true);
    // Counts via the SERVICE-ROLE API so the badge reflects the TRUE row count
    // that a clear/delete will affect. The RLS-scoped client read under-reports
    // tables like notifications (you only see your own), which previously made
    // "9 shown" silently become "58 deleted".
    const { data } = await callAdminApi<{ counts: Record<string, number> }>(
      "admin-clear-data",
      { kind: "counts" }
    );
    const next: Record<string, number> = {};
    if (data?.counts) {
      for (const spec of TABLE_SPECS) next[spec.key] = data.counts[spec.table] ?? 0;
    } else {
      // Fallback for local `npm run dev` (no /api/*): RLS-scoped client counts.
      await Promise.all(
        TABLE_SPECS.map(async (spec) => {
          const { count } = await supabase
            .from(spec.table)
            .select("*", { count: "exact", head: true });
          next[spec.key] = count ?? 0;
        })
      );
    }
    setCounts(next);
    setCountsLoading(false);
  }, []);

  useEffect(() => {
    void fetchCounts();
  }, [fetchCounts]);

  async function executeClearNotifs() {
    setBusyTable("notifications-soft");
    try {
      const { data, error } = await callAdminApi<{ cleared: number }>(
        "admin-clear-data", { kind: "clear-notifs" }
      );
      if (error || !data) {
        toast.error(error?.message ?? "Failed to clear notifications");
        return;
      }
      toast.success(`${data.cleared.toLocaleString()} notifications cleared`);
      void fetchCounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear notifications");
    } finally {
      setBusyTable(null);
    }
  }

  async function executeClearTable(spec: TableSpec) {
    setBusyTable(spec.key);
    try {
      const { data, error } = await callAdminApi<{ cleared: number }>(
        "admin-clear-data", { kind: "clear-table", table: spec.table }
      );
      if (error || !data) {
        toast.error(error?.message ?? `Failed to clear ${spec.label}`);
        return;
      }
      toast.success(`${data.cleared.toLocaleString()} records cleared from ${spec.label}`);
      void fetchCounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to clear ${spec.label}`);
    } finally {
      setBusyTable(null);
    }
  }

  async function executeDeleteSelected(spec: TableSpec, ids: string[]) {
    setBusyTable(spec.key);
    try {
      // Delete ONLY the selected ids, via service-role so RLS can't silently
      // block (or, worse, the old client→whole-table fallback can't over-delete).
      // The server returns the EXACT number of rows removed.
      const { data, error } = await callAdminApi<{ cleared: number }>(
        "admin-clear-data",
        { kind: "delete-rows", table: spec.table, ids }
      );
      if (error || !data) {
        toast.error(error?.message ?? `Failed to delete from ${spec.label}`);
        return;
      }
      toast.success(
        `${data.cleared.toLocaleString()} record${data.cleared !== 1 ? "s" : ""} deleted from ${spec.label}`
      );
      void fetchCounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to delete from ${spec.label}`);
    } finally {
      setBusyTable(null);
    }
  }

  async function executeClearAll() {
    setBusyTable("__all__");
    try {
      const { data, error } = await callAdminApi<{
        cleared: number;
        errors?: Record<string, string>;
      }>("admin-clear-data", { kind: "clear-all" });
      if (error || !data) {
        toast.error(error?.message ?? "Failed to clear all data");
        await fetchCounts();
        return;
      }
      if (data.errors && Object.keys(data.errors).length) {
        const failed = Object.entries(data.errors).map(([t, m]) => `${t} (${m})`).join("; ");
        toast.error(`Cleared ${data.cleared.toLocaleString()} rows, but some tables failed — ${failed}`);
        await fetchCounts();
        return;
      }
      toast.success(`${data.cleared.toLocaleString()} records cleared across all tables`);
      void fetchCounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear all data");
    } finally {
      setBusyTable(null);
    }
  }

  async function executeDeleteFiles() {
    setBusyTable("__files__");
    try {
      const { deleted, error } = await deleteFiles(files);
      if (error) {
        toast.error(`Deleted ${deleted.toLocaleString()} file${deleted !== 1 ? "s" : ""}, but some failed — ${error}`);
      } else {
        toast.success(`${deleted.toLocaleString()} file${deleted !== 1 ? "s" : ""} deleted from all buckets`);
      }
      void refetchFiles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete files");
    } finally {
      setBusyTable(null);
    }
  }

  function onStage1Confirm() {
    setStage2(stage1);
    setStage1(null);
    setVerifyInput("");
  }

  async function onStage2Confirm() {
    if (verifyInput.trim().toUpperCase() !== "DELETE") return;
    const action = stage2;
    setStage2(null);
    setVerifyInput("");
    if (!action) return;

    if (action.kind === "clear-notifs") await executeClearNotifs();
    else if (action.kind === "clear-table") await executeClearTable(action.spec);
    else if (action.kind === "delete-selected") await executeDeleteSelected(action.spec, action.ids);
    else if (action.kind === "clear-all") await executeClearAll();
    else if (action.kind === "delete-files") await executeDeleteFiles();
  }

  const stage1Dialog = (() => {
    if (!stage1) return null;
    if (stage1.kind === "clear-notifs") {
      return {
        title: "Clear all notifications?",
        description: `Removes ${(counts["notifications"] ?? 0).toLocaleString()} notification rows for every user.`,
        confirmLabel: "Clear notifications",
        variant: "warning" as const,
        onConfirm: () => { setStage1(null); void executeClearNotifs(); },
      };
    }
    if (stage1.kind === "clear-table") {
      const n = counts[stage1.spec.key] ?? 0;
      return {
        title: `Clear all ${stage1.spec.label}?`,
        description: `Permanently deletes ${n.toLocaleString()} records. ${stage1.spec.dependents?.length ? `Cascades: ${stage1.spec.dependents.join(", ")}.` : ""} Cannot be undone.`,
        confirmLabel: "I understand, continue",
        variant: "danger" as const,
        onConfirm: onStage1Confirm,
      };
    }
    if (stage1.kind === "delete-selected") {
      return {
        title: `Delete ${stage1.ids.length} from ${stage1.spec.label}?`,
        description: `Permanently deletes the selected ${stage1.ids.length} record${stage1.ids.length !== 1 ? "s" : ""}. Cannot be undone.`,
        confirmLabel: "I understand, continue",
        variant: "danger" as const,
        onConfirm: onStage1Confirm,
      };
    }
    if (stage1.kind === "delete-files") {
      return {
        title: `Delete ALL ${files.length.toLocaleString()} files?`,
        description: `Permanently removes all ${files.length.toLocaleString()} uploaded file${files.length !== 1 ? "s" : ""} from every storage bucket (briefs, concepts, samples, salvedge, full-knitting) AND their database records. Cannot be undone.`,
        confirmLabel: "I understand, continue",
        variant: "danger" as const,
        onConfirm: onStage1Confirm,
      };
    }
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return {
      title: "Clear ALL transactional data?",
      description: `Permanently deletes ${total.toLocaleString()} records across every transactional table. Preserves: user accounts, profiles, clients, designer codes, lookup data.`,
      confirmLabel: "I understand, continue",
      variant: "danger" as const,
      onConfirm: onStage1Confirm,
    };
  })();

  const stage2Title = (() => {
    if (!stage2) return "";
    if (stage2.kind === "clear-all") return "Final confirmation";
    if (stage2.kind === "clear-table") return `Confirm clearing ${stage2.spec.label}`;
    if (stage2.kind === "delete-selected") return `Confirm deleting ${stage2.ids.length} records`;
    if (stage2.kind === "delete-files") return "Confirm deleting ALL files";
    return "Confirm";
  })();

  const verifyOk = verifyInput.trim().toUpperCase() === "DELETE";

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-destructive/30 bg-destructive/[0.06]">
        <CardContent className="flex items-start gap-3 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-destructive">Permanent data deletion</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Actions here permanently delete data. User accounts, profiles, clients, and lookup tables are never affected.
              Expand a section to search and delete specific records, or use Clear to wipe an entire table.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void fetchCounts()} className="shrink-0 gap-1.5" disabled={countsLoading}>
            <RefreshCw className={cn("h-3.5 w-3.5", countsLoading && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </CardContent>
      </Card>

      {/* Clear notifications (soft) */}
      <Card className="border-warning/30 bg-warning/[0.04]">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-start gap-3">
            <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="text-sm font-semibold text-foreground">Clear all notifications</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {(counts["notifications"] ?? 0).toLocaleString()} rows · removes the in-app feed for every user.
              </p>
            </div>
          </div>
          <Button
            size="sm" variant="outline"
            disabled={busyTable === "notifications-soft" || (counts["notifications"] ?? 0) === 0}
            onClick={() => setStage1({ kind: "clear-notifs" })}
            className="gap-1.5 border-warning/40 text-warning hover:bg-warning/10"
          >
            {busyTable === "notifications-soft" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellOff className="h-3.5 w-3.5" />}
            Clear notifications
          </Button>
        </CardContent>
      </Card>

      {/* Delete all files — SUPER-ADMIN ONLY. Wipes every storage object across
          all buckets + their `files` rows. Moved here out of the Files view,
          where it was too easy to trigger. */}
      {isSuper && (
        <Card className="border-destructive/30 bg-destructive/[0.05]">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-start gap-3">
              <FolderOpen className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-semibold text-foreground">Delete all files</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {files.length.toLocaleString()} file{files.length !== 1 ? "s" : ""} across all storage buckets · removes the objects and their records. Super-admin only.
                </p>
              </div>
            </div>
            <Button
              size="sm" variant="outline"
              disabled={busyTable === "__files__" || files.length === 0}
              onClick={() => setStage1({ kind: "delete-files" })}
              className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              {busyTable === "__files__" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete all files
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Expandable per-table sections */}
      <div className="space-y-2">
        {TABLE_SPECS.map((spec) => {
          const count = counts[spec.key] ?? 0;
          const isEmpty = !countsLoading && count === 0;
          const isExpanded = expandedKey === spec.key;
          const isBusy = busyTable === spec.key;

          return (
            <Card key={spec.key} className={cn("transition-all duration-200", isExpanded && "ring-1 ring-primary/20")}>
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setExpandedKey(isExpanded ? null : spec.key)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors hover:opacity-80"
                >
                  <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", isExpanded && "rotate-90")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{spec.label}</p>
                      {countsLoading ? (
                        <Badge variant="secondary" className="text-[10px]">…</Badge>
                      ) : (
                        <Badge variant="secondary" className="tabular-nums text-[10px]">{count.toLocaleString()}</Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{spec.description}</p>
                  </div>
                </button>
                {isEmpty ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Empty
                  </span>
                ) : (
                  <Button
                    size="sm" variant="outline"
                    disabled={isBusy || countsLoading}
                    onClick={() => setStage1({ kind: "clear-table", spec })}
                    className="shrink-0 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Clear all
                  </Button>
                )}
              </div>

              {isExpanded && !isEmpty && (
                <ExpandedSection
                  spec={spec}
                  busyTable={busyTable}
                  onDeleteSelected={(ids) => setStage1({ kind: "delete-selected", spec, ids })}
                />
              )}
            </Card>
          );
        })}
      </div>

      {/* Nuclear clear all */}
      <Card className="border-destructive/40 bg-destructive/[0.05]">
        <CardContent className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div className="flex max-w-md items-start gap-3">
            <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-bold text-destructive">Clear ALL transactional data</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Deletes tasks, concepts, samples, salvedge, notifications, files, comments, and all logs. Resets task-code counter.
              </p>
            </div>
          </div>
          <Button
            size="sm" variant="outline"
            disabled={busyTable === "__all__" || countsLoading}
            onClick={() => setStage1({ kind: "clear-all" })}
            className="gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10"
          >
            {busyTable === "__all__" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Clear all data
          </Button>
        </CardContent>
      </Card>

      {/* Stage 1 */}
      {stage1Dialog && (
        <ConfirmDialog
          open={!!stage1}
          title={stage1Dialog.title}
          description={stage1Dialog.description}
          variant={stage1Dialog.variant}
          confirmLabel={stage1Dialog.confirmLabel}
          onConfirm={stage1Dialog.onConfirm}
          onCancel={() => setStage1(null)}
        />
      )}

      {/* Stage 2 — type DELETE */}
      <Dialog open={!!stage2} onOpenChange={(o) => { if (!o) { setStage2(null); setVerifyInput(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" /> {stage2Title}
            </DialogTitle>
            <DialogDescription>
              Type <span className="font-mono font-bold text-foreground">DELETE</span> below to permanently execute this action. There is no undo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="delete-confirm" className="text-xs text-muted-foreground">Confirmation</Label>
            <Input
              id="delete-confirm"
              value={verifyInput}
              onChange={(e) => setVerifyInput(e.target.value)}
              placeholder="DELETE"
              autoFocus
              className="font-mono"
              onKeyDown={(e) => {
                if (e.key === "Enter" && verifyOk) void onStage2Confirm();
                if (e.key === "Escape") { setStage2(null); setVerifyInput(""); }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setStage2(null); setVerifyInput(""); }}>Cancel</Button>
            <Button
              variant="default"
              disabled={!verifyOk}
              onClick={() => void onStage2Confirm()}
              className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90", !verifyOk && "opacity-50")}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExpandedSection({
  spec,
  busyTable,
  onDeleteSelected,
}: {
  spec: TableSpec;
  busyTable: string | null;
  onDeleteSelected: (ids: string[]) => void;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      // List via the service-role API so EVERY row shows (the RLS client read
      // hid other users' rows — e.g. notifications — so "select all" only ever
      // grabbed your own subset while a clear wiped the whole table).
      const { data } = await callAdminApi<{ rows: Record<string, unknown>[] }>(
        "admin-clear-data",
        {
          kind: "list-rows",
          table: spec.table,
          cols: spec.selectCols,
          orderCol: spec.orderCol,
          limit: 200,
        }
      );
      if (cancelled) return;
      if (data?.rows) {
        setRows(data.rows);
      } else {
        // Fallback for local `npm run dev` (no /api/*): RLS-scoped client read.
        const { data: clientRows } = await supabase
          .from(spec.table)
          .select(spec.selectCols)
          .order(spec.orderCol, { ascending: false })
          .limit(200);
        if (!cancelled)
          setRows((clientRows as unknown as Record<string, unknown>[]) ?? []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [spec.table, spec.selectCols, spec.orderCol, busyTable]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => {
      const display = spec.displayFn(r).toLowerCase();
      const id = String(r.id ?? "").toLowerCase();
      return display.includes(q) || id.includes(q);
    });
  }, [rows, search, spec]);

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => String(r.id))));
    }
  }

  const allSelected = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div className="border-t border-border">
      {/* Search + actions bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-secondary/20">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${spec.label.toLowerCase()}…`}
            className="h-8 w-full rounded-md border border-border bg-card pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {selected.size > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDeleteSelected(Array.from(selected))}
            className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3 w-3" />
            Delete {selected.size}
          </Button>
        )}
      </div>

      {/* Records list */}
      <div className="max-h-[320px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {search ? "No records match your search" : "No records found"}
          </p>
        ) : (
          <>
            {/* Select all header */}
            <div className="flex items-center gap-3 border-b border-border/40 bg-secondary/30 px-4 py-1.5">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-primary"
              />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {selected.size > 0 ? `${selected.size} selected` : `${filtered.length} records`}
              </span>
            </div>
            {filtered.map((row) => {
              const id = String(row.id);
              const isChecked = selected.has(id);
              return (
                <label
                  key={id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 border-b border-border/30 px-4 py-2 transition-colors last:border-b-0 hover:bg-secondary/30",
                    isChecked && "bg-destructive/5"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleRow(id)}
                    className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-border accent-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">
                      {spec.displayFn(row)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {spec.dateFn(row) ? formatDate(spec.dateFn(row)) : "—"} · <span className="font-mono text-[9px]">{id.slice(0, 8)}</span>
                    </p>
                  </div>
                </label>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

const _typeCheck: TableKey[] = CLEAR_ALL_ORDER as TableKey[];
void _typeCheck;
