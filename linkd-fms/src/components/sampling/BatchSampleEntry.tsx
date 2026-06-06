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
  AlertCircle,
  RotateCcw,
  X,
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
    assigned_by: "",
    sampling_done_by: prev?.sampling_done_by ?? "",
    fusing_operator: prev?.fusing_operator ?? "",
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
  { key: "is_completed", label: "Done", w: "w-14" },
  { key: "neatly_prepared", label: "Neat", w: "w-14" },
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

  // Rows state
  const [rows, setRows] = useState<BatchRow[]>(() => [emptyRow()]);
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
          setRows(parsed.map((r) => ({ ...r, _key: nextKey() })));
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

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRow(prev[prev.length - 1])]);
    // Scroll to bottom after render
    requestAnimationFrame(() => {
      tableRef.current?.scrollTo({
        top: tableRef.current.scrollHeight,
        behavior: "smooth",
      });
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

  const selectCls =
    "h-7 w-full rounded border border-border bg-card px-1.5 text-xs text-foreground " +
    "focus:outline-none focus:ring-2 focus:ring-primary/40 truncate";

  const inputCls =
    "h-7 w-full rounded border border-border bg-card px-1.5 text-xs text-foreground " +
    "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

  const checkboxCls =
    "h-4 w-4 rounded border-border text-primary accent-primary focus:ring-2 focus:ring-primary/40";

  // ── Render ─────────────────────────────────────────────────────────

  const filledCount = rows.filter((r) => r.party_name.trim()).length;

  const completedCount = rows.filter((r) => r.is_completed).length;

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
              <Button type="button" variant="outline" size="sm" onClick={addRow} className="h-7 gap-1 text-[11px]">
                <Plus className="h-3 w-3" /> Add Row
              </Button>
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
                    {col.label}
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
                      <div className="relative">
                        <select
                          value={row.party_name}
                          onChange={(e) =>
                            updateRow(row._key, "party_name", e.target.value)
                          }
                          onKeyDown={(e) => handleKeyDown(e, row._key)}
                          className={cn(
                            selectCls,
                            hasError && "border-destructive ring-1 ring-destructive/30"
                          )}
                        >
                          <option value="">Select...</option>
                          {partyNames.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                        {hasError && (
                          <AlertCircle className="absolute right-6 top-1/2 h-3 w-3 -translate-y-1/2 text-destructive" />
                        )}
                      </div>
                    </td>

                    {/* Fabric */}
                    <td className="px-1 py-1">
                      <select
                        value={row.quality}
                        onChange={(e) =>
                          updateRow(row._key, "quality", e.target.value)
                        }
                        onKeyDown={(e) => handleKeyDown(e, row._key)}
                        className={selectCls}
                      >
                        <option value="">--</option>
                        {fabrics.map((f) => (
                          <option key={f.id} value={f.name}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Requirement */}
                    <td className="px-1 py-1">
                      <select
                        value={row.requirement}
                        onChange={(e) =>
                          updateRow(row._key, "requirement", e.target.value)
                        }
                        onKeyDown={(e) => handleKeyDown(e, row._key)}
                        className={selectCls}
                      >
                        <option value="">--</option>
                        {samplingNames.requirement.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </td>

                    {/* Assigned By */}
                    <td className="px-1 py-1">
                      <select
                        value={row.assigned_by}
                        onChange={(e) =>
                          updateRow(row._key, "assigned_by", e.target.value)
                        }
                        onKeyDown={(e) => handleKeyDown(e, row._key)}
                        className={selectCls}
                      >
                        <option value="">--</option>
                        {assignedByNames.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Sampling Done By */}
                    <td className="px-1 py-1">
                      <select
                        value={row.sampling_done_by}
                        onChange={(e) =>
                          updateRow(
                            row._key,
                            "sampling_done_by",
                            e.target.value
                          )
                        }
                        onKeyDown={(e) => handleKeyDown(e, row._key)}
                        className={selectCls}
                      >
                        <option value="">--</option>
                        {samplingNames.sampling_done_by.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Fusing Operator */}
                    <td className="px-1 py-1">
                      <select
                        value={row.fusing_operator}
                        onChange={(e) =>
                          updateRow(
                            row._key,
                            "fusing_operator",
                            e.target.value
                          )
                        }
                        onKeyDown={(e) => handleKeyDown(e, row._key)}
                        className={selectCls}
                      >
                        <option value="">--</option>
                        {samplingNames.fusing_operator.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
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
