import { Fragment } from "react";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// TaskPipelineStepper — a slim, single-row "glass pill" pipeline tracker that
// sits as the task table's header. Each stage is a compact frosted pill
// (dot/✓ + label + count on ONE line); the active pill is tinted in its own
// tone with a soft ring. Pills are joined by chevrons that "fill" once the
// upstream stage has items. The whole strip is the height of a single row.
//
// `sideStage` is an OPTIONAL standalone pill to the right, separated by a
// divider — NOT part of the flow (e.g. Full Kitting, a separate data tab).
//
// Theme-token only, light + dark safe, CSS transitions only.
// ============================================================================

export interface PipelineStage {
  /** Status key passed back on click ('pool', 'in_progress', 'completed', …). */
  key: string;
  label: string;
  count: number;
  /** Optional sub-info shown inline on wide screens (e.g. "0 urgent · 1 normal"). */
  subLabel?: string;
  /** Tone token: 'muted' | 'primary' | 'warning' | 'success'. */
  color: string;
}

interface TaskPipelineStepperProps {
  stages: PipelineStage[];
  /** Currently selected stage key. */
  activeStage: string | null;
  onStageClick: (stageKey: string) => void;
  /** Optional standalone pill, divided off from the pipeline (not a step). */
  sideStage?: PipelineStage;
}

// Colored status dot per tone (inactive pills). Static strings — Tailwind can't
// compose dynamic color utilities.
const TONE_DOT: Record<string, string> = {
  muted: "bg-muted-foreground/50",
  primary: "bg-primary",
  warning: "bg-warning",
  success: "bg-success",
};

// Active pill: tinted glass surface + ring in the stage tone. `muted` stages
// adopt the primary tint so "active" always reads clearly.
const ACTIVE_PILL: Record<string, string> = {
  muted: "border-primary/40 bg-primary/10 ring-1 ring-primary/20",
  primary: "border-primary/40 bg-primary/10 ring-1 ring-primary/20",
  warning: "border-warning/40 bg-warning/10 ring-1 ring-warning/20",
  success: "border-success/40 bg-success/10 ring-1 ring-success/20",
};

const ACTIVE_TEXT: Record<string, string> = {
  muted: "text-primary",
  primary: "text-primary",
  warning: "text-warning",
  success: "text-success",
};

function StagePill({
  stage,
  isActive,
  onClick,
}: {
  stage: PipelineStage;
  isActive: boolean;
  onClick: () => void;
}) {
  const tone = stage.color;
  const isSuccess = tone === "success";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      title={`${stage.label}: ${stage.count} task${stage.count === 1 ? "" : "s"}${
        stage.subLabel ? ` (${stage.subLabel})` : ""
      }`}
      className={cn(
        "group flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur-sm transition-all duration-200",
        isActive
          ? cn("shadow-sm", ACTIVE_PILL[tone] ?? ACTIVE_PILL.primary)
          : "border-border/60 bg-card/50 hover:border-border hover:bg-secondary/50"
      )}
    >
      {isSuccess ? (
        <Check
          className={cn(
            "h-3 w-3 shrink-0",
            isActive ? "text-success" : "text-success/70"
          )}
        />
      ) : (
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            TONE_DOT[tone] ?? TONE_DOT.primary
          )}
        />
      )}
      <span
        className={cn(
          "whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide transition-colors",
          isActive ? ACTIVE_TEXT[tone] ?? ACTIVE_TEXT.primary : "text-muted-foreground"
        )}
      >
        {stage.label}
      </span>
      <span
        className={cn(
          "text-[13px] font-bold leading-none tabular-nums transition-colors",
          isActive ? ACTIVE_TEXT[tone] ?? ACTIVE_TEXT.primary : "text-foreground"
        )}
      >
        {stage.count}
      </span>
      {stage.subLabel && (
        <span className="hidden whitespace-nowrap border-l border-border pl-2 text-[10px] font-normal text-muted-foreground lg:inline">
          {stage.subLabel}
        </span>
      )}
    </button>
  );
}

export function TaskPipelineStepper({
  stages,
  activeStage,
  onStageClick,
  sideStage,
}: TaskPipelineStepperProps) {
  return (
    <div className="no-scrollbar touch-scroll-x flex items-center gap-1.5 overflow-x-auto px-3 py-2 sm:px-4">
      {stages.map((stage, i) => {
        // Connector "fills" once the stage to its left has items.
        const lineFilled = i > 0 && stages[i - 1].count > 0;
        return (
          <Fragment key={stage.key}>
            {i > 0 && (
              <ChevronRight
                aria-hidden
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-colors",
                  lineFilled ? "text-primary" : "text-border"
                )}
              />
            )}
            <StagePill
              stage={stage}
              isActive={activeStage === stage.key}
              onClick={() => onStageClick(stage.key)}
            />
          </Fragment>
        );
      })}

      {sideStage && (
        <>
          {/* Vertical divider — marks the boundary between the pipeline flow
              and this standalone pill (not a pipeline step). */}
          <div
            aria-hidden
            className="mx-1 h-5 w-px shrink-0 bg-border sm:mx-1.5"
          />
          <StagePill
            stage={sideStage}
            isActive={activeStage === sideStage.key}
            onClick={() => onStageClick(sideStage.key)}
          />
        </>
      )}
    </div>
  );
}
