import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type KeyboardEvent,
} from "react";
import {
  Plus,
  Copy,
  Trash2,
  Loader2,
  RotateCcw,
  X,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useClients } from "@/hooks/useClients";
import { useFabrics } from "@/hooks/useFabrics";
import { useAssignedByOptions } from "@/hooks/useAssignedByOptions";
import { useSamplingDropdowns } from "@/hooks/useSamplingDropdowns";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/queryKeys";
import { useQueryClient } from "@tanstack/react-query";
import type { SampleInsert } from "@/types/database";

// ── Types ──────────────────────────────────────────────────────────────

interface BatchRow {
  _key: string; // client-only stable key
  party_name: string;
  quality: string;
  requirement: string;
  assigned_by: string;
  sampling_done_by: string;
  fusing_operator: string;
  printed_mtr: string;
  order_or_sample: "order" | "sample";
  is_completed: boolean;
  neatly_prepared: boolean;
  additional_comments: string;
}

interface BatchSampleEntryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────

const DRAFT_KEY = "batch-sample-draft";
const AUTOSAVE_MS = 30_000;

let keyCounter = 0;
function nextKey(): string {
  return `br-${Date.now()}-${++keyCounter}`;
}

function emptyRow(prev?: BatchRow): BatchRow {
  return {
    _key: nextKey(),
    party_name: "",
    quality: "",
    requirement: "",
    // Carry forward the "who" fields from the previous row — they're usually
    // the same across a batch, so this saves re-picking on every row.
    assigned_by: prev?.assigned_by ?? "",
    sampling_done_by: prev?.sampling_done_by ?? "",
    fusing_operator: prev?.fusing_operator ?? "",
    printed_mtr: "0",
    order_or_sample: prev?.order_or_sample ?? "sample",
    is_completed: false,
    neatly_prepared: false,
    additional_comments: "",
  };
}

// ── Column config ──────────────────────────────────────────────────────

const COLUMNS = [
  { key: "row_num", label: "#", w: "w-10" },
  { key: "party_name", label: "Party Name", w: "w-44" },
  { key: "quality", label: "Fabric", w: "w-36" },
  { key: "requirement", label: "Requirement", w: "w-56" },
  { key: "assigned_by", label: "Assigned By", w: "w-36" },
  { key: "sampling_done_by", label: "Sampling Done By", w: "w-36" },
  { key: "fusing_operator", label: "Fusing Operator", w: "w-36" },
  { key: "printed_mtr", label: "Printed MTR", w: "w-24" },
  { key: "is_completed", label: "Done", w: "w-16" },
  { key: "neatly_prepared", label: "Neatly Prepared", w: "w-24" },
  { key: "additional_comments", label: "Comments", w: "w-40" },
  { key: "actions", label: "", w: "w-20" },
] as const;

// ── Component ──────────────────────────────────────────────────────────

