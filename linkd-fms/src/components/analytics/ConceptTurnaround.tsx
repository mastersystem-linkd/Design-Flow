import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent } from "@/components/ui";
import {
  CHART_THEME,
  CHART_GRID_PROPS,
  CHART_AXIS_PROPS,
  CHART_TOOLTIP_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  useChartAnimation,
} from "@/lib/chartConfig";
import type { ApprovalSpeedItem } from "@/hooks/useAnalytics";

export function ConceptTurnaround({ data }: { data: ApprovalSpeedItem[] }) {
  const animate = useChartAnimation();
  const hasData = data.some((d) => d.avgHours > 0);
  const maxHours = Math.max(72, ...data.map((d) => d.avgHours));

  return (
    <Card>
      <CardContent className="py-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">
            Concept Review Turnaround
          </h3>
          <p className="text-xs text-muted-foreground">
            Average hours from submission to decision
          </p>
        </div>

        {!hasData ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Not enough data for trend
          </p>
        ) : (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="turnaroundArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(var(--primary))" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="rgb(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...CHART_GRID_PROPS} />
                <ReferenceArea y1={0} y2={24} fill={CHART_THEME.success} fillOpacity={0.06} />
                <ReferenceArea y1={24} y2={48} fill={CHART_THEME.warning} fillOpacity={0.06} />
                <ReferenceArea y1={48} y2={maxHours} fill={CHART_THEME.destructive} fillOpacity={0.06} />
                <XAxis dataKey="month" {...CHART_AXIS_PROPS} dy={4} />
                <YAxis
                  width={35}
                  {...CHART_AXIS_PROPS}
                  label={{
                    value: "hrs",
                    position: "insideTopLeft",
                    style: { fill: CHART_THEME.mutedForeground, fontSize: 10 },
                  }}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  formatter={(value) => [`${value}h`, "Average"]}
                />
                <Area
                  type="monotone"
                  dataKey="avgHours"
                  stroke={CHART_THEME.primary}
                  strokeWidth={2}
                  fill="url(#turnaroundArea)"
                  dot={{ r: 4, fill: CHART_THEME.primary, stroke: CHART_THEME.card, strokeWidth: 2 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={animate}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
