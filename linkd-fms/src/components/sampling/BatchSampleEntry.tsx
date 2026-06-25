import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  Copy,
  Trash2,
  Loader2,
  RotateCcw,
  X,
  ChevronDown,
  Check,
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
  const [addCount, setAddCount] = useState(5);
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
        onInteractOutside={(e) => {
          const t = (e.detail as { originalEvent?: Event } | undefined)
            ?.originalEvent?.target as HTMLElement | null;
          if (t?.closest?.("[data-batch-cell-menu]")) e.preventDefault();
        }}
        // Escape runs through Radix's own (capture-phase) handler, which would
        // close the WHOLE dialog before the cell dropdown's bubble handler runs.
        // When any cell menu is open, swallow Escape here so it only closes the
        // dropdown (handled inside BatchCellSelect), not the batch grid.
        onEscapeKeyDown={(e) => {
          if (document.querySelector("[data-batch-cell-menu]")) e.preventDefault();
        }}
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
                  onChange={(e) =>
                    setAddCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addRows(addCount);
                    }
                  }}
                  className="h-6 w-11 bg-transparent px-1 text-center text-[11px] tabular-nums text-foreground focus:outline-none"
                  aria-label="Number of rows to add"
                />
                <button
                  type="button"
                  onClick={() => addRows(addCount)}
                  className="h-6 rounded px-2 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
                  title={`Add ${addCount} rows`}
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
                        options={partyNames}
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
                        options={fabricNames}
                        placeholder="Fabric…"
                        ariaLabel="Fabric"
                      />
                    </td>

                    {/* Requirement */}
                    <td className="px-1 py-1">
                      <BatchCellSelect
                        value={row.requirement}
                        onChange={(v) => updateRow(row._key, "requirement", v)}
                        options={samplingNames.requirement}
                        placeholder="Requirement…"
                        ariaLabel="Requirement"
                      />
                    </td>

                    {/* Assigned By */}
                    <td className="px-1 py-1">
                      <BatchCellSelect
                        value={row.assigned_by}
                        onChange={(v) => updateRow(row._key, "assigned_by", v)}
                        options={assignedByNames}
                        placeholder="Assigned by…"
                        ariaLabel="Assigned by"
                      />
                    </td>

                    {/* Sampling Done By */}
                    <td className="px-1 py-1">
                      <BatchCellSelect
                        value={row.sampling_done_by}
                        onChange={(v) => updateRow(row._key, "sampling_done_by", v)}
                        options={samplingNames.sampling_done_by}
                        placeholder="Done by…"
                        ariaLabel="Sampling done by"
                      />
                    </td>

                    {/* Fusing Operator */}
                    <td className="px-1 py-1">
                      <BatchCellSelect
                        value={row.fusing_operator}
                        onChange={(v) => updateRow(row._key, "fusing_operator", v)}
                        options={samplingNames.fusing_operator}
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

// ── BatchCellSelect — compact search-as-you-type dropdown for grid cells ──────
// The trigger is a real <input> (stays inside the dialog's focus trap so typing
// works), while the result list is PORTALED to <body> with position:fixed so it
// escapes the dialog's transform + the table's overflow clipping. The list has
// no focusable controls (items commit on click via mousedown-preventDefault),
// and the dialog guards onInteractOutside on [data-batch-cell-menu] so clicking
// the list never closes the dialog.

function BatchCellSelect({
  value,
  onChange,
  options,
  placeholder = "--",
  ariaLabel,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  ariaLabel?: string;
  error?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{
    left: number;
    width: number;
    maxHeight: number;
    top?: number;
    bottom?: number;
  } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const reposition = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // If the anchor has scrolled out of its scroll container (e.g. behind the
    // sticky header), close — otherwise the position:fixed menu floats detached.
    for (let n = el.parentElement; n; n = n.parentElement) {
      const oy = getComputedStyle(n).overflowY;
      if (oy === "auto" || oy === "scroll" || oy === "hidden") {
        const clip = n.getBoundingClientRect();
        if (r.bottom <= clip.top || r.top >= clip.bottom) {
          setOpen(false);
          return;
        }
        break;
      }
    }
    const gap = 4;
    const desired = 260;
    const below = window.innerHeight - r.bottom - gap;
    const above = r.top - gap;
    // Prefer below when it has reasonable room, else the side with more space.
    const placeBelow = below >= 160 || below >= above;
    // Clamp to the chosen side's ACTUAL space so the menu never overflows the
    // viewport — the inner list scrolls within maxHeight instead.
    const maxHeight = Math.min(desired, Math.max(0, placeBelow ? below : above));
    const width = Math.max(r.width, 200);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setBox({
      left,
      width,
      maxHeight,
      ...(placeBelow
        ? { top: r.bottom + gap }
        : { bottom: window.innerHeight - r.top + gap }),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onScrollResize = () => reposition();
    // capture:true so we also catch the table's own scroll, not just window.
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    function onDocDown(e: MouseEvent) {
      const t = e.target as Node;
      if (inputRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => {
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
      document.removeEventListener("mousedown", onDocDown);
    };
  }, [open, reposition]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Reset the search query whenever the menu closes so reopening starts fresh
  // (and a committed value is shown via the closed-state display, not a stale
  // query).
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open || !menuRef.current) return;
    menuRef.current
      .querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, open]);

  function commit(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open) {
        e.preventDefault();
        const o = filtered[activeIdx];
        if (o !== undefined) commit(o);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (
      !open &&
      e.key.length === 1 &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey
    ) {
      // First printable key on a closed-but-focused cell (e.g. right after a
      // commit). Start a FRESH query with this char instead of letting it
      // append to the displayed committed value.
      e.preventDefault();
      setOpen(true);
      setQuery(e.key);
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
        value={open ? query : value}
        placeholder={open && value ? value : placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onClick={() => {
          if (!open) setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "h-7 w-full truncate rounded border bg-card pl-1.5 pr-5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40",
          error ? "border-destructive ring-1 ring-destructive/30" : "border-border"
        )}
      />
      <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />

      {open &&
        box &&
        createPortal(
          <div
            ref={menuRef}
            data-batch-cell-menu
            style={{
              position: "fixed",
              left: box.left,
              width: box.width,
              maxHeight: box.maxHeight,
              ...(box.top != null ? { top: box.top } : { bottom: box.bottom }),
            }}
            className="z-[200] flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-dropdown"
          >
            <ul className="flex-1 overflow-y-auto py-1">
              {value && (
                <li>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commit("")}
                    className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary/60"
                  >
                    <X className="h-3 w-3" /> Clear
                  </button>
                </li>
              )}
              {filtered.length === 0 ? (
                <li className="px-3 py-4 text-center text-[11px] italic text-muted-foreground">
                  No matches
                </li>
              ) : (
                filtered.map((o, i) => (
                  <li key={o}>
                    <button
                      type="button"
                      data-idx={i}
                      onMouseEnter={() => setActiveIdx(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => commit(o)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs transition-colors",
                        i === activeIdx && "bg-primary/[0.08]",
                        o === value && "bg-primary/[0.12]"
                      )}
                    >
                      <span className="truncate text-foreground">{o}</span>
                      {o === value && <Check className="h-3 w-3 shrink-0 text-primary" />}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
}
