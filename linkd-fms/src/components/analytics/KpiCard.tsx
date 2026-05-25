import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, Sparkline } from "@/components/ui";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
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
  /** 7 data points for sparkline (last 7 periods). */
  sparklineData?: number[];
  /** Animate the numeric value on mount. Only works if `value` is a number. */
  animateValue?: boolean;
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
  sparklineData,
  animateValue,
}: Props) {
  const trend = metric.trend;
  const isNew = metric.previous === 0 && metric.current > 0;
  const isPositive = invertTrend ? trend < 0 : trend > 0;
  const isNegative = invertTrend ? trend > 0 : trend < 0;

  // Animated counter — only for plain numbers (not "85%" or "3.2d")
  const numericTarget =
    animateValue && typeof value === "number" ? value : 0;
  const animated = useAnimatedNumber(numericTarget);
  const displayValue =
    animateValue && typeof value === "number" ? animated : value;

  // Sparkline color derived from the trend
  const sparkColor = isNegative
    ? "rgb(var(--destructive))"
    : isPositive
      ? "rgb(var(--success))"
      : "rgb(var(--primary))";

  const card = (
    <Card
      className={cn(
        "h-full transition-all duration-200",
        "hover:ring-1 hover:ring-primary/20 hover:-translate-y-0.5 hover:shadow-md",
        to && "cursor-pointer"
      )}
    >
      {/* Mobile-first padding + spacing: cards are dense at small widths
           (py-2.5, smaller icon, no sparkline placeholder when there's
           no data) and roomy on sm+ where there's screen for it. The
           sparkline only reserves vertical space WHEN it has data —
           empty cards stay compact instead of mandating a 28px gap. */}
      <CardContent className="flex h-full items-start justify-between py-2.5 sm:py-3">
        <div className="flex min-w-0 flex-1 flex-col space-y-1.5 sm:space-y-2">
          <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg sm:h-8 sm:w-8", tintClass)}>
            {icon}
          </div>
          <div>
            <p className={cn("text-xl font-bold tabular-nums sm:text-2xl", valueColor ?? "text-foreground")}>
              {displayValue}
            </p>
            <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
            {sub && (
              <p className="text-[11px] text-muted-foreground/70">{sub}</p>
            )}
          </div>

          {/* Sparkline — only rendered when there's actual data. Empty
               cards skip the placeholder so mobile rows don't stack tall
               with whitespace. */}
          {sparklineData && sparklineData.length >= 2 && (
            <div className="mt-auto pt-1">
              <Sparkline data={sparklineData} color={sparkColor} height={28} />
            </div>
          )}
        </div>

        {/* Trend pill */}
        <div className="shrink-0 ml-2 sm:ml-3">
          {isNew ? (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary sm:px-2">
              New
            </span>
          ) : trend !== 0 ? (
            <span
              className={cn(
                "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:px-2",
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
        </div>
      </CardContent>
    </Card>
  );

  if (to) return <Link to={to}>{card}</Link>;
  return card;
}
