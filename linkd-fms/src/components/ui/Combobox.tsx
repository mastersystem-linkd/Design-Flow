import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Combobox — search-as-you-type dropdown
// ============================================================================
//
// Drop-in replacement for native <select> when the option list is too long
// to scan. Same controlled-input API (value/onChange), plus full keyboard
// support, debounced filter, match highlighting, and a soft elevated menu.
//
// State model: idle → typing → (loading or filtered) → success/empty.
// `loading` is opt-in for async data sources; for in-memory option lists
// (which is what the brief form has) you never set it.
//
// Why a custom build and not a library: the rest of the app uses Radix where
// it makes sense (Dialog, Sheet, DropdownMenu), but Radix doesn't ship a
// combobox primitive. The community alternatives (Downshift, cmdk) drag in
// extra deps for a fairly contained widget. Writing it once gives full
// control over highlight + visual states that match the rest of the UI.
// ============================================================================

export interface ComboboxOption<TValue extends string = string> {
  value: TValue;
  label: string;
  /** Optional secondary line shown under the label (e.g. role, code). */
  hint?: string;
  /** Optional leading icon rendered before the label (in both the trigger
   *  and the open option list). Use a small element sized ~14px so it
   *  aligns with the text baseline. */
  icon?: React.ReactNode;
  /** When true, item renders disabled and can't be selected. */
  disabled?: boolean;
}

export interface ComboboxProps<TValue extends string = string> {
  /** Currently selected value (or empty string for "nothing picked"). */
  value: TValue | "";
  /** Fires when user picks (or clears with the × button). */
  onChange: (next: TValue | "") => void;
  options: ComboboxOption<TValue>[];

  /** Trigger placeholder when nothing is selected. */
  placeholder?: string;
  /** Search input placeholder inside the open menu. */
  searchPlaceholder?: string;
  /** Empty state copy. */
  emptyMessage?: string;
  /** Optional loading state (e.g. while parent fetches options). */
  loading?: boolean;

  /** Disable the whole control. */
  disabled?: boolean;
  /** Show as an error (red border ring). */
  error?: boolean;
  /** Allow the user to clear the selection with an × button on the trigger. */
  clearable?: boolean;

  /** id passed to the trigger button (for label htmlFor). */
  id?: string;
  /** Debounce in ms for the filter step. 0 = filter on every keystroke. */
  debounceMs?: number;

  className?: string;
}

// ============================================================================

