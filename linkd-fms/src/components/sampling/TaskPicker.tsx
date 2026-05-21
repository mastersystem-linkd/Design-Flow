import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import { useTasks } from "@/hooks/useTasks";
import { Badge } from "@/components/ui";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { TaskWithRelations } from "@/types/database";

// ============================================================================
// Types
// ============================================================================

/**
 * Minimal task shape the picker emits to its parent. Parents only need this
 * for auto-fill (party name, uid); they fetch full details on-demand via
 * useTaskDetail if they want more.
 */
export interface TaskSummary {
  id: string;
  task_code: string | null;
  concept: string | null;
  status: string;
  description: string | null;
  assigned_to: string | null;
  client_party_name: string | null;
  assignee_name: string | null;
  qty: number | null;
}

interface TaskPickerProps {
  /** Currently selected task id, or null when no task is linked. */
  value: string | null;
  /**
   * Fired when the user picks a task or clears the selection. `task` is the
   * full summary on pick, null on clear. Parent uses it for auto-fill.
   */
  onChange: (taskId: string | null, task: TaskSummary | null) => void;
  /**
   * Optional party-name filter — narrows the dropdown to that client's
   * tasks. Pass the form's party_name to keep the two fields aligned.
   * Match is case-insensitive substring.
   */
  clientFilter?: string;
  /** Compact label (default: "Linked task"). */
  label?: string;
  className?: string;
  /** Disable the picker (form is loading / read-only mode). */
  disabled?: boolean;
}

// ============================================================================
// Component
// ============================================================================

/**
 * TaskPicker — searchable dropdown of active tasks for the sampling form.
 *
 * Why: nobody at the printing machine remembers a 20-char code like
 * `DF 10-X0526-COUN-10M`. The picker shows the same task list as the kanban,
 * narrowed by the form's party-name filter, so the coordinator selects from
 * what they already see on screen. UID auto-fills from `task_code`.
 *
 * Walk-in samples that don't have a brief can still be logged — the parent
 * keeps the "Custom UID" text field below this picker, and the picker tolerates
 * `value === null`.
 */
