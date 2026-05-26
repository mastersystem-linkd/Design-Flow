// ---------------------------------------------------------------------------
// Shared table styling. Imported by every data table so the look stays
// uniform across the app — one place to tweak header tone, row hover, sticky
// column shadow, etc.
//
// Header uses a light secondary surface with black, semibold text. The
// elevated card around the table provides separation; the header itself
// stays restrained so data tables read like a document, not a UI chrome
// banner.
// ---------------------------------------------------------------------------

/** Outer wrapper for a self-contained data table card. */
export const TABLE_CONTAINER =
  "overflow-hidden rounded-xl border border-border bg-card shadow-sm";

/** Scroll wrapper that goes immediately inside TABLE_CONTAINER (or used
 *  standalone when the parent already supplies the card). */
export const TABLE_SCROLL = "overflow-x-auto";

/** `<thead>` background + text token. Light secondary surface, black text,
 *  semibold weight — enough emphasis to read as a header without going
 *  full dark. */
export const TABLE_HEAD =
  "border-b border-border bg-secondary/70 text-left text-[11px] font-semibold uppercase tracking-wider text-foreground";

/** `<th>` cell — default padding + alignment. */
export const TABLE_TH = "px-4 py-3 font-semibold whitespace-nowrap";

/** Sticky right `<th>` (e.g. Open / Actions). Matches the header background
 *  so the shadow fade reads cleanly. */
export const TABLE_TH_STICKY_RIGHT =
  "sticky right-0 z-10 bg-secondary/70 px-4 py-3 text-right font-semibold shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]";

/** Body row — non-clickable. */
export const TABLE_ROW =
  "border-b border-border/40 last:border-0 transition-colors";

/** Body row — clickable (whole row opens a detail view). */
export const TABLE_ROW_CLICKABLE =
  "cursor-pointer border-b border-border/40 last:border-0 transition-colors hover:bg-secondary/50";

/** `<td>` cell — default padding + text. */
export const TABLE_TD = "px-4 py-3 text-sm";

/** Sticky right `<td>` companion to TABLE_TH_STICKY_RIGHT. */
export const TABLE_TD_STICKY_RIGHT =
  "sticky right-0 z-10 bg-card px-4 py-3 text-right shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]";
