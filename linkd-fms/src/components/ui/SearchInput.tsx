import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchInputProps {
  /** The "committed" value (debounced). */
  value: string;
  /** Called after `debounceMs` of no typing. */
  onChange: (value: string) => void;
  placeholder?: string;
  /** Default 300 ms. Set to 0 to disable debouncing. */
  debounceMs?: number;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Optional label for screen-readers (defaults to placeholder). */
  ariaLabel?: string;
}

/**
 * Search input with a left icon, a clear button, and built-in debouncing.
 * The parent receives `onChange` only after the user stops typing for
 * `debounceMs` (default 300 ms) — keeps useTasks queries from firing on
 * every keystroke. Focus ring uses the gold accent.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  debounceMs = 300,
  className,
  disabled,
  autoFocus,
  ariaLabel,
}: SearchInputProps) {
  const [internal, setInternal] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Reflect external value changes (e.g. parent reset) into the internal field.
  useEffect(() => {
    setInternal(value);
  }, [value]);

  // Debounce: propagate `internal` upward after the configured pause.
  useEffect(() => {
    if (internal === value) return;
    if (debounceMs === 0) {
      onChangeRef.current(internal);
      return;
    }
    const t = setTimeout(() => onChangeRef.current(internal), debounceMs);
    return () => clearTimeout(t);
  }, [internal, value, debounceMs]);

  function clear() {
    setInternal("");
    onChangeRef.current("");
  }

  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="text"
        value={internal}
        onChange={(e) => setInternal(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel ?? placeholder}
        className={cn(
          "h-10 w-full rounded-md border border-input bg-card pl-9 pr-9 text-sm",
          "placeholder:text-muted-foreground",
          "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      />
      {internal && !disabled && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
