import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { KpiMetric } from "@/hooks/useAnalytics";

interface Props {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  metric: KpiMetric;
  tintClass: string;
  invertTrend?: boolean;
  valueColor?: string;
  to?: string;
  /** Secondary context line below the label (e.g. "by 4 designers"). */
  sub?: string;
}

export function KpiCard({
  icon,
  label,
  value,
  metric,
  tintClass,
  invertTrend,
  valueColor,
  to,
  sub,
}: Props) {
  const trend = metric.trend;
  const isNew = metric.previous === 0 && metric.current > 0;
  const isPositive = invertTrend ? trend < 0 : trend > 0;
  const isNegative = invertTrend ? trend > 0 : trend < 0;

  const card = (
    <Card
      className={cn(
        "transition-all duration-200",
        "hover:ring-1 hover:ring-primary/20 hover:-translate-y-0.5 hover:shadow-md",
        to && "cursor-pointer"
      )}
    >
      <CardContent className="flex items-start justify-between py-4">
        <div className="space-y-2">
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tintClass)}>
            {icon}
          </div>
          <div>
            <p className={cn("text-2xl font-bold tabular-nums", valueColor ?? "text-foreground")}>
              {value}
            </p>
            <p className="text-sm text-muted-foreground">{label}</p>
            {sub && (
              <p className="text-[11px] text-muted-foreground/70">{sub}</p>
            )}
          </div>
        </div>

        {/* Trend pill */}
        {isNew ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            New
          </span>
        ) : trend !== 0 ? (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              isPositive && "bg-success/10 text-success",
              isNegative && "bg-destructive/10 text-destructive",
              !isPositive && !isNegative && "bg-secondary text-muted-foreground"
            )}
          >
            {isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : isNegative ? (
              <TrendingDown className="h-3 w-3" />
            ) : null}
            {Math.abs(trend)}%
          </span>
        ) : null}
      </CardContent>
    </Card>
  );

  if (to) return <Link to={to}>{card}</Link>;
  return card;
}
