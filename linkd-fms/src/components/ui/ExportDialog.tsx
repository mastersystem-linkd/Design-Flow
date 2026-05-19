import { useState } from "react";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { exportToCSV, type CsvColumn } from "@/lib/exportCSV";
import { cn } from "@/lib/utils";

// ============================================================================
// ExportDialog — optional pre-download modal with column + date filtering
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
      // Deselect all except the first
      setSelectedCols(new Set([columns[0].key]));
    } else {
      setSelectedCols(new Set(columns.map((c) => c.key)));
    }
  }

  function handleExport() {
    // Filter by date range if dateField and dates are set
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

    // Filter columns
    const activeCols = columns.filter((c) => selectedCols.has(c.key));

    exportToCSV(filtered, filename || defaultFilename, activeCols);
    onOpenChange(false);
  }

  const allChecked = selectedCols.size === columns.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Export CSV
          </DialogTitle>
          <DialogDescription>
            {data.length} record{data.length !== 1 ? "s" : ""} available.
            Customize your export below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Filename */}
          <div>
            <Label htmlFor="export-filename" className="text-xs">
              Filename
            </Label>
            <Input
              id="export-filename"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder={defaultFilename}
              className="mt-1"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Date will be appended automatically
            </p>
          </div>

          {/* Date range (only if dateField is provided) */}
          {dateField && (
            <div>
              <Label className="text-xs">Date Range (optional)</Label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  placeholder="From"
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  placeholder="To"
                />
              </div>
            </div>
          )}

          {/* Column checkboxes */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Columns</Label>
              <button
                type="button"
                onClick={toggleAll}
                className="text-[10px] font-medium text-primary hover:underline"
              >
                {allChecked ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {columns.map((col) => {
                const checked = selectedCols.has(col.key);
                return (
                  <label
                    key={String(col.key)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors",
                      checked
                        ? "border-primary/30 bg-primary/5 text-foreground"
                        : "border-border bg-card text-muted-foreground"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCol(col.key)}
                      className="h-3.5 w-3.5 rounded border-border accent-primary"
                    />
                    {col.label}
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Download CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
