import { useEffect, useMemo, useRef, useState } from "react";
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
  Upload,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompression";
import { useAuth } from "@/hooks/useAuth";
import {
  useSamples,
  type SampleFilters,
  type SampleWithTask,
} from "@/hooks/useSamples";
import { useProfiles } from "@/hooks/useProfiles";
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
  const { profiles: designers } = useProfiles({ roles: ["designer"] });

  const role: UserRole = profile?.role ?? "designer";
  const isAdmin = isAdminOrCoordinator(role);

  // Lookup map for "Sample Entry By" column. `created_by` on samples stores
  // the auth.users uuid of whoever clicked Save in the form — we resolve it
  // to a friendly name via the profiles table. Cached by React Query.
  const { profiles: allProfiles } = useProfiles();
  const profileMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of allProfiles ?? []) m.set(p.id, p.full_name);
    return m;
  }, [allProfiles]);

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
              {samples.length} record{samples.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { void refetchSamples(); }}
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
            {/* Wide Excel-style table — every column from the team's
                sampling sheet. Horizontal scroll because it's ~2800px wide. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[2800px] text-sm">
                <caption className="sr-only">Sampling records</caption>
                <thead>
                  <tr className="whitespace-nowrap border-b border-border bg-card/30 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Timestamp</th>
                    <th className="px-3 py-2 font-medium">UID</th>
                    <th className="px-3 py-2 font-medium">Party Name</th>
                    <th className="px-3 py-2 font-medium">Quality</th>
                    <th className="px-3 py-2 font-medium text-right">Received</th>
                    <th className="px-3 py-2 font-medium">Requirement</th>
                    <th className="px-3 py-2 font-medium">Assigned By</th>
                    <th className="px-3 py-2 font-medium">Sampling Done By</th>
                    <th className="px-3 py-2 font-medium">Sample Entry By</th>
                    <th className="px-3 py-2 font-medium text-right">Printed Mtr</th>
                    <th className="px-3 py-2 font-medium">Order / Sample</th>
                    <th className="px-3 py-2 font-medium">Completion</th>
                    <th className="px-3 py-2 font-medium text-right">Pending</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Fusing Operator</th>
                    <th className="px-3 py-2 font-medium">Neatly Prepared</th>
                    <th className="px-3 py-2 font-medium">Photo</th>
                    <th className="px-3 py-2 font-medium">Video</th>
                    <th className="px-3 py-2 font-medium">Form</th>
                    <th className="px-3 py-2 font-medium">Signature</th>
                    <th className="px-3 py-2 font-medium">Comments</th>
                    <th className="px-3 py-2 font-medium">Full Knitting</th>
                    <th className="px-3 py-2 font-medium">FK Image</th>
                    {isAdmin && (
                      <th className="sticky right-0 z-10 bg-card/30 px-3 py-2 text-right font-medium">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleSamples.map((s) => (
                    <SampleRow
                      key={s.id}
                      sample={s}
                      isAdmin={isAdmin}
                      profileMap={profileMap}
                      onEdit={() => {
                        setEditSample(s);
                        setFormOpen(true);
                      }}
                      onDelete={() => setDeletingSample(s)}
                      onUpdate={updateSample}
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
  profileMap,
  onEdit,
  onDelete,
  onUpdate,
}: {
  sample: SampleWithTask | Sample;
  isAdmin: boolean;
  /** profile_id → full_name lookup. Used for the "Sample Entry By" column
   *  which resolves the row's `created_by` uuid to a name. */
  profileMap: Map<string, string>;
  onEdit: () => void;
  onDelete: () => void;
  /**
   * Inline update — the row uses this for the "Mark Done" / "Undo" status
   * toggle without going through the full edit drawer.
   */
  onUpdate: (
    id: string,
    patch: { is_completed?: boolean; completion_timestamp?: string | null }
  ) => Promise<{ data: unknown; error: string | null }>;
}) {
  const pending = s.pending_qty;
  const [statusBusy, setStatusBusy] = useState(false);

  // Inline status toggle — flips is_completed and stamps/clears the
  // completion_timestamp atomically so the audit trail stays clean.
  async function toggleStatus() {
    if (statusBusy) return;
    setStatusBusy(true);
    const next = !s.is_completed;
    const { error } = await onUpdate(s.id, {
      is_completed: next,
      completion_timestamp: next ? new Date().toISOString() : null,
    });
    setStatusBusy(false);
    if (error) toast.error(error);
    else toast.success(next ? "Sample marked complete" : "Sample marked pending");
  }

  const entryBy = s.created_by ? profileMap.get(s.created_by) ?? "—" : "—";

  return (
    <>
      <tr
        className="border-b border-border/60 transition-colors hover:bg-card/60"
      >
        {/* Timestamp */}
        <td className="whitespace-nowrap px-3 py-3 text-[12px] text-muted-foreground">
          {formatDate(s.created_at)}
        </td>

        {/* UID */}
        <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-primary">
          {s.uid || "—"}
        </td>

        {/* Party */}
        <td className="whitespace-nowrap px-3 py-3 text-foreground">
          {s.party_name}
        </td>

        {/* Quality */}
        <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
          {s.quality || "—"}
        </td>

        {/* Received */}
        <td className="px-3 py-3 text-right tabular-nums">
          {s.total_fabrics_received ?? "—"}
        </td>

        {/* Requirement */}
        <td className="max-w-[180px] truncate px-3 py-3 text-muted-foreground" title={s.requirement ?? ""}>
          {s.requirement || "—"}
        </td>

        {/* Assigned By */}
        <td className="whitespace-nowrap px-3 py-3 text-foreground">
          {s.assigned_by || "—"}
        </td>

        {/* Sampling Done By */}
        <td className="whitespace-nowrap px-3 py-3 text-foreground">
          {s.sampling_done_by || "—"}
        </td>

        {/* Sample Entry By — resolved from created_by */}
        <td className="whitespace-nowrap px-3 py-3 text-foreground">
          {entryBy}
        </td>

        {/* Printed Mtr */}
        <td className="px-3 py-3 text-right tabular-nums">{s.printed_mtr}</td>

        {/* Order / Sample */}
        <td className="px-3 py-3 text-xs capitalize text-muted-foreground">
          {s.order_or_sample ? (
            <Badge
              className={cn(
                "border px-1.5 py-0 text-[10px]",
                s.order_or_sample === "order"
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "bg-success/10 text-success border-success/20"
              )}
            >
              {s.order_or_sample}
            </Badge>
          ) : (
            "—"
          )}
        </td>

        {/* Completion Timestamp */}
        <td className="whitespace-nowrap px-3 py-3 text-[12px] text-muted-foreground">
          {s.completion_timestamp ? formatDate(s.completion_timestamp) : "—"}
        </td>

        {/* Pending */}
        <td className="px-3 py-3 text-right tabular-nums">
          {pending > 0 ? (
            <span className="font-medium text-warning">{pending}</span>
          ) : (
            <span className="text-success">0</span>
          )}
        </td>

        {/* Status — interactive: Pending badge has a "Mark Done" button,
            Done badge has a small "Undo" button. Click flips
            is_completed and stamps/clears completion_timestamp. */}
        <td className="px-3 py-3">
          {s.is_completed ? (
            <div className="flex items-center gap-1.5">
              <Badge className="border border-success/30 bg-success/15 px-1.5 py-0 text-[10px] text-success">
                <Check className="mr-0.5 h-3 w-3" />
                Done
              </Badge>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => void toggleStatus()}
                  disabled={statusBusy}
                  className="rounded-md border border-border bg-card px-1.5 py-0 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                  title="Reopen as pending"
                >
                  Undo
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Badge className="border border-warning/30 bg-warning/15 px-1.5 py-0 text-[10px] text-warning">
                Pending
              </Badge>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => void toggleStatus()}
                  disabled={statusBusy}
                  className="rounded-md border border-success/30 bg-success/10 px-1.5 py-0 text-[10px] font-medium text-success transition-colors hover:bg-success/20 disabled:opacity-50"
                  title="Mark as completed"
                >
                  {statusBusy ? "…" : "Mark Done"}
                </button>
              )}
            </div>
          )}
        </td>

        {/* Fusing Operator */}
        <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
          {s.fusing_operator || "—"}
        </td>

        {/* Neatly Prepared */}
        <td className="px-3 py-3">
          {s.neatly_prepared ? (
            <Badge className="border border-success/30 bg-success/15 px-1.5 py-0 text-[10px] text-success">
              Yes
            </Badge>
          ) : (
            <span className="text-[11px] text-muted-foreground">No</span>
          )}
        </td>

        {/* Photo */}
        <td className="px-3 py-3">
          <SampleFileSlot
            sampleId={s.id}
            field="photo_url"
            currentPath={s.photo_url}
            canEdit={isAdmin}
            onUpdate={onUpdate}
          />
        </td>

        {/* Video */}
        <td className="px-3 py-3">
          <SampleFileSlot
            sampleId={s.id}
            field="video_url"
            currentPath={s.video_url}
            canEdit={isAdmin}
            onUpdate={onUpdate}
          />
        </td>

        {/* Form */}
        <td className="px-3 py-3">
          {s.has_form ? (
            <Badge className="border border-success/30 bg-success/15 px-1.5 py-0 text-[10px] text-success">
              Yes
            </Badge>
          ) : (
            <span className="text-[11px] text-muted-foreground">No</span>
          )}
        </td>

        {/* Signature */}
        <td className="px-3 py-3">
          <SampleFileSlot
            sampleId={s.id}
            field="signature_url"
            currentPath={s.signature_url}
            canEdit={isAdmin}
            onUpdate={onUpdate}
          />
        </td>

        {/* Comments */}
        <td className="max-w-[180px] truncate px-3 py-3 text-muted-foreground" title={s.additional_comments ?? ""}>
          {s.additional_comments || "—"}
        </td>

        {/* Full Kitting */}
        <td className="px-3 py-3">
          {s.requires_full_kitting ? (
            <Badge className="border border-primary/30 bg-primary/10 px-1.5 py-0 text-[10px] text-primary">
              Yes
            </Badge>
          ) : (
            <span className="text-[11px] text-muted-foreground">No</span>
          )}
        </td>

        {/* FK Image */}
        <td className="px-3 py-3">
          <SampleFileSlot
            sampleId={s.id}
            field="full_kitting_image_url"
            currentPath={s.full_kitting_image_url}
            canEdit={isAdmin}
            onUpdate={onUpdate}
          />
        </td>

        {/* Actions — sticky right so they stay reachable while horizontally
            scrolling such a wide table. */}
        {isAdmin && (
          <td className="sticky right-0 z-10 bg-card/95 px-3 py-3 text-right shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)]">
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

    </>
  );
}

