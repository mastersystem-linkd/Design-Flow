import { useMemo, useState } from "react";
import {
  useAssignedByOptions,
  ASSIGNED_BY_CONTEXTS,
  type AssignedByContext,
} from "@/hooks/useAssignedByOptions";
import { useReceivedByOptions } from "@/hooks/useReceivedByOptions";
import { useSamplingDropdowns } from "@/hooks/useSamplingDropdowns";
import { useRequesterOptions } from "@/hooks/useRequesterOptions";
import { useTaskSources } from "@/hooks/useTaskSources";
import {
  LookupSection,
  type LookupRow,
  type FlagColumn,
} from "@/components/system/LookupSection";
import { WhatsAppIcon } from "@/components/ui/WhatsAppIcon";
import { cn } from "@/lib/utils";

// ============================================================================
// DropdownsTab — manages every form dropdown roster from one place.
//   Level 1: context pills  → Tasks / Full Knitting / Sampling / Coordinator Tasks
//   Level 2: dropdown chips  → the lists that context owns
//   Below:   the editor for the selected dropdown only (one at a time, tight)
// ============================================================================

// The Dropdowns picker spans every form context. The first three map 1:1 to
// the assigned_by_options.context values; "coordinator_tasks" is a UI-only
// context that owns the Requester roster (no Assigned By list).
type DropdownContext = AssignedByContext | "coordinator_tasks";

const DROPDOWN_CONTEXTS: { key: DropdownContext; label: string }[] = [
  ...ASSIGNED_BY_CONTEXTS,
  { key: "coordinator_tasks", label: "Coordinator Tasks" },
];

const CONTEXT_DESC: Record<DropdownContext, string> = {
  task: "Used by New Brief, Edit Task & Submit Concept.",
  full_kitting: "Used by the Full Knitting form.",
  sampling: "Used by the Sampling form.",
  coordinator_tasks: "Used by the Coordinator Tasks 'Log New Request' form.",
};

type DropdownTable =
  | "assigned_by_options"
  | "received_by_options"
  | "sampling_dropdowns"
  | "requester_options"
  | "task_sources";

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
  flagColumn?: FlagColumn;
}

export function DropdownsTab() {
  const [context, setContext] = useState<DropdownContext>("task");
  const [activeKey, setActiveKey] = useState<string>("assigned_by");

  // Coordinator Tasks has no Assigned By list — fall back to a valid context
  // for the (unused) query so the hook is always called with a real value.
  const assignedBy = useAssignedByOptions(
    context === "coordinator_tasks" ? "task" : context,
    { activeOnly: false }
  );
  const receivedBy = useReceivedByOptions({ activeOnly: false });
  const sampling = useSamplingDropdowns({ activeOnly: false });
  const requester = useRequesterOptions({ activeOnly: false });
  const taskSources = useTaskSources({ activeOnly: false });

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

    if (context === "coordinator_tasks") {
      return [
        {
          key: "requester",
          label: "Requester",
          count: requester.options.length,
          table: "requester_options",
          description:
            "Names offered by the 'Requester' dropdown on the Coordinator Tasks form.",
          addPlaceholder: "e.g. Raghav Sir",
          rows: requester.options,
          isLoading: requester.isLoading,
          error: requester.error,
          refetch: requester.refetch,
        },
      ];
    }

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

    // task context — Assigned By + Task Source (the brief "Group" picker).
    return [
      assignedSpec,
      {
        key: "task_source",
        label: "Task Source",
        count: taskSources.rows.length,
        table: "task_sources",
        description:
          "The 'Group' / source picker on New Brief & Edit Task. Toggle WhatsApp to show the green icon in the picker.",
        addPlaceholder: "e.g. LinkD Design Group",
        rows: taskSources.rows,
        isLoading: taskSources.isLoading,
        error: taskSources.error,
        refetch: taskSources.refetch,
        flagColumn: {
          label: "WhatsApp",
          hint: "Show the WhatsApp icon in the picker",
          icon: <WhatsAppIcon />,
        },
      },
    ];
  }, [context, assignedBy, receivedBy, sampling, requester, taskSources]);

  const active = lists.find((l) => l.key === activeKey) ?? lists[0];
  if (!active) return null;

  return (
    <div className="space-y-3">
      {/* Level 1 — context pills */}
      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {DROPDOWN_CONTEXTS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => {
              setContext(c.key);
              setActiveKey(
                c.key === "coordinator_tasks" ? "requester" : "assigned_by"
              );
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
        flagColumn={active.flagColumn}
      />
    </div>
  );
}
