import { format as fmtDate } from "date-fns";

// ============================================================================
// Reusable CSV export utility
// ============================================================================

export interface CsvColumn<T> {
  key: keyof T;
  label: string;
  /** Optional transform for the raw value. Receives the field value. */
  transform?: (val: unknown, row: T) => string;
}

/**
 * Format a single cell value for CSV output.
 *
 * - null / undefined → ""
 * - boolean → "Yes" / "No"
 * - Date objects or ISO strings → DD/MM/YYYY
 * - Arrays → semicolon-separated
 * - Strings with commas/quotes/newlines → wrapped in double-quotes (quotes escaped)
 * - Everything else → String(val)
 */
function formatCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean") return val ? "Yes" : "No";

  // Date detection
  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? "" : fmtDate(val, "dd/MM/yyyy");
  }
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return fmtDate(d, "dd/MM/yyyy");
  }

  // Arrays → semicolon-separated
  if (Array.isArray(val)) {
    return val.map((v) => formatCell(v)).join("; ");
  }

  const str = String(val);

  // Escape if contains comma, quote, or newline
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Convert an array of objects into a CSV string and trigger a browser download.
 *
 * @param data     Array of rows
 * @param filename Base filename (date will be appended: `{filename}-2026-05-18.csv`)
 * @param columns  Column definitions — key, label, optional transform
 */
export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  columns: CsvColumn<T>[]
): void {
  if (data.length === 0) return;

  // Header row
  const header = columns.map((c) => formatCell(c.label)).join(",");

  // Data rows
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const raw = row[col.key];
        if (col.transform) return formatCell(col.transform(raw, row));
        return formatCell(raw);
      })
      .join(",")
  );

  const csv = [header, ...rows].join("\n");

  // Build filename with today's date
  const today = fmtDate(new Date(), "yyyy-MM-dd");
  const fullName = `${filename}-${today}.csv`;

  // Trigger download via Blob
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fullName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