// ---------------------------------------------------------------------------
// SampleFileSlot — per-cell uploader for photo / video / signature / FK image
// ---------------------------------------------------------------------------
//
// Each row's Photo / Video / Signature / FK Image cells use this. When the
// column is empty it renders a "+ Upload" affordance; when set, it renders
// a "✓ View" pill with an inline × that removes the storage object and
// clears the DB column. Per-file 100 MB cap (matches the bucket policy).

const FK_BUCKET = "sample-files";
const MAX_SAMPLE_FILE_BYTES = 100 * 1024 * 1024;

type SampleFileField =
  | "photo_url"
  | "video_url"
  | "signature_url"
  | "full_kitting_image_url";

const FIELD_ACCEPT: Record<SampleFileField, string> = {
  photo_url: "image/*",
  video_url: "video/*",
  signature_url: "image/*",
  full_kitting_image_url: "image/*,application/pdf",
};

function SampleFileSlot({
  sampleId,
  field,
  currentPath,
  canEdit,
  onUpdate,
}: {
  sampleId: string;
  /** Which column on `samples` this slot reads/writes. */
  field: SampleFileField;
  currentPath: string | null;
  /** Admins/coordinators see upload + remove; designers see view-only. */
  canEdit: boolean;
  onUpdate: (
    id: string,
    patch: Record<string, string | null>
  ) => Promise<{ data: unknown; error: string | null }>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    if (file.size > MAX_SAMPLE_FILE_BYTES) {
      toast.error(`"${file.name}" is over 100 MB.`);
      return;
    }
    setBusy(true);
    try {
      // Best-effort compress for image fields; non-images pass through.
      const processed = await compressImage(file);
      const safe = processed.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `samples/${sampleId}/${field}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from(FK_BUCKET)
        .upload(path, processed, {
          contentType: processed.type || "application/octet-stream",
          upsert: false,
        });
      if (upErr) {
        toast.error(`Upload failed: ${upErr.message}`);
        return;
      }
      const { error: dbErr } = await onUpdate(sampleId, { [field]: path });
      if (dbErr) {
        toast.error(dbErr);
        // Best-effort cleanup if the DB write failed but storage succeeded.
        void supabase.storage.from(FK_BUCKET).remove([path]);
        return;
      }
      toast.success("File uploaded");
    } finally {
      setBusy(false);
    }
  }

  async function handleView() {
    if (!currentPath) return;
    const { data, error } = await supabase.storage
      .from(FK_BUCKET)
      .createSignedUrl(currentPath, 3600);
    if (error || !data?.signedUrl) {
      toast.error("Couldn't open file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function handleRemove() {
    if (!currentPath) return;
    setBusy(true);
    try {
      // Best-effort storage delete — even if the object is already missing
      // we still clear the DB pointer so the cell reads as empty.
      void supabase.storage.from(FK_BUCKET).remove([currentPath]);
      const { error } = await onUpdate(sampleId, { [field]: null });
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("File removed");
    } finally {
      setBusy(false);
    }
  }

  // Hidden picker shared across all states so we never mount/unmount it.
  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept={FIELD_ACCEPT[field]}
      className="hidden"
      onChange={handlePick}
    />
  );

  if (currentPath) {
    return (
      <>
        <div className="inline-flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => void handleView()}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success transition-colors hover:bg-success/20 disabled:opacity-50"
            title="Open file"
          >
            <Check className="h-3 w-3" />
            View
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={busy}
              className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              title="Remove"
              aria-label="Remove file"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {hiddenInput}
      </>
    );
  }

  if (!canEdit) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
        title="Upload file"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        Upload
      </button>
      {hiddenInput}
    </>
  );
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
