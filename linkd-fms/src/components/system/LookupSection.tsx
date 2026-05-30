import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X as XIcon,
  Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  Badge,
  Button,
  Input,
  Label,
  ConfirmDialog,
  EmptyState,
  SkeletonText,
  SearchInput,
  toast,
} from "@/components/ui";
import { cn } from "@/lib/utils";

// ============================================================================
// LookupSection — reusable inline-edit CRUD for `concept_categories` and
// `fabrics`. Both tables share the same shape (id, name, sort_order,
// is_active, timestamps) so one component handles both with the table name
// passed in.
//
// Features:
//   • Inline name edit (click → input, Enter saves, Esc cancels)
//   • Inline sort_order edit (blur saves)
//   • is_active toggle pill
//   • Search (debounced 300ms) by name
//   • Active/Inactive/All filter chips
//   • Add form at the top
//   • Delete with ConfirmDialog
// ============================================================================

export interface LookupRow {
  id: string;
  name: string;
  sort_order: number | null;
  is_active: boolean;
}

export interface LookupSectionProps {
  /** Card title — e.g. "Concept Categories". */
  title: string;
  /** Small tagline under the title. */
  description: string;
  /** PostgREST table name. The component reads + writes via this. */
  table:
    | "concept_categories"
    | "fabrics"
    | "assigned_by_options"
    | "received_by_options"
    | "sampling_dropdowns";
  /**
   * Optional placeholder for the "add" form's name input — useful so each
   * section shows a domain-relevant example.
   */
  addPlaceholder?: string;
  /** Rows passed in by the parent (so the parent can own loading state). */
  rows: LookupRow[];
  isLoading: boolean;
  error: string | null;
  refetch: () => unknown;
  /** Extra columns merged into every insert (e.g. { context: "task" } for the
   *  per-context Assigned By lists). */
  insertExtra?: Record<string, unknown>;
}

type StatusFilter = "all" | "active" | "inactive";

