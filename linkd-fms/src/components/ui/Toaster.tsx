import { useEffect, useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastOptions {
  /** ms until auto-dismiss. 0 = sticky. Default: 4000 for success/info, 0 for error, 6000 for warning. */
  durationMs?: number;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  durationMs: number;
}

// ============================================================================
// Module-level store (small pub/sub)
// ============================================================================

type Listener = (items: ToastItem[]) => void;
let items: ToastItem[] = [];
const listeners = new Set<Listener>();

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 0, // sticky — user must dismiss
};

function emit() {
  for (const l of listeners) l([...items]);
}

function push(
  type: ToastType,
  message: string,
  opts?: ToastOptions
): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const durationMs = opts?.durationMs ?? DEFAULT_DURATIONS[type];
  // Newest first (visible at the bottom of a flex-col-reverse stack)
  items = [{ id, type, message, durationMs }, ...items].slice(0, 8);
  emit();
  return id;
}

function dismissOne(id: string) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function dismissAll() {
  items = [];
  emit();
}

/**
 * Global toast API — import anywhere.
 *
 *   toast.success("Task created ✓")
 *   toast.error("Something went wrong", { durationMs: 0 })  // sticky
 */
export const toast = {
  success: (msg: string, opts?: ToastOptions) => push("success", msg, opts),
  error: (msg: string, opts?: ToastOptions) => push("error", msg, opts),
  info: (msg: string, opts?: ToastOptions) => push("info", msg, opts),
  warning: (msg: string, opts?: ToastOptions) => push("warning", msg, opts),
  dismiss: dismissOne,
  dismissAll,
};

/** Hook form — same API, useful when you want to grab it once per component. */
export function useToast() {
  return toast;
}

// ============================================================================
// Toaster — mount once in App
// ============================================================================

const VARIANT: Record<
  ToastType,
  {
    icon: React.ComponentType<{ className?: string }>;
    border: string;
    iconColor: string;
    role: "status" | "alert";
    ariaLive: "polite" | "assertive";
  }
> = {
  success: {
    icon: CheckCircle2,
    border: "border-l-emerald-500",
    iconColor: "text-emerald-600",
    role: "status",
    ariaLive: "polite",
  },
  error: {
    icon: AlertCircle,
    border: "border-l-destructive",
    iconColor: "text-destructive",
    role: "alert",
    ariaLive: "assertive",
  },
  info: {
    icon: Info,
    border: "border-l-sky-500",
    iconColor: "text-sky-600",
    role: "status",
    ariaLive: "polite",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-l-amber-500",
    iconColor: "text-amber-700",
    role: "status",
    ariaLive: "polite",
  },
};

export function Toaster() {
  const [list, setList] = useState<ToastItem[]>(items);

  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);

  // Up to 3 visible at a time — newest at the bottom on desktop, at the top on mobile.
  const visible = list.slice(0, 3);
  const overflow = list.length - visible.length;

  return (
    <div
      // Mobile: pinned to top, full-width with side padding.
      // ≥sm: pinned to bottom-right, narrow column.
      className="pointer-events-none fixed inset-x-3 top-3 z-[100] flex flex-col gap-2 sm:bottom-5 sm:left-auto sm:right-5 sm:top-auto sm:flex-col-reverse sm:items-end"
    >
      {visible.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
      {overflow > 0 && (
        <div className="pointer-events-auto rounded-md bg-black/80 px-2.5 py-1 text-[11px] text-cream shadow-md">
          +{overflow} more
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Individual card
// ============================================================================

function ToastCard({ item }: { item: ToastItem }) {
  const [exiting, setExiting] = useState(false);
  const v = VARIANT[item.type];
  const Icon = v.icon;

  // Auto-dismiss timer
  useEffect(() => {
    if (!item.durationMs) return;
    const t = setTimeout(() => beginExit(), item.durationMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.durationMs]);

  function beginExit() {
    setExiting(true);
    // Wait for the fade-out animation, then remove from store.
    setTimeout(() => toast.dismiss(item.id), 200);
  }

  return (
    <div
      role={v.role}
      aria-live={v.ariaLive}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border border-border border-l-4 bg-card px-3.5 py-3 shadow-lg",
        v.border,
        exiting ? "animate-fade-out" : "animate-slide-in-right"
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", v.iconColor)} />
      <p className="flex-1 text-sm leading-snug text-foreground">{item.message}</p>
      <button
        type="button"
        onClick={beginExit}
        className="-mr-1 shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
