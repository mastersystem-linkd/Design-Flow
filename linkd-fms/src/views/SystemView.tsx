import { useCallback, useEffect, useState } from "react";
import {
  Trash2, Database, AlertTriangle, RefreshCw, Shield,
  CheckCircle2, ChevronDown, ChevronRight, Search, X,
  Plus, Pencil, Check,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import {
  Card, CardContent, Button, Badge, ConfirmDialog, toast,
} from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";

// ============================================================================
// Table definitions
// ============================================================================

interface TableInfo {
  key: string;
  label: string;
  table: string;
  description: string;
  deletable: boolean;
  dependents?: string[];
  isSeed?: boolean;
  /** Columns to show in the data browser. First is the primary display. */
  columns: string[];
  /** Columns included in text search. */
  searchCols: string[];
  /** If set, user can add new rows via inline form. Key = column name to insert. */
  addField?: string;
  /** If set, these columns are editable inline. */
  editFields?: string[];
}

const TABLES: TableInfo[] = [
  { key: "tasks", label: "Tasks", table: "tasks", description: "All design briefs / tasks", deletable: true, dependents: ["task_logs", "files", "full_kitting_details"],
    columns: ["task_code", "concept", "fabric", "status", "priority", "created_at"],
    searchCols: ["task_code", "concept", "fabric", "description"] },
  { key: "task_logs", label: "Task Logs", table: "task_logs", description: "Activity audit trail", deletable: true,
    columns: ["task_id", "status_to", "note", "created_at"],
    searchCols: ["note", "status_to"] },
  { key: "files", label: "Task Files", table: "files", description: "Uploaded attachments", deletable: true,
    columns: ["file_name", "task_id", "file_size", "created_at"],
    searchCols: ["file_name"] },
  { key: "full_kitting_details", label: "Full Kitting", table: "full_kitting_details", description: "Kitting form submissions", deletable: true,
    columns: ["task_id", "packing_type", "fabric_details", "colors", "created_at"],
    searchCols: ["fabric_details", "colors", "packing_type"] },
  { key: "concepts", label: "Concepts", table: "concepts", description: "Concept submissions", deletable: true,
    columns: ["concept_code", "title", "md_status", "created_at"],
    searchCols: ["concept_code", "title", "description"] },
  { key: "samples", label: "Samples", table: "samples", description: "Sampling records", deletable: true,
    columns: ["uid", "party_name", "quality", "printed_mtr", "is_completed", "created_at"],
    searchCols: ["uid", "party_name", "quality"] },
  { key: "notifications", label: "Notifications", table: "notifications", description: "User notifications", deletable: true,
    columns: ["title", "message", "type", "is_read", "created_at"],
    searchCols: ["title", "message"] },
  { key: "sampling_logs", label: "Sampling Logs", table: "sampling_logs", description: "Sampling events", deletable: true,
    columns: ["id", "created_at"],
    searchCols: [] },
  { key: "salvedge_records", label: "Salvedge", table: "salvedge_records", description: "Fabric distribution", deletable: true,
    columns: ["challan_no", "party_name", "qty", "is_completed", "created_at"],
    searchCols: ["challan_no", "party_name"] },
  { key: "clients", label: "Clients", table: "clients", description: "Party names (CSV)", deletable: true, isSeed: true,
    columns: ["party_name", "created_at"],
    searchCols: ["party_name"],
    addField: "party_name", editFields: ["party_name"] },
  { key: "fabrics", label: "Fabrics", table: "fabrics", description: "Fabric taxonomy", deletable: true, isSeed: true,
    columns: ["name", "is_active", "created_at"],
    searchCols: ["name"],
    addField: "name", editFields: ["name"] },
  { key: "concept_categories", label: "Categories", table: "concept_categories", description: "Concept taxonomy", deletable: true, isSeed: true,
    columns: ["name", "is_active", "created_at"],
    searchCols: ["name"],
    addField: "name", editFields: ["name"] },
];

// ============================================================================
// View
// ============================================================================

export function SystemView() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "design_coordinator";

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<TableInfo | null>(null);
  const [confirmRow, setConfirmRow] = useState<{ table: TableInfo; row: Record<string, unknown> } | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  const fetchCounts = useCallback(async () => {
    setLoading(true);
    const result: Record<string, number> = {};
    for (const t of TABLES) {
      const { count } = await supabase
        .from(t.table as "tasks")
        .select("*", { count: "exact", head: true });
      result[t.key] = count ?? 0;
    }
    setCounts(result);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchCounts(); }, [fetchCounts]);

  async function handleDeleteTable(info: TableInfo) {
    setDeleting(info.key);
    if (info.dependents) {
      for (const dep of info.dependents) {
        await supabase.from(dep as "tasks").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      }
    }
    await supabase.from(info.table as "tasks").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setDeleting(null);
    setConfirmTarget(null);
    toast.success(`${info.label} cleared`);
    if (expandedTable === info.key) setExpandedTable(null);
    await fetchCounts();
  }

  async function handleDeleteRow(info: TableInfo, row: Record<string, unknown>) {
    const id = row.id as string;
    if (!id) return;
    await supabase.from(info.table as "tasks").delete().eq("id", id);
    setConfirmRow(null);
    toast.success("Row deleted");
    await fetchCounts();
  }

  async function handleDeleteAll() {
    setDeleting("all");
    const order = ["task_logs", "files", "full_kitting_details", "sampling_logs", "notifications", "samples", "salvedge_records", "concepts", "tasks"];
    for (const table of order) {
      await supabase.from(table as "tasks").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    }
    await supabase.from("task_counters" as "tasks").delete().neq("year", -1);
    setDeleting(null);
    setConfirmAll(false);
    setExpandedTable(null);
    toast.success("All transactional data cleared");
    await fetchCounts();
  }

  const totalRows = Object.values(counts).reduce((s, n) => s + n, 0);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg py-20">
        <Card><CardContent className="flex flex-col items-center gap-3 py-8">
          <Shield className="h-10 w-10 text-destructive" />
          <p className="text-sm font-medium text-foreground">Admin Only</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
            <Database className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">System</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Data management · {totalRows.toLocaleString()} total rows · Click a table to browse
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void fetchCounts()} disabled={loading} className="gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setConfirmAll(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Clear All
          </Button>
        </div>
      </div>

      {/* Warning */}
      <div className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
        <p className="text-xs text-muted-foreground">
          Deletions are permanent. User accounts, profiles, and designer codes are never affected.
        </p>
      </div>

      {/* Table list */}
      <div className="space-y-2">
        {TABLES.map((info) => {
          const count = counts[info.key] ?? 0;
          const isExpanded = expandedTable === info.key;

          return (
            <div key={info.key}>
              <Card className={cn(isExpanded && "ring-1 ring-primary/30")}>
                <CardContent className="flex items-center gap-4 py-3">
                  {/* Expand toggle */}
                  <button
                    type="button"
                    onClick={() => setExpandedTable(isExpanded ? null : info.key)}
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>

                  {/* Info */}
                  <button
                    type="button"
                    onClick={() => count > 0 && setExpandedTable(isExpanded ? null : info.key)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{info.label}</p>
                      <Badge variant="secondary" className="text-[10px] tabular-nums">
                        {loading ? "…" : count.toLocaleString()}
                      </Badge>
                      {info.isSeed && <Badge className="bg-primary/10 text-primary border border-primary/20 text-[9px]">Re-seedable</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{info.description}</p>
                  </button>

                  {/* Actions */}
                  {count === 0 ? (
                    <span className="flex items-center gap-1 text-xs text-success shrink-0">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Empty
                    </span>
                  ) : (
                    <Button variant="outline" size="sm"
                      className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => setConfirmTarget(info)} disabled={!!deleting}>
                      <Trash2 className="h-3 w-3" /> Clear All
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Expanded data browser */}
              {isExpanded && (
                <DataBrowser
                  info={info}
                  onDeleteRow={(row) => setConfirmRow({ table: info, row })}
                  onDataChanged={() => void fetchCounts()}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Preserved note */}
      <Card>
        <CardContent className="py-4">
          <h3 className="text-sm font-semibold text-foreground mb-2">Never deleted</h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>• User accounts (auth.users) · Profiles · Designer codes</li>
            <li>• Task counter sequence (reset only on "Clear All")</li>
          </ul>
        </CardContent>
      </Card>

      {/* Confirm dialogs */}
      <ConfirmDialog open={!!confirmTarget} title={`Clear ${confirmTarget?.label}?`}
        description={confirmTarget ? `Delete all ${counts[confirmTarget.key] ?? 0} rows from ${confirmTarget.label}. ${confirmTarget.dependents ? `Related: ${confirmTarget.dependents.join(", ")} will also be cleared.` : ""}` : ""}
        variant="danger" confirmLabel="Delete all"
        onConfirm={() => { if (confirmTarget) void handleDeleteTable(confirmTarget); }}
        onCancel={() => setConfirmTarget(null)} />

      <ConfirmDialog open={!!confirmRow} title="Delete this row?"
        description="This specific record will be permanently deleted."
        variant="danger" confirmLabel="Delete"
        onConfirm={() => { if (confirmRow) void handleDeleteRow(confirmRow.table, confirmRow.row); }}
        onCancel={() => setConfirmRow(null)} />

      <ConfirmDialog open={confirmAll} title="Clear ALL data?"
        description={`Delete all transactional data (${totalRows.toLocaleString()} rows). Lookups, accounts, and profiles are preserved.`}
        variant="danger" confirmLabel="Delete everything"
        onConfirm={() => void handleDeleteAll()}
        onCancel={() => setConfirmAll(false)} />
    </div>
  );
}

// ============================================================================
// Data Browser — expandable table showing rows with search + per-row delete
// ============================================================================

function DataBrowser({
  info,
  onDeleteRow,
  onDataChanged,
}: {
  info: TableInfo;
  onDeleteRow: (row: Record<string, unknown>) => void;
  onDataChanged?: () => void;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  // Add new row state
  const [addValue, setAddValue] = useState("");
  const [adding, setAdding] = useState(false);

  // Edit row state
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from(info.table as "tasks")
      .select("*")
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (search.trim() && info.searchCols.length > 0) {
      const term = search.trim();
      const orClauses = info.searchCols
        .map((col) => `${col}.ilike.%${term}%`)
        .join(",");
      q = q.or(orClauses);
    }

    const { data, error } = await q;
    if (error) {
      setRows([]);
    } else {
      setRows((data ?? []) as Record<string, unknown>[]);
    }
    setLoading(false);
  }, [info.table, info.searchCols, search, page]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);
  useEffect(() => { setPage(0); }, [search]);

  async function handleAdd() {
    if (!info.addField || !addValue.trim()) return;
    setAdding(true);
    const { error } = await (supabase
      .from(info.table as "tasks") as unknown as { insert: (v: Record<string, unknown>) => { error: { message: string; code?: string } | null } })
      .insert({ [info.addField]: addValue.trim() });
    setAdding(false);
    if (error) {
      toast.error(error.code === "23505" ? `"${addValue.trim()}" already exists` : error.message);
    } else {
      toast.success(`Added "${addValue.trim()}"`);
      setAddValue("");
      void fetchRows();
      onDataChanged?.();
    }
  }

  async function handleSaveEdit(rowId: string) {
    if (!info.editFields?.[0] || !editValue.trim()) return;
    setSaving(true);
    const { error } = await (supabase
      .from(info.table as "tasks") as unknown as { update: (v: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> } })
      .update({ [info.editFields[0]]: editValue.trim() })
      .eq("id", rowId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Updated");
      setEditId(null);
      void fetchRows();
      onDataChanged?.();
    }
  }

  function cellValue(row: Record<string, unknown>, col: string): string {
    const val = row[col];
    if (val === null || val === undefined) return "—";
    if (typeof val === "boolean") return val ? "Yes" : "No";
    if (typeof val === "string" && col.includes("created_at"))
      return formatDate(val);
    if (typeof val === "string" && val.length > 50)
      return val.slice(0, 47) + "…";
    return String(val);
  }

  const canAdd = !!info.addField;
  const canEdit = !!info.editFields?.length;

  return (
    <div className="ml-6 mr-1 mt-1 mb-2 overflow-hidden rounded-lg border border-border bg-card/50">
      {/* Search + Add */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${info.searchCols.join(", ") || "records"}…`}
          className="h-8 border-0 bg-transparent px-0 text-sm focus-visible:ring-0"
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Inline Add Row */}
      {canAdd && (
        <div className="flex items-center gap-2 border-b border-border bg-secondary/20 px-3 py-2">
          <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
          <Input
            value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
            placeholder={`Add new ${info.addField?.replace(/_/g, " ")}…`}
            className="h-7 flex-1 text-xs"
            onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
          />
          <Button size="sm" className="h-7 px-3 text-xs" disabled={!addValue.trim() || adding} onClick={() => void handleAdd()}>
            {adding ? "Adding…" : "Add"}
          </Button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
          {search ? "No matches found" : "No records"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-[9px] uppercase tracking-wider text-muted-foreground">
                {info.columns.map((col) => (
                  <th key={col} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                    {col.replace(/_/g, " ")}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium w-[80px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const rowId = String(row.id ?? "");
                const isEditing = editId === rowId;
                const editableCol = info.editFields?.[0];

                return (
                  <tr key={rowId || i} className="border-b border-border/40 hover:bg-primary/[0.02] transition-colors">
                    {info.columns.map((col) => (
                      <td key={col} className="px-3 py-2 whitespace-nowrap text-foreground" title={String(row[col] ?? "")}>
                        {isEditing && col === editableCol ? (
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="h-6 text-xs w-[200px]"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleSaveEdit(rowId);
                              if (e.key === "Escape") setEditId(null);
                            }}
                          />
                        ) : (
                          cellValue(row, col)
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleSaveEdit(rowId)}
                              disabled={saving}
                              className="rounded p-1 text-success hover:bg-success/10 transition-colors"
                              title="Save"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditId(null)}
                              className="rounded p-1 text-muted-foreground hover:bg-secondary transition-colors"
                              title="Cancel"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditId(rowId);
                                  setEditValue(String(row[editableCol ?? ""] ?? ""));
                                }}
                                className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                                title="Edit"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onDeleteRow(row)}
                              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {rows.length > 0 && (
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="text-xs h-7">
            Previous
          </Button>
          <span className="text-[10px] text-muted-foreground">
            Page {page + 1} · Showing {rows.length} rows
          </span>
          <Button variant="outline" size="sm" disabled={rows.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)} className="text-xs h-7">
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
