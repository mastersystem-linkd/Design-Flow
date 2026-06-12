// Extra dashboard charts — a priority donut + cycle-time column chart for the
// Task Dashboard, and a composite-score bar chart for Scorecards. All pull
// their styling from the shared chartConfig so they match the existing
// VolumeChart / PipelineHealth look and repaint correctly on theme switch.
import {
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import { Card, CardContent } from "@/components/ui";
import {
  CHART_THEME,
  CHART_GRID_PROPS,
  CHART_AXIS_PROPS,
  CHART_TOOLTIP_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_CURSOR,
  CHART_BAR_RADIUS,
  useChartAnimation,
} from "@/lib/chartConfig";
import { ChartGradients, CHART_GRAD } from "@/lib/chartGradients";

function ChartShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardContent className="py-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

// ── Priority Mix — donut of the active pipeline by priority ──────────────────
export function PriorityDonut({
  data,
}: {
  data: { urgent: number; high: number; normal: number; low: number };
}) {
  const animate = useChartAnimation();
  const segments = [
    { name: "Urgent", value: data.urgent, color: CHART_THEME.destructive },
    { name: "High", value: data.high, color: CHART_THEME.warning },
    { name: "Normal", value: data.normal, color: CHART_THEME.primary },
    { name: "Low", value: data.low, color: CHART_THEME.mutedSolid },
  ];
  const total = data.urgent + data.high + data.normal + data.low;
  const shown = segments.filter((s) => s.value > 0);

  return (
    <ChartShell title="Priority Mix" subtitle={`Active pipeline by priority · ${total} task${total === 1 ? "" : "s"}`}>
      {total === 0 ? (
        <EmptyChart text="No active tasks" />
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
          {/* Donut with a center total in the hole */}
          <div className="relative h-[200px] w-[200px] shrink-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
              <PieChart>
                <Pie
                  data={shown}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={92}
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive={animate}
                >
                  {shown.map((s, i) => (
                    <Cell key={i} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  formatter={(value) => {
                    const v = Number(value);
                    return `${v} task${v === 1 ? "" : "s"} (${total ? Math.round((v / total) * 100) : 0}%)`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold tabular-nums text-foreground">{total}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">active</span>
            </div>
          </div>

          {/* Legend — only priorities that actually have tasks. High/Low are
              unused in this workflow, so listing them just adds dead 0% rows. */}
          <ul className="flex w-full flex-col gap-2.5">
            {shown.map((s) => {
              const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
              return (
                <li key={s.name} className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="text-sm font-medium text-foreground">{s.name}</span>
                  <span className="ml-auto flex items-baseline gap-2 tabular-nums">
                    <span className="text-sm font-bold text-foreground">{s.value}</span>
                    <span className="w-9 text-right text-xs text-muted-foreground">{pct}%</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </ChartShell>
  );
}

// ── Cycle Time — column chart of completed tasks by days-to-finish bucket ─────
export function CycleTimeChart({ data }: { data: { label: string; count: number }[] }) {
  const animate = useChartAnimation();
  const total = data.reduce((s, x) => s + x.count, 0);

  return (
    <ChartShell title="Cycle Time" subtitle="Completed tasks by days to finish">
      {total === 0 ? (
        <EmptyChart text="No completions in this period" />
      ) : (
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
            <BarChart data={data} barCategoryGap="22%">
              <ChartGradients />
              <CartesianGrid {...CHART_GRID_PROPS} />
              <XAxis dataKey="label" {...CHART_AXIS_PROPS} dy={4} />
              <YAxis allowDecimals={false} width={28} {...CHART_AXIS_PROPS} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                cursor={CHART_TOOLTIP_CURSOR}
              />
              <Bar
                dataKey="count"
                name="Tasks"
                fill={`url(#${CHART_GRAD.barPrimary})`}
                radius={CHART_BAR_RADIUS}
                maxBarSize={48}
                isAnimationActive={animate}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartShell>
  );
}

// ── Composite Scores — horizontal bars per designer (Scorecards) ─────────────
function scoreFill(score: number): string {
  if (score >= 80) return CHART_THEME.success;
  if (score >= 60) return CHART_THEME.primary;
  if (score >= 40) return CHART_THEME.warning;
  return CHART_THEME.destructive;
}

export function ScoreBars({
  data,
  limit = 8,
}: {
  data: { name: string; score: number }[];
  limit?: number;
}) {
  const animate = useChartAnimation();
  // `data` arrives pre-sorted (active first by composite). Keep only scored
  // designers so the chart reads as a clean leaderboard.
  const top = data.filter((d) => d.score > 0).slice(0, limit);

  return (
    <ChartShell title="Composite Scores" subtitle="Top designers this period (out of 100)">
      {top.length === 0 ? (
        <EmptyChart text="No scored activity this period" />
      ) : (
        <div style={{ height: Math.max(180, top.length * 44) }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
            <BarChart data={top} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 8 }}>
              <CartesianGrid
                strokeDasharray="2 4"
                stroke={CHART_THEME.border}
                strokeOpacity={0.45}
                horizontal={false}
              />
              <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} {...CHART_AXIS_PROPS} />
              <YAxis type="category" dataKey="name" width={84} {...CHART_AXIS_PROPS} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                cursor={CHART_TOOLTIP_CURSOR}
                formatter={(value) => [`${Number(value)} / 100`, "Composite"]}
              />
              <Bar dataKey="score" name="Composite" radius={[0, 6, 6, 0]} maxBarSize={26} isAnimationActive={animate}>
                {top.map((d, i) => (
                  <Cell key={i} fill={scoreFill(d.score)} />
                ))}
                <LabelList
                  dataKey="score"
                  position="right"
                  offset={8}
                  style={{
                    fill: "rgb(var(--foreground))",
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartShell>
  );
}
