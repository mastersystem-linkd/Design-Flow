import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}

function LoomSwatch() {
  return (
    <svg
      width="80"
      height="56"
      viewBox="0 0 80 56"
      fill="none"
      aria-hidden
      className="mb-1"
    >
      {/* Warp threads (vertical) */}
      {[10, 22, 34, 46, 58, 70].map((x) => (
        <line
          key={`w${x}`}
          x1={x}
          y1="0"
          x2={x}
          y2="56"
          stroke="rgb(var(--border))"
          strokeWidth="1"
          strokeDasharray="3 5"
        />
      ))}
      {/* Weft threads (horizontal) */}
      {[8, 20, 32, 44].map((y) => (
        <line
          key={`f${y}`}
          x1="0"
          y1={y}
          x2="80"
          y2={y}
          stroke="rgb(var(--muted))"
          strokeWidth="0.75"
          strokeDasharray="6 4"
          opacity="0.5"
        />
      ))}
      {/* Selvedge edges (left + right) */}
      <line
        x1="1"
        y1="0"
        x2="1"
        y2="56"
        stroke="rgb(var(--primary))"
        strokeWidth="1.5"
        opacity="0.3"
      />
      <line
        x1="79"
        y1="0"
        x2="79"
        y2="56"
        stroke="rgb(var(--primary))"
        strokeWidth="1.5"
        opacity="0.3"
      />
    </svg>
  );
}

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
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center",
        className
      )}
    >
      {icon ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary text-xl leading-none">
          {icon}
        </div>
      ) : (
        <LoomSwatch />
      )}
      <p className="text-base font-semibold text-foreground">{title}</p>
      {description && (
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && (
        <Button size="sm" onClick={action.onClick} className="mt-1">
          {action.label}
        </Button>
      )}
    </div>
  );
}
