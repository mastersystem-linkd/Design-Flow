import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  /** Emoji string or any ReactNode (e.g. a lucide icon). */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}

/**
 * Centered, muted "nothing here" panel with an optional CTA.
 *
 *   <EmptyState
 *     icon="📋"
 *     title="No tasks here"
 *     description="Briefs you create will appear in this column."
 *     action={{ label: "Create task", onClick: () => navigate('/brief/new') }}
 *   />
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-card px-6 py-12 text-center",
        className
      )}
    >
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/60 text-3xl leading-none">
          {icon}
        </div>
      )}
      <h3 className="font-sans text-2xl tracking-tight text-foreground">{title}</h3>
      {description && (
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick} className="mt-2">
          {action.label}
        </Button>
      )}
    </div>
  );
}