export function LookupSection({
  title,
  description,
  table,
  addPlaceholder = "Name…",
  rows,
  isLoading,
  error,
  refetch,
  insertExtra,
}: LookupSectionProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSort, setNewSort] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleteRow, setDeleteRow] = useState<LookupRow | null>(null);

  // Search + filter — same UX as Clients tab.
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  const reload = useCallback(() => void refetch(), [refetch]);

  // ── Filtered + sorted rows ──────────────────────────────────────────
  const visible = useMemo(() => {
    let list = rows;
    if (status === "active") list = list.filter((r) => r.is_active);
    else if (status === "inactive") list = list.filter((r) => !r.is_active);
    if (debouncedQuery) {
      const q = debouncedQuery.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q));
    }
    return list;
  }, [rows, status, debouncedQuery]);

  const activeCount = rows.filter((r) => r.is_active).length;
  const inactiveCount = rows.length - activeCount;

  // ── Mutations ──────────────────────────────────────────────────────
  async function handleAdd() {
    const name = newName.trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    setAdding(true);
    const sortNum = newSort.trim() === "" ? null : Number(newSort);
    const sort_order =
      sortNum != null && Number.isFinite(sortNum) ? sortNum : null;
    const { error: err } = await supabase
      .from(table)
      .insert({ name, sort_order, is_active: true, ...insertExtra });
    setAdding(false);
    if (err) {
      toast.error(err.message);
      return;
    }
    toast.success("Added");
    setNewName("");
    setNewSort("");
    setAddOpen(false);
    reload();
  }

  async function handleUpdate(
    id: string,
    patch: Partial<Pick<LookupRow, "name" | "sort_order" | "is_active">>
  ) {
    const { error: err } = await supabase.from(table).update(patch).eq("id", id);
    if (err) {
      toast.error(err.message);
      return false;
    }
    reload();
    return true;
  }

  async function handleDelete() {
    if (!deleteRow) return;
    const { error: err } = await supabase
      .from(table)
      .delete()
      .eq("id", deleteRow.id);
    if (err) {
      toast.error(err.message);
      return;
    }
    toast.success("Deleted");
    setDeleteRow(null);
    reload();
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <Badge variant="secondary" className="tabular-nums">
                {rows.length}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddOpen((v) => !v)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </header>

        {/* Inline add form */}
        {addOpen && (
          <div className="grid grid-cols-1 gap-2 border-b border-border bg-secondary/40 px-5 py-3 sm:grid-cols-[1fr_120px_auto]">
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Name
              </Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={addPlaceholder}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAdd();
                  if (e.key === "Escape") setAddOpen(false);
                }}
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Sort order
              </Label>
              <Input
                type="number"
                value={newSort}
                onChange={(e) => setNewSort(e.target.value)}
                placeholder="auto"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button size="sm" onClick={() => void handleAdd()} disabled={adding}>
                {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setAddOpen(false);
                  setNewName("");
                  setNewSort("");
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Search + status filter row.
            Always shown when there are rows — even at small counts the user
            benefits from the active/inactive split. */}
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
            <div className="flex-1 md:max-w-sm">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder={`Search ${title.toLowerCase()}…`}
              />
            </div>
            <div className="flex items-center gap-1">
              <FilterChip
                active={status === "all"}
                onClick={() => setStatus("all")}
                label="All"
                count={rows.length}
                tone="default"
              />
              <FilterChip
                active={status === "active"}
                onClick={() => setStatus("active")}
                label="Active"
                count={activeCount}
                tone="success"
              />
              <FilterChip
                active={status === "inactive"}
                onClick={() => setStatus("inactive")}
                label="Inactive"
                count={inactiveCount}
                tone="muted"
              />
            </div>
            {debouncedQuery && (
              <p className="ml-auto text-[11px] text-muted-foreground">
                {visible.length} match{visible.length !== 1 ? "es" : ""}
              </p>
            )}
          </div>
        )}

        {/* Body */}
        {isLoading ? (
          <div className="p-5">
            <SkeletonText lines={3} />
          </div>
        ) : error ? (
          <p className="px-5 py-4 text-sm text-destructive">{error}</p>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={`No ${title.toLowerCase()} yet`}
              description="Click Add to create your first entry."
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No matches"
              description={
                debouncedQuery
                  ? `Nothing matches "${debouncedQuery}" in this filter.`
                  : "No rows match the current filter."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card/30 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="w-[100px] px-4 py-2 font-medium">Sort</th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="w-[120px] px-4 py-2 font-medium">Active</th>
                  <th className="w-[80px] px-4 py-2 text-right font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <LookupRowComponent
                    key={row.id}
                    row={row}
                    onUpdate={handleUpdate}
                    onDelete={() => setDeleteRow(row)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={!!deleteRow}
        title={`Delete '${deleteRow?.name}'?`}
        description="This cannot be undone. Existing tasks/concepts referencing this entry keep the text but the lookup will no longer offer it."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteRow(null)}
      />
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Filter chip — All / Active / Inactive
// ----------------------------------------------------------------------------

function FilterChip({
  active,
  onClick,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone: "default" | "success" | "muted";
}) {
  const activeTone: Record<typeof tone, string> = {
    default: "bg-primary/10 text-primary border-primary/30",
    success: "bg-success/10 text-success border-success/30",
    muted: "bg-secondary text-foreground border-border",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
        active
          ? activeTone[tone]
          : "border-border bg-card text-muted-foreground hover:bg-secondary"
      )}
    >
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

// ----------------------------------------------------------------------------
// Single editable row
// ----------------------------------------------------------------------------

function LookupRowComponent({
  row,
  onUpdate,
  onDelete,
}: {
  row: LookupRow;
  onUpdate: (id: string, patch: Partial<LookupRow>) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(row.name);
  const [sortDraft, setSortDraft] = useState(
    row.sort_order != null ? String(row.sort_order) : ""
  );
  const [busy, setBusy] = useState(false);

  // Re-sync local drafts when the row from the parent changes (e.g. another
  // tab updated the same record and refetched).
  useEffect(() => {
    setNameDraft(row.name);
    setSortDraft(row.sort_order != null ? String(row.sort_order) : "");
  }, [row.name, row.sort_order]);

  async function saveName() {
    const next = nameDraft.trim();
    if (!next || next === row.name) {
      setEditingName(false);
      setNameDraft(row.name);
      return;
    }
    setBusy(true);
    const ok = await onUpdate(row.id, { name: next });
    setBusy(false);
    if (ok) {
      setEditingName(false);
    } else {
      setNameDraft(row.name);
    }
  }

  async function saveSort() {
    const trimmed = sortDraft.trim();
    const nextNum = trimmed === "" ? null : Number(trimmed);
    if (nextNum != null && !Number.isFinite(nextNum)) return;
    if (nextNum === row.sort_order) return;
    setBusy(true);
    await onUpdate(row.id, { sort_order: nextNum });
    setBusy(false);
  }

  async function toggleActive() {
    setBusy(true);
    await onUpdate(row.id, { is_active: !row.is_active });
    setBusy(false);
  }

  return (
    <tr
      className={cn(
        "border-b border-border/60 transition-colors hover:bg-secondary/30",
        !row.is_active && "opacity-60"
      )}
    >
      <td className="px-4 py-2.5">
        <Input
          type="number"
          value={sortDraft}
          onChange={(e) => setSortDraft(e.target.value)}
          onBlur={() => void saveSort()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="h-8 w-20 text-xs"
          disabled={busy}
        />
      </td>
      <td className="px-4 py-2.5">
        {editingName ? (
          <div className="flex items-center gap-1">
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveName();
                if (e.key === "Escape") {
                  setEditingName(false);
                  setNameDraft(row.name);
                }
              }}
              autoFocus
              className="h-8 max-w-xs"
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => void saveName()}
              className="rounded-md p-1 text-success hover:bg-success/10"
              title="Save"
              disabled={busy}
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingName(false);
                setNameDraft(row.name);
              }}
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
              title="Cancel"
              disabled={busy}
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="group flex items-center gap-2 rounded-md px-1 py-0.5 text-left text-foreground hover:bg-secondary"
            title="Click to edit"
          >
            <span>{row.name}</span>
            {!row.is_active && (
              <Badge className="border border-muted-foreground/30 bg-secondary text-[9px] text-muted-foreground">
                Inactive
              </Badge>
            )}
            <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-50" />
          </button>
        )}
      </td>
      <td className="px-4 py-2.5">
        <ToggleSwitch
          on={row.is_active}
          onToggle={() => void toggleActive()}
          disabled={busy}
        />
      </td>
      <td className="px-4 py-2.5 text-right">
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          aria-label="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ----------------------------------------------------------------------------
// ToggleSwitch — small two-state switch for is_active
// ----------------------------------------------------------------------------

function ToggleSwitch({
  on,
  onToggle,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        on ? "bg-success" : "bg-muted",
        disabled && "opacity-50"
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
          on ? "translate-x-[18px]" : "translate-x-[2px]"
        )}
      />
    </button>
  );
}
