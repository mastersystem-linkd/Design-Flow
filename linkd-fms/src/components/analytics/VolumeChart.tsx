import { useNavigate } from "react-router-dom";
import {
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
import { ROUTES } from "@/lib/routes";
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
import type { VolumePoint } from "@/hooks/useAnalytics";

export function VolumeChart({ data, title }: { data: VolumePoint[]; title?: string }) {
  const navigate = useNavigate();
  const animate = useChartAnimation();

  function handleBarClick() {
    navigate(ROUTES.concepts);
  }

  return (
    <Card className="h-full">
      <CardContent className="py-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">{title ?? "Volume"}</h3>
          <p className="text-xs text-muted-foreground">Submitted vs Approved vs Rejected</p>
        </div>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
            <BarChart data={data} barGap={3} barCategoryGap="26%">
              <ChartGradients />
              <CartesianGrid {...CHART_GRID_PROPS} />
              <XAxis dataKey="label" {...CHART_AXIS_PROPS} dy={4} />
              <YAxis allowDecimals={false} width={30} {...CHART_AXIS_PROPS} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                cursor={CHART_TOOLTIP_CURSOR}
              />
              <Legend wrapperStyle={CHART_LEGEND_STYLE} iconType="circle" iconSize={8} />
              <Bar
                dataKey="submitted"
                name="Submitted"
                fill={CHART_THEME.muted}
                radius={CHART_BAR_RADIUS}
                maxBarSize={44}
                cursor="pointer"
                onClick={handleBarClick}
                isAnimationActive={animate}
              />
              <Bar
                dataKey="approved"
                name="Approved"
                fill={`url(#${CHART_GRAD.barSuccess})`}
                radius={CHART_BAR_RADIUS}
                maxBarSize={44}
                cursor="pointer"
                onClick={handleBarClick}
                isAnimationActive={animate}
              />
              <Bar
                dataKey="rejected"
                name="Rejected"
                fill={CHART_THEME.destructive}
                opacity={0.7}
                radius={CHART_BAR_RADIUS}
                maxBarSize={44}
                cursor="pointer"
                onClick={handleBarClick}
                isAnimationActive={animate}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
