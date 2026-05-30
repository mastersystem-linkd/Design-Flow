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
  metric?: KpiMetric;
  tintClass: string;
  invertTrend?: boolean;
  valueColor?: string;
  to?: string;
  sub?: string;
  sparklineData?: number[];
  animateValue?: boolean;
  flat?: boolean;
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
  flat,
}: Props) {
  const trend = metric?.trend ?? 0;
  const isNew = metric ? metric.previous === 0 && metric.current > 0 : false;
  const isPositive = metric ? (invertTrend ? trend < 0 : trend > 0) : false;
  const isNegative = metric ? (invertTrend ? trend > 0 : trend < 0) : false;

  const numericTarget =
    animateValue && typeof value === "number" ? value : 0;
  const animated = useAnimatedNumber(numericTarget);
  const displayValue =
    animateValue && typeof value === "number" ? animated : value;

  const sparkColor = isNegative
    ? "rgb(var(--destructive))"
    : isPositive
      ? "rgb(var(--success))"
      : "rgb(var(--primary))";

  const trendPill = !metric ? null : isNew ? (
    <span className="flex items-center gap-0.5 rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
      <TrendingUp className="h-2.5 w-2.5" />
    </span>
  ) : trend !== 0 ? (
    <span
      className={cn(
        "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
        isPositive && "bg-success/10 text-success",
        isNegative && "bg-destructive/10 text-destructive",
        !isPositive && !isNegative && "bg-secondary text-muted-foreground"
      )}
    >
      {isPositive ? (
        <TrendingUp className="h-2.5 w-2.5" />
      ) : isNegative ? (
        <TrendingDown className="h-2.5 w-2.5" />
      ) : null}
      {Math.abs(trend)}%
    </span>
  ) : null;

  /* ── Flat mode — compact tiles for divided grid strips ── */
  if (flat) {
    const inner = (
      <div className="flex h-full flex-col justify-center gap-0.5 px-3 py-1.5 sm:px-4 sm:py-2">
        <div className="flex items-center justify-between gap-2">
          <div className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
            tintClass
          )}>
            {icon}
          </div>
          {trendPill}
        </div>
        <p className={cn(
          "text-lg font-bold leading-none tabular-nums sm:text-xl",
          valueColor ?? "text-foreground"
        )}>
          {displayValue}
        </p>
        <p className="truncate text-[10px] font-medium text-muted-foreground sm:text-[11px]">
          {label}
        </p>
        {sub && (
          <p className="hidden truncate text-[9px] leading-tight text-muted-foreground/60 sm:block">{sub}</p>
        )}
        {sparklineData && sparklineData.length >= 2 && (
          <div className="-mb-0.5 mt-auto hidden h-3.5 sm:block">
            <Sparkline data={sparklineData} color={sparkColor} height={14} />
          </div>
        )}
      </div>
    );

    if (!to) return inner;
    return (
      <Link to={to} className="h-full transition-colors hover:bg-secondary/40">
        {inner}
      </Link>
    );
  }

  /* ── Card mode ── */
  const card = (
    <Card
      className={cn(
        "group/kpi relative h-full overflow-hidden border-border/60 transition-all duration-200",
        to && "cursor-pointer hover:border-primary/25 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/[0.04]"
      )}
    >
      <div aria-hidden className={cn(
        "pointer-events-none absolute -left-4 -top-4 h-20 w-20 rounded-full opacity-[0.07] blur-2xl transition-opacity",
        tintClass.replace("/10", "").replace("bg-", "bg-"),
        to && "group-hover/kpi:opacity-[0.12]"
      )} />

      <CardContent className="relative flex h-full flex-col gap-1.5 px-3.5 py-3 sm:px-4 sm:py-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            tintClass
          )}>
            {icon}
          </div>
          {trendPill}
        </div>

        <div>
          <p className={cn(
            "text-xl font-bold leading-tight tabular-nums sm:text-2xl",
            valueColor ?? "text-foreground"
          )}>
            {displayValue}
          </p>
          <p className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</p>
          {sub && (
            <p className="hidden truncate text-[10px] text-muted-foreground/60 sm:block">{sub}</p>
          )}
        </div>

        {sparklineData && sparklineData.length >= 2 && (
          <div className="mt-auto hidden pt-0.5 sm:block">
            <Sparkline data={sparklineData} color={sparkColor} height={24} />
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (to) return <Link to={to}>{card}</Link>;
  return card;
}
