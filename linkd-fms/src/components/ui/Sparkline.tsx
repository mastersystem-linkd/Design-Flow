import { useMemo } from "react";

interface Props {
  data: number[];
  color?: string;
  height?: number;
}

/**
 * Tiny SVG sparkline — no axes, no labels, just a smooth curve + gradient fill.
 * Uses quadratic bezier segments for smoothness.
 */
export function Sparkline({
  data,
  color = "rgb(var(--primary))",
  height = 32,
}: Props) {
  const viewW = 120;
  const viewH = height;
  const padY = 3; // top/bottom padding inside the viewBox

  const { linePath, fillPath, lastPoint, isEmpty } = useMemo(() => {
    // Need at least 2 points
    const pts = data.length >= 2 ? data : [0, 0];
    const allZero = pts.every((v) => v === 0);
    if (allZero) {
      const mid = viewH / 2;
      return {
        linePath: `M 0 ${mid} L ${viewW} ${mid}`,
        fillPath: `M 0 ${mid} L ${viewW} ${mid} L ${viewW} ${viewH} L 0 ${viewH} Z`,
        lastPoint: { x: viewW, y: mid },
        isEmpty: true,
      };
    }

    const max = Math.max(...pts);
    const min = Math.min(...pts);
    const range = max - min || 1;

    // Map data to x/y coordinates
    const points = pts.map((v, i) => ({
      x: (i / (pts.length - 1)) * viewW,
      y: padY + (1 - (v - min) / range) * (viewH - padY * 2),
    }));

    // Build smooth quadratic bezier path
    let line = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const cpx = (curr.x + next.x) / 2;
      line += ` Q ${curr.x} ${curr.y} ${cpx} ${(curr.y + next.y) / 2}`;
    }
    const last = points[points.length - 1];
    line += ` L ${last.x} ${last.y}`;

    // Fill: line path + bottom edge
    const fill = `${line} L ${viewW} ${viewH} L 0 ${viewH} Z`;

    return {
      linePath: line,
      fillPath: fill,
      lastPoint: last,
      isEmpty: false,
    };
  }, [data, viewH]);

  const gradientId = `sparkline-grad-${useMemo(() => Math.random().toString(36).slice(2, 8), [])}`;

  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor={color}
            stopOpacity={isEmpty ? 0.03 : 0.12}
          />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Gradient fill */}
      <path d={fillPath} fill={`url(#${gradientId})`} />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={isEmpty ? 1 : 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={isEmpty ? 0.2 : 1}
      />

      {/* End dot */}
      {!isEmpty && (
        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r={2.5}
          fill={color}
        />
      )}
    </svg>
  );
}
