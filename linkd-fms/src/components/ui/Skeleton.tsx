import { cn } from "@/lib/utils";

/** Pulsing gray rounded rectangle — base building block. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-secondary/80",
        className
      )}
    />
  );
}

/** Matches the task-card layout used in the Kanban view. */
export function SkeletonCard() {
  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-cream/95 p-3">
      {/* Code line + priority pill */}
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="h-3 w-12" />
      </div>
      {/* Title line */}
      <Skeleton className="h-4 w-3/4" />
      {/* Subtitle */}
      <Skeleton className="h-3 w-1/2" />
      {/* Tag row */}
      <div className="flex gap-1.5">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-12" />
      </div>
      {/* Footer: assignee + deadline */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}

/** Matches a basic data table with header + N rows × M columns. */
export function SkeletonTable({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  const gridStyle = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      {/* Header */}
      <div
        className="grid gap-3 border-b border-border bg-secondary/50 px-4 py-3"
        style={gridStyle}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-3/5" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid gap-3 border-b border-border px-4 py-3 last:border-b-0"
          style={gridStyle}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn("h-3.5", c === 0 ? "w-4/5" : "w-2/3")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Paragraph placeholder — last line is shorter, like real prose. */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-3.5",
            i === lines - 1 ? "w-2/3" : i % 3 === 1 ? "w-11/12" : "w-full"
          )}
        />
      ))}
    </div>
  );
}
