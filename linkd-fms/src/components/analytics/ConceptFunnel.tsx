import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { FunnelData, ConversionRates } from "@/hooks/useAnalytics";

const STAGES: {
  key: keyof Pick<FunnelData, "submitted" | "underReview" | "decided" | "finalization" | "completed">;
  label: string;
  color: string;
  bg: string;
}[] = [
  { key: "submitted", label: "Submitted", color: "text-primary", bg: "bg-primary/10" },
  { key: "underReview", label: "Under Review", color: "text-warning", bg: "bg-warning/10" },
  { key: "decided", label: "Decision", color: "text-[#7C5CFC]", bg: "bg-[#7C5CFC]/10" },
  { key: "finalization", label: "Finalization", color: "text-primary", bg: "bg-primary/10" },
  { key: "completed", label: "Complete", color: "text-success", bg: "bg-success/10" },
];

export function ConceptFunnel({
  funnel,
  conversionRates,
  oldestPendingDays,
}: {
  funnel: FunnelData;
  conversionRates: ConversionRates;
  oldestPendingDays: number;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  const conversionBetween = (from: number, to: number): string => {
    if (from === 0) return "—";
    return `${Math.round((to / from) * 100)}%`;
  };

  return (
    <Card>
      <CardContent className="py-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Concept Pipeline</h3>

        {/* Funnel stages */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-0">
          {STAGES.map((stage, i) => {
            const count = funnel[stage.key];
            const isUnderReview = stage.key === "underReview";

            return (
              <div key={stage.key} className="flex flex-1 items-center">
                {/* Stage block */}
                <div
                  className={cn(
                    "flex-1 rounded-xl p-3 text-center transition-all",
                    stage.bg,
                    mounted ? "opacity-100" : "opacity-0"
                  )}
                  style={{ transitionDelay: `${i * 80}ms`, transition: "opacity 400ms ease-out" }}
                >
                  <p className={cn("text-2xl font-bold tabular-nums", stage.color)}>
                    {count}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{stage.label}</p>

                  {/* Decision split */}
                  {stage.key === "decided" && count > 0 && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      <span className="text-success">{funnel.approved}✓</span>{" "}
                      <span className="text-destructive">{funnel.rejected}✗</span>{" "}
                      <span className="text-warning">{funnel.revision}↩</span>
                    </p>
                  )}

                  {/* Stale review warning */}
                  {isUnderReview && count > 0 && oldestPendingDays > 0 && (
                    <p className="mt-1 text-[9px] text-warning">
                      Oldest: {oldestPendingDays}d waiting
                    </p>
                  )}
                </div>

                {/* Arrow between stages */}
                {i < STAGES.length - 1 && (
                  <div className="hidden sm:flex flex-col items-center px-1.5 shrink-0">
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Conversion rates */}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>
            Submitted → Reviewed:{" "}
            <span className="font-semibold text-foreground">{conversionRates.submittedToReviewed}%</span>
          </span>
          <span>
            Reviewed → Approved:{" "}
            <span className="font-semibold text-foreground">{conversionRates.reviewedToApproved}%</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
