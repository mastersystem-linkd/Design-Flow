import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

// ============================================================================
// T-Shirt Loader
// ============================================================================
//
// A full-screen overlay that shows a waving t-shirt silhouette + caption.
// Ported from a vanilla HTML/CSS/JS snippet into a React component so it
// can be conditionally rendered like everything else in the app, and made
// theme-aware so it doesn't look wrong in dark mode.
//
// Two ways to use it:
//
//   1. As a controlled component — render it when `open` is true.
//      Useful for page-scoped loading states.
//
//        <TShirtLoader open={isLoading} text="Saving brief…" />
//
//   2. As a global imperative loader — wrap `<App>` with <LoaderProvider />
//      and call show/hide from anywhere via `useLoader()`.
//
//        const { show, hide } = useLoader();
//        show("Fetching report…");
//        try { await fetchReport(); } finally { hide(); }
//
//      Only one global loader is rendered at a time; nested show() calls
//      just update the caption and increment a counter, so the loader stays
//      up until every matching hide() has run.
// ============================================================================

interface TShirtLoaderProps {
  /** Show / hide the overlay. */
  open: boolean;
  /** Caption underneath the t-shirt. Defaults to "Loading…". */
  text?: string;
  /**
   * Where to render. Defaults to portal-into-body so the overlay sits above
   * everything (sidebar, dialogs, drawers). Pass `false` to render in place
   * for embedded loaders (e.g. inside a single card).
   */
  portal?: boolean;
  className?: string;
}

export function TShirtLoader({
  open,
  text = "Loading…",
  portal = true,
  className,
}: TShirtLoaderProps) {
  if (!open) return null;

  const node = (
    <div
      role="status"
      aria-live="polite"
      aria-label={text}
      className={cn(
        "fixed inset-0 z-[9999] flex flex-col items-center justify-center",
        // Match the page background so the neck cutout (which inherits the
        // overlay color) blends in. Slight transparency + backdrop-blur so
        // the user can still tell something is behind it.
        "bg-background/95 backdrop-blur-sm",
        "transition-opacity duration-500",
        className
      )}
    >
      {/* T-shirt silhouette — pure CSS, no SVG. The neck cutout is positioned
          absolutely with the same background as the overlay so it punches a
          hole through the shirt collar. */}
      <div className="tshirt-loader relative h-[100px] w-[80px]">
        {/* Body */}
        <div className="absolute bottom-0 h-[80px] w-full rounded-t-[10px] bg-foreground/85 dark:bg-foreground/70">
          {/* Neck cutout */}
          <div className="absolute left-1/2 top-0 h-[15px] w-[30px] -translate-x-1/2 rounded-b-[15px] bg-background" />
        </div>
        {/* Left sleeve */}
        <div className="absolute -left-[25px] top-[20px] h-[20px] w-[30px] origin-right rotate-[20deg] rounded-l-[10px] rounded-tr-[5px] bg-foreground/85 dark:bg-foreground/70" />
        {/* Right sleeve */}
        <div className="absolute -right-[25px] top-[20px] h-[20px] w-[30px] origin-left -rotate-[20deg] rounded-r-[10px] rounded-tl-[5px] bg-foreground/85 dark:bg-foreground/70" />
      </div>

      <p className="mt-5 text-base font-medium uppercase tracking-[0.15em] text-foreground">
        {text}
      </p>
    </div>
  );

  // Portal so the overlay z-index always wins over modal/drawer stacks.
  if (portal && typeof document !== "undefined") {
    return createPortal(node, document.body);
  }
  return node;
}

// ============================================================================
// LoaderProvider — global imperative API
// ============================================================================
//
// Reference-counted: nested show() calls don't trigger duplicate overlays;
// the loader stays visible until every matching hide() has fired. This makes
// it safe to wrap multiple parallel awaits without coordinating them.

interface LoaderContextValue {
  show: (text?: string) => void;
  hide: () => void;
}

const LoaderContext = createContext<LoaderContextValue | null>(null);

export function LoaderProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const [text, setText] = useState<string>("Loading…");

  const show = useCallback((next?: string) => {
    setCount((c) => c + 1);
    if (next) setText(next);
  }, []);
  const hide = useCallback(() => {
    setCount((c) => Math.max(0, c - 1));
  }, []);

  return (
    <LoaderContext.Provider value={{ show, hide }}>
      {children}
      <TShirtLoader open={count > 0} text={text} />
    </LoaderContext.Provider>
  );
}

/**
 * Imperative loader handle. Throws when used outside <LoaderProvider />.
 */
export function useLoader(): LoaderContextValue {
  const ctx = useContext(LoaderContext);
  if (!ctx) {
    throw new Error(
      "useLoader must be called inside <LoaderProvider />. Wrap your app root in main.tsx."
    );
  }
  return ctx;
}
