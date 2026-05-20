import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from 0 (or previous value) to `target` using
 * requestAnimationFrame with cubic ease-out.
 *
 * - Only animates on first mount or when target changes by > 10%.
 * - Returns 0 immediately if target is 0.
 */
export function useAnimatedNumber(target: number, duration = 800): number {
  const [display, setDisplay] = useState(0);
  const prevTarget = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (target === 0) {
      setDisplay(0);
      prevTarget.current = 0;
      return;
    }

    const from = prevTarget.current;
    const delta = target - from;

    // Skip animation if change is < 10% (avoid micro-jitter)
    if (from > 0 && Math.abs(delta / from) < 0.1) {
      setDisplay(target);
      prevTarget.current = target;
      return;
    }

    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Cubic ease-out: 1 - (1 - t)^3
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + delta * eased));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevTarget.current = target;
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return display;
}
