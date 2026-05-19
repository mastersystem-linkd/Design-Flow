import { Check, X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConceptWithRelations, ConceptStatus } from "@/types/database";

// ============================================================================
// Stage mapping from concept data
// ============================================================================

type Stage = "submitted" | "under_review" | "md_decision" | "finalization" | "complete";

const STAGE_LABELS: Record<Stage, string> = {
  submitted: "Submitted",
  under_review: "Review",
  md_decision: "Decision",
  finalization: "Finalize",
  complete: "Complete",
};

function getActiveStage(concept: ConceptWithRelations): Stage {
  if (concept.designer_actual_date) return "complete";
  if (concept.md_status === "approved") return "finalization";
  if (concept.md_status !== "pending") return "md_decision";
  return "under_review";
}

function isStageComplete(stage: Stage, activeStage: Stage): boolean {
  const order: Stage[] = ["submitted", "under_review", "md_decision", "finalization", "complete"];
  return order.indexOf(stage) < order.indexOf(activeStage);
}

// ============================================================================
// Component — renders one concept's workflow as a horizontal stepper
// ============================================================================

export function ConceptWorkflowStage({
  concept,
  onClick,
}: {
  concept: ConceptWithRelations;
  onClick?: () => void;
}) {
  const active = getActiveStage(concept);
  const stages: Stage[] = ["submitted", "under_review", "md_decision", "finalization", "complete"];

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:bg-secondary/50 w-full text-left"
    >
      {/* Concept title */}
      <span className="w-28 shrink-0 truncate text-xs font-medium text-foreground" title={concept.title}>
        {concept.title}
      </span>

      {/* Stepper */}
      <div className="flex flex-1 items-center">
        {stages.map((stage, i) => {
          const completed = isStageComplete(stage, active);
          const isCurrent = stage === active;
          const isFuture = !completed && !isCurrent;
          const isDiamond = stage === "md_decision";

          return (
            <div key={stage} className="flex items-center flex-1 last:flex-none">
              {/* Dot / Diamond */}
              <div className="relative flex items-center justify-center" title={STAGE_LABELS[stage]}>
                {isDiamond ? (
                  <MdDecisionDot
                    status={concept.md_status}
                    completed={completed}
                    isCurrent={isCurrent}
                  />
                ) : (
                  <div
                    className={cn(
                      "h-3 w-3 rounded-full border-2 transition-all",
                      completed && "bg-success border-success",
                      isCurrent && "bg-primary border-primary animate-pulse",
                      isFuture && "bg-transparent border-border"
                    )}
                  />
                )}
              </div>

              {/* Connecting line (not after last) */}
              {i < stages.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-0.5 transition-colors",
                    completed ? "bg-success" : "bg-border"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </button>
  );
}

// ============================================================================
// MD Decision diamond dot
// ============================================================================

function MdDecisionDot({
  status,
  completed,
  isCurrent,
}: {
  status: ConceptStatus;
  completed: boolean;
  isCurrent: boolean;
}) {
  // Diamond = rotated square
  const base = "h-4 w-4 flex items-center justify-center rotate-45 rounded-[2px] border-2 transition-all";

  if (status === "approved" && (completed || isCurrent)) {
    return (
      <div className={cn(base, "bg-success border-success")}>
        <Check className="h-2.5 w-2.5 -rotate-45 text-white" strokeWidth={3} />
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div className={cn(base, "bg-destructive border-destructive")}>
        <X className="h-2.5 w-2.5 -rotate-45 text-white" strokeWidth={3} />
      </div>
    );
  }
  if (status === "revision_requested") {
    return (
      <div className={cn(base, "bg-warning border-warning")}>
        <RotateCcw className="h-2.5 w-2.5 -rotate-45 text-white" strokeWidth={3} />
      </div>
    );
  }
  if (isCurrent) {
    return <div className={cn(base, "bg-primary border-primary animate-pulse")} />;
  }
  return <div className={cn(base, "bg-transparent border-border")} />;
}
