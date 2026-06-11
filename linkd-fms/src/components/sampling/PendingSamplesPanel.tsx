import { useState, useMemo } from "react";
import { Package, ArrowRight, ExternalLink, Clock, Layers } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { EmptyState } from "@/components/ui";
import { SkeletonText } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/button";
import { ExternalOriginBadge } from "@/components/integration/ExternalOriginBadge";
import {
  TABLE_HEAD,
  TABLE_TH,
  TABLE_TH_STICKY_RIGHT,
  TABLE_ROW,
  TABLE_TD,
  TABLE_TD_STICKY_RIGHT,
} from "@/lib/tableStyles";
import { cn, formatDate } from "@/lib/utils";
import type { SampleWithTask } from "@/hooks/useSamples";

// ============================================================================
// PendingSamplesPanel — pending samples from task completion + Sales ERP
// ============================================================================

type SourceFilter = "all" | "task_completion" | "sales_erp";

function flaggedAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return `flagged ${formatDistanceToNow(new Date(iso))} ago`;
  } catch {
    return "—";
  }
}

const dt = (iso: string | null | undefined) => (iso ? formatDate(iso) : "—");

function rowView(s: SampleWithTask, nameById: Map<string, string>) {
  const t = s.task;
  const isErp = s.source === "sales_erp";
  const storedParty = s.party_name && s.party_name !== "—" ? s.party_name : null;
  const completedByName = s.created_by ? nameById.get(s.created_by) : undefined;
  const qty = t?.qty ?? null;
  const done = t?.qty_completed ?? null;

  const eb = isErp && s.external_brief && typeof s.external_brief === "object"
    ? (s.external_brief as Record<string, unknown>)
    : null;

  return {
    uid: s.uid || t?.task_code || "—",
    party: storedParty || t?.client?.party_name || "—",
    designer: completedByName || t?.assignee?.full_name || "—",
    designType: s.design_type || (eb?.design_type as string) || t?.concept || "—",
    description: (eb?.description as string) || t?.description || "—",
    fabric: s.quality || (eb?.fabric as string) || t?.fabric || "—",
    qty,
    completed: done != null ? `${done}/${qty ?? "?"}` : "—",
    pending: qty != null && done != null ? Math.max(0, qty - done) : null,
    whatsappGroup: t?.whatsapp_group || "—",
    messageDate: dt(t?.whatsapp_received_date),
    messageTime: t?.whatsapp_received_time || "—",
    assignedBy: t?.assigned_by || "—",
    briefed: dt(t?.created_at || s.created_at),
    claimed: dt(t?.started_at),
    deadline: dt(t?.planned_deadline),
    startedLate: t?.started_late == null ? "—" : t.started_late ? "Yes" : "No",
    meters: (eb?.meters as number) ?? s.printed_mtr ?? null,
  };
}

interface PendingSamplesPanelProps {
  samples: SampleWithTask[];
  isLoading: boolean;
  nameById: Map<string, string>;
  onProcess: (sample: SampleWithTask) => void;
  onOpenTask: (taskId: string) => void;
  onStartDevelopment?: (sample: SampleWithTask) => void;
}

const SOURCE_CHIPS: { key: SourceFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "task_completion", label: "From Tasks" },
  { key: "sales_erp", label: "From Sales ERP" },
];

