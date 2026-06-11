import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExternalOriginBadgeProps {
  source: string | null | undefined;
  refId?: string | null;
  size?: "sm" | "md";
}

const SOURCE_LABELS: Record<string, string> = {
  sales_erp: "Sales ERP",
};

export function ExternalOriginBadge({ source, refId, size = "sm" }: ExternalOriginBadgeProps) {
  if (!source || !SOURCE_LABELS[source]) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-primary/10 font-semibold text-primary",
        size === "sm" && "px-1.5 py-0.5 text-[10px]",
        size === "md" && "px-2 py-0.5 text-[11px]",
      )}
      title={refId ? `Ref: ${refId}` : SOURCE_LABELS[source]}
    >
      <ArrowUpRight className={cn(size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3")} />
      {SOURCE_LABELS[source]}
    </span>
  );
}
