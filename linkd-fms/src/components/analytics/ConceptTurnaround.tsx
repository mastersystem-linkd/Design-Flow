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
import type { ApprovalSpeedItem } from "@/hooks/useAnalytics";

export function ConceptTurnaround({ data }: { data: ApprovalSpeedItem[] }) {
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
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgb(var(--border))"
                  vertical={false}
                />
                <ReferenceArea y1={0} y2={24} fill="rgb(var(--success))" fillOpacity={0.06} />
                <ReferenceArea y1={24} y2={48} fill="rgb(var(--warning))" fillOpacity={0.06} />
                <ReferenceArea y1={48} y2={maxHours} fill="rgb(var(--destructive))" fillOpacity={0.06} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "rgb(var(--muted-foreground))", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "rgb(var(--muted-foreground))", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={35}
                  label={{
                    value: "hrs",
                    position: "insideTopLeft",
                    style: {
                      fill: "rgb(var(--muted-foreground))",
                      fontSize: 10,
                    },
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgb(var(--card))",
                    border: "1px solid rgb(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "rgb(var(--foreground))",
                  }}
                  formatter={(value) => [`${value}h`, "Average"]}
                />
                <Area
                  type="monotone"
                  dataKey="avgHours"
                  stroke="rgb(var(--primary))"
                  strokeWidth={2}
                  fill="rgb(var(--primary))"
                  fillOpacity={0.05}
                  dot={{ r: 4, fill: "rgb(var(--primary))", stroke: "rgb(var(--card))", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
