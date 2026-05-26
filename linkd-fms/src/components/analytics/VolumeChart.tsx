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
import type { VolumePoint } from "@/hooks/useAnalytics";

export function VolumeChart({ data, title }: { data: VolumePoint[]; title?: string }) {
  const navigate = useNavigate();

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
            <BarChart data={data} barGap={2}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgb(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fill: "rgb(var(--muted-foreground))", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "rgb(var(--muted-foreground))", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgb(var(--card))",
                  border: "1px solid rgb(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "rgb(var(--foreground))",
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                iconType="circle"
                iconSize={8}
              />
              <Bar
                dataKey="submitted"
                name="Submitted"
                fill="rgb(var(--muted))"
                opacity={0.5}
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={handleBarClick}
              />
              <Bar
                dataKey="approved"
                name="Approved"
                fill="rgb(var(--success))"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={handleBarClick}
              />
              <Bar
                dataKey="rejected"
                name="Rejected"
                fill="rgb(var(--destructive))"
                opacity={0.6}
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={handleBarClick}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
