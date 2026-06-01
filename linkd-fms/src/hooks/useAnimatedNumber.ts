import { useEffect, useState } from "react";

/**
 * Count-up 0 → target, ~800ms cubic ease-out, ON MOUNT ONLY.
 *
 * - Refetches (target changes after the first animation) snap instantly.
 * - StrictMode-safe: `done` is state (re-initialized on remount) so the
 *   animation plays on the "real" mount, not just the discarded first one.
 * - Reduced-motion: shows the final number instantly.
 * - Pair with `tabular-nums` to prevent digit jitter.
 */
export function useAnimatedNumber(target: number, duration = 800): number {
  const [display, setDisplay] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (done) {
      setDisplay(target);
      return;
    }

    if (target === 0) return;

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      setDisplay(target);
      setDone(true);
      return;
    }

    const start = performance.now();
    let cancelled = false;

    function tick(now: number) {
      if (cancelled) return;
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(Math.round(eased * target));
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        setDone(true);
      }
    }

    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [target, duration, done]);

  return display;
}
