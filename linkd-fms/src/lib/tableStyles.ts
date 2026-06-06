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
  "overflow-hidden rounded-xl border border-border bg-card shadow-card transition-shadow duration-normal ease-spring";

/** Scroll wrapper that goes immediately inside TABLE_CONTAINER (or used
 *  standalone when the parent already supplies the card). */
export const TABLE_SCROLL = "overflow-x-auto";

/** `<thead>` background + text token. Thin selvedge gradient at top edge,
 *  with a subtle top-down tint so the header reads as a raised surface. */
export const TABLE_HEAD =
  "thead-selvedge border-b border-border bg-gradient-to-b from-secondary/70 to-secondary/30 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground whitespace-nowrap";

/** `<th>` cell — tight padding matching the All Tasks table. */
export const TABLE_TH = "px-3 py-2 text-left font-bold";

/** Sticky right `<th>` (e.g. Open / Actions). */
export const TABLE_TH_STICKY_RIGHT =
  "sticky right-0 z-10 bg-secondary/60 px-3 py-2 text-right font-bold shadow-[-6px_0_12px_-6px_rgba(0,0,0,0.06)]";

/** Body row — non-clickable. Shows 2px selvedge edge on hover. */
export const TABLE_ROW =
  "border-b border-border/30 last:border-0 transition-[colors,box-shadow,background-color] duration-normal ease-spring row-selvedge";

/** Body row — clickable (whole row opens a detail view). Shows 2px selvedge + bg tint on hover. */
export const TABLE_ROW_CLICKABLE =
  "cursor-pointer border-b border-border/30 last:border-0 transition-[colors,box-shadow,background-color] duration-normal ease-spring row-selvedge hover:bg-secondary/40";

/** `<td>` cell — tight padding matching the All Tasks table. */
export const TABLE_TD = "px-3 py-1.5 text-sm text-foreground font-medium";

/** Sticky right `<td>` companion to TABLE_TH_STICKY_RIGHT. */
export const TABLE_TD_STICKY_RIGHT =
  "sticky right-0 z-10 bg-card px-3 py-1.5 text-right shadow-[-6px_0_12px_-6px_rgba(0,0,0,0.06)]";
