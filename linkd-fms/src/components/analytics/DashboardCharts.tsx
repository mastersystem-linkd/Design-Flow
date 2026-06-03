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
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent } from "@/components/ui";
import {
  CHART_THEME,
  CHART_GRID_PROPS,
  CHART_AXIS_PROPS,
  CHART_TOOLTIP_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_CURSOR,
  CHART_LEGEND_STYLE,
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
  ].filter((s) => s.value > 0);
  const total = data.urgent + data.high + data.normal + data.low;

  return (
    <ChartShell title="Priority Mix" subtitle={`Active pipeline by priority · ${total} task${total === 1 ? "" : "s"}`}>
      {total === 0 ? (
        <EmptyChart text="No active tasks" />
      ) : (
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
            <PieChart>
              <Pie
                data={segments}
                dataKey="value"
                nameKey="name"
                innerRadius={56}
                outerRadius={84}
                paddingAngle={2}
                stroke="none"
                isAnimationActive={animate}
              >
                {segments.map((s, i) => (
                  <Cell key={i} fill={s.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
              <Legend wrapperStyle={CHART_LEGEND_STYLE} iconType="circle" iconSize={8} />
            </PieChart>
          </ResponsiveContainer>
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
        <div style={{ height: Math.max(180, top.length * 38) }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
            <BarChart data={top} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
              <CartesianGrid
                strokeDasharray="2 4"
                stroke={CHART_THEME.border}
                strokeOpacity={0.45}
                horizontal={false}
              />
              <XAxis type="number" domain={[0, 100]} {...CHART_AXIS_PROPS} />
              <YAxis type="category" dataKey="name" width={96} {...CHART_AXIS_PROPS} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                cursor={CHART_TOOLTIP_CURSOR}
              />
              <Bar dataKey="score" name="Composite" radius={[0, 5, 5, 0]} maxBarSize={22} isAnimationActive={animate}>
                {top.map((d, i) => (
                  <Cell key={i} fill={scoreFill(d.score)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartShell>
  );
}