export function BatchSampleEntry({
  open,
  onOpenChange,
  onSubmitted,
}: BatchSampleEntryProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Data hooks
  const { clients } = useClients();
  const { fabrics } = useFabrics();
  const { names: assignedByNames } = useAssignedByOptions("sampling");
  const { names: samplingNames } = useSamplingDropdowns();

  const partyNames = useMemo(
    () => Array.from(new Set(clients.map((c) => c.party_name))).sort(),
    [clients]
  );
  const fabricNames = useMemo(() => fabrics.map((f) => f.name), [fabrics]);

  // Rows state
  const [rows, setRows] = useState<BatchRow[]>(() => [emptyRow()]);
  const [addCount, setAddCount] = useState(""); // empty by default — user types a count
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDraftBanner, setShowDraftBanner] = useState(false);

  const tableRef = useRef<HTMLDivElement>(null);
  const autosaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Draft restore check ────────────────────────────────────────────

  const draftChecked = useRef(false);
  useEffect(() => {
    if (!open) { draftChecked.current = false; return; }
    if (draftChecked.current) return;
    draftChecked.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as BatchRow[];
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.some((r) => r.party_name.trim())) {
          setRows(parsed.map((r) => ({ ...r, _key: nextKey(), printed_mtr: r.printed_mtr ?? "0" })));
          toast.info(`Restored ${parsed.length} row draft`);
          localStorage.removeItem(DRAFT_KEY);
        }
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, [open]);

  const dismissDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
    setShowDraftBanner(false);
  }, []);

  // ── Autosave ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    autosaveTimer.current = setInterval(() => {
      const nonEmpty = rows.filter((r) => r.party_name.trim());
      if (nonEmpty.length > 0) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(rows));
      }
    }, AUTOSAVE_MS);
    return () => {
      if (autosaveTimer.current) clearInterval(autosaveTimer.current);
    };
  }, [open, rows]);

  // ── Row operations ─────────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      tableRef.current?.scrollTo({
        top: tableRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRow(prev[prev.length - 1])]);
    scrollToBottom();
  }, [scrollToBottom]);

  /** Append N rows at once (each carrying the previous row's "who" fields). */
  const addRows = useCallback(
    (n: number) => {
      const count = Math.max(1, Math.min(100, Math.floor(n) || 1));
      setRows((prev) => {
        const out = [...prev];
        for (let i = 0; i < count; i++) out.push(emptyRow(out[out.length - 1]));
        return out;
      });
      scrollToBottom();
    },
    [scrollToBottom]
  );

  // "Add rows" — parse the typed count (empty/invalid → 1).
  const handleAddRows = useCallback(() => {
    const n = parseInt(addCount, 10);
    addRows(Number.isFinite(n) && n >= 1 ? n : 1);
  }, [addCount, addRows]);

  // Check-all toggles for the Done / Neatly Prepared columns.
  const toggleAllDone = useCallback(() => {
    setRows((prev) => {
      const target = !(prev.length > 0 && prev.every((r) => r.is_completed));
      return prev.map((r) => ({ ...r, is_completed: target }));
    });
  }, []);
  const toggleAllNeat = useCallback(() => {
    setRows((prev) => {
      const target = !(prev.length > 0 && prev.every((r) => r.neatly_prepared));
      return prev.map((r) => ({ ...r, neatly_prepared: target }));
    });
  }, []);

  const updateRow = useCallback(
    (key: string, field: keyof BatchRow, value: string | boolean) => {
      setRows((prev) =>
        prev.map((r) => (r._key === key ? { ...r, [field]: value } : r))
      );
      // Clear error for this row when the user types
      setErrors((prev) => {
        if (prev[key]) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return prev;
      });
    },
    []
  );

  const duplicateRow = useCallback((key: string) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r._key === key);
      if (idx < 0) return prev;
      const src = prev[idx];
      const dup: BatchRow = {
        ...src,
        _key: nextKey(),
        additional_comments: "",
        printed_mtr: "0",
        is_completed: false,
        neatly_prepared: false,
      };
      const next = [...prev];
      next.splice(idx + 1, 0, dup);
      return next;
    });
  }, []);

  // Stash the last deleted row so the undo banner can restore it.
  const [deletedRow, setDeletedRow] = useState<{
    row: BatchRow;
    index: number;
  } | null>(null);

  const deleteRow = useCallback((key: string) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev; // keep at least 1 row
      const idx = prev.findIndex((r) => r._key === key);
      if (idx < 0) return prev;
      setDeletedRow({ row: prev[idx], index: idx });
      return prev.filter((r) => r._key !== key);
    });
  }, []);

  const undoDelete = useCallback(() => {
    if (!deletedRow) return;
    setRows((prev) => {
      const next = [...prev];
      next.splice(
        Math.min(deletedRow.index, next.length),
        0,
        deletedRow.row
      );
      return next;
    });
    setDeletedRow(null);
  }, [deletedRow]);

  // ── Keyboard navigation ────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>, rowKey: string) => {
      if (e.key === "Enter") {
        const isLastRow = rows[rows.length - 1]?._key === rowKey;
        if (isLastRow) {
          e.preventDefault();
          addRow();
          // Focus the first input of the new row after render
          requestAnimationFrame(() => {
            const allRows = tableRef.current?.querySelectorAll(
              "tr[data-row-key]"
            );
            const last = allRows?.[allRows.length - 1];
            const firstInput = last?.querySelector<HTMLElement>(
              "select, input:not([type=checkbox])"
            );
            firstInput?.focus();
          });
        }
      }
    },
    [rows, addRow]
  );

  // ── Validation ─────────────────────────────────────────────────────

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    for (const row of rows) {
      if (!row.party_name.trim()) {
        newErrors[row._key] = "Party Name is required";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [rows]);

  // ── Submit ─────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!validate()) {
      toast.error("Fix validation errors before submitting");
      return;
    }
    if (!user) {
      toast.error("Not authenticated");
      return;
    }

    setSubmitting(true);
    try {
      const inserts: SampleInsert[] = rows.map((r) => ({
        party_name: r.party_name.trim(),
        quality: r.quality || null,
        requirement: r.requirement.trim() || null,
        assigned_by: r.assigned_by || null,
        sampling_done_by: r.sampling_done_by || null,
        fusing_operator: r.fusing_operator || null,
        printed_mtr: Number(r.printed_mtr) || 0,
        order_or_sample: r.order_or_sample,
        is_completed: r.is_completed,
        neatly_prepared: r.neatly_prepared,
        additional_comments: r.additional_comments.trim() || null,
        created_by: user.id,
      }));

      const { data, error } = await supabase
        .from("samples")
        .insert(inserts)
        .select("id");

      if (error) {
        toast.error(`Batch insert failed: ${error.message}`);
        return;
      }

      const count = data?.length ?? inserts.length;
      toast.success(`${count} sample${count === 1 ? "" : "s"} created`);
      localStorage.removeItem(DRAFT_KEY);
      setRows([emptyRow()]);
      setErrors({});
      queryClient.invalidateQueries({ queryKey: queryKeys.samples.all });
      onSubmitted();
      onOpenChange(false);
    } catch (err) {
      toast.error(
        `Unexpected error: ${err instanceof Error ? err.message : "Unknown"}`
      );
    } finally {
      setSubmitting(false);
    }
  }, [rows, user, validate, queryClient, onSubmitted, onOpenChange]);

  // ── Select helper ──────────────────────────────────────────────────

  const inputCls =
    "h-7 w-full rounded border border-border bg-card px-1.5 text-xs text-foreground " +
    "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

  const checkboxCls =
    "h-4 w-4 rounded border-border text-primary accent-primary focus:ring-2 focus:ring-primary/40";

  // ── Render ─────────────────────────────────────────────────────────

  const filledCount = rows.filter((r) => r.party_name.trim()).length;

  const completedCount = rows.filter((r) => r.is_completed).length;

  // Header check-all state (all / some / none) for the two boolean columns.
  const allDone = rows.length > 0 && rows.every((r) => r.is_completed);
  const someDone = rows.some((r) => r.is_completed);
  const allNeat = rows.length > 0 && rows.every((r) => r.neatly_prepared);
  const someNeat = rows.some((r) => r.neatly_prepared);

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o) {
        const filled = rows.filter((r) => r.party_name.trim());
        if (filled.length > 0) localStorage.setItem(DRAFT_KEY, JSON.stringify(rows));
        else localStorage.removeItem(DRAFT_KEY);
      }
      onOpenChange(o);
    }}>
      <DialogContent
        className="flex max-h-[92vh] w-[95vw] max-w-[95vw] flex-col overflow-hidden p-0 !top-[2vh] !translate-y-0 [&>button.absolute]:hidden"
        srTitle="Batch Sample Entry"
        // The cell dropdowns portal their menu to <body> (to escape this
        // dialog's transform + overflow clipping). Clicking such a menu counts
        // as "outside" to Radix and would close the whole dialog — guard it.
        // This is a long data-entry grid — never discard it on an accidental
        // outside click (incl. clicking a portaled cell dropdown) or Escape.
        // Only the explicit Cancel / ✕ / Submit buttons close it. Escape still
        // bubbles to an open cell dropdown to close just that menu.
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-border">
          <div className="flex items-center justify-between px-5 py-3">
            <DialogTitle className="text-sm font-semibold text-foreground">
              Batch Entry
              <span className="ml-2 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-primary">
                {rows.length} row{rows.length !== 1 ? "s" : ""}
              </span>
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addRow} className="h-7 gap-1 text-[11px]" title="Add one row">
                <Plus className="h-3 w-3" /> Add Row
              </Button>
              {/* Bulk add — type a count and add that many rows at once. */}
              <div className="flex h-7 items-center gap-1 rounded-md border border-border bg-card pl-1">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={addCount}
                  placeholder="5"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") {
                      setAddCount("");
                      return;
                    }
                    setAddCount(
                      String(Math.max(1, Math.min(100, parseInt(v, 10) || 1)))
                    );
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddRows();
                    }
                  }}
                  className="h-6 w-11 bg-transparent px-1 text-center text-[11px] tabular-nums text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                  aria-label="Number of rows to add"
                />
                <button
                  type="button"
                  onClick={handleAddRows}
                  className="h-6 rounded px-2 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
                  title="Add rows"
                >
                  Add rows
                </button>
              </div>
              <Button type="button" size="sm" onClick={() => onOpenChange(false)} variant="outline" className="h-7 text-[11px]">
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={handleSubmit} disabled={submitting || filledCount === 0} className="h-7 gap-1 text-[11px]">
                {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
                Submit ({filledCount})
              </Button>
              <button type="button" onClick={() => onOpenChange(false)} className="ml-1 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" title="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>


        {/* Shared option lists for the cell dropdowns. Native <datalist> gives
            reliable type-ahead inside the dialog (no portal/focus-trap issues),
            and one list per column keeps the DOM light regardless of row count. */}
        <datalist id="batch-dl-party">
          {partyNames.map((n, i) => (
            <option key={`p${i}`} value={n} />
          ))}
        </datalist>
        <datalist id="batch-dl-fabric">
          {fabricNames.map((n, i) => (
            <option key={`f${i}`} value={n} />
          ))}
        </datalist>
        <datalist id="batch-dl-requirement">
          {samplingNames.requirement.map((n, i) => (
            <option key={`r${i}`} value={n} />
          ))}
        </datalist>
        <datalist id="batch-dl-assigned">
          {assignedByNames.map((n, i) => (
            <option key={`a${i}`} value={n} />
          ))}
        </datalist>
        <datalist id="batch-dl-sampling">
          {samplingNames.sampling_done_by.map((n, i) => (
            <option key={`s${i}`} value={n} />
          ))}
        </datalist>
        <datalist id="batch-dl-fusing">
          {samplingNames.fusing_operator.map((n, i) => (
            <option key={`fu${i}`} value={n} />
          ))}
        </datalist>

        {/* Scrollable table */}
        <div ref={tableRef} className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-secondary/80 backdrop-blur-sm">
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "border-b border-border px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
                      col.w
                    )}
                  >
                    {col.key === "is_completed" ? (
                      <HeaderCheckAll
                        label="Done"
                        checked={allDone}
                        indeterminate={someDone && !allDone}
                        onToggle={toggleAllDone}
                      />
                    ) : col.key === "neatly_prepared" ? (
                      <HeaderCheckAll
                        label="Neatly Prepared"
                        checked={allNeat}
                        indeterminate={someNeat && !allNeat}
                        onToggle={toggleAllNeat}
                      />
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const hasError = !!errors[row._key];
                return (
                  <tr
                    key={row._key}
                    data-row-key={row._key}
                    className={cn(
                      "group border-b border-border/50 transition-colors hover:bg-secondary/30",
                      hasError && "bg-destructive/5"
                    )}
                  >
                    {/* # */}
                    <td className="px-2 py-1 text-center text-xs tabular-nums text-muted-foreground">
                      {idx + 1}
                    </td>

                    {/* Party Name */}
                    <td className="px-1 py-1">
                      <BatchCellSelect
                        value={row.party_name}
                        onChange={(v) => updateRow(row._key, "party_name", v)}
                        listId="batch-dl-party"
                        placeholder="Select party…"
                        ariaLabel="Party name"
                        error={hasError}
                      />
                    </td>

                    {/* Fabric */}
                    <td className="px-1 py-1">
                      <BatchCellSelect
                        value={row.quality}
                        onChange={(v) => updateRow(row._key, "quality", v)}
                        listId="batch-dl-fabric"
                        placeholder="Fabric…"
                        ariaLabel="Fabric"
                      />
                    </td>

                    {/* Requirement */}
                    <td className="px-1 py-1">
                      <BatchCellSelect
                        value={row.requirement}
                        onChange={(v) => updateRow(row._key, "requirement", v)}
                        listId="batch-dl-requirement"
                        placeholder="Requirement…"
                        ariaLabel="Requirement"
                      />
                    </td>

                    {/* Assigned By */}
                    <td className="px-1 py-1">
                      <BatchCellSelect
                        value={row.assigned_by}
                        onChange={(v) => updateRow(row._key, "assigned_by", v)}
                        listId="batch-dl-assigned"
                        placeholder="Assigned by…"
                        ariaLabel="Assigned by"
                      />
                    </td>

                    {/* Sampling Done By */}
                    <td className="px-1 py-1">
                      <BatchCellSelect
                        value={row.sampling_done_by}
                        onChange={(v) => updateRow(row._key, "sampling_done_by", v)}
                        listId="batch-dl-sampling"
                        placeholder="Done by…"
                        ariaLabel="Sampling done by"
                      />
                    </td>

                    {/* Fusing Operator */}
                    <td className="px-1 py-1">
                      <BatchCellSelect
                        value={row.fusing_operator}
                        onChange={(v) => updateRow(row._key, "fusing_operator", v)}
                        listId="batch-dl-fusing"
                        placeholder="Fusing…"
                        ariaLabel="Fusing operator"
                      />
                    </td>

                    {/* Printed MTR */}
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={row.printed_mtr}
                        onChange={(e) =>
                          updateRow(row._key, "printed_mtr", e.target.value)
                        }
                        onKeyDown={(e) => handleKeyDown(e, row._key)}
                        className={inputCls}
                      />
                    </td>

                    {/* Completed */}
                    <td className="px-1 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={row.is_completed}
                        onChange={(e) =>
                          updateRow(
                            row._key,
                            "is_completed",
                            e.target.checked
                          )
                        }
                        className={checkboxCls}
                      />
                    </td>

                    {/* Neatly Prepared */}
                    <td className="px-1 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={row.neatly_prepared}
                        onChange={(e) =>
                          updateRow(
                            row._key,
                            "neatly_prepared",
                            e.target.checked
                          )
                        }
                        className={checkboxCls}
                      />
                    </td>

                    {/* Comments */}
                    <td className="px-1 py-1">
                      <input
                        type="text"
                        value={row.additional_comments}
                        onChange={(e) =>
                          updateRow(
                            row._key,
                            "additional_comments",
                            e.target.value
                          )
                        }
                        onKeyDown={(e) => handleKeyDown(e, row._key)}
                        placeholder="Notes..."
                        className={inputCls}
                      />
                    </td>

                    {/* Actions */}
                    <td className="px-1 py-1">
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => duplicateRow(row._key)}
                          title="Duplicate row"
                          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteRow(row._key)}
                          title="Delete row"
                          disabled={rows.length <= 1}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Empty state */}
          {rows.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <p className="text-sm">No rows yet</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRow}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add First Row
              </Button>
            </div>
          )}
        </div>

        {/* Undo delete banner */}
        {deletedRow && (
          <div className="mx-4 flex items-center gap-3 rounded-lg border border-border bg-secondary/50 px-3 py-1.5">
            <span className="flex-1 text-xs text-muted-foreground">
              Row deleted
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={undoDelete}
              className="h-6 gap-1 text-xs"
            >
              <RotateCcw className="h-3 w-3" />
              Undo
            </Button>
            <button
              type="button"
              onClick={() => setDeletedRow(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Sticky footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-border bg-card px-4 py-2.5">
          <p className="text-xs text-muted-foreground">
            Enter on last row = new row · Tab = next cell · Files can be added after submit via Edit ·
            30s.
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>{rows.length} row{rows.length !== 1 ? "s" : ""}</span>
              <span className="text-border">·</span>
              <span className="font-medium text-primary">{filledCount} ready</span>
              {completedCount > 0 && <><span className="text-border">·</span><span className="font-medium text-success">{completedCount} done</span></>}
              <span className="text-border">·</span>
              <span>Tab to navigate, Enter for new row</span>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || filledCount === 0}
              className="h-8 gap-1 text-xs"
            >
              {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
              Submit {filledCount} Sample{filledCount !== 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── HeaderCheckAll — label + a tri-state "check all" box for a boolean column ──

function HeaderCheckAll({
  label,
  checked,
  indeterminate,
  onToggle,
}: {
  label: string;
  checked: boolean;
  indeterminate: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-center leading-tight">{label}</span>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        title={checked ? "Uncheck all rows" : "Check all rows"}
        className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-primary"
      />
    </div>
  );
}

// ── BatchCellSelect — searchable grid-cell dropdown (native datalist) ─────────
// A plain <input list> backed by a shared <datalist>: native type-ahead that
// works reliably INSIDE the Radix dialog — no portal, no focus-trap fight, no
// outside-dismiss quirk. Clicking a suggestion fills the input via onChange,
// and the browser renders the popup so it's never clipped by the table.

function BatchCellSelect({
  value,
  onChange,
  listId,
  placeholder = "--",
  ariaLabel,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  listId: string;
  placeholder?: string;
  ariaLabel?: string;
  error?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        className={cn(
          "h-7 w-full truncate rounded border bg-card pl-1.5 pr-5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40",
          error ? "border-destructive ring-1 ring-destructive/30" : "border-border"
        )}
      />
      <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
