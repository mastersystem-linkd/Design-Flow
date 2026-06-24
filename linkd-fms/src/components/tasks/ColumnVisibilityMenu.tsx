import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Columns3, Check, RotateCcw, Eye, Star } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  ALL_COLUMNS,
  DEFAULT_COLUMNS,
  REQUIRED_ONE_OF,
  type ColumnKey,
} from "@/hooks/useUserPreferences";

function sameColumns(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((k) => sb.has(k));
}

interface ColumnVisibilityMenuProps {
  visibleColumns: string[];
  defaultColumns?: readonly string[];
  onSetDefault?: () => void;
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Position the portal-rendered panel below the trigger button
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const selectionKey = [...visibleColumns].sort().join(",");
  useEffect(() => {
    setJustSaved(false);
  }, [selectionKey, open]);

  const isVisible = useCallback(
    (key: ColumnKey) => visibleColumns.includes(key),
    [visibleColumns]
  );
  const isCurrentTheDefault = sameColumns(visibleColumns, defaultColumns);

  function setAsDefault() {
    onSetDefault?.();
    setJustSaved(true);
  }

  function toggle(key: ColumnKey) {
    const next = isVisible(key)
      ? visibleColumns.filter((k) => k !== key)
      : [...visibleColumns, key];
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

  function deselectAll() {
    onChange([...REQUIRED_ONE_OF]);
  }

  const shownCount = ALL_COLUMNS.filter((c) => isVisible(c.key)).length;
  const allSelected = shownCount === ALL_COLUMNS.length;

  function toggleAll() {
    if (allSelected) deselectAll();
    else showAll();
  }

  return (
    <>
      <Button
        ref={triggerRef}
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

      {open &&
        createPortal(
          <>
            {/* Invisible backdrop — closes menu on any outside click */}
            <div
              className="fixed inset-0 z-[9998]"
              onPointerDown={() => setOpen(false)}
            />

            {/* Menu panel */}
            <div
              ref={panelRef}
              role="menu"
              className="fixed z-[9999] w-64 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
              style={{ top: pos.top, right: pos.right }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Visible Columns
                </span>
              </div>

              <div className="max-h-[min(55vh,28rem)] overflow-y-auto py-1">
                {/* Select all — sticky master toggle */}
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={allSelected}
                  onClick={toggleAll}
                  title={allSelected ? "Deselect all columns" : "Show every column"}
                  className="sticky top-0 z-10 flex w-full items-center gap-2.5 border-b border-border bg-card px-3 py-1.5 text-left text-sm font-semibold transition-colors hover:bg-secondary/60"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      allSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card"
                    )}
                  >
                    {allSelected && <Check className="h-3 w-3" />}
                  </span>
                  <span className="text-foreground">Select all columns</span>
                  <span className="ml-auto text-[10px] font-normal tabular-nums text-muted-foreground">
                    {shownCount}/{ALL_COLUMNS.length}
                  </span>
                </button>
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
          </>,
          document.body
        )}
    </>
  );
}
