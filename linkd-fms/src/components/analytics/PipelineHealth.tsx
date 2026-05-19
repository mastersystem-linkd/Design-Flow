import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, Badge } from "@/components/ui";
import { CONCEPT_STATUS_LABELS } from "@/lib/constants";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { StatusDistribution } from "@/hooks/useAnalytics";

const STATUS_BAR_COLOR: Record<string, string> = {
  pending: "bg-warning",
  approved: "bg-success",
  rejected: "bg-destructive",
  revision_requested: "bg-primary",
};

const STATUS_BORDER: Record<string, string> = {
  pending: "border-l-warning",
  approved: "border-l-success",
  rejected: "border-l-destructive",
  revision_requested: "border-l-primary",
};

export function PipelineHealth({ data }: { data: StatusDistribution[] }) {
  const navigate = useNavigate();
  const maxCount = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <Card className="h-full">
      <CardContent className="space-y-1 py-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Concept Status</h3>
          <Badge variant="secondary" className="text-[10px]">
            {total} total
          </Badge>
        </div>

        <div className="mt-3 space-y-2">
          {data.map((item, i) => {
            const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
            const barPct = Math.max(item.count > 0 ? 8 : 4, (item.count / maxCount) * 100);
            const label =
              CONCEPT_STATUS_LABELS[item.status as keyof typeof CONCEPT_STATUS_LABELS] ?? item.status;
            const barColor = STATUS_BAR_COLOR[item.status] ?? "bg-muted";
            const borderColor = STATUS_BORDER[item.status] ?? "border-l-muted";

            return (
              <button
                key={item.status}
                type="button"
                onClick={() => navigate(ROUTES.concepts)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border-l-[3px] px-2 py-1.5 transition-all",
                  "hover:bg-secondary/40 hover:ring-1 hover:ring-primary/20 cursor-pointer",
                  borderColor
                )}
              >
                <span className="w-[80px] shrink-0 text-left text-xs font-medium text-foreground">
                  {label}
                </span>
                <div className="flex-1 overflow-hidden rounded-md bg-secondary/60">
                  <div
                    className={cn("h-7 rounded-md", barColor)}
                    style={{
                      width: mounted ? `${barPct}%` : "0%",
                      transition: "width 600ms cubic-bezier(0.4,0,0.2,1)",
                      transitionDelay: `${i * 80}ms`,
                      minWidth: 4,
                    }}
                  />
                </div>
                <div className="flex w-16 shrink-0 items-center justify-end gap-1">
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {item.count}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    ({pct}%)
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
