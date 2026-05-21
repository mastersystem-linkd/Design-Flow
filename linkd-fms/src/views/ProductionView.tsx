import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Check,
  Loader2,
  FileIcon,
  Pencil,
  Trash2,
  Package,
  Users,
  Calendar,
  Clock,
  X,
  RefreshCw,
  Download,
  BarChart3,
  TrendingUp,
  PieChart as PieChartIcon,
  Layers,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { useTasks } from "@/hooks/useTasks";
import {
  useSamples,
  getTaskFiles,
  type SampleFilters,
  type SampleWithTask,
  type TaskFileWithUploader,
} from "@/hooks/useSamples";
import { useProfiles } from "@/hooks/useProfiles";
import { useTaskMutations } from "@/hooks/useTaskMutations";
import { TaskDetailDrawer } from "@/components/tasks/TaskDetailDrawer";
import { SamplingFormDrawer } from "@/components/sampling/SamplingFormDrawer";
import {
  Badge,
  Button,
  Card,
  CardContent,
  SkeletonText,
  SearchInput,
  EmptyState,
  ConfirmDialog,
  toast,
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
  DeadlineCell,
  ExportDialog,
  Pagination,
} from "@/components/ui";
import { Input } from "@/components/ui/input";
import { usePagination } from "@/hooks/usePagination";
import { type CsvColumn } from "@/lib/exportCSV";
import { COLUMN_ACCENT, COLUMN_DOT, STATUS_LABELS } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";
import { isAdminOrCoordinator } from "@/lib/permissions";
import type {
  Sample,
  TaskWithRelations,
  UserRole,
} from "@/types/database";

// ============================================================================
// Sampling Hub
// ============================================================================