export function Combobox<TValue extends string = string>({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches",
  loading = false,
  disabled = false,
  error = false,
  clearable = true,
  id,
  debounceMs = 0,
  className,
}: ComboboxProps<TValue>) {
  const triggerId = useId();
  const listboxId = `${id ?? triggerId}-listbox`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Drop-up vs drop-down. Inside a scrolling dialog body the menu would be
  // clipped if it opened downward off a near-the-bottom field, so when
  // there's more room above the trigger we flip it up. Kept as an in-flow
  // absolute child (not a body portal) so it stays inside the dialog's
  // focus trap — a portaled <input> would get focus-bounced by Radix.
  const [menuPos, setMenuPos] = useState<{
    placement: "bottom" | "top";
    maxHeight: number;
  }>({ placement: "bottom", maxHeight: 340 });
  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    const el = wrapperRef.current;
    const rect = el.getBoundingClientRect();
    const ESTIMATED_MENU = 340; // search bar + list + footer, roughly

    // The clip box is the nearest scrollable ancestor (e.g. a dialog body
    // with overflow-y-auto), NOT the viewport — measuring against the
    // viewport would drop the menu down into a region the dialog clips.
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
    const placement =
      spaceBelow < ESTIMATED_MENU && spaceAbove > spaceBelow ? "top" : "bottom";
    // Never taller than the room on the chosen side, so the list scrolls
    // internally instead of spilling past the clip box.
    const maxHeight = Math.min(
      ESTIMATED_MENU,
      Math.max(160, placement === "top" ? spaceAbove : spaceBelow)
    );
    setMenuPos({ placement, maxHeight });
  }, [open]);

  // Debounced filter — keeps the menu rendering smooth when the user types
  // fast across a 1000+ row list. For server-driven sources, push the
  // debounced value to the parent via `onChange` of a search-text-only prop
  // (not exposed here yet — easy to add when needed).
  useEffect(() => {
    if (debounceMs <= 0) {
      setDebouncedQuery(query.trim());
      return;
    }
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), debounceMs);
    return () => window.clearTimeout(id);
  }, [query, debounceMs]);

  // Close on outside click. We listen on mousedown (not click) so the
  // close fires before any text-input focus changes can re-open it.
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

  // Focus the search input as soon as the menu opens (autofocus alone
  // doesn't work because the input is conditionally mounted).
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Reset highlight when the visible list shape changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery]);

  // Filtered + highlighted matches. Case-insensitive substring search.
  const filtered = useMemo(() => {
    if (!debouncedQuery) return options;
    const q = debouncedQuery.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, debouncedQuery]);

  // Scroll the active row into view as the user keyboard-pages.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const row = listRef.current.querySelector<HTMLElement>(
      `[data-row-index="${activeIndex}"]`
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  // Find the selected option once — used to render the trigger label.
  // If the value exists but isn't in the options list, synthesize a display entry
  // so the trigger shows the raw value instead of the placeholder.
  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? (value ? { value, label: value } : null),
    [options, value]
  );

  function commit(next: TValue | "") {
    onChange(next);
    setOpen(false);
    setQuery("");
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
      if (o && !o.disabled) commit(o.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Tab") {
      // Let Tab close the menu without committing, matching native combobox UX.
      setOpen(false);
    }
  }

  const showLoading = loading;
  const showEmpty = !showLoading && filtered.length === 0;

  return (
    <div
      ref={wrapperRef}
      className={cn("relative w-full", className)}
    >
      {/* ── Trigger ── */}
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
          "flex h-10 w-full items-center justify-between gap-2 rounded-md border bg-card px-3 text-sm transition-[colors,box-shadow,border-color] duration-normal ease-spring",
          "focus-visible:outline-none focus-visible:border-ring focus-visible:shadow-input-focus",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-ring shadow-input-focus",
          error ? "border-destructive" : "border-input",
          // Subtle hover when not open
          !open && !disabled && "hover:bg-secondary/40"
        )}
      >
        <span
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 text-left",
            selected ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {selected?.icon}
          <span className="min-w-0 flex-1 truncate">
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {clearable && selected && !disabled && (
            <span
              role="button"
              aria-label="Clear selection"
              onClick={(e) => {
                e.stopPropagation();
                commit("");
              }}
              className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* ── Menu — diffused shadow, rounded corners, slide-in fade. Drops up
           or down based on available space so a near-the-bottom field in a
           scrolling dialog doesn't get its list clipped. ── */}
      {open && (
        <div
          style={{ maxHeight: menuPos.maxHeight }}
          className={cn(
            "absolute left-0 right-0 z-50 flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-dropdown",
            "animate-spring-slide-up",
            menuPos.placement === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"
          )}
        >
          {/* Search bar */}
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
              aria-activedescendant={
                filtered[activeIndex]
                  ? `${listboxId}-opt-${activeIndex}`
                  : undefined
              }
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
            {showLoading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Result list */}
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            className="flex-1 overflow-y-auto py-1"
          >
            {showLoading && filtered.length === 0 ? (
              <SkeletonRows />
            ) : showEmpty ? (
              <li className="px-4 py-6 text-center text-xs italic text-muted-foreground">
                {emptyMessage}
              </li>
            ) : (
              filtered.map((o, i) => (
                <ComboboxRow
                  key={o.value}
                  option={o}
                  index={i}
                  active={i === activeIndex}
                  selected={o.value === value}
                  query={debouncedQuery}
                  onHover={() => setActiveIndex(i)}
                  onPick={() => !o.disabled && commit(o.value)}
                  listboxId={listboxId}
                />
              ))
            )}
          </ul>

          {/* Footer count — gives the user a sense of how big the list is. */}
          {!showLoading && filtered.length > 0 && (
            <div className="shrink-0 border-t border-border bg-secondary/30 px-3 py-1.5 text-[10px] text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? "match" : "matches"}
              {debouncedQuery ? ` for "${debouncedQuery}"` : ""}
              {filtered.length !== options.length && ` of ${options.length}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Single row — handles hover, selected check, and substring highlighting
// ============================================================================

function ComboboxRow<TValue extends string = string>({
  option,
  index,
  active,
  selected,
  query,
  onHover,
  onPick,
  listboxId,
}: {
  option: ComboboxOption<TValue>;
  index: number;
  active: boolean;
  selected: boolean;
  query: string;
  onHover: () => void;
  onPick: () => void;
  listboxId: string;
}) {
  return (
    <li
      id={`${listboxId}-opt-${index}`}
      data-row-index={index}
      role="option"
      aria-selected={selected}
      aria-disabled={option.disabled || undefined}
      onMouseEnter={onHover}
      onClick={onPick}
      className={cn(
        "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm transition-colors",
        active && "bg-primary/[0.08]",
        selected && "bg-primary/[0.12]",
        option.disabled && "cursor-not-allowed opacity-50"
      )}
    >
      {option.icon && <span className="shrink-0">{option.icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-foreground">
          <Highlight text={option.label} query={query} />
        </p>
        {option.hint && (
          <p className="truncate text-[11px] text-muted-foreground">
            {option.hint}
          </p>
        )}
      </div>
      {selected && (
        <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
      )}
    </li>
  );
}

// ============================================================================
// Highlight — bolds the matching substring inside a label
// ============================================================================

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-warning/30 font-semibold text-foreground">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ============================================================================
// Skeleton rows for the explicit `loading` prop
// ============================================================================

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-2 px-3 py-2"
          aria-hidden
        >
          <div
            className="h-3 animate-pulse rounded bg-secondary"
            style={{ width: `${60 + i * 10}%` }}
          />
        </li>
      ))}
    </>
  );
}
