import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, Badge } from "@/components/ui";
import { CONCEPT_STATUS_LABELS } from "@/lib/constants";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { StatusDistribution } from "@/hooks/useAnalytics";

// Gradient fills + a soft colored glow so the bars read as lit data, not
// flat blocks. Each glow is tinted to its own status colour.
const STATUS_BAR_COLOR: Record<string, string> = {
  pending: "bg-gradient-to-r from-warning/60 to-warning shadow-[0_0_12px_-2px_rgb(var(--warning)/0.55)]",
  approved: "bg-gradient-to-r from-success/60 to-success shadow-[0_0_12px_-2px_rgb(var(--success)/0.55)]",
  rejected: "bg-gradient-to-r from-destructive/60 to-destructive shadow-[0_0_12px_-2px_rgb(var(--destructive)/0.55)]",
  revision_requested: "bg-gradient-to-r from-primary/60 to-primary shadow-[0_0_12px_-2px_rgb(var(--primary)/0.55)]",
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
      {/* Flex column so the bar list can grow + center inside the card when
          the sibling (VolumeChart) stretches this card taller than its
          content. Header stays pinned at the top, bars settle in the middle. */}
      <CardContent className="flex h-full flex-col py-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[17px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
            Concept Status
          </h3>
          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
            {total} total
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-center space-y-2 py-3">
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
                  "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
                  borderColor
                )}
              >
                <span className="w-[80px] shrink-0 text-left text-[13px] font-semibold text-foreground">
                  {label}
                </span>
                <div className="flex-1 overflow-hidden rounded-md bg-secondary/60">
                  <div
                    className={cn("flex h-7 items-center justify-end rounded-md", barColor)}
                    style={{
                      width: mounted ? `${barPct}%` : "0%",
                      transition: "width 600ms cubic-bezier(0.4,0,0.2,1)",
                      transitionDelay: `${i * 80}ms`,
                      minWidth: 4,
                    }}
                  >
                    {item.status === "pending" && item.count > 0 && (
                      <span className="shuttle-dot mr-1.5 text-white" />
                    )}
                  </div>
                </div>
                <div className="flex w-16 shrink-0 items-center justify-end gap-1">
                  <span className="text-base font-bold tabular-nums text-foreground">
                    {item.count}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
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