export function PendingSamplesPanel({
  samples,
  isLoading,
  nameById,
  onProcess,
  onOpenTask,
  onStartDevelopment,
}: PendingSamplesPanelProps) {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  const filtered = useMemo(
    () =>
      sourceFilter === "all"
        ? samples
        : samples.filter((s) => s.source === sourceFilter),
    [samples, sourceFilter]
  );

  const erpCount = useMemo(
    () => samples.filter((s) => s.source === "sales_erp").length,
    [samples]
  );
  const taskCount = useMemo(
    () => samples.filter((s) => s.source === "task_completion").length,
    [samples]
  );

  if (isLoading) {
    return (
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="p-4">
          <SkeletonText lines={4} />
        </div>
      </section>
    );
  }

  if (samples.length === 0) {
    return (
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="py-10">
          <EmptyState
            icon={<Package className="h-10 w-10 text-muted-foreground/40" />}
            title="No pending samples"
            description="Tasks marked 'Sampling Required' and Sales ERP sample requests will appear here."
          />
        </div>
      </section>
    );
  }

  const showChips = erpCount > 0 && taskCount > 0;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Sub-filter chips — only when both sources have items */}
      {showChips && (
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
          {SOURCE_CHIPS.map((chip) => {
            const count =
              chip.key === "all"
                ? samples.length
                : chip.key === "sales_erp"
                  ? erpCount
                  : taskCount;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setSourceFilter(chip.key)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  sourceFilter === chip.key
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {chip.label}
                <span className="tabular-nums text-[10px] opacity-70">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="py-10">
          <EmptyState
            icon={<Package className="h-10 w-10 text-muted-foreground/40" />}
            title="No samples for this filter"
            description="Try switching the source filter above."
          />
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="space-y-2 p-3 sm:hidden">
            {filtered.map((s) => {
              const v = rowView(s, nameById);
              return (
                <div key={s.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => s.task_id && onOpenTask(s.task_id)}
                        disabled={!s.task_id}
                        className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-primary hover:underline disabled:no-underline disabled:opacity-60"
                        title="Open linked task"
                      >
                        {v.uid}
                        {s.task_id && <ExternalLink className="h-3 w-3" />}
                      </button>
                      <ExternalOriginBadge source={s.source} refId={s.external_ref_id} />
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" /> {flaggedAgo(s.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-foreground">{v.party}</p>
                  {v.description !== "—" && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{v.description}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{v.designType}</span>
                    {v.fabric !== "—" && <span>· {v.fabric}</span>}
                    {v.qty != null && <span>· Qty {v.qty}</span>}
                    {v.meters != null && <span>· {v.meters}m</span>}
                    {v.designer !== "—" && <span>· {v.designer}</span>}
                    {v.whatsappGroup !== "—" && <span>· {v.whatsappGroup}</span>}
                    {v.assignedBy !== "—" && <span>· by {v.assignedBy}</span>}
                    {v.deadline !== "—" && <span>· due {v.deadline}</span>}
                  </div>
                  <div className="mt-2 flex gap-2">
                    {s.source === "sales_erp" && onStartDevelopment && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
                        onClick={() => onStartDevelopment(s)}
                      >
                        <Layers className="h-3.5 w-3.5" />
                        Development
                      </Button>
                    )}
                    <Button size="sm" className="flex-1 gap-1.5" onClick={() => onProcess(s)}>
                      <ArrowRight className="h-3.5 w-3.5" />
                      Start Sampling
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: full-context table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[1700px] text-sm">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_TH}>UID</th>
                  <th className={TABLE_TH}>Source</th>
                  <th className={TABLE_TH}>Party Name</th>
                  <th className={TABLE_TH}>Designer</th>
                  <th className={TABLE_TH}>Design Type</th>
                  <th className={TABLE_TH}>Description</th>
                  <th className={TABLE_TH}>Fabric</th>
                  <th className={TABLE_TH}>Qty</th>
                  <th className={TABLE_TH}>Completed</th>
                  <th className={TABLE_TH}>Pending</th>
                  <th className={TABLE_TH}>WhatsApp Group</th>
                  <th className={TABLE_TH}>Message Date</th>
                  <th className={TABLE_TH}>Message Time</th>
                  <th className={TABLE_TH}>Assigned By</th>
                  <th className={TABLE_TH}>Briefed</th>
                  <th className={TABLE_TH}>Claimed</th>
                  <th className={TABLE_TH}>Deadline</th>
                  <th className={TABLE_TH}>Started Late</th>
                  <th className={TABLE_TH}>Flagged</th>
                  <th className={TABLE_TH_STICKY_RIGHT}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const v = rowView(s, nameById);
                  return (
                    <tr key={s.id} className={TABLE_ROW}>
                      <td className={TABLE_TD}>
                        <button
                          type="button"
                          onClick={() => s.task_id && onOpenTask(s.task_id)}
                          disabled={!s.task_id}
                          className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-primary hover:underline disabled:no-underline disabled:opacity-60"
                          title="Open linked task"
                        >
                          {v.uid}
                          {s.task_id && <ExternalLink className="h-3 w-3" />}
                        </button>
                      </td>
                      <td className={TABLE_TD}>
                        <ExternalOriginBadge source={s.source} refId={s.external_ref_id} />
                        {s.source === "task_completion" && (
                          <span className="text-[10px] text-muted-foreground">Task</span>
                        )}
                      </td>
                      <td className={cn(TABLE_TD, "font-medium text-foreground")}>{v.party}</td>
                      <td className={TABLE_TD}>{v.designer}</td>
                      <td className={TABLE_TD}>{v.designType}</td>
                      <td className={cn(TABLE_TD, "max-w-[220px] truncate")} title={v.description}>
                        {v.description}
                      </td>
                      <td className={TABLE_TD}>{v.fabric}</td>
                      <td className={cn(TABLE_TD, "tabular-nums")}>{v.qty ?? "—"}</td>
                      <td className={cn(TABLE_TD, "tabular-nums")}>{v.completed}</td>
                      <td className={cn(TABLE_TD, "tabular-nums")}>{v.pending ?? "—"}</td>
                      <td className={TABLE_TD}>{v.whatsappGroup}</td>
                      <td className={cn(TABLE_TD, "whitespace-nowrap")}>{v.messageDate}</td>
                      <td className={cn(TABLE_TD, "whitespace-nowrap")}>{v.messageTime}</td>
                      <td className={TABLE_TD}>{v.assignedBy}</td>
                      <td className={cn(TABLE_TD, "whitespace-nowrap")}>{v.briefed}</td>
                      <td className={cn(TABLE_TD, "whitespace-nowrap")}>{v.claimed}</td>
                      <td className={cn(TABLE_TD, "whitespace-nowrap")}>{v.deadline}</td>
                      <td className={TABLE_TD}>{v.startedLate}</td>
                      <td className={cn(TABLE_TD, "whitespace-nowrap text-xs text-muted-foreground")}>
                        {flaggedAgo(s.created_at)}
                      </td>
                      <td className={TABLE_TD_STICKY_RIGHT}>
                        <div className="flex items-center gap-1.5">
                          {s.source === "sales_erp" && onStartDevelopment && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 border-primary/30 text-primary hover:bg-primary/5"
                              onClick={() => onStartDevelopment(s)}
                            >
                              <Layers className="h-3 w-3" />
                              Development
                            </Button>
                          )}
                          <Button size="sm" className="gap-1.5" onClick={() => onProcess(s)}>
                            <ArrowRight className="h-3.5 w-3.5" />
                            Start Sampling
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
