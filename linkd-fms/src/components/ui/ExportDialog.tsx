import { useState, useMemo } from "react";
import {
  Download,
  FileText,
  ArrowRight,
  CheckCircle2,
  Calendar,
  Layers,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exportToCSV, type CsvColumn } from "@/lib/exportCSV";
import { cn } from "@/lib/utils";

// ============================================================================
// ExportDialog — modern pre-download modal with column + date filtering.
//
// Layout: section-scoped cards instead of a flat form, each section labeled
// with a small icon-chip header. Column chips read as multi-select pills
// (filled-primary when selected). Footer pinned with a prominent CTA.
// ============================================================================

interface ExportDialogProps<T extends Record<string, unknown>> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Full unfiltered dataset */
  data: T[];
  /** All available columns */
  columns: CsvColumn<T>[];
  /** Default filename (without date suffix) */
  defaultFilename: string;
  /** Optional field key that holds a date string — used for date-range filter */
  dateField?: keyof T;
}

export function ExportDialog<T extends Record<string, unknown>>({
  open,
  onOpenChange,
  data,
  columns,
  defaultFilename,
  dateField,
}: ExportDialogProps<T>) {
  const [filename, setFilename] = useState(defaultFilename);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedCols, setSelectedCols] = useState<Set<keyof T>>(
    () => new Set(columns.map((c) => c.key))
  );

  function toggleCol(key: keyof T) {
    setSelectedCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleAll() {
    if (selectedCols.size === columns.length) {
      // Deselect all except the first — guarantees ≥ 1 column is always
      // exported. Keeps download from producing an empty CSV.
      setSelectedCols(new Set([columns[0].key]));
    } else {
      setSelectedCols(new Set(columns.map((c) => c.key)));
    }
  }

  function handleExport() {
    let filtered = data;
    if (dateField && (dateFrom || dateTo)) {
      filtered = data.filter((row) => {
        const val = row[dateField];
        if (!val || typeof val !== "string") return true;
        const d = val.slice(0, 10); // YYYY-MM-DD
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
        return true;
      });
    }
    const activeCols = columns.filter((c) => selectedCols.has(c.key));
    exportToCSV(filtered, filename || defaultFilename, activeCols);
    onOpenChange(false);
  }

  const allChecked = selectedCols.size === columns.length;
  const selectedCount = selectedCols.size;

  // Live preview of records that will be exported, given the date filter.
  const previewCount = useMemo(() => {
    if (!dateField || (!dateFrom && !dateTo)) return data.length;
    return data.filter((row) => {
      const val = row[dateField];
      if (!val || typeof val !== "string") return true;
      const d = val.slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    }).length;
  }, [data, dateField, dateFrom, dateTo]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        {/* ── Header card — icon chip + title + record-count pill ── */}
        <DialogHeader className="border-b border-border bg-gradient-to-b from-primary/[0.06] via-primary/[0.02] to-transparent px-6 pb-5 pr-12 pt-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
              <Download className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-bold text-foreground">
                Export CSV
              </DialogTitle>
              <div className="mt-1 flex items-center gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-semibold tabular-nums text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  {previewCount}
                  <span className="font-normal opacity-70">/</span>
                  {data.length}
                </span>
                <span className="text-muted-foreground">
                  record{previewCount !== 1 ? "s" : ""} ready to export
                </span>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* ── Body — scrollable when content overflows ── */}
        <div className="max-h-[60vh] space-y-5 overflow-y-auto px-6 py-5">
          {/* ─ Filename ─ */}
          <Section
            icon={<FileText className="h-3 w-3" />}
            title="File name"
          >
            <div className="relative">
              <FileText className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="export-filename"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder={defaultFilename}
                className="pl-9 font-mono text-sm"
              />
            </div>
            <p className="text-[10px] text-muted-foreground/80">
              Will be saved as{" "}
              <span className="font-mono text-foreground/80">
                {filename || defaultFilename}-YYYY-MM-DD.csv
              </span>
            </p>
          </Section>

          {/* ─ Date range ─ (only when a date field is available) */}
          {dateField && (
            <Section
              icon={<Calendar className="h-3 w-3" />}
              title="Date range"
              optional
            >
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  aria-label="From date"
                  className="text-xs"
                />
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  aria-label="To date"
                  className="text-xs"
                />
                {(dateFrom || dateTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDateFrom("");
                      setDateTo("");
                    }}
                    className="shrink-0 rounded-md border border-border bg-card px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
            </Section>
          )}

          {/* ─ Columns ─ */}
          <Section
            icon={<Layers className="h-3 w-3" />}
            title="Columns"
            rightSlot={
              <div className="flex items-center gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-semibold tabular-nums text-foreground">
                  <CheckCircle2 className="h-3 w-3 text-success" />
                  {selectedCount} / {columns.length}
                </span>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="font-medium text-primary hover:underline"
                >
                  {allChecked ? "Deselect all" : "Select all"}
                </button>
              </div>
            }
          >
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {columns.map((col) => {
                const checked = selectedCols.has(col.key);
                return (
                  <label
                    key={String(col.key)}
                    className={cn(
                      "group flex cursor-pointer select-none items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-all duration-100 active:scale-[0.98]",
                      checked
                        ? "border-primary/40 bg-primary/[0.08] text-foreground shadow-card-soft"
                        : "border-border bg-card text-muted-foreground hover:border-[var(--border-hover)] hover:bg-secondary/40 hover:text-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        checked
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-card"
                      )}
                    >
                      {checked && <CheckCircle2 className="h-3 w-3" />}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCol(col.key)}
                      className="sr-only"
                    />
                    <span className="truncate font-medium">{col.label}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground/80">
              At least one column must stay selected.
            </p>
          </Section>
        </div>

        {/* ── Footer — pinned, gradient primary CTA ── */}
        <div className="flex items-center justify-between gap-3 border-t border-border bg-secondary/30 px-6 py-3">
          <div className="text-[11px] text-muted-foreground">
            {previewCount === 0
              ? "No records match your filters"
              : `Ready to export ${previewCount} row${previewCount === 1 ? "" : "s"} × ${selectedCount} col${selectedCount === 1 ? "" : "s"}`}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={previewCount === 0}
              size="sm"
              className="gap-1.5 shadow-card-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              Download CSV
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Section — tiny wrapper that gives each form group a labeled icon-chip
// header and consistent spacing. Lives in this file because it's purely
// Export-Dialog visual sugar, not a general-purpose primitive.
// ============================================================================

function Section({
  icon,
  title,
  optional,
  rightSlot,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  optional?: boolean;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-foreground">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-secondary text-muted-foreground">
            {icon}
          </span>
          {title}
          {optional && (
            <span className="rounded-full border border-border bg-card px-1.5 py-px text-[9px] font-normal lowercase tracking-normal text-muted-foreground">
              optional
            </span>
          )}
        </div>
        {rightSlot}
      </header>
      {children}
    </section>
  );
}
