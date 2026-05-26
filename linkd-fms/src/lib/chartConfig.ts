// ---------------------------------------------------------------------------
// chartConfig — shared Recharts styling pulled from CSS variables.
//
// Every chart in the app should import these instead of inline hex/rgba
// literals. Because the colors resolve to `rgb(var(--token))`, switching
// theme repaints the chart without any per-component branching.
//
// Usage:
//   import { CHART_THEME, CHART_GRID_PROPS, CHART_AXIS_PROPS,
//            CHART_TOOLTIP_STYLE, CHART_BAR_RADIUS } from "@/lib/chartConfig";
//
//   <BarChart>
//     <CartesianGrid {...CHART_GRID_PROPS} />
//     <XAxis dataKey="label" {...CHART_AXIS_PROPS} />
//     <YAxis {...CHART_AXIS_PROPS} />
//     <Tooltip contentStyle={CHART_TOOLTIP_STYLE}
//              cursor={{ fill: CHART_THEME.primaryLight }} />
//     <Bar dataKey="value" fill={CHART_THEME.primary} radius={CHART_BAR_RADIUS} />
//   </BarChart>
// ---------------------------------------------------------------------------

/** Tokenised colours for Recharts `fill` / `stroke` props. */
export const CHART_THEME = {
  primary: "rgb(var(--primary))",
  primaryLight: "rgb(var(--primary) / 0.2)",
  primaryFaint: "rgb(var(--primary) / 0.08)",

  success: "rgb(var(--success))",
  successLight: "rgb(var(--success) / 0.15)",

  warning: "rgb(var(--warning))",
  warningLight: "rgb(var(--warning) / 0.15)",

  destructive: "rgb(var(--destructive))",
  destructiveLight: "rgb(var(--destructive) / 0.15)",

  muted: "rgb(var(--muted) / 0.3)",
  mutedSolid: "rgb(var(--muted))",

  foreground: "rgb(var(--foreground))",
  mutedForeground: "rgb(var(--muted-foreground))",

  border: "rgb(var(--border))",
  card: "rgb(var(--card))",
} as const;

/** CartesianGrid defaults — subtle dotted divider in both themes. */
export const CHART_GRID_PROPS = {
  strokeDasharray: "3 3",
  stroke: CHART_THEME.border,
  strokeOpacity: 0.5,
  vertical: false,
} as const;

/** Axis tick text — uses muted-foreground so it auto-flips. */
export const CHART_AXIS_TICK = {
  fontSize: 11,
  fill: CHART_THEME.mutedForeground,
} as const;

/** Default XAxis / YAxis props — no axis line, no tick marks, tokenised tick. */
export const CHART_AXIS_PROPS = {
  axisLine: false,
  tickLine: false,
  tick: CHART_AXIS_TICK,
} as const;

/** Tooltip surface — matches the card background so dark-mode tooltips
 *  don't render as a white floater against the dark canvas. */
export const CHART_TOOLTIP_STYLE = {
  background: CHART_THEME.card,
  border: `1px solid ${CHART_THEME.border}`,
  borderRadius: 12,
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  fontSize: 12,
  color: CHART_THEME.foreground,
} as const;

/** Top-rounded corners for vertical bars. */
export const CHART_BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];

/** Legend wrapper style — pads the top a touch so legend doesn't kiss the chart. */
export const CHART_LEGEND_STYLE = {
  fontSize: 11,
  paddingTop: 8,
  color: CHART_THEME.mutedForeground,
} as const;
