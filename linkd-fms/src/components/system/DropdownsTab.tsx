import { useMemo, useState } from "react";
import {
  useAssignedByOptions,
  ASSIGNED_BY_CONTEXTS,
  type AssignedByContext,
} from "@/hooks/useAssignedByOptions";
import { useReceivedByOptions } from "@/hooks/useReceivedByOptions";
import { useSamplingDropdowns } from "@/hooks/useSamplingDropdowns";
import { LookupSection, type LookupRow } from "@/components/system/LookupSection";
import { cn } from "@/lib/utils";

// ============================================================================
// DropdownsTab — manages every form dropdown roster from one place.
//   Level 1: context pills  → Tasks / Full Knitting / Sampling
//   Level 2: dropdown chips  → the lists that context owns
//   Below:   the editor for the selected dropdown only (one at a time, tight)
// ============================================================================

const CONTEXT_DESC: Record<AssignedByContext, string> = {
  task: "Used by New Brief, Edit Task & Submit Concept.",
  full_kitting: "Used by the Full Knitting form.",
  sampling: "Used by the Sampling form.",
};

type DropdownTable =
  | "assigned_by_options"
  | "received_by_options"
  | "sampling_dropdowns";

interface ListSpec {
  key: string;
  label: string;
  count: number;
  table: DropdownTable;
  description: string;
  addPlaceholder: string;
  rows: LookupRow[];
  isLoading: boolean;
  error: string | null;
  refetch: () => unknown;
  insertExtra?: Record<string, unknown>;
}

export function DropdownsTab() {
  const [context, setContext] = useState<AssignedByContext>("task");
  const [activeKey, setActiveKey] = useState<string>("assigned_by");

  const assignedBy = useAssignedByOptions(context, { activeOnly: false });
  const receivedBy = useReceivedByOptions({ activeOnly: false });
  const sampling = useSamplingDropdowns({ activeOnly: false });

  // The dropdown lists the active context owns.
  const lists = useMemo<ListSpec[]>(() => {
    const assignedSpec: ListSpec = {
      key: "assigned_by",
      label: "Assigned By",
      count: assignedBy.options.length,
      table: "assigned_by_options",
      description: CONTEXT_DESC[context],
      addPlaceholder: "e.g. Raghav Sir",
      rows: assignedBy.options,
      isLoading: assignedBy.isLoading,
      error: assignedBy.error,
      refetch: assignedBy.refetch,
      insertExtra: { context },
    };

    if (context === "full_kitting") {
      return [
        assignedSpec,
        {
          key: "received_by",
          label: "Received By",
          count: receivedBy.options.length,
          table: "received_by_options",
          description:
            "Names offered by the 'Received By' dropdown on the Full Knitting form.",
          addPlaceholder: "e.g. Raghav Sir",
          rows: receivedBy.options,
          isLoading: receivedBy.isLoading,
          error: receivedBy.error,
          refetch: receivedBy.refetch,
        },
      ];
    }

    if (context === "sampling") {
      return [
        assignedSpec,
        {
          key: "requirement",
          label: "Requirement",
          count: sampling.rowsByField.requirement.length,
          table: "sampling_dropdowns",
          description: "Requirement options on the Sampling form.",
          addPlaceholder: "e.g. 6x4",
          rows: sampling.rowsByField.requirement,
          isLoading: sampling.isLoading,
          error: sampling.error,
          refetch: sampling.refetch,
          insertExtra: { field: "requirement" },
        },
        {
          key: "sampling_done_by",
          label: "Sampling Done By",
          count: sampling.rowsByField.sampling_done_by.length,
          table: "sampling_dropdowns",
          description: "Who performed the sampling.",
          addPlaceholder: "e.g. Nandu Sir",
          rows: sampling.rowsByField.sampling_done_by,
          isLoading: sampling.isLoading,
          error: sampling.error,
          refetch: sampling.refetch,
          insertExtra: { field: "sampling_done_by" },
        },
        {
          key: "fusing_operator",
          label: "Fusing Operator",
          count: sampling.rowsByField.fusing_operator.length,
          table: "sampling_dropdowns",
          description: "Fusing operator on the Sampling form.",
          addPlaceholder: "e.g. Satyandra",
          rows: sampling.rowsByField.fusing_operator,
          isLoading: sampling.isLoading,
          error: sampling.error,
          refetch: sampling.refetch,
          insertExtra: { field: "fusing_operator" },
        },
      ];
    }

    return [assignedSpec];
  }, [context, assignedBy, receivedBy, sampling]);

  const active = lists.find((l) => l.key === activeKey) ?? lists[0];
  if (!active) return null;

  return (
    <div className="space-y-3">
      {/* Level 1 — context pills */}
      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {ASSIGNED_BY_CONTEXTS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => {
              setContext(c.key);
              setActiveKey("assigned_by");
            }}
            aria-pressed={context === c.key}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              context === c.key
                ? "bg-primary text-white shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Level 2 — dropdown chips (only when the context owns more than one) */}
      {lists.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {lists.map((l) => {
            const on = l.key === active.key;
            return (
              <button
                key={l.key}
                type="button"
                onClick={() => setActiveKey(l.key)}
                aria-pressed={on}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  on
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:bg-secondary hover:text-foreground"
                )}
              >
                {l.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px] tabular-nums",
                    on ? "bg-primary/20 text-primary" : "bg-secondary text-foreground"
                  )}
                >
                  {l.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Editor for the selected dropdown only */}
      <LookupSection
        key={`${context}-${active.key}`}
        title={active.label}
        description={active.description}
        table={active.table}
        addPlaceholder={active.addPlaceholder}
        rows={active.rows}
        isLoading={active.isLoading}
        error={active.error}
        refetch={active.refetch}
        insertExtra={active.insertExtra}
      />
    </div>
  );
}
