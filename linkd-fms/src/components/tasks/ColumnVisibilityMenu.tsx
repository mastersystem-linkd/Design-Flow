import { useEffect, useRef, useState } from "react";
import { Columns3, Check, RotateCcw, Eye, Star } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  ALL_COLUMNS,
  DEFAULT_COLUMNS,
  REQUIRED_ONE_OF,
  type ColumnKey,
} from "@/hooks/useUserPreferences";

// ============================================================================
// ColumnVisibilityMenu — lets a user pick which task-table columns to show.
// Changes save immediately (the parent's setVisibleColumns is optimistic).
// At least one identifying column (concept OR party_name) must stay visible.
// "Set as my default" pins the current layout as the user's Reset target.
// ============================================================================

/** Order-independent set equality for column key lists. */
function sameColumns(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((k) => sb.has(k));
}

interface ColumnVisibilityMenuProps {
  visibleColumns: string[];
  /** Column set that "Reset" restores. Defaults to the generic DEFAULT_COLUMNS;
   *  callers pass a stage-specific default so Reset honors per-stage defaults. */
  defaultColumns?: readonly string[];
  /** Pin the current selection as the user's personal default for this stage.
   *  When omitted, the "Set as my default" button is hidden. */
  onSetDefault?: () => void;
  /** Whether the user has already pinned a personal default (affects copy). */
  hasCustomDefault?: boolean;
  onChange: (columns: string[]) => void;
}

export function ColumnVisibilityMenu({
  visibleColumns,
  defaultColumns = DEFAULT_COLUMNS,
  onSetDefault,
  hasCustomDefault = false,
  onChange,
}: ColumnVisibilityMenuProps) {
  const [open, setOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Clear the "Saved" confirmation as soon as the selection changes again, or
  // when the menu is reopened.
  const selectionKey = [...visibleColumns].sort().join(",");
  useEffect(() => {
    setJustSaved(false);
  }, [selectionKey, open]);

  const isVisible = (key: ColumnKey) => visibleColumns.includes(key);
  const isCurrentTheDefault = sameColumns(visibleColumns, defaultColumns);

  function setAsDefault() {
    onSetDefault?.();
    setJustSaved(true);
  }

  function toggle(key: ColumnKey) {
    const next = isVisible(key)
      ? visibleColumns.filter((k) => k !== key)
      : [...visibleColumns, key];
    // Never let the user hide every identifying column.
    const stillHasIdentity = REQUIRED_ONE_OF.some((k) => next.includes(k));
    if (!stillHasIdentity) return;
    onChange(next);
  }

  function showAll() {
    onChange(ALL_COLUMNS.map((c) => c.key));
  }

  function resetDefault() {
    onChange([...defaultColumns]);
  }

  const shownCount = ALL_COLUMNS.filter((c) => isVisible(c.key)).length;

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        className="gap-1.5"
      >
        <Columns3 className="h-4 w-4" />
        <span className="hidden sm:inline">Columns</span>
        <span className="rounded-full bg-secondary px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {shownCount}
        </span>
      </Button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
          role="menu"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Visible Columns
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {ALL_COLUMNS.map(({ key, label }) => {
              const checked = isVisible(key);
              const isLastIdentity =
                REQUIRED_ONE_OF.includes(key) &&
                checked &&
                REQUIRED_ONE_OF.filter((k) => visibleColumns.includes(k))
                  .length === 1;
              return (
                <button
                  key={key}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  disabled={isLastIdentity}
                  onClick={() => toggle(key)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors",
                    "hover:bg-secondary/60 disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                  title={
                    isLastIdentity
                      ? "Keep at least one of Concept / Party Name visible"
                      : undefined
                  }
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card"
                    )}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate text-foreground">{label}</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5 border-t border-border px-2 py-2">
            {onSetDefault && (
              <button
                type="button"
                onClick={setAsDefault}
                disabled={isCurrentTheDefault && !justSaved}
                title="Make this column layout the one Reset restores for this stage"
                className={cn(
                  "inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
                  justSaved
                    ? "border-success/40 bg-success/5 text-success"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary",
                  "disabled:cursor-default disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-card disabled:hover:text-muted-foreground"
                )}
              >
                {justSaved ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Saved as your default
                  </>
                ) : (
                  <>
                    <Star className="h-3.5 w-3.5" />
                    {isCurrentTheDefault
                      ? "This is your default"
                      : "Set as my default"}
                  </>
                )}
              </button>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={showAll}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
              >
                <Eye className="h-3.5 w-3.5" />
                Show All
              </button>
              <button
                type="button"
                onClick={resetDefault}
                title={
                  hasCustomDefault
                    ? "Reset to your saved default"
                    : "Reset to the built-in default"
                }
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
