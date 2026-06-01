// ---------------------------------------------------------------------------
// chartGradients — reusable Recharts <defs> gradients for the premium
// "Command Center" look. Drop <ChartGradients /> as the FIRST child of any
// chart, then reference a fill/stroke via the exported id constants:
//
//   import { ChartGradients, CHART_GRAD } from "@/lib/chartGradients";
//   <AreaChart>
//     <ChartGradients />
//     <Area fill={`url(#${CHART_GRAD.areaPrimary})`} stroke={...} />
//   </AreaChart>
//
// All stops resolve to `rgb(var(--token))`, so they repaint on theme switch
// with zero per-component branching. IDs are global to the document, but
// gradient definitions are idempotent — rendering <ChartGradients /> in
// several charts on one page just re-declares the same ids harmlessly.
// ---------------------------------------------------------------------------

/** Gradient ids — reference as `url(#<id>)` in fill/stroke props. */
export const CHART_GRAD = {
  areaPrimary: "cc-grad-area-primary",
  areaSuccess: "cc-grad-area-success",
  areaWarning: "cc-grad-area-warning",
  barPrimary: "cc-grad-bar-primary",
  barSuccess: "cc-grad-bar-success",
  strokePrimary: "cc-grad-stroke-primary",
} as const;

/** Vertical area fade: opacity `top` → 0 at the baseline. */
function AreaFade({ id, token, top }: { id: string; token: string; top: number }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={`rgb(var(${token}))`} stopOpacity={top} />
      <stop offset="100%" stopColor={`rgb(var(${token}))`} stopOpacity={0} />
    </linearGradient>
  );
}

/** Vertical bar gradient: brighter top → softer base. */
function BarFade({ id, token }: { id: string; token: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={`rgb(var(${token}))`} stopOpacity={0.95} />
      <stop offset="100%" stopColor={`rgb(var(${token}))`} stopOpacity={0.5} />
    </linearGradient>
  );
}

/** Drop these defs into any chart to enable the gradient ids above. */
export function ChartGradients() {
  return (
    <defs>
      <AreaFade id={CHART_GRAD.areaPrimary} token="--primary" top={0.32} />
      <AreaFade id={CHART_GRAD.areaSuccess} token="--success" top={0.28} />
      <AreaFade id={CHART_GRAD.areaWarning} token="--warning" top={0.28} />
      <BarFade id={CHART_GRAD.barPrimary} token="--primary" />
      <BarFade id={CHART_GRAD.barSuccess} token="--success" />
      {/* Horizontal brand sweep for line strokes. */}
      <linearGradient id={CHART_GRAD.strokePrimary} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="rgb(var(--primary))" />
        <stop offset="100%" stopColor="rgb(var(--accent))" />
      </linearGradient>
    </defs>
  );
}
