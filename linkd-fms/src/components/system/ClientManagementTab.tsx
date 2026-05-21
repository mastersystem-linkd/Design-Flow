import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, X as XIcon, GitMerge, Pencil, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useClients } from "@/hooks/useClients";
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
  Pagination,
  toast,
} from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import type { Client } from "@/types/database";

const PAGE_SIZE = 25;

/**
 * ClientManagementTab
 * --------------------------------------------------------------------------
 * Two concerns combined into one tab:
 *   1. CRUD on `clients` — add, inline-rename, delete.
 *   2. Dedup — clients are added freely from the brief form, so casing /
 *      whitespace variants pile up. We surface "looks like a duplicate"
 *      groups so an admin can merge them with one click.
 *
 * Merge implementation does three writes server-side (UPDATE tasks +
 * UPDATE concepts to point at the keeper, then DELETE the losers). No
 * transactional wrapper available from the JS client, but the operations
 * are idempotent enough that a retry after a partial failure converges.
 */
export function ClientManagementTab() {
  const { clients, isLoading, error, refetch } = useClients();

  // Search + pagination state
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(0);
  // Filter chip — "all" = full list, "duplicates" = only rows that share a
  // normalised name with at least one other row.
  const [filter, setFilter] = useState<"all" | "duplicates">("all");

  // Add form
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  // Delete + merge confirm state
  const [deleteRow, setDeleteRow] = useState<Client | null>(null);
  const [mergeGroup, setMergeGroup] = useState<DuplicateGroup | null>(null);
  const [merging, setMerging] = useState(false);

  // Debounce text input — heavy ILIKE on 1.6k rows benefits, even in-memory.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  // Reset to page 0 whenever any filter changes.
  useEffect(() => {
    setPage(0);
  }, [debouncedQuery, filter]);

  // Pre-compute the set of duplicate ids so the "duplicates only" filter
  // is O(1) per row. Same normalisation rule as duplicateGroups below.
  const duplicateIdSet = useMemo(() => {
    const byNorm = new Map<string, string[]>();
    for (const c of clients) {
      const key = c.party_name.toLowerCase().replace(/\s+/g, " ").trim();
      const arr = byNorm.get(key) ?? [];
      arr.push(c.id);
      byNorm.set(key, arr);
    }
    const ids = new Set<string>();
    for (const arr of byNorm.values()) {
      if (arr.length > 1) for (const id of arr) ids.add(id);
    }
    return ids;
  }, [clients]);

  // Filtered list (in-memory — useClients() pulls all rows once and React
  // Query caches them, so this is essentially free).
  const filtered = useMemo(() => {
    let list = clients;
    if (filter === "duplicates") {
      list = list.filter((c) => duplicateIdSet.has(c.id));
    }
    if (debouncedQuery) {
      const q = debouncedQuery.toLowerCase();
      list = list.filter((c) => c.party_name.toLowerCase().includes(q));
    }
    return list;
  }, [clients, debouncedQuery, filter, duplicateIdSet]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const from = page * PAGE_SIZE;
  const to = Math.min(from + PAGE_SIZE, filtered.length);
  const visible = filtered.slice(from, to);

  // Duplicate detection — group by normalised name (lowercase + collapsed
  // whitespace). Anything with 2+ entries is a candidate.
  const duplicateGroups = useMemo(() => {
    const map = new Map<string, Client[]>();
    for (const c of clients) {
      const key = c.party_name.toLowerCase().replace(/\s+/g, " ").trim();
      const bucket = map.get(key) ?? [];
      bucket.push(c);
      map.set(key, bucket);
    }
    return Array.from(map.values())
      .filter((g) => g.length > 1)
      .map<DuplicateGroup>((g) => {
        const sorted = [...g].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        return {
          normalised: sorted[0].party_name.toLowerCase().trim(),
          keep: sorted[0],
          duplicates: sorted.slice(1),
        };
      })
      .sort((a, b) => b.duplicates.length - a.duplicates.length);
  }, [clients]);

  const reload = () => void refetch();

  // ── Mutations ───────────────────────────────────────────────────────
  async function handleAdd() {
    const name = newName.trim();
    if (!name) {
      toast.error("Party name is required");
      return;
    }
    // Quick duplicate check before insert — saves a 23505 round-trip.
    const exists = clients.find(
      (c) => c.party_name.toLowerCase().trim() === name.toLowerCase()
    );
    if (exists) {
      toast.error(`Client "${exists.party_name}" already exists`);
      return;
    }
    setAdding(true);
    const { error: err } = await supabase
      .from("clients")
      .insert({ party_name: name });
    setAdding(false);
    if (err) {
      toast.error(err.message);
      return;
    }
    toast.success("Client added");
    setNewName("");
    setAddOpen(false);
    reload();
  }

  async function saveEdit(id: string) {
    const next = editDraft.trim();
    const current = clients.find((c) => c.id === id);
    if (!next || !current || next === current.party_name) {
      setEditingId(null);
      return;
    }
    const { error: err } = await supabase
      .from("clients")
      .update({ party_name: next })
      .eq("id", id);
    if (err) {
      toast.error(err.message);
      return;
    }
    toast.success("Renamed");
    setEditingId(null);
    reload();
  }

  async function handleDelete() {
    if (!deleteRow) return;
    const { error: err } = await supabase
      .from("clients")
      .delete()
      .eq("id", deleteRow.id);
    if (err) {
      toast.error(err.message);
      return;
    }
    toast.success("Client deleted");
    setDeleteRow(null);
    reload();
  }

  /**
   * Merge a duplicate group into its keeper.
   *   1. Repoint tasks + concepts to the keeper
   *   2. Delete the duplicate rows
   * If step 1 partially fails the keeper stays; subsequent runs converge.
   */
  async function handleMerge() {
    if (!mergeGroup) return;
    setMerging(true);
    const duplicateIds = mergeGroup.duplicates.map((d) => d.id);
    const keepId = mergeGroup.keep.id;

    const { error: e1 } = await supabase
      .from("tasks")
      .update({ client_id: keepId })
      .in("client_id", duplicateIds);
    if (e1) {
      toast.error(`Couldn't repoint tasks: ${e1.message}`);
      setMerging(false);
      return;
    }
    const { error: e2 } = await supabase
      .from("concepts")
      .update({ client_id: keepId })
      .in("client_id", duplicateIds);
    if (e2) {
      toast.error(`Couldn't repoint concepts: ${e2.message}`);
      setMerging(false);
      return;
    }
    const { error: e3 } = await supabase
      .from("clients")
      .delete()
      .in("id", duplicateIds);
    if (e3) {
      toast.error(`Couldn't delete duplicates: ${e3.message}`);
      setMerging(false);
      return;
    }

    toast.success(
      `Merged ${mergeGroup.duplicates.length} duplicate${
        mergeGroup.duplicates.length > 1 ? "s" : ""
      } into "${mergeGroup.keep.party_name}"`
    );
    setMergeGroup(null);
    setMerging(false);
    reload();
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-0">
          {/* Header */}
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">Clients</h3>
                <Badge variant="secondary" className="tabular-nums">
                  {clients.length.toLocaleString()}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Customers / parties referenced by briefs and samples.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddOpen((v) => !v)}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Client
            </Button>
          </header>

          {addOpen && (
            <div className="grid grid-cols-1 gap-2 border-b border-border bg-secondary/40 px-5 py-3 sm:grid-cols-[1fr_auto]">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Party name
                </Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. ABC Textiles"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleAdd();
                    if (e.key === "Escape") setAddOpen(false);
                  }}
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
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Search + filter row */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
            <div className="flex-1 md:max-w-sm">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search clients by name…"
              />
            </div>
            <div className="flex items-center gap-1">
              <ClientFilterChip
                active={filter === "all"}
                onClick={() => setFilter("all")}
                label="All"
                count={clients.length}
              />
              <ClientFilterChip
                active={filter === "duplicates"}
                onClick={() => setFilter("duplicates")}
                label="Duplicates"
                count={duplicateIdSet.size}
                tone="warning"
              />
            </div>
            {debouncedQuery && (
              <p className="ml-auto text-[11px] text-muted-foreground">
                {filtered.length} result{filtered.length !== 1 ? "s" : ""} for{" "}
                <span className="font-medium">&quot;{debouncedQuery}&quot;</span>
              </p>
            )}
          </div>

          {/* Body */}
          {isLoading ? (
            <div className="p-5">
              <SkeletonText lines={4} />
            </div>
          ) : error ? (
            <p className="px-5 py-4 text-sm text-destructive">{error}</p>
          ) : filtered.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No clients found"
                description={
                  debouncedQuery
                    ? "Try a different search term."
                    : "Click Add Client to create one."
                }
              />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-card/30 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="w-[60px] px-4 py-2 font-medium text-right">#</th>
                      <th className="px-4 py-2 font-medium">Party Name</th>
                      <th className="w-[140px] px-4 py-2 font-medium">Created</th>
                      <th className="w-[100px] px-4 py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((c, idx) => (
                      <tr
                        key={c.id}
                        className="border-b border-border/60 transition-colors hover:bg-secondary/30"
                      >
                        <td className="px-4 py-2.5 text-right text-xs tabular-nums text-muted-foreground">
                          {from + idx + 1}
                        </td>
                        <td className="px-4 py-2.5">
                          {editingId === c.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void saveEdit(c.id);
                                  if (e.key === "Escape") setEditingId(null);
                                }}
                                autoFocus
                                className="h-8 max-w-sm"
                              />
                              <button
                                type="button"
                                onClick={() => void saveEdit(c.id)}
                                className="rounded-md p-1 text-success hover:bg-success/10"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
                              >
                                <XIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(c.id);
                                setEditDraft(c.party_name);
                              }}
                              className="group flex items-center gap-2 text-left text-foreground hover:text-primary"
                              title="Click to rename"
                            >
                              {c.party_name}
                              <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-50" />
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {formatDate(c.created_at)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setDeleteRow(c)}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  hasNext={page < totalPages - 1}
                  hasPrev={page > 0}
                  onPageChange={setPage}
                  showing={{ from: from + 1, to, total: filtered.length }}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Duplicate-detection card ── */}
      {duplicateGroups.length > 0 && (
        <Card className="border-warning/30 bg-warning/[0.04]">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <GitMerge className="h-4 w-4 text-warning" />
              <h3 className="text-sm font-semibold text-foreground">
                Potential duplicates found
              </h3>
              <Badge className="border border-warning/40 bg-warning/15 text-[10px] text-warning">
                {duplicateGroups.length} group{duplicateGroups.length !== 1 ? "s" : ""}
              </Badge>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Same name with different casing or whitespace. Merge keeps the
              oldest record and repoints all tasks + concepts to it.
            </p>

            <ul className="space-y-3">
              {duplicateGroups.slice(0, 10).map((group, gi) => (
                <li
                  key={gi}
                  className="rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground">
                        Keep: {group.keep.party_name}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Will absorb:{" "}
                        {group.duplicates.map((d) => `"${d.party_name}"`).join(", ")}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setMergeGroup(group)}
                      className="gap-1.5 border-warning/40 text-warning hover:bg-warning/10"
                    >
                      <GitMerge className="h-3.5 w-3.5" />
                      Merge {group.duplicates.length}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {duplicateGroups.length > 10 && (
              <p className="mt-3 text-[11px] italic text-muted-foreground">
                Showing first 10 of {duplicateGroups.length} groups.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={!!deleteRow}
        title={`Delete "${deleteRow?.party_name}"?`}
        description="This may affect tasks and concepts linked to this client. They will keep their text but lose the client link."
        variant="danger"
        confirmLabel="Delete client"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteRow(null)}
      />
      <ConfirmDialog
        open={!!mergeGroup}
        title={`Merge into "${mergeGroup?.keep.party_name}"?`}
        description={
          mergeGroup
            ? `Repoints all tasks + concepts referencing ${
                mergeGroup.duplicates.length
              } duplicate${
                mergeGroup.duplicates.length !== 1 ? "s" : ""
              } to the keeper, then deletes them. This cannot be undone.`
            : ""
        }
        variant="warning"
        confirmLabel={merging ? "Merging…" : "Merge"}
        onConfirm={() => void handleMerge()}
        onCancel={() => setMergeGroup(null)}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Internal types
// ----------------------------------------------------------------------------

interface DuplicateGroup {
  /** Lowercase trimmed name — the key everyone in the group shares. */
  normalised: string;
  /** Survivor — earliest-created row. */
  keep: Client;
  /** Rows to be merged in (and deleted). */
  duplicates: Client[];
}

// ----------------------------------------------------------------------------
// Client filter chip — mirrors the LookupSection chip style for consistency
// ----------------------------------------------------------------------------

function ClientFilterChip({
  active,
  onClick,
  label,
  count,
  tone = "default",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone?: "default" | "warning";
}) {
  const activeTone =
    tone === "warning"
      ? "bg-warning/10 text-warning border-warning/30"
      : "bg-primary/10 text-primary border-primary/30";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
        active
          ? activeTone
          : "border-border bg-card text-muted-foreground hover:bg-secondary"
      )}
    >
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

