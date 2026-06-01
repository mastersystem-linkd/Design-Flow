import {
  daysUntil,
  daysSeverity,
  daysLabel,
  shouldPulse,
  DAYS_DOT_CLASS,
  DAYS_TEXT_CLASS,
} from "@/lib/days";
import { formatDate, cn } from "@/lib/utils";

/**
 * Renders a deadline as: severity dot + exact date (primary) + relative label
 * (secondary, muted). Used in the task tables on /dashboard, /sampling, and
 * /concepts.
 */
export function DeadlineCell({
  deadline,
}: {
  deadline: string | Date | null | undefined;
}) {
  const days = daysUntil(deadline ?? null);
  const sev = daysSeverity(days);
  const pulse = shouldPulse(sev);

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          DAYS_DOT_CLASS[sev],
          pulse && "animate-urgent-pulse"
        )}
        aria-hidden
      />
      <div className="flex flex-col leading-tight">
        <span className={cn("text-[12px] tabular-nums", DAYS_TEXT_CLASS[sev])}>
          {formatDate(deadline)}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {daysLabel(days)}
        </span>
      </div>
    </div>
  );
}
