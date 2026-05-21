import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Generic localStorage-backed form draft.
 *
 *   const [draft, setDraft, clearDraft, restored] = useFormDraft(
 *     `concept-draft:${user.id}`,           // null disables persistence
 *     { title: "", description: "" },        // shape + defaults
 *   );
 *
 * Behavior:
 *  - On mount: reads `storageKey` from localStorage; if a parsed value matches
 *    the same keys as `defaults`, merges it into state and sets `restored=true`.
 *  - On every state change: debounced write (300 ms) so we don't hammer
 *    localStorage on every keystroke.
 *  - `clear()`: wipes the storage key and resets state to `defaults`.
 *  - Pass `storageKey = null` to disable entirely (e.g. before user has loaded).
 *
 * Files / Blobs cannot be persisted — keep only serializable text fields
 * inside the draft shape. The caller is responsible for showing a hint if
 * the file needs to be re-attached.
 */
export function useFormDraft<T extends Record<string, unknown>>(
  storageKey: string | null,
  defaults: T,
  debounceMs = 300
): [T, React.Dispatch<React.SetStateAction<T>>, () => void, boolean] {
  // Stable reference to the defaults so the restore-from-storage effect doesn't
  // re-run every render (which would reload the persisted draft over fresh edits).
  const defaultsRef = useRef(defaults);
  const expectedKeys = useMemo(() => Object.keys(defaultsRef.current), []);

  const [state, setState] = useState<T>(defaultsRef.current);
  const [restored, setRestored] = useState(false);

  // Restore from storage on mount / when the key becomes available.
  // We only restore once per key — subsequent mounts that share the same key
  // would already have current state.
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;

      // Defensive merge — only adopt keys we know about, drop anything else.
      const merged = { ...defaultsRef.current } as T;
      let hasContent = false;
      for (const k of expectedKeys) {
        if (k in parsed) {
          (merged as Record<string, unknown>)[k] = parsed[k];
          const v = parsed[k];
          // "Has content" = any non-empty string / non-default truthy value.
          if (v !== "" && v !== null && v !== undefined) hasContent = true;
        }
      }
      if (hasContent) {
        setState(merged);
        setRestored(true);
      }
    } catch (err) {
      // Corrupted JSON or storage access denied — just ignore.
      console.warn("[useFormDraft] restore failed", err);
    }
  }, [storageKey, expectedKeys]);

  // Debounced write whenever state changes (and we have a key).
  // We skip the very first write (the one immediately after restore/default)
  // by checking a `dirty` flag set on any user-driven setState.
  const dirty = useRef(false);
  const wrappedSetState = useCallback<
    React.Dispatch<React.SetStateAction<T>>
  >((updater) => {
    dirty.current = true;
    setState(updater);
  }, []);

  useEffect(() => {
    if (!storageKey || !dirty.current) return;
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch (err) {
        console.warn("[useFormDraft] persist failed", err);
      }
    }, debounceMs);
    return () => window.clearTimeout(id);
  }, [state, storageKey, debounceMs]);

  const clear = useCallback(() => {
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    }
    dirty.current = false;
    setState(defaultsRef.current);
    setRestored(false);
  }, [storageKey]);

  return [state, wrappedSetState, clear, restored];
}
