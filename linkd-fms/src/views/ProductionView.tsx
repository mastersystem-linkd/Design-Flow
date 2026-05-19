import { useMemo, useState } from "react";
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
import { useSamples, type SampleFilters } from "@/hooks/useSamples";
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
} from "@/components/ui";
import { Input } from "@/components/ui/input";
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
    isLoading: samplesLoading,
    refetch: refetchSamples,
    createSample,
    updateSample,
    deleteSample,
  } = useSamples(sampleFilters);

  // ── State ──
  const [formOpen, setFormOpen] = useState(false);
  const [editSample, setEditSample] = useState<Sample | null>(null);
  const [deletingSample, setDeletingSample] = useState<Sample | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [samplePage, setSamplePage] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const PAGE_SIZE = 20;

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

  const visibleSamples = samples.slice(0, (samplePage + 1) * PAGE_SIZE);
  const hasMoreSamples = visibleSamples.length < samples.length;

  // ── Stats ──
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

      {/* ── Stats (admin/coordinator) ── */}
      {isAdmin && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard icon={<Calendar className="h-5 w-5 text-primary" />} label="Today" value={stats.today} />
          <StatCard icon={<Package className="h-5 w-5 text-success" />} label="This Month" value={stats.thisMonth} />
          <StatCard icon={<Users className="h-5 w-5 text-muted-foreground" />} label="Customers" value={stats.customers} />
          <StatCard icon={<Clock className="h-5 w-5 text-warning" />} label="Pending" value={stats.totalPending} />
        </div>
      )}

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
              onClick={() => { setStatusFilter(s); setSamplePage(0); }}
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
                <thead>
                  <tr className="border-b border-border bg-card/30 text-left text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">UID</th>
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
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {hasMoreSamples && (
              <div className="border-t border-border px-4 py-3 text-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSamplePage((p) => p + 1)}
                >
                  Load more ({samples.length - visibleSamples.length} remaining)
                </Button>
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

      {/* ── Chart (admin/coordinator) ── */}
      {isAdmin && samples.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Samples Per Day (Last 14 Days)
          </h3>
          <div className="h-48">
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
        </section>
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
}: {
  sample: Sample;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const pending = s.pending_qty;

  return (
    <tr className="border-b border-border/60 transition-colors hover:bg-card/60">
      <td className="whitespace-nowrap px-3 py-3 text-[12px] text-muted-foreground">
        {formatDate(s.created_at)}
      </td>
      <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-primary">
        {s.uid || "—"}
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
  );
}
