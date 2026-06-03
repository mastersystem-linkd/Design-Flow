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
  /** Center-align the card-mode content (icon chip + value + label). */
  centered?: boolean;
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
  centered,
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
      <div className="relative flex h-full flex-col justify-center gap-0.5 px-3 py-1.5 swatch-edge sm:px-4 sm:py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/15">
            <span className="text-primary">{icon}</span>
          </div>
          {trendPill}
        </div>
        <p className={cn(
          "font-mono-data text-xl font-bold leading-none tracking-tight sm:text-2xl",
          valueColor ?? "text-foreground"
        )}>
          {displayValue}
        </p>
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        {sub && (
          <p className="mt-0.5 hidden truncate text-[11px] font-medium leading-tight text-muted-foreground sm:block">{sub}</p>
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
      <Link to={to} className="h-full swatch-edge-actionable outline-none transition-colors duration-200 hover:bg-secondary/40 focus-visible:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40">
        {inner}
      </Link>
    );
  }

  /* ── Card mode ── */
  const card = (
    <Card
      className={cn(
        "group/kpi relative h-full overflow-hidden rounded-xl border-border bg-card swatch-edge shadow-card transition-all duration-200",
        to && "cursor-pointer swatch-edge-actionable hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card-hover"
      )}
    >
      <CardContent className="relative flex h-full flex-col gap-1 px-3.5 py-2.5 sm:px-4 sm:py-3">
        <div className={cn("flex items-center gap-2", centered ? "justify-center" : "justify-between")}>
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06]",
              tintClass ?? "bg-primary/10"
            )}
          >
            <span className="text-primary">{icon}</span>
          </div>
          {!centered && trendPill}
        </div>

        <div className={cn(centered && "text-center")}>
          <p className={cn(
            "font-mono-data text-[24px] font-bold leading-none tracking-tight sm:text-[26px]",
            valueColor ?? "text-foreground"
          )}>
            {displayValue}
          </p>
          <p className={cn("mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground", !centered && "truncate")}>{label}</p>
          {sub && (
            <p className={cn("mt-0.5 hidden text-[11px] font-medium text-muted-foreground sm:block", !centered && "truncate")}>{sub}</p>
          )}
        </div>

        {sparklineData && sparklineData.length >= 2 && (
          <div className="mt-auto hidden pt-0.5 sm:block">
            <Sparkline data={sparklineData} color={sparkColor} height={18} />
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (to) return <Link to={to} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{card}</Link>;
  return card;
}
