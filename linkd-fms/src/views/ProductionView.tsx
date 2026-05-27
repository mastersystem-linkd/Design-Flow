import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Check,
  FileIcon,
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
  MoreVertical,
  Eye,
  Pencil,
  Trash2,
  ClipboardList,
  FilterX,
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
import { useAuth } from "@/hooks/useAuth";
import {
  useSamples,
  type SampleFilters,
  type SampleWithTask,
} from "@/hooks/useSamples";
import { useProfiles } from "@/hooks/useProfiles";
import { SamplingFormDialog } from "@/components/sampling/SamplingFormDialog";
import { CompletedKittingPanel } from "@/components/tasks/CompletedKittingPanel";
import { TextileHeroWrapper } from "@/components/analytics/TextileHeroWrapper";
import { AlertBanner } from "@/components/analytics/AlertBanner";
import {
  Badge,
  Button,
  Card,
  CardContent,
  SkeletonText,
  SearchInput,
  EmptyState,
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
import { kittingDetailPath } from "@/lib/routes";
import { getKittingBySample } from "@/lib/kittingQueries";
import { ConfirmDialog } from "@/components/ui";
import {
  TABLE_HEAD,
  TABLE_TH,
  TABLE_ROW_CLICKABLE,
  TABLE_TD,
} from "@/lib/tableStyles";
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
  const [tab, setTab] = useState<"samples" | "dashboard" | "kitting">("samples");

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
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [editSample, setEditSample] = useState<SampleWithTask | Sample | null>(null);
  const [deleteSampleTarget, setDeleteSampleTarget] = useState<SampleWithTask | Sample | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Full Knitting tab — search + export are lifted into the page header
  // so they sit next to the title instead of inside the table card.
  // CompletedKittingPanel already supports externalSearch + onExportRef
  // for this exact lift-state-up pattern.
  const [kittingSearch, setKittingSearch] = useState("");
  const kittingExportRef = useRef<(() => void) | null>(null);
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

  // ── Full Knitting funnel for the Sample Dashboard ──────────────────────
  // Pulls only sample-sourced rows from full_kitting_details and buckets
  // them by data_entry_status. Re-runs when the samples list refetches so
  // a newly-uploaded FK image appears in the funnel without a full reload.
  const [fkSampleStats, setFkSampleStats] = useState<{
    pendingDeo: number;
    inProgress: number;
    completed: number;
    total: number;
  }>({ pendingDeo: 0, inProgress: 0, completed: 0, total: 0 });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("full_kitting_details")
        .select("data_entry_status")
        .not("sample_id", "is", null);
      if (cancelled || !data) return;
      let pendingDeo = 0;
      let inProgress = 0;
      let completed = 0;
      for (const row of data) {
        if (row.data_entry_status === "pending_deo" || row.data_entry_status === "pending_image") pendingDeo++;
        else if (row.data_entry_status === "in_progress") inProgress++;
        else if (row.data_entry_status === "completed") completed++;
      }
      setFkSampleStats({
        pendingDeo,
        inProgress,
        completed,
        total: pendingDeo + inProgress + completed,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [samples]);

  return (
    <div className="space-y-4">
      {/* ── Header — title left, primary actions right ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10">
            <Package className="h-5 w-5 text-warning" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Sampling</h1>
            <p className="text-xs text-muted-foreground">
              {samples.length} record{samples.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => { void refetchSamples(); }}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          {isAdmin && tab === "samples" && (
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

      {/* ── Tab strip + tab-specific filters — same row, filters right-aligned ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* no-scrollbar + touch-scroll-x lets the 3 tab pills scroll
            horizontally on phones instead of wrapping to a second row. */}
        <div className="no-scrollbar touch-scroll-x -mx-3 inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-card p-0.5 sm:mx-0">
          {([
            { id: "samples" as const, label: "Samples", icon: Package },
            { id: "dashboard" as const, label: "Sample Dashboard", icon: BarChart3 },
            { id: "kitting" as const, label: "Full Knitting", icon: Layers },
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
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
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {/* Clear-filters — shown only when search or status is non-default.
                Resets both and bumps pagination back to page 1. */}
            {(customerSearch || statusFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setCustomerSearch("");
                  setStatusFilter("all");
                  samplePg.resetPage();
                }}
                title="Clear all filters"
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2 text-xs font-medium text-muted-foreground transition-all hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive active:scale-[0.97]"
              >
                <FilterX className="h-3 w-3" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            )}
            <div className="w-full sm:w-[260px]">
              <SearchInput
                value={customerSearch}
                onChange={setCustomerSearch}
                placeholder="Search customer…"
              />
            </div>
            <div className="no-scrollbar touch-scroll-x -mx-3 flex max-w-full gap-1.5 overflow-x-auto px-3 sm:mx-0 sm:px-0">
              {(["all", "pending", "completed"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setStatusFilter(s);
                    samplePg.resetPage();
                  }}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
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
        )}
        {tab === "kitting" && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative w-full sm:w-[300px]">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={kittingSearch}
                onChange={(e) => setKittingSearch(e.target.value)}
                placeholder="Search UID or party…"
                className="h-9 pl-8 text-sm"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => kittingExportRef.current?.()}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        )}
      </div>

      {tab === "samples" && (
        <>

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
            {/* Mobile: card list. The 23-column table is unusable below
                640px; cards surface the high-signal fields per row and
                tap-to-open the same edit dialog. */}
            <div className="space-y-2 px-3 pb-3 sm:hidden">
              {visibleSamples.map((s) => (
                <SampleMobileCard
                  key={s.id}
                  sample={s}
                  canDelete={isAdmin}
                  onOpen={() => { setEditSample(s); setFormOpen(true); }}
                  onEdit={() => { setEditSample(s); setFormOpen(true); }}
                  onDelete={() => setDeleteSampleTarget(s)}
                />
              ))}
            </div>

            {/* Desktop / tablet: wide Excel-style table — every column
                from the team's sampling sheet. */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[2800px] text-sm">
                <caption className="sr-only">Sampling records</caption>
                <thead className={TABLE_HEAD}>
                  <tr>
                    <th className={TABLE_TH}>Timestamp</th>
                    <th className={TABLE_TH}>Party Name</th>
                    <th className={TABLE_TH}>Quality</th>
                    <th className={cn(TABLE_TH, "text-right")}>Received</th>
                    <th className={TABLE_TH}>Requirement</th>
                    <th className={TABLE_TH}>Assigned By</th>
                    <th className={TABLE_TH}>Sampling Done By</th>
                    <th className={TABLE_TH}>Sample Entry By</th>
                    <th className={cn(TABLE_TH, "text-right")}>Printed Mtr</th>
                    <th className={TABLE_TH}>SR NO-</th>
                    <th className={TABLE_TH}>Order / Sample</th>
                    <th className={TABLE_TH}>Completion</th>
                    <th className={cn(TABLE_TH, "text-right")}>Pending</th>
                    <th className={TABLE_TH}>Status</th>
                    <th className={TABLE_TH}>Fusing Operator</th>
                    <th className={TABLE_TH}>Neatly Prepared</th>
                    <th className={TABLE_TH}>Photo</th>
                    <th className={TABLE_TH}>Video</th>
                    <th className={TABLE_TH}>Signature</th>
                    <th className={TABLE_TH}>Comments</th>
                    <th className={TABLE_TH}>Full Knitting</th>
                    <th className={TABLE_TH}>FK Image</th>
                    <th className={TABLE_TH}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSamples.map((s) => (
                    <SampleRow
                      key={s.id}
                      sample={s}
                      profileMap={profileMap}
                      canDelete={isAdmin}
                      onView={() => { setEditSample(s); setFormOpen(true); }}
                      onEdit={() => { setEditSample(s); setFormOpen(true); }}
                      onDelete={() => setDeleteSampleTarget(s)}
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
          fkStats={fkSampleStats}
        />
      )}

      {tab === "kitting" && (
        // linkType="sample" filters to FK rows initiated from the Sampling
        // screen — brief-sourced rows live in All Tasks → Full Knitting.
        // externalSearch + onExportRef move the search box and Export CSV
        // button up into the page header.
        <CompletedKittingPanel
          includeIncomplete
          linkType="sample"
          externalSearch={kittingSearch}
          onExportRef={kittingExportRef}
        />
      )}

      {/* ── Drawers / Dialogs ── */}
      <SamplingFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          if (!o) setEditSample(null);
          setFormOpen(o);
        }}
        editSample={editSample}
        onCreate={createSample}
        onUpdate={updateSample}
        onDelete={isAdmin ? deleteSample : undefined}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        data={samples as unknown as Record<string, unknown>[]}
        columns={sampleExportColumns as unknown as CsvColumn<Record<string, unknown>>[]}
        defaultFilename="linkd-samples"
        dateField="created_at"
      />

      <ConfirmDialog
        open={!!deleteSampleTarget}
        title="Delete sample?"
        description={
          deleteSampleTarget
            ? `Delete sample "${deleteSampleTarget.party_name}" (${deleteSampleTarget.uid || "no UID"})? This cannot be undone.`
            : ""
        }
        confirmLabel={deleting ? "Deleting…" : "Delete sample"}
        variant="danger"
        onCancel={() => setDeleteSampleTarget(null)}
        onConfirm={async () => {
          if (!deleteSampleTarget) return;
          setDeleting(true);
          const { error } = await deleteSample(deleteSampleTarget.id);
          setDeleting(false);
          if (error) {
            toast.error(error);
            return;
          }
          toast.success("Sample deleted");
          setDeleteSampleTarget(null);
        }}
      />
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

// ─── KPI tile used in the hero strip on Sample Dashboard ─────────────────
// One row of 6 of these on desktop, wrapping to 3-col / 2-col on smaller
// screens. Each tile carries its own tone — icon background + value tint
// — so the strip reads like a focused dashboard rather than a flat list.
type KpiTone = "primary" | "info" | "warning" | "success" | "muted";

function KpiTile({
  icon: Icon,
  label,
  value,
  unit,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  unit?: string;
  sub?: string;
  tone: KpiTone;
}) {
  const toneText: Record<KpiTone, string> = {
    primary: "text-primary",
    info: "text-success",
    warning: "text-warning",
    success: "text-success",
    muted: "text-foreground",
  };
  const toneBg: Record<KpiTone, string> = {
    primary: "bg-primary/10 text-primary",
    info: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    success: "bg-success/10 text-success",
    muted: "bg-secondary text-muted-foreground",
  };
  return (
    <div className="flex h-full flex-col justify-center gap-0.5 px-3 py-2.5 transition-colors hover:bg-secondary/30 sm:px-4 sm:py-3">
      <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", toneBg[tone])}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <p className={cn("text-lg font-bold leading-none tabular-nums sm:text-xl", toneText[tone])}>
        {value.toLocaleString()}
        {unit && (
          <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </p>
      <p className="truncate text-[10px] font-medium text-muted-foreground sm:text-[11px]">
        {label}
      </p>
      {sub && (
        <p className="hidden truncate text-[9px] leading-tight text-muted-foreground/60 sm:block">
          {sub}
        </p>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// SampleMobileCard — phone-friendly summary with action menu.
// ----------------------------------------------------------------------------
function SampleMobileCard({
  sample: s,
  canDelete,
  onOpen,
  onEdit,
  onDelete,
}: {
  sample: SampleWithTask | Sample;
  canDelete: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const handleMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const top = Math.min(r.bottom + 4, window.innerHeight - 220);
      const left = Math.max(8, Math.min(r.right - 180, window.innerWidth - 188));
      setPos({ top, left });
    }
    setMenuOpen((p) => !p);
  }, []);

  const handleFullKnitting = useCallback(async () => {
    setMenuOpen(false);
    if (!s.requires_full_kitting) {
      toast.error("Full Knitting is not enabled for this sample");
      return;
    }
    const { data: row } = await getKittingBySample(s.id);
    if (row) {
      navigate(kittingDetailPath(row.id));
    } else {
      toast.error("No Full Knitting record found for this sample");
    }
  }, [s, navigate]);

  const pending = s.pending_qty;
  return (
    <>
      <div className={cn("relative rounded-xl border border-l-[3px] border-border/60 bg-card p-3.5 shadow-sm transition-colors hover:bg-card/80 active:scale-[0.99]", s.is_completed ? "border-l-success" : "border-l-warning")}>
        <button type="button" onClick={onOpen} className="block w-full pr-7 text-left">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-sm font-semibold text-foreground"
                title={s.uid || undefined}
              >
                {s.party_name}
              </p>
            </div>
            {s.is_completed ? (
              <Badge className="shrink-0 border border-success/30 bg-success/15 px-1.5 py-0 text-[10px] text-success">
                <Check className="mr-0.5 h-3 w-3" />Done
              </Badge>
            ) : (
              <Badge className="shrink-0 border border-warning/30 bg-warning/15 px-1.5 py-0 text-[10px] text-warning">Pending</Badge>
            )}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>{formatDate(s.created_at)}</span>
            {s.quality && (<><span aria-hidden>·</span><span className="truncate">{s.quality}</span></>)}
            {s.printed_mtr > 0 && (<><span aria-hidden>·</span><span className="tabular-nums">{s.printed_mtr}m</span></>)}
          </div>
          {pending > 0 && <p className="mt-1.5 text-[11px] font-medium text-warning">{pending} pending</p>}
        </button>
        <button ref={btnRef} type="button" onClick={handleMenu} className="absolute right-2 top-2.5 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>
      {menuOpen && createPortal(
        <>
          <div className="fixed inset-0 z-50" onClick={() => setMenuOpen(false)} />
          <div className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-card py-1 shadow-xl" style={{ top: pos.top, left: pos.left }} role="menu">
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpen(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary">
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />View details
            </button>
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEdit(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary">
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />Edit sample
            </button>
            {s.requires_full_kitting && (
              <button type="button" role="menuitem" onClick={handleFullKnitting} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary">
                <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />Full Knitting
              </button>
            )}
            {canDelete && (
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onDelete(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10">
                <Trash2 className="h-3.5 w-3.5" />Delete sample
              </button>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  );
}

function SampleRow({
  sample: s,
  profileMap,
  canDelete,
  onView,
  onEdit,
  onDelete,
}: {
  sample: SampleWithTask | Sample;
  profileMap: Map<string, string>;
  canDelete: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const pending = s.pending_qty;
  const entryBy = s.created_by ? profileMap.get(s.created_by) ?? "—" : "—";

  return (
    <tr onClick={onView} className={TABLE_ROW_CLICKABLE}>
      {/* Timestamp */}
      <td className={cn(TABLE_TD, "whitespace-nowrap text-[12px] text-muted-foreground")}>
        {formatDate(s.created_at)}
      </td>

      {/* Party — UID hidden from view; still in export + delete dialog. */}
      <td
        className={cn(TABLE_TD, "whitespace-nowrap font-medium text-foreground")}
        title={s.uid || undefined}
      >
        {s.party_name}
      </td>

      {/* Quality */}
      <td className={cn(TABLE_TD, "whitespace-nowrap text-muted-foreground")}>
        {s.quality || "—"}
      </td>

      {/* Received */}
      <td className={cn(TABLE_TD, "text-right tabular-nums")}>
        {s.total_fabrics_received ?? "—"}
      </td>

      {/* Requirement */}
      <td className={cn(TABLE_TD, "max-w-[180px] truncate text-muted-foreground")} title={s.requirement ?? ""}>
        {s.requirement || "—"}
      </td>

      {/* Assigned By */}
      <td className={cn(TABLE_TD, "whitespace-nowrap text-foreground")}>
        {s.assigned_by || "—"}
      </td>

      {/* Sampling Done By */}
      <td className={cn(TABLE_TD, "whitespace-nowrap text-foreground")}>
        {s.sampling_done_by || "—"}
      </td>

      {/* Sample Entry By — resolved from created_by */}
      <td className={cn(TABLE_TD, "whitespace-nowrap text-foreground")}>
        {entryBy}
      </td>

      {/* Printed Mtr */}
      <td className={cn(TABLE_TD, "text-right tabular-nums")}>{s.printed_mtr}</td>

      {/* SR NO- */}
      <td className={cn(TABLE_TD, "font-mono text-[11px] text-primary")}>{s.sr_no ?? "—"}</td>

      {/* Order / Sample */}
      <td className={cn(TABLE_TD, "capitalize text-muted-foreground")}>
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
      <td className={cn(TABLE_TD, "whitespace-nowrap text-[12px] text-muted-foreground")}>
        {s.completion_timestamp ? formatDate(s.completion_timestamp) : "—"}
      </td>

      {/* Pending */}
      <td className={cn(TABLE_TD, "text-right tabular-nums")}>
        {pending > 0 ? (
          <span className="font-medium text-warning">{pending}</span>
        ) : (
          <span className="text-success">0</span>
        )}
      </td>

      {/* Status — read-only. Toggle lives in the dialog. */}
      <td className={TABLE_TD}>
        {s.is_completed ? (
          <Badge className="border border-success/30 bg-success/15 px-1.5 py-0 text-[10px] text-success">
            <Check className="mr-0.5 h-3 w-3" />
            Done
          </Badge>
        ) : (
          <Badge className="border border-warning/30 bg-warning/15 px-1.5 py-0 text-[10px] text-warning">
            Pending
          </Badge>
        )}
      </td>

      {/* Fusing Operator */}
      <td className={cn(TABLE_TD, "whitespace-nowrap text-muted-foreground")}>
        {s.fusing_operator || "—"}
      </td>

      {/* Neatly Prepared */}
      <td className={TABLE_TD}>
        {s.neatly_prepared ? (
          <Badge className="border border-success/30 bg-success/15 px-1.5 py-0 text-[10px] text-success">
            Yes
          </Badge>
        ) : (
          <span className="text-[11px] text-muted-foreground">No</span>
        )}
      </td>

      {/* Photo / Video / Signature — read-only presence indicator. */}
      <td className={TABLE_TD}><FilePresenceCell path={s.photo_url} /></td>
      <td className={TABLE_TD}><FilePresenceCell path={s.video_url} /></td>
      <td className={TABLE_TD}><FilePresenceCell path={s.signature_url} /></td>

      {/* Comments */}
      <td className={cn(TABLE_TD, "max-w-[180px] truncate text-muted-foreground")} title={s.additional_comments ?? ""}>
        {s.additional_comments || "—"}
      </td>

      {/* Full Kitting */}
      <td className={TABLE_TD}>
        {s.requires_full_kitting ? (
          <Badge className="border border-primary/30 bg-primary/10 px-1.5 py-0 text-[10px] text-primary">
            Yes
          </Badge>
        ) : (
          <span className="text-[11px] text-muted-foreground">No</span>
        )}
      </td>

      {/* FK Image */}
      <td className={TABLE_TD}><FilePresenceCell path={s.full_kitting_image_url} /></td>

      {/* Actions */}
      <td className={TABLE_TD}>
        <SampleActionsMenu sample={s} canDelete={canDelete} onView={onView} onEdit={onEdit} onDelete={onDelete} />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// SampleActionsMenu — portal-based 3-dot dropdown for each row.
// ---------------------------------------------------------------------------
function SampleActionsMenu({
  sample: s,
  canDelete,
  onView,
  onEdit,
  onDelete,
}: {
  sample: SampleWithTask | Sample;
  canDelete: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const navigate = useNavigate();

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        const top = Math.min(r.bottom + 4, window.innerHeight - 220);
        const left = Math.max(8, Math.min(r.right - 180, window.innerWidth - 188));
        setPos({ top, left });
      }
      setOpen((p) => !p);
    },
    []
  );

  const handleFullKnitting = useCallback(async () => {
    setOpen(false);
    const { data: row } = await getKittingBySample(s.id);
    if (row) {
      navigate(kittingDetailPath(row.id));
    } else {
      toast.error("No Full Knitting record found");
    }
  }, [s.id, navigate]);

  return (
    <>
      <button ref={btnRef} type="button" onClick={handleOpen} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} />
          <div className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-card py-1 shadow-xl" style={{ top: pos.top, left: pos.left }} role="menu">
            <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setOpen(false); onView(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary">
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />View details
            </button>
            <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary">
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />Edit sample
            </button>
            {s.requires_full_kitting && (
              <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); handleFullKnitting(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary">
                <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />Full Knitting
              </button>
            )}
            {canDelete && (
              <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10">
                <Trash2 className="h-3.5 w-3.5" />Delete sample
              </button>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// FilePresenceCell — read-only cell indicator that a file has been attached.
// Clicking the cell does NOT open the file (row click opens the dialog,
// where the user can View / Replace / Remove). Keeps cell behavior
// predictable: every cell defers to the row's onClick.
// ---------------------------------------------------------------------------
function FilePresenceCell({ path }: { path: string | null }) {
  if (!path) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  return (
    <Badge className="border border-success/30 bg-success/15 px-1.5 py-0 text-[10px] text-success">
      <Check className="mr-0.5 h-3 w-3" />
      Attached
    </Badge>
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
  /** Sample-sourced Full Knitting funnel — pulled separately from
   *  full_kitting_details since that pipeline isn't on the samples row. */
  fkStats: {
    pendingDeo: number;
    inProgress: number;
    completed: number;
    total: number;
  };
}

function SampleDashboard({
  isAdmin,
  samples,
  stats,
  chartData,
  aggregates,
  fkStats,
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

  // Coverage figure for the KPI strip — counts samples flagged with FK
  // (image uploaded). Single source of truth on the dashboard for the FK
  // funnel; the dedicated FK section below shows the per-status detail.
  const pendingShare =
    aggregates.totalReceived > 0
      ? Math.round((aggregates.totalPendingMtr / aggregates.totalReceived) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* ── Hero KPI strip — every primary metric in one row, dividers
           between tiles. Wrapped in the shared TextileHeroWrapper so the
           Sample Dashboard reads as part of the same visual system. */}
      <TextileHeroWrapper className="p-0 sm:p-0">
        <div className="grid grid-cols-2 divide-x divide-y divide-border/40 sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6">
          <KpiTile
            icon={Calendar}
            label="Today"
            value={stats.today}
            tone="primary"
            sub="new entries"
          />
          <KpiTile
            icon={Package}
            label="This Month"
            value={stats.thisMonth}
            tone="info"
            sub={`of ${aggregates.total} total`}
          />
          <KpiTile
            icon={Users}
            label="Customers"
            value={stats.customers}
            tone="muted"
            sub="active parties"
          />
          <KpiTile
            icon={TrendingUp}
            label="Received"
            value={aggregates.totalReceived}
            unit="m"
            tone="muted"
            sub="fabric in"
          />
          <KpiTile
            icon={Layers}
            label="Printed"
            value={aggregates.totalPrinted}
            unit="m"
            tone="primary"
            sub={`avg ${aggregates.avgPrinted}m / sample`}
          />
          <KpiTile
            icon={Clock}
            label="Pending"
            value={aggregates.pending}
            tone={aggregates.pending > 0 ? "warning" : "success"}
            sub={
              aggregates.totalPendingMtr > 0
                ? `${aggregates.totalPendingMtr}m · ${pendingShare}% of received`
                : "all clear"
            }
          />
        </div>
      </TextileHeroWrapper>

      {/* Alert when the pending-sample pile starts stacking up. */}
      {aggregates.pending > 5 && (
        <AlertBanner
          variant="warning"
          title="Pending Samples"
          count={aggregates.pending}
          description={`${aggregates.totalPendingMtr}m of fabric still to print across pending samples.`}
        />
      )}

      {/* ── Volume chart (span 2) + Completion donut ── */}
      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <Card className="h-full lg:col-span-2">
          <CardContent className="py-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <TrendingUp className="h-4 w-4 text-primary" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Samples per day
                </h3>
                <span className="text-[10px] text-muted-foreground">last 14 days</span>
              </div>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
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
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <PieChartIcon className="h-4 w-4 text-primary" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Completion
                </h3>
                <span className="text-[10px] text-muted-foreground">
                  done vs pending
                </span>
              </div>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <CompletionDonut
                completed={aggregates.completed}
                pending={aggregates.pending}
                rate={aggregates.completionRate}
              />
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                <LegendDot color="bg-success" label={`Done ${aggregates.completed}`} />
                <LegendDot color="bg-warning" label={`Pending ${aggregates.pending}`} />
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
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-4 w-4 text-primary" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Top customers
                </h3>
                <span className="text-[10px] text-muted-foreground">
                  by sample volume
                </span>
              </div>
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
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <Layers className="h-4 w-4 text-primary" />
              </span>
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

      {/* ── Full Knitting funnel — sample-sourced FK forms across their
           three lifecycle stages. Coverage = how many samples flagged FK
           actually have an FK row created (image uploaded). */}
      <FullKnittingPanel samples={samples} fkStats={fkStats} />
    </div>
  );
}

// ─── Full Knitting funnel block ──────────────────────────────────────────
function FullKnittingPanel({
  samples,
  fkStats,
}: {
  samples: SampleWithTask[];
  fkStats: { pendingDeo: number; inProgress: number; completed: number; total: number };
}) {
  const flagged = samples.filter((s) => s.requires_full_kitting).length;
  const withImage = samples.filter(
    (s) => s.requires_full_kitting && s.full_kitting_image_url
  ).length;
  const coverage = flagged > 0 ? Math.round((withImage / flagged) * 100) : 0;
  const total = Math.max(1, fkStats.total);
  const pendingPct = (fkStats.pendingDeo / total) * 100;
  const inProgPct = (fkStats.inProgress / total) * 100;
  const donePct = (fkStats.completed / total) * 100;

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Layers className="h-4 w-4 text-primary" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Full Knitting Pipeline
            </h3>
            <span className="text-[10px] text-muted-foreground">
              sample-sourced FK forms
            </span>
          </div>
        </div>

        {/* 4 KPI tiles in a row — mirrors the dashboard's KPI strip */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <FkStatTile
            label="Flagged"
            value={flagged}
            sub={flagged > 0 ? `${withImage} with image · ${coverage}% coverage` : "No samples flagged"}
            tone="muted"
          />
          <FkStatTile label="Pending DEO" value={fkStats.pendingDeo} tone="destructive" />
          <FkStatTile label="In Progress" value={fkStats.inProgress} tone="warning" />
          <FkStatTile label="Completed" value={fkStats.completed} tone="success" />
        </div>

        {/* Funnel progress bar — relative width of each status. Hidden when
            no FK rows exist yet so we don't render an empty grey bar. */}
        {fkStats.total > 0 && (
          <div className="space-y-1.5">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              {pendingPct > 0 && (
                <div
                  className="h-full bg-destructive transition-[width] duration-700"
                  style={{ width: `${pendingPct}%` }}
                  title={`Pending DEO: ${fkStats.pendingDeo}`}
                />
              )}
              {inProgPct > 0 && (
                <div
                  className="h-full bg-warning transition-[width] duration-700"
                  style={{ width: `${inProgPct}%` }}
                  title={`In Progress: ${fkStats.inProgress}`}
                />
              )}
              {donePct > 0 && (
                <div
                  className="h-full bg-success transition-[width] duration-700"
                  style={{ width: `${donePct}%` }}
                  title={`Completed: ${fkStats.completed}`}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
              <LegendDot color="bg-destructive" label={`Pending DEO ${fkStats.pendingDeo}`} />
              <LegendDot color="bg-warning" label={`In Progress ${fkStats.inProgress}`} />
              <LegendDot color="bg-success" label={`Completed ${fkStats.completed}`} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FkStatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone: "muted" | "destructive" | "warning" | "success";
}) {
  const toneText: Record<typeof tone, string> = {
    muted: "text-foreground",
    destructive: "text-destructive",
    warning: "text-warning",
    success: "text-success",
  };
  const toneBg: Record<typeof tone, string> = {
    muted: "bg-secondary",
    destructive: "bg-destructive/10",
    warning: "bg-warning/10",
    success: "bg-success/10",
  };
  return (
    <div className={cn("rounded-lg px-3 py-3", toneBg[tone])}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-0.5 text-2xl font-bold leading-none tabular-nums", toneText[tone])}>
        {value}
      </p>
      {sub && (
        <p className="mt-1.5 text-[10px] leading-tight text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", color)} aria-hidden />
      {label}
    </span>
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
