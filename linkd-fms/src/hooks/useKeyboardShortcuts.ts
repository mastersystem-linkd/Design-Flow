import { useEffect } from "react";

export interface Shortcut {
  /** Key name (e.g. 'j', 'k', 'Enter', 'Escape', '1', '/', '?'). */
  key: string;
  handler: () => void;
  description: string;
  category: string;
}

/**
 * Registers global keyboard shortcuts via a `keydown` listener.
 *
 * Shortcuts are ignored when:
 * - An input, textarea, or select is focused
 * - A Radix dialog/sheet is open (`[role="dialog"]`)
 *
 * @param shortcuts — list of shortcut definitions
 * @param enabled — pass false to temporarily disable all shortcuts
 */
export function useKeyboardShortcuts(
  shortcuts: Shortcut[],
  enabled = true
) {
  useEffect(() => {
    if (!enabled || shortcuts.length === 0) return;

    function handler(e: KeyboardEvent) {
      // Skip when typing in form elements
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Skip when a dialog or sheet is open
      if (document.querySelector("[role='dialog']")) return;

      // Skip if modifier keys are held (except Shift for ?)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      for (const s of shortcuts) {
        if (e.key === s.key) {
          e.preventDefault();
          s.handler();
          return;
        }
      }
    }

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [shortcuts, enabled]);
}
