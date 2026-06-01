import { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  children?: React.ReactNode;
}

const THRESHOLDS: { min: number; stroke: string }[] = [
  { min: 80, stroke: "rgb(var(--success))" },
  { min: 60, stroke: "rgb(var(--warning))" },
  { min: 40, stroke: "rgb(217 119 6)" },
  { min: 0, stroke: "rgb(var(--destructive))" },
];

function fillColor(score: number): string {
  for (const t of THRESHOLDS) {
    if (score >= t.min) return t.stroke;
  }
  return THRESHOLDS[THRESHOLDS.length - 1].stroke;
}

export function ScoreRing({
  score,
  size = 96,
  strokeWidth = 6,
  className,
  children,
}: ScoreRingProps) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const finalOffset = c - (pct / 100) * c;

  const hasAnimated = useRef(false);
  const [offset, setOffset] = useState(c);

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;
    const id = requestAnimationFrame(() => setOffset(finalOffset));
    return () => cancelAnimationFrame(id);
  }, [finalOffset]);

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const currentOffset = reducedMotion ? finalOffset : offset;
  const color = fillColor(score);

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        {/* Dashed guide circle — the embroidery hoop */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--secondary))"
          strokeWidth={strokeWidth}
          strokeDasharray="4 4"
        />
        {/* Solid stitched fill arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={currentOffset}
          className="dark:drop-shadow-[0_0_6px_var(--brand-glow)]"
          style={
            reducedMotion
              ? undefined
              : {
                  transition: "stroke-dashoffset 1.2s ease-out",
                }
          }
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}
