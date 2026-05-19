/**
 * Days-until / days-since helpers for deadlines. Time-of-day is ignored;
 * everything is bucketed at the day level.
 */

export function daysUntil(
  deadline: string | Date | null | undefined
): number | null {
  if (!deadline) return null;
  const target = new Date(deadline);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
}

export type DaysSeverity =
  | "safe"      // > 5 days
  | "warning"   // 2-5 days
  | "critical"  // 1 day (Due tomorrow) — red, no pulse
  | "today"     // 0 days (Due today) — amber, pulsing
  | "overdue"   // < 0 (Overdue by N) — red, pulsing
  | "none";     // no deadline

export function daysSeverity(days: number | null): DaysSeverity {
  if (days === null) return "none";
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days === 1) return "critical";
  if (days <= 5) return "warning";
  return "safe";
}

export function daysLabel(days: number | null): string {
  if (days === null) return "No deadline";
  if (days < 0) return `Overdue by ${Math.abs(days)}d`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `${days} days left`;
}

/** Whether to apply animate-pulse to the deadline dot. */
export function shouldPulse(severity: DaysSeverity): boolean {
  return severity === "overdue" || severity === "today";
}

/** Dot background — small colored circle next to the deadline text. */
export const DAYS_DOT_CLASS: Record<DaysSeverity, string> = {
  safe: "bg-success",
  warning: "bg-warning",
  critical: "bg-destructive",
  today: "bg-warning",
  overdue: "bg-destructive",
  none: "bg-muted/40",
};

/** Text color for the deadline label. */
export const DAYS_TEXT_CLASS: Record<DaysSeverity, string> = {
  safe: "text-muted-foreground",
  warning: "text-warning",
  critical: "text-destructive",
  today: "font-medium text-warning",
  overdue: "font-medium text-destructive",
  none: "text-muted-foreground",
};

/** Legacy badge class (kept for places that use the old severity pill). */
export const DAYS_SEVERITY_CLASS: Record<DaysSeverity, string> = {
  safe: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  today: "bg-warning/15 text-warning border-warning/30",
  overdue: "bg-destructive/20 text-destructive border-destructive/40",
  none: "bg-secondary text-muted-foreground border-border",
};
