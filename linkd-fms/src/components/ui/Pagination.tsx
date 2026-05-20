import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  onPageChange: (page: number) => void;
  showing: { from: number; to: number; total: number };
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
}

const PAGE_SIZES = [10, 25, 50];

export function Pagination({
  page,
  totalPages,
  hasNext,
  hasPrev,
  onPageChange,
  showing,
  pageSize,
  onPageSizeChange,
}: PaginationProps) {
  if (showing.total === 0) return null;

  const pages = buildPageNumbers(page, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      {/* Left: showing info */}
      <p className="text-sm text-muted-foreground">
        Showing{" "}
        <span className="font-medium text-foreground tabular-nums">
          {showing.from}–{showing.to}
        </span>{" "}
        of{" "}
        <span className="font-medium text-foreground tabular-nums">
          {showing.total}
        </span>
      </p>

      {/* Center: page numbers */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <NavButton
            onClick={() => onPageChange(page - 1)}
            disabled={!hasPrev}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </NavButton>

          {pages.map((p, i) =>
            p === "..." ? (
              <span
                key={`ellipsis-${i}`}
                className="px-1 text-sm text-muted-foreground"
              >
                ...
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p as number)}
                className={cn(
                  "flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-medium tabular-nums transition-colors",
                  p === page
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {p}
              </button>
            )
          )}

          <NavButton
            onClick={() => onPageChange(page + 1)}
            disabled={!hasNext}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </NavButton>
        </div>
      )}

      {/* Right: page size */}
      {onPageSizeChange && pageSize != null && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function NavButton({
  children,
  disabled,
  onClick,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
        disabled
          ? "cursor-not-allowed text-muted-foreground/40"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * Build page number array with smart ellipsis.
 * Example for page 5 of 10: [1, '...', 4, 5, 6, '...', 10]
 */
function buildPageNumbers(
  current: number,
  total: number
): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [];

  // Always show first page
  pages.push(1);

  if (current > 3) {
    pages.push("...");
  }

  // Window around current
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push("...");
  }

  // Always show last page
  pages.push(total);

  return pages;
}