export function ProductionView() {
  const { profile, user } = useAuth();
  const { tasks, isLoading: tasksLoading, refetch: refetchTasks } = useTasks();
  const { updateTaskStatus, isPending } = useTaskMutations();
  const { profiles: designers } = useProfiles({ roles: ["designer"] });

  const role: UserRole = profile?.role ?? "designer";
  const isAdmin = isAdminOrCoordinator(role);

  // Top-level view tabs. "samples" = entries + active sampling queue (the
  // operational view). "dashboard" = analytics rollups. Two distinct mental
  // modes — coordinators bounce between them, so a tab is cheaper than a
  // separate route.
  const [tab, setTab] = useState<"samples" | "dashboard">("samples");

  // ── Sample filters ──
  const [customerSearch, setCustomerSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "completed">("all");

  const sampleFilters: SampleFilters = useMemo(
    () => ({
      customerName: customerSearch.trim() || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
    }),
    [customerSearch, statusFilter]
  );

  const {
    samples,
    totalCount: sampleTotal,
    isLoading: samplesLoading,
    refetch: refetchSamples,
    createSample,
    updateSample,
    deleteSample,
  } = useSamples(sampleFilters);

  const samplePg = usePagination(sampleTotal, 25);

  // Reset page when filters change
  useEffect(() => { samplePg.resetPage(); }, [customerSearch, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleSamples = samples.slice(samplePg.from, samplePg.to + 1);

  // ── State ──
  const [formOpen, setFormOpen] = useState(false);
  const [editSample, setEditSample] = useState<SampleWithTask | Sample | null>(null);
  const [deletingSample, setDeletingSample] = useState<SampleWithTask | Sample | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const sampleExportColumns: CsvColumn<Sample>[] = [
    { key: "created_at", label: "Date" },
    { key: "uid", label: "UID" },
    { key: "party_name", label: "Party Name" },
    { key: "quality", label: "Quality" },
    { key: "total_fabrics_received", label: "Fabrics Received", transform: (v) => v != null ? String(v) : "" },
    { key: "printed_mtr", label: "Printed (m)", transform: (v) => v != null ? String(v) : "" },
    { key: "pending_qty", label: "Pending", transform: (v) => v != null ? String(v) : "" },
    { key: "order_or_sample", label: "Type", transform: (v) => v === "order" ? "Order" : v === "sample" ? "Sample" : "" },
    { key: "is_completed", label: "Status" },
    { key: "additional_comments", label: "Notes" },
  ];

  // ── Computed ──
  const samplingTasks = useMemo(
    () => tasks.filter((t) => t.status === "sampling"),
    [tasks]
  );


  // ── Stats ──
  // Two shapes here:
  //   1. `stats` — the 4 KPI tiles (Today / Month / Customers / Pending).
  //   2. `dashboardAggregates` — everything the analytics tab adds on top:
  //      throughput totals, order/sample mix, top customers, completion %.
  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const today = samples.filter(
      (s) => s.created_at.slice(0, 10) === todayStr
    ).length;
    const thisMonth = samples.filter(
      (s) => s.created_at >= monthStart
    ).length;
    const customers = new Set(samples.map((s) => s.party_name)).size;
    const totalPending = samples.reduce(
      (sum, s) => sum + (s.pending_qty > 0 ? 1 : 0),
      0
    );

    return { today, thisMonth, customers, totalPending };
  }, [samples]);

  const dashboardAggregates = useMemo(() => {
    const total = samples.length;
    const completed = samples.filter((s) => s.is_completed).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Throughput in metres. Pending = received - printed when the row has a
    // recorded receipt; falls back to the generated pending_qty otherwise.
    let totalReceived = 0;
    let totalPrinted = 0;
    let totalPendingMtr = 0;
    for (const s of samples) {
      totalReceived += s.total_fabrics_received ?? 0;
      totalPrinted += s.printed_mtr;
      totalPendingMtr += s.pending_qty;
    }
    const avgPrinted = total > 0 ? Math.round((totalPrinted / total) * 10) / 10 : 0;

    // Order vs sample mix — the third "" bucket is rows where the user
    // never picked. Show as "Untagged".
    let orders = 0;
    let samplesOnly = 0;
    let untagged = 0;
    for (const s of samples) {
      if (s.order_or_sample === "order") orders++;
      else if (s.order_or_sample === "sample") samplesOnly++;
      else untagged++;
    }

    // Top customers — bucket by party_name, take top 5 by count.
    const byCustomer = new Map<string, number>();
    for (const s of samples) {
      const k = s.party_name || "—";
      byCustomer.set(k, (byCustomer.get(k) ?? 0) + 1);
    }
    const topCustomers = Array.from(byCustomer.entries())
      .map(([party_name, count]) => ({ party_name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      total,
      completed,
      pending: total - completed,
      completionRate,
      totalReceived,
      totalPrinted,
      totalPendingMtr,
      avgPrinted,
      orders,
      samplesOnly,
      untagged,
      topCustomers,
    };
  }, [samples]);

  // ── Chart data (samples per day, last 14 days) ──
  const chartData = useMemo(() => {
    const days: Record<string, number> = {};
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days[d.toISOString().slice(5, 10)] = 0; // MM-DD
    }
    for (const s of samples) {
      const key = s.created_at.slice(5, 10);
      if (key in days) days[key]++;
    }
    return Object.entries(days).map(([date, count]) => ({ date, count }));
  }, [samples]);

  // ── Handlers ──
  async function handleMarkDone(task: TaskWithRelations) {
    const { error } = await updateTaskStatus(task.id, "done");
    if (error) {
      toast.error(error);
      return;
    }
    await refetchTasks();
    toast.success(`${task.task_code} marked done ✓`);
  }

  async function handleDeleteSample() {
    if (!deletingSample) return;
    const { error } = await deleteSample(deletingSample.id);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Sample deleted");
    setDeletingSample(null);
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10">
            <Package className="h-5 w-5 text-warning" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Sampling</h1>
            <p className="text-xs text-muted-foreground">
              {samples.length} records · {samplingTasks.length} tasks in queue
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { void refetchTasks(); void refetchSamples(); }}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="Export CSV"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          )}
          {isAdmin && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setEditSample(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Sample
            </Button>
          )}
        </div>
      </div>

      {/* ── Tab switcher — two sections under one page ── */}
      <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
        {([
          { id: "samples" as const, label: "Samples", icon: Package },
          { id: "dashboard" as const, label: "Sample Dashboard", icon: BarChart3 },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === id
                ? "bg-primary text-white shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
            aria-pressed={tab === id}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "samples" && (
        <>
      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 md:max-w-xs">
          <SearchInput
            value={customerSearch}
            onChange={setCustomerSearch}
            placeholder="Search customer…"
          />
        </div>
        <div className="flex gap-1.5">
          {(["all", "pending", "completed"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setStatusFilter(s); samplePg.resetPage(); }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                statusFilter === s
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:bg-secondary"
              )}
            >
              {s === "all" ? "All" : s === "pending" ? "Pending" : "Completed"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Samples Table ── */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-card/50 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-foreground">
            Sample Records
            <span className="ml-2 text-[10px] font-normal text-muted-foreground">
              {samples.length}
            </span>
          </h2>
        </div>

        {samplesLoading ? (
          <div className="p-4"><SkeletonText lines={4} /></div>
        ) : samples.length === 0 ? (
          <div className="py-8">
            <EmptyState
              icon={<Package className="h-10 w-10 text-muted-foreground/40" />}
              title="No samples yet"
              description={isAdmin ? "Click '+ Add Sample' to start." : "No sampling records to show."}
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <caption className="sr-only">Sampling records</caption>
                <thead>
                  <tr className="border-b border-border bg-card/30 text-left text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    <th className="px-3 py-2 font-medium w-[28px]" aria-label="Expand" />
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">UID</th>
                    <th className="px-3 py-2 font-medium">Task</th>
                    <th className="px-3 py-2 font-medium">Party Name</th>
                    <th className="px-3 py-2 font-medium">Quality</th>
                    <th className="px-3 py-2 font-medium">Received</th>
                    <th className="px-3 py-2 font-medium">Printed</th>
                    <th className="px-3 py-2 font-medium">Pending</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    {isAdmin && <th className="px-3 py-2 font-medium text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {visibleSamples.map((s) => (
                    <SampleRow
                      key={s.id}
                      sample={s}
                      isAdmin={isAdmin}
                      onEdit={() => {
                        setEditSample(s);
                        setFormOpen(true);
                      }}
                      onDelete={() => setDeletingSample(s)}
                      onOpenTask={(taskId) => setSelectedTaskId(taskId)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {sampleTotal > 0 && (
              <div className="px-4 pb-3">
                <Pagination
                  page={samplePg.page}
                  totalPages={samplePg.totalPages}
                  hasNext={samplePg.hasNext}
                  hasPrev={samplePg.hasPrev}
                  onPageChange={samplePg.setPage}
                  showing={samplePg.showing}
                  pageSize={samplePg.pageSize}
                  onPageSizeChange={samplePg.setPageSize}
                />
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Tasks in Sampling Stage ── */}
      {samplingTasks.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className={cn("h-[3px]", COLUMN_ACCENT.sampling)} aria-hidden />
          <div className="flex items-center justify-between border-b border-border bg-card/50 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", COLUMN_DOT.sampling)} />
              <h2 className="text-sm font-semibold text-foreground">
                Tasks in Sampling Stage
              </h2>
              <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                {samplingTasks.length}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <caption className="sr-only">Sampling records</caption>
              <thead>
                <tr className="border-b border-border bg-card/30 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Concept</th>
                  <th className="px-3 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 font-medium">Designer</th>
                  <th className="px-3 py-2 font-medium">Deadline</th>
                  {isAdmin && <th className="px-3 py-2 font-medium text-right">Action</th>}
                </tr>
              </thead>
              <tbody>
                {samplingTasks.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => setSelectedTaskId(t.id)}
                    className="cursor-pointer border-b border-border/60 transition-colors hover:bg-card/60"
                  >
                    <td className="px-3 py-3 font-medium text-foreground">{t.concept}</td>
                    <td className="px-3 py-3 text-muted-foreground">{t.client?.party_name ?? "—"}</td>
                    <td className="px-3 py-3">
                      {t.assignee ? (
                        <div className="flex items-center gap-1.5">
                          <Avatar className="h-5 w-5">
                            {t.assignee.avatar_url ? <AvatarImage src={t.assignee.avatar_url} /> : null}
                            <AvatarFallback className="text-[8px]">{getInitials(t.assignee.full_name)}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs">{t.assignee.full_name}</span>
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-3"><DeadlineCell deadline={t.planned_deadline} /></td>
                    {isAdmin && (
                      <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => void handleMarkDone(t)}
                          disabled={isPending("updateStatus", t.id)}
                          className="inline-flex items-center gap-1 rounded-md bg-success px-2 py-1 text-[11px] font-medium text-white hover:bg-success/90 disabled:opacity-50"
                        >
                          {isPending("updateStatus", t.id) ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                          Mark Done
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

        </>
      )}

      {tab === "dashboard" && (
        <SampleDashboard
          isAdmin={isAdmin}
          samples={samples}
          stats={stats}
          chartData={chartData}
          aggregates={dashboardAggregates}
        />
      )}

      {/* ── Drawers / Dialogs ── */}
      <SamplingFormDrawer
        open={formOpen}
        onOpenChange={(o) => {
          if (!o) setEditSample(null);
          setFormOpen(o);
        }}
        editSample={editSample}
        onCreate={createSample}
        onUpdate={updateSample}
      />

      <TaskDetailDrawer
        taskId={selectedTaskId}
        open={!!selectedTaskId}
        onOpenChange={(o) => !o && setSelectedTaskId(null)}
        onChange={() => void refetchTasks()}
      />

      <ConfirmDialog
        open={!!deletingSample}
        title="Delete sample record?"
        description={
          deletingSample
            ? `"${deletingSample.party_name}" record will be permanently deleted.`
            : ""
        }
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => void handleDeleteSample()}
        onCancel={() => setDeletingSample(null)}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        data={samples as unknown as Record<string, unknown>[]}
        columns={sampleExportColumns as unknown as CsvColumn<Record<string, unknown>>[]}
        defaultFilename="linkd-samples"
        dateField="created_at"
      />
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SampleRow({
  sample: s,
  isAdmin,
  onEdit,
  onDelete,
  onOpenTask,
}: {
  sample: SampleWithTask | Sample;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  const pending = s.pending_qty;
  // The hook returns SampleWithTask, but legacy fallback (pre-0019) gives
  // plain Sample. Coalesce so we don't crash when task isn't joined.
  const linkedTask = "task" in s ? s.task : null;
  const [expanded, setExpanded] = useState(false);
  const canExpand = !!s.task_id;

  return (
    <>
      <tr
        className={cn(
          "border-b border-border/60 transition-colors hover:bg-card/60",
          expanded && "bg-secondary/30"
        )}
      >
        {/* Chevron — only enabled when the sample has a linked task. */}
        <td className="px-2 py-3 align-middle">
          {canExpand ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Collapse" : "Expand"}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <span
                className={cn(
                  "inline-block transition-transform",
                  expanded ? "rotate-90" : "rotate-0"
                )}
              >
                ▸
              </span>
            </button>
          ) : (
            <span className="inline-block w-6" aria-hidden />
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-[12px] text-muted-foreground">
          {formatDate(s.created_at)}
        </td>
        <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-primary">
          {s.uid || "—"}
        </td>
        <td className="whitespace-nowrap px-3 py-3">
          {linkedTask?.task_code ? (
            <button
              type="button"
              onClick={() => s.task_id && onOpenTask(s.task_id)}
              className="font-mono text-[11px] text-primary underline-offset-2 hover:underline"
              title={linkedTask.concept ?? undefined}
            >
              {linkedTask.task_code}
            </button>
          ) : s.task_id ? (
            // Task linked but join didn't load it (pre-0019 fallback path) —
            // still let the user open it.
            <button
              type="button"
              onClick={() => s.task_id && onOpenTask(s.task_id)}
              className="text-[11px] text-primary underline-offset-2 hover:underline"
            >
              View task
            </button>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-foreground">
          {s.party_name}
        </td>
        <td className="px-3 py-3 text-muted-foreground">{s.quality || "—"}</td>
        <td className="px-3 py-3 tabular-nums">{s.total_fabrics_received ?? "—"}</td>
        <td className="px-3 py-3 tabular-nums">{s.printed_mtr}</td>
        <td className="px-3 py-3 tabular-nums">
          {pending > 0 ? (
            <span className="font-medium text-warning">{pending}</span>
          ) : (
            <span className="text-success">0</span>
          )}
        </td>
        <td className="px-3 py-3 text-xs text-muted-foreground capitalize">
          {s.order_or_sample || "—"}
        </td>
        <td className="px-3 py-3">
          {s.is_completed ? (
            <Badge className="bg-success/20 text-success border border-success/30 px-1.5 py-0 text-[10px]">
              Done
            </Badge>
          ) : (
            <Badge className="bg-warning/20 text-warning border border-warning/30 px-1.5 py-0 text-[10px]">
              Pending
            </Badge>
          )}
        </td>
        {isAdmin && (
          <td className="px-3 py-3 text-right">
            <div className="flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={onEdit}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </td>
        )}
      </tr>

      {/* Expanded panel — full-width row showing linked task info + files.
          Lazy-loads files only when actually expanded (see SampleExpansion). */}
      {expanded && s.task_id && (
        <tr className="bg-secondary/20">
          <td
            colSpan={isAdmin ? 12 : 11}
            className="border-b border-border/60 px-4 pb-4 pt-1"
          >
            <SampleExpansion
              taskId={s.task_id}
              linkedTask={linkedTask}
              onOpenTask={() => onOpenTask(s.task_id!)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// SampleExpansion — task info + lazy-loaded file list
// ---------------------------------------------------------------------------

function SampleExpansion({
  taskId,
  linkedTask,
  onOpenTask,
}: {
  taskId: string;
  linkedTask: SampleWithTask["task"] | null;
  onOpenTask: () => void;
}) {
  const [files, setFiles] = useState<TaskFileWithUploader[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Lazy fetch. The expansion row only mounts when the chevron is open, so
  // the cost is paid per-expand rather than on the initial page load.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getTaskFiles(taskId).then((rows) => {
      if (cancelled) return;
      setFiles(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {/* Task summary */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Linked task
          </span>
          <button
            type="button"
            onClick={onOpenTask}
            className="ml-auto text-[10px] font-medium text-primary hover:underline"
          >
            Open ↗
          </button>
        </div>
        {linkedTask ? (
          <>
            <p className="font-mono text-xs text-primary">
              {linkedTask.task_code ?? "—"}
            </p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {linkedTask.concept ?? "No concept"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {[
                linkedTask.client?.party_name,
                linkedTask.assignee?.full_name,
                STATUS_LABELS[linkedTask.status as keyof typeof STATUS_LABELS] ?? linkedTask.status,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {linkedTask.description && (
              <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                {linkedTask.description}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Task details unavailable.
          </p>
        )}
      </div>

      {/* Files */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Task files
          </span>
          {files !== null && (
            <span className="rounded-full bg-secondary px-1.5 py-0 text-[9px] text-muted-foreground tabular-nums">
              {files.length}
            </span>
          )}
        </div>
        {loading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="h-7 animate-pulse rounded bg-secondary/60"
              />
            ))}
          </div>
        ) : files && files.length > 0 ? (
          <ul className="space-y-1 text-xs">
            {files.slice(0, 6).map((f) => (
              <TaskFileLink key={f.id} file={f} />
            ))}
            {files.length > 6 && (
              <li className="pt-1 text-[10px] text-muted-foreground">
                +{files.length - 6} more — open the task to see all
              </li>
            )}
          </ul>
        ) : (
          <p className="text-xs italic text-muted-foreground">
            No files attached to this task.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TaskFileLink — single row with a signed download link (lazy-resolved on click)
// ---------------------------------------------------------------------------

function TaskFileLink({ file }: { file: TaskFileWithUploader }) {
  const [busy, setBusy] = useState(false);

  // Resolve the storage path → signed URL on click. We don't pre-resolve
  // every row's URL because signed URLs cost an API call each and most files
  // never get clicked.
  async function open() {
    if (busy) return;
    setBusy(true);
    try {
      // We try multiple buckets in order — the schema doesn't store the
      // bucket, only the storage path. design-files is by far the most
      // common task-file home; sample-files + task-files are fallbacks.
      const { supabase } = await import("@/lib/supabase");
      const buckets = ["design-files", "task-files", "sample-files"];
      for (const bucket of buckets) {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(file.storage_url, 3600);
        if (!error && data?.signedUrl) {
          window.open(data.signedUrl, "_blank", "noopener");
          return;
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-2 rounded-md border border-border/60 bg-secondary/30 px-2 py-1.5">
      <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="min-w-0 flex-1 truncate text-left text-foreground hover:text-primary disabled:opacity-50"
        title={file.file_name}
      >
        {file.file_name}
      </button>
      <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
        {formatBytes(file.file_size)}
      </span>
    </li>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ============================================================================
// SAMPLE DASHBOARD — analytics tab
// ============================================================================
//
// All sample-related rollups in one tab so coordinators can switch from "log
// today's entries" mode into "how is sampling running" mode without leaving
// the page. The same data the samples table is showing — just re-shaped.

interface SampleDashboardProps {
  isAdmin: boolean;
  samples: SampleWithTask[];
  stats: { today: number; thisMonth: number; customers: number; totalPending: number };
  chartData: { date: string; count: number }[];
  aggregates: {
    total: number;
    completed: number;
    pending: number;
    completionRate: number;
    totalReceived: number;
    totalPrinted: number;
    totalPendingMtr: number;
    avgPrinted: number;
    orders: number;
    samplesOnly: number;
    untagged: number;
    topCustomers: { party_name: string; count: number }[];
  };
}

function SampleDashboard({
  isAdmin,
  samples,
  stats,
  chartData,
  aggregates,
}: SampleDashboardProps) {
  // Designer view: hide most rollups (RLS already trims to their data, but
  // the KPIs/charts are coordinator-oriented). Keep just the personal volume.
  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-2 text-sm font-medium text-foreground">
            Sample analytics are visible to coordinators and admins.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            You can still log samples from the Samples tab.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (samples.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Package className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium text-foreground">
            No sampling data yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add a few sample entries to see the rollups.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── KPI tiles ── 4 columns on md+, 2 on mobile. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={<Calendar className="h-5 w-5 text-primary" />} label="Today" value={stats.today} />
        <StatCard icon={<Package className="h-5 w-5 text-success" />} label="This Month" value={stats.thisMonth} />
        <StatCard icon={<Users className="h-5 w-5 text-muted-foreground" />} label="Customers" value={stats.customers} />
        <StatCard icon={<Clock className="h-5 w-5 text-warning" />} label="Pending" value={stats.totalPending} />
      </div>

      {/* ── Throughput strip (metres) — total received / printed / pending */}
      <Card>
        <CardContent className="grid grid-cols-3 divide-x divide-border py-4">
          <ThroughputStat
            label="Received"
            value={aggregates.totalReceived}
            unit="m"
            tone="muted"
          />
          <ThroughputStat
            label="Printed"
            value={aggregates.totalPrinted}
            unit="m"
            tone="primary"
            sub={`avg ${aggregates.avgPrinted}m / sample`}
          />
          <ThroughputStat
            label="Pending"
            value={aggregates.totalPendingMtr}
            unit="m"
            tone={aggregates.totalPendingMtr > 0 ? "warning" : "success"}
            sub={
              aggregates.totalReceived > 0
                ? `${Math.round((aggregates.totalPendingMtr / aggregates.totalReceived) * 100)}% of received`
                : undefined
            }
          />
        </CardContent>
      </Card>

      {/* ── Volume chart (span 2) + Completion donut ── */}
      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <Card className="h-full lg:col-span-2">
          <CardContent className="py-4">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Samples per day
              </h3>
              <span className="text-[10px] text-muted-foreground">last 14 days</span>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "rgb(var(--muted-foreground))", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "rgb(var(--muted-foreground))", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={25}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgb(var(--card))",
                      border: "1px solid rgb(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="rgb(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardContent className="flex h-full flex-col py-4">
            <div className="mb-3 flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Completion
              </h3>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-4">
              <CompletionDonut
                completed={aggregates.completed}
                pending={aggregates.pending}
                rate={aggregates.completionRate}
              />
              <div className="grid w-full grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-success/10 px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Done</p>
                  <p className="text-lg font-bold tabular-nums text-success">
                    {aggregates.completed}
                  </p>
                </div>
                <div className="rounded-lg bg-warning/10 px-2 py-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pending</p>
                  <p className="text-lg font-bold tabular-nums text-warning">
                    {aggregates.pending}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Top customers + Order/Sample mix ── */}
      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <Card className="h-full lg:col-span-2">
          <CardContent className="py-4">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Top customers
              </h3>
              <span className="text-[10px] text-muted-foreground">
                by sample volume
              </span>
            </div>
            {aggregates.topCustomers.length === 0 ? (
              <p className="py-6 text-center text-xs italic text-muted-foreground">
                No customer activity in range.
              </p>
            ) : (
              <ul className="space-y-2">
                {aggregates.topCustomers.map((c, i) => {
                  const max = aggregates.topCustomers[0]?.count ?? 1;
                  const pct = Math.max(8, (c.count / max) * 100);
                  return (
                    <li key={c.party_name} className="flex items-center gap-2 text-xs">
                      <span className="w-5 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                        #{i + 1}
                      </span>
                      <span className="w-32 shrink-0 truncate font-medium text-foreground" title={c.party_name}>
                        {c.party_name}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-foreground">
                        {c.count}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardContent className="flex h-full flex-col py-4">
            <div className="mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Order vs Sample
              </h3>
            </div>
            <OrderSampleMix
              orders={aggregates.orders}
              samplesOnly={aggregates.samplesOnly}
              untagged={aggregates.untagged}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Throughput stat cell (used inside the divided 3-col card) ───────────
function ThroughputStat({
  label,
  value,
  unit,
  sub,
  tone,
}: {
  label: string;
  value: number;
  unit: string;
  sub?: string;
  tone: "primary" | "warning" | "success" | "muted";
}) {
  const toneClass: Record<typeof tone, string> = {
    primary: "text-primary",
    warning: "text-warning",
    success: "text-success",
    muted: "text-foreground",
  };
  return (
    <div className="px-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-0.5 text-2xl font-bold tabular-nums", toneClass[tone])}>
        {value.toLocaleString()}
        <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
      </p>
      {sub && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

// ─── Completion donut — success vs warning split, with % in centre ───────
function CompletionDonut({
  completed,
  pending,
  rate,
}: {
  completed: number;
  pending: number;
  rate: number;
}) {
  const total = Math.max(1, completed + pending);
  const r = 56;
  const c = 2 * Math.PI * r;
  const doneLen = (completed / total) * c;

  const rateColor =
    rate >= 80 ? "text-success" : rate >= 50 ? "text-warning" : "text-destructive";

  return (
    <div className="relative h-[150px] w-[150px]">
      <svg viewBox="0 0 150 150" className="-rotate-90 h-full w-full" aria-hidden>
        <circle
          cx="75"
          cy="75"
          r={r}
          fill="none"
          stroke="rgb(var(--warning))"
          strokeWidth={16}
          opacity={0.25}
        />
        <circle
          cx="75"
          cy="75"
          r={r}
          fill="none"
          stroke="rgb(var(--success))"
          strokeWidth={16}
          strokeDasharray={`${doneLen} ${c - doneLen}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 700ms cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className={cn("text-3xl font-bold leading-none tabular-nums", rateColor)}>
          {rate}%
        </p>
        <p className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground">
          completed
        </p>
      </div>
    </div>
  );
}

// ─── Order/Sample/Untagged — segmented bar with row legend ───────────────
function OrderSampleMix({
  orders,
  samplesOnly,
  untagged,
}: {
  orders: number;
  samplesOnly: number;
  untagged: number;
}) {
  const total = Math.max(1, orders + samplesOnly + untagged);
  const rows = [
    { label: "Orders", value: orders, fill: "bg-primary", dot: "bg-primary" },
    { label: "Samples", value: samplesOnly, fill: "bg-success", dot: "bg-success" },
    {
      label: "Untagged",
      value: untagged,
      fill: "bg-muted-foreground/40",
      dot: "bg-muted-foreground/60",
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-3">
      {/* Stacked segmented bar */}
      <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
        {rows.map((r) => {
          const pct = (r.value / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={r.label}
              className={cn("h-full", r.fill)}
              style={{ width: `${pct}%`, transition: "width 700ms" }}
              title={`${r.label}: ${r.value}`}
            />
          );
        })}
      </div>
      {/* Row legend */}
      <ul className="space-y-1.5 text-xs">
        {rows.map((r) => {
          const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
          return (
            <li key={r.label} className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <span className={cn("h-2 w-2 rounded-full", r.dot)} />
                {r.label}
              </span>
              <span className="tabular-nums text-foreground">
                {r.value}
                <span className="ml-1 text-[10px] text-muted-foreground">({pct}%)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
