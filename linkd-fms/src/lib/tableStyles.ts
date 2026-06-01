// ---------------------------------------------------------------------------
// Shared table styling. Imported by every data table so the look stays
// uniform across the app — one place to tweak header tone, row hover, sticky
// column shadow, etc.
//
// Matches the All Tasks table: tight px-3 py-1.5 cells, bold uppercase
// headers with column dividers, secondary/60 header background.
// ---------------------------------------------------------------------------

import type { TableDensity } from "@/hooks/useUserPreferences";

/** Returns "table-compact" when compact, empty string when comfortable. */
export function densityClass(d: TableDensity): string {
  return d === "compact" ? "table-compact" : "";
}

/** Outer wrapper for a self-contained data table card. */
export const TABLE_CONTAINER =
  "overflow-hidden rounded-xl border border-border bg-card shadow-sm";

/** Scroll wrapper that goes immediately inside TABLE_CONTAINER (or used
 *  standalone when the parent already supplies the card). */
export const TABLE_SCROLL = "overflow-x-auto";

/** `<thead>` background + text token. Thin selvedge gradient at top edge. */
export const TABLE_HEAD =
  "thead-selvedge border-b border-border bg-secondary/60 text-left text-[11px] font-bold uppercase tracking-wider text-foreground whitespace-nowrap";

/** `<th>` cell — tight padding matching the All Tasks table. */
export const TABLE_TH = "px-3 py-2 text-left font-bold";

/** Sticky right `<th>` (e.g. Open / Actions). */
export const TABLE_TH_STICKY_RIGHT =
  "sticky right-0 z-10 bg-secondary/60 px-3 py-2 text-right font-bold shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]";

/** Body row — non-clickable. Shows 2px selvedge edge on hover. */
export const TABLE_ROW =
  "border-b border-border/40 last:border-0 transition-[colors,box-shadow] duration-200 row-selvedge";

/** Body row — clickable (whole row opens a detail view). Shows 2px selvedge + bg tint on hover. */
export const TABLE_ROW_CLICKABLE =
  "cursor-pointer border-b border-border/40 last:border-0 transition-[colors,box-shadow] duration-200 row-selvedge hover:bg-secondary/50";

/** `<td>` cell — tight padding matching the All Tasks table. */
export const TABLE_TD = "px-3 py-1.5 text-sm";

/** Sticky right `<td>` companion to TABLE_TH_STICKY_RIGHT. */
export const TABLE_TD_STICKY_RIGHT =
  "sticky right-0 z-10 bg-card px-3 py-1.5 text-right shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]";
