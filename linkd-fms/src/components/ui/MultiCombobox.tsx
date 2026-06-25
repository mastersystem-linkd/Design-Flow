import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// MultiCombobox — search-as-you-type MULTI-select dropdown.
// ----------------------------------------------------------------------------
// Sibling of <Combobox> but holds an array of values. The trigger shows the
// selected items as removable chips; the menu stays open while toggling so the
// user can pick several. Used for "select multiple fabrics / design types" on
// the claim + completion flows. Values not present in `options` still render as
// chips (so pre-filled / legacy values survive).
// ============================================================================

export interface MultiComboboxOption {
  value: string;
  label: string;
}

/** Split a comma-joined text field into a clean array (for pre-filling). */
export function splitMulti(s: string | null | undefined): string[] {
  return (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Join selected values into the single text column the backend stores. */
export function joinMulti(values: string[]): string {
  return values.map((v) => v.trim()).filter(Boolean).join(", ");
}

export interface MultiComboboxProps {
  /** Currently selected values. */
  values: string[];
  onChange: (next: string[]) => void;
  options: MultiComboboxOption[];

  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  className?: string;
}

export function MultiCombobox({
  values,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches",
  disabled = false,
  error = false,
  id,
  className,
}: MultiComboboxProps) {
  const triggerId = useId();
  const listboxId = `${id ?? triggerId}-listbox`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedSet = useMemo(() => new Set(values), [values]);

  // Label lookup so chips show the option label when known, else the raw value.
  const labelFor = useMemo(() => {
    const m = new Map(options.map((o) => [o.value, o.label]));
    return (v: string) => m.get(v) ?? v;
  }, [options]);

  // Drop-up vs drop-down (mirrors Combobox so it works inside scrolling dialogs).
  const [menuPos, setMenuPos] = useState<{ placement: "bottom" | "top"; maxHeight: number }>(
    { placement: "bottom", maxHeight: 320 }
  );
  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    const el = wrapperRef.current;
    const rect = el.getBoundingClientRect();
    const ESTIMATED_MENU = 320;
    let clipBottom = window.innerHeight;
    let clipTop = 0;
    for (let node = el.parentElement; node; node = node.parentElement) {
      const oy = getComputedStyle(node).overflowY;
      if (oy === "auto" || oy === "scroll" || oy === "hidden") {
        const r = node.getBoundingClientRect();
        clipBottom = Math.min(clipBottom, r.bottom);
        clipTop = Math.max(clipTop, r.top);
        break;
      }
    }
    const gap = 8;
    const spaceBelow = clipBottom - rect.bottom - gap;
    const spaceAbove = rect.top - clipTop - gap;
    const placement = spaceBelow < ESTIMATED_MENU && spaceAbove > spaceBelow ? "top" : "bottom";
    const maxHeight = Math.min(
      ESTIMATED_MENU,
      Math.max(160, placement === "top" ? spaceAbove : spaceBelow)
    );
    setMenuPos({ placement, maxHeight });
  }, [open, values.length]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const row = listRef.current.querySelector<HTMLElement>(`[data-row-index="${activeIndex}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function toggle(value: string) {
    if (selectedSet.has(value)) onChange(values.filter((v) => v !== value));
    else onChange([...values, value]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = filtered[activeIndex];
      if (o) toggle(o.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Backspace" && query === "" && values.length > 0) {
      // Quick-remove the last chip when the search box is empty.
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div ref={wrapperRef} className={cn("relative w-full", className)}>
      {/* ── Trigger (chips) ── */}
      <button
        id={id ?? triggerId}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex min-h-10 w-full items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm transition-[colors,box-shadow,border-color] duration-normal ease-spring",
          "focus-visible:outline-none focus-visible:border-ring focus-visible:shadow-input-focus",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-ring shadow-input-focus",
          error ? "border-destructive" : "border-input",
          !open && !disabled && "hover:bg-secondary/40"
        )}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {values.length === 0 ? (
            <span className="px-1 text-muted-foreground">{placeholder}</span>
          ) : (
            values.map((v) => (
              <span
                key={v}
                className="inline-flex max-w-full items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
              >
                <span className="truncate">{labelFor(v)}</span>
                {!disabled && (
                  <span
                    role="button"
                    aria-label={`Remove ${labelFor(v)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(values.filter((x) => x !== v));
                    }}
                    className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded hover:bg-primary/20"
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </span>
            ))
          )}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {/* ── Menu ── */}
      {open && (
        <div
          style={{ maxHeight: menuPos.maxHeight }}
          className={cn(
            "absolute left-0 right-0 z-50 flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-dropdown animate-spring-slide-up",
            menuPos.placement === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"
          )}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
              aria-autocomplete="list"
              aria-controls={listboxId}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <ul ref={listRef} id={listboxId} role="listbox" aria-multiselectable className="flex-1 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-4 py-6 text-center text-xs italic text-muted-foreground">
                {emptyMessage}
              </li>
            ) : (
              filtered.map((o, i) => {
                const isSelected = selectedSet.has(o.value);
                return (
                  <li
                    key={o.value}
                    data-row-index={i}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => toggle(o.value)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm transition-colors",
                      i === activeIndex && "bg-primary/[0.08]",
                      isSelected && "bg-primary/[0.12]"
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </span>
                      <span className="truncate text-foreground">{o.label}</span>
                    </span>
                  </li>
                );
              })
            )}
          </ul>

          {values.length > 0 && (
            <div className="flex shrink-0 items-center justify-between border-t border-border bg-secondary/30 px-3 py-1.5 text-[10px] text-muted-foreground">
              <span>{values.length} selected</span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="font-medium text-muted-foreground hover:text-destructive"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
