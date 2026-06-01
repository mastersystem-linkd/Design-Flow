import { cn } from "@/lib/utils";

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

export function SkeletonCard() {
  return (
    <div className="swatch-edge space-y-2.5 rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-primary/10" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <Skeleton className="h-6 w-20" />
      <Skeleton className="h-3 w-2/3" />
      <div className="flex gap-1.5">
        <Skeleton className="h-4 w-14 rounded-full" />
        <Skeleton className="h-4 w-12 rounded-full" />
      </div>
    </div>
  );
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  const gridStyle = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className="thead-selvedge grid gap-3 border-b border-border bg-secondary/60 px-3 py-2"
        style={gridStyle}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-2.5 w-3/5" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="row-selvedge grid gap-3 border-b border-border/40 px-3 py-1.5 last:border-b-0"
          style={gridStyle}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn("h-3", c === 0 ? "w-4/5" : "w-2/3")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

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

export function SkeletonScoreRing({ size = 80 }: { size?: number }) {
  return (
    <div
      className="animate-pulse rounded-full border-4 border-dashed border-secondary"
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
