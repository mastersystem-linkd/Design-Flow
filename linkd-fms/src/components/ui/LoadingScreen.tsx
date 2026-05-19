import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoadingScreen({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-muted-foreground",
        className
      )}
    >
      <Loader2 className="h-8 w-8 animate-spin text-white/40" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