export function TaskPicker({
  value,
  onChange,
  clientFilter,
  label = "Linked task",
  className,
  disabled,
}: TaskPickerProps) {
  // Pull live task list. We fetch the whole set (already filtered by RLS) and
  // do search in-memory — the kanban already does this for thousands of rows.
  const { tasks, isLoading } = useTasks();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // 300ms debounce on the search input — typing fast shouldn't re-filter every
  // keystroke on the full task list.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  // Close on outside click — standard popover behaviour.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Filter + sort ─────────────────────────────────────────────────────
  const filteredTasks = useMemo(() => {
    let list = tasks;

    // Hide soft-deleted by upstream RLS already; we also drop done/sampling
    // since the coordinator is logging samples for in-flight work. Designers
    // sometimes want to log against a recently-completed task though, so we
    // keep "done" if there's no other filter active.
    list = list.filter((t) => t.status !== "approved");

    if (clientFilter) {
      const needle = clientFilter.toLowerCase();
      list = list.filter((t) =>
        (t.client?.party_name ?? "").toLowerCase().includes(needle)
      );
    }

    if (debouncedQuery) {
      const q = debouncedQuery.toLowerCase();
      list = list.filter((t) => {
        const hay = [
          t.task_code ?? "",
          t.concept ?? "",
          t.description ?? "",
          t.client?.party_name ?? "",
          t.assignee?.full_name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    // Most recent first — matches the kanban default sort.
    list = [...list].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    // Cap at 50 — anything beyond that is scroll-fatigue and the user should
    // type a more specific search.
    return list.slice(0, 50);
  }, [tasks, clientFilter, debouncedQuery]);

  // Selected task — look up in the full task list, not just the filtered
  // slice. This way the chip stays accurate even if the user types a search
  // that excludes the currently-selected task.
  const selectedTask = useMemo(() => {
    if (!value) return null;
    return tasks.find((t) => t.id === value) ?? null;
  }, [tasks, value]);

  // Reset highlight when the visible list changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery, clientFilter]);

  // Scroll the active row into view as the user keyboard-pages.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const row = listRef.current.querySelector<HTMLElement>(
      `[data-row-index="${activeIndex}"]`
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  // Focus the search input as soon as the dropdown opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function pick(task: TaskWithRelations) {
    const summary = toSummary(task);
    onChange(task.id, summary);
    setOpen(false);
    setQuery("");
  }

  function clear() {
    onChange(null, null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filteredTasks.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const t = filteredTasks[activeIndex];
      if (t) pick(t);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className={cn("relative", className)} ref={wrapperRef}>
      {label && (
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </label>
      )}

      {/* Trigger — either the selected chip or a "Pick a task" button. */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 py-2 text-left text-sm transition-colors",
          "hover:bg-secondary/40 focus:outline-none focus:ring-2 focus:ring-ring focus-visible:ring-2",
          open && "ring-2 ring-ring",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        {selectedTask ? (
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-mono text-xs text-primary">
                {selectedTask.task_code ?? "—"}
              </span>
              <Badge
                className={cn(
                  "shrink-0 px-1.5 py-0 text-[9px]",
                  STATUS_COLORS[selectedTask.status]
                )}
              >
                {STATUS_LABELS[selectedTask.status] ?? selectedTask.status}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {selectedTask.concept ?? "No concept"}
            </p>
          </div>
        ) : (
          <span className="text-muted-foreground">
            {clientFilter
              ? `Pick a task for ${clientFilter}…`
              : "Pick a task (optional)"}
          </span>
        )}
        <div className="flex shrink-0 items-center gap-1">
          {selectedTask && !disabled && (
            <span
              role="button"
              aria-label="Clear linked task"
              onClick={(e) => {
                e.stopPropagation();
                clear();
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

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          {/* Search row */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search task code, concept, designer, or client…"
              className="w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
            />
            {isLoading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Results */}
          <ul
            ref={listRef}
            className="max-h-[280px] overflow-y-auto"
            role="listbox"
          >
            {isLoading && filteredTasks.length === 0 ? (
              <SkeletonRows />
            ) : filteredTasks.length === 0 ? (
              <EmptyRow
                clientFilter={clientFilter}
                hasQuery={!!debouncedQuery}
              />
            ) : (
              filteredTasks.map((t, i) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  active={i === activeIndex}
                  selected={t.id === value}
                  onHover={() => setActiveIndex(i)}
                  onPick={() => pick(t)}
                  rowIndex={i}
                />
              ))
            )}
          </ul>

          {/* Bottom helper — clear option for walk-in samples. */}
          {value && (
            <div className="border-t border-border bg-secondary/30 px-3 py-2">
              <button
                type="button"
                onClick={clear}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Clear selection — log a walk-in sample without a task
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function TaskRow({
  task,
  active,
  selected,
  onHover,
  onPick,
  rowIndex,
}: {
  task: TaskWithRelations;
  active: boolean;
  selected: boolean;
  onHover: () => void;
  onPick: () => void;
  rowIndex: number;
}) {
  const partyName = task.client?.party_name ?? "";
  const designerName = task.assignee?.full_name ?? "Unassigned";
  const qty = task.qty != null ? `${task.qty}m` : "—";

  return (
    <li
      data-row-index={rowIndex}
      role="option"
      aria-selected={selected}
      onMouseEnter={onHover}
      onClick={onPick}
      className={cn(
        "flex cursor-pointer items-start gap-2 border-b border-border/50 px-3 py-2 last:border-b-0",
        active && "bg-primary/[0.06]",
        selected && "bg-primary/10"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-xs font-medium text-primary">
            {task.task_code ?? "—"}
          </span>
          <Badge
            className={cn(
              "shrink-0 px-1.5 py-0 text-[9px]",
              STATUS_COLORS[task.status]
            )}
          >
            {STATUS_LABELS[task.status] ?? task.status}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-sm font-medium text-foreground">
          {task.concept ?? "No concept"}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {[partyName, designerName, qty].filter(Boolean).join(" · ")}
        </p>
      </div>
      {selected && (
        <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
      )}
    </li>
  );
}

function SkeletonRows() {
  return (
    <li className="px-3 py-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="mb-2 space-y-1">
          <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-secondary/60" />
          <div className="h-2.5 w-1/2 animate-pulse rounded bg-secondary/40" />
        </div>
      ))}
    </li>
  );
}

function EmptyRow({
  clientFilter,
  hasQuery,
}: {
  clientFilter?: string;
  hasQuery: boolean;
}) {
  return (
    <li className="px-4 py-6 text-center text-xs text-muted-foreground">
      {hasQuery ? (
        <>No matching tasks.</>
      ) : clientFilter ? (
        <>No active tasks for {clientFilter}.</>
      ) : (
        <>No active tasks right now.</>
      )}
    </li>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function toSummary(t: TaskWithRelations): TaskSummary {
  return {
    id: t.id,
    task_code: t.task_code,
    concept: t.concept,
    status: t.status,
    description: t.description ?? null,
    assigned_to: t.assigned_to,
    client_party_name: t.client?.party_name ?? null,
    assignee_name: t.assignee?.full_name ?? null,
    qty: t.qty,
  };
}
