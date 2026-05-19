import type {
  TaskStatus,
  TaskPriority,
  UserRole,
  ConceptStatus,
} from "@/types/database";

// ============================================================================
// Task status — pipeline order, labels, badge classes
// ============================================================================

export const STATUS_ORDER: readonly TaskStatus[] = [
  "pool",
  "todo",
  "in_progress",
  "full_kitting",
  "approved",
  "sampling",
  "done",
] as const;

export const STATUS_LABELS: Record<TaskStatus, string> = {
  pool: "Pool",
  todo: "To-Do",
  in_progress: "In Progress",
  full_kitting: "Full Knitting",
  approved: "Approved",
  sampling: "Sampling",
  done: "Done",
};

/** Pill/badge styling for a status. */
export const STATUS_COLORS: Record<TaskStatus, string> = {
  pool: "bg-secondary text-muted-foreground border border-border",
  todo: "bg-card text-foreground border border-border",
  in_progress: "bg-primary/20 text-primary border border-primary/30",
  full_kitting: "bg-primary/40 text-white border border-primary/50",
  approved: "bg-primary text-white border border-primary",
  sampling: "bg-warning/30 text-warning border border-warning/40",
  done: "bg-success/20 text-success border border-success/30",
};

/**
 * Soft background tint for the entire kanban column.
 * Visual narrative: cool/neutral early → warm gold mid-flow → ink finalisation → faded done.
 */
export const COLUMN_BG: Record<TaskStatus, string> = {
  pool: "bg-secondary/30",
  todo: "bg-secondary/50",
  in_progress: "bg-primary/10",
  full_kitting: "bg-primary/15",
  approved: "bg-primary/5",
  sampling: "bg-warning/10",
  done: "bg-success/10",
};

/** Solid dot next to each column heading. */
export const COLUMN_DOT: Record<TaskStatus, string> = {
  pool: "bg-muted",
  todo: "bg-white/50",
  in_progress: "bg-primary",
  full_kitting: "bg-primary",
  approved: "bg-primary",
  sampling: "bg-warning",
  done: "bg-success",
};

/** 3-px top accent stripe — same color family as the dot, stronger. */
export const COLUMN_ACCENT: Record<TaskStatus, string> = {
  pool: "bg-muted",
  todo: "bg-white/50",
  in_progress: "bg-primary",
  full_kitting: "bg-primary",
  approved: "bg-primary",
  sampling: "bg-warning",
  done: "bg-success",
};

// ============================================================================
// Priority
// ============================================================================

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "bg-muted/20 text-muted-foreground",
  normal: "bg-secondary text-foreground",
  high: "bg-warning/30 text-warning",
  urgent: "bg-destructive text-destructive-foreground",
};

// ============================================================================
// Roles
// ============================================================================

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  design_coordinator: "Design Coordinator",
  designer: "Designer",
};

// ============================================================================
// Concept (MD) review status
// ============================================================================

export const CONCEPT_STATUS_LABELS: Record<ConceptStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  revision_requested: "Revision",
};

export const CONCEPT_STATUS_COLORS: Record<ConceptStatus, string> = {
  pending: "bg-secondary text-foreground",
  approved: "bg-success/20 text-success border border-success/30",
  rejected: "bg-destructive/20 text-destructive border border-destructive/30",
  revision_requested: "bg-warning/20 text-warning border border-warning/30",
};

// ============================================================================
// Month codes — single letter per month, shared across all designers.
// Used for generating sample / swatch identifiers like "UD-001"
// (designer U + month D + sequence 001 = a January task for designer U... wait, D = Apr).
// ============================================================================

export type MonthCode =
  | "A" | "B" | "C" | "D" | "E" | "F"
  | "G" | "H" | "I" | "J" | "K" | "L";

/** Letter → 3-letter English month abbreviation. */
export const MONTH_CODE_LABELS: Record<MonthCode, string> = {
  A: "Jan", B: "Feb", C: "Mar", D: "Apr", E: "May", F: "Jun",
  G: "Jul", H: "Aug", I: "Sep", J: "Oct", K: "Nov", L: "Dec",
};

/** Stable index — element N is the code for month N+1 (1 = Jan = A). */
export const MONTH_CODE_ORDER: readonly MonthCode[] = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
] as const;

/** Ordered list of `{ code, name, monthNumber }` records — useful for dropdowns. */
export const MONTH_CODES: readonly { code: MonthCode; name: string; monthNumber: number }[] =
  MONTH_CODE_ORDER.map((code, i) => ({
    code,
    name: MONTH_CODE_LABELS[code],
    monthNumber: i + 1,
  }));

/** Given a JS Date or ISO date string, return its month code (Jan → A, Dec → L). */
export function monthCodeForDate(input: Date | string): MonthCode {
  const d = typeof input === "string" ? new Date(input) : input;
  return MONTH_CODE_ORDER[d.getMonth()]!;
}

/** Given a 1-12 month number, return its code. Out-of-range returns undefined. */
export function monthCodeFromNumber(monthNumber: number): MonthCode | undefined {
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return undefined;
  }
  return MONTH_CODE_ORDER[monthNumber - 1];
}

/** Reverse: given a code, return its 1-12 month number. */
export function monthNumberFromCode(code: MonthCode): number {
  return MONTH_CODE_ORDER.indexOf(code) + 1;
}

// ============================================================================
// Concept categories + fabrics — now DB-backed (public.concept_categories +
// public.fabrics, migration 0011). Use the hooks: useConceptCategories(),
// useFabrics(). The previous hard-coded arrays were removed when the lookup
// tables landed.
// ============================================================================

// ============================================================================
// "Assigned By" — concept-form dropdown options. Internal stakeholder names
// supplied by the team; some are users (SELF, Supriya), some are external
// reviewers (NAUSHI MAM, GAURAV SIR, etc).
// ============================================================================
export const ASSIGNED_BY_OPTIONS: readonly string[] = [
  "SELF",
  "NAUSHI MAM",
  "Nandu Desai",
  "OTHER",
  "Eldee",
  "GAURAV SIR",
  "Raghav Sir",
  "Shrikant Bhole",
  "Jiten",
  "Supriya",
  "Laxmikant Sir",
  "Hiren",
] as const;
