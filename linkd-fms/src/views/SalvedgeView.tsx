import { useMemo, useState } from "react";
import {
  Plus, Pencil, Trash2, Package, RefreshCw, CheckCircle2,
  Palette, Layers, AlertCircle, BarChart3, TrendingUp, Clock,
  Users, Building2, LayoutDashboard, Table2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import { useSalvedge } from "@/hooks/useSalvedge";
import { useClients } from "@/hooks/useClients";
import { useProfiles } from "@/hooks/useProfiles";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Card, CardContent, Button, Badge, ConfirmDialog,
  SkeletonText, EmptyState, toast,
} from "@/components/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { cn, formatDate } from "@/lib/utils";
import { isAdminOrCoordinator } from "@/lib/permissions";
import { TABLE_HEAD, TABLE_TH, TABLE_ROW, TABLE_TD } from "@/lib/tableStyles";
import { TextileHeroWrapper } from "@/components/analytics/TextileHeroWrapper";
import { AlertBanner } from "@/components/analytics/AlertBanner";
import type { SalvedgeRecord } from "@/types/database";

// ============================================================================
// View
// ============================================================================

export function SalvedgeView() {
  const { profile } = useAuth();
  const role = profile?.role ?? "designer";
  const isAdmin = isAdminOrCoordinator(role);
  const isDesigner = role === "designer";

  const { records: allRecords, isLoading, refetch, createRecord, updateRecord, deleteRecord } = useSalvedge();
  const { clients } = useClients();
  const { profiles: designers } = useProfiles({ roles: ["designer"] });

  // Designers only see records assigned to them
  const records = useMemo(
    () => isDesigner ? allRecords.filter((r) => r.designer_id === profile?.id) : allRecords,
    [allRecords, isDesigner, profile?.id]
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<SalvedgeRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SalvedgeRecord | null>(null);

  // Records first by default for everyone — the operational view is what
  // users open Salvedge to do; the dashboard is a follow-up read.
  const [activeTab, setActiveTab] = useState<"dashboard" | "records">("records");

  // Stats
  const stats = useMemo(() => {
    const total = records.length;
    const completed = records.filter((r) => r.is_completed).length;
    const pending = records.filter((r) => !r.is_completed).length;
    const totalQty = records.reduce((s, r) => s + r.qty, 0);
    return { total, completed, pending, totalQty };
  }, [records]);

  const analytics = useMemo(() => {
    const completionRate = records.length > 0
      ? Math.round((stats.completed / records.length) * 100)
      : 0;
    const avgQty = records.length > 0
      ? Math.round(stats.totalQty / records.length)
      : 0;
    const completedQtyTotal = records.reduce((s, r) => s + r.completed_qty, 0);
    const pendingQtyTotal = stats.totalQty - completedQtyTotal;

    const partyMap = new Map<string, { qty: number; completed: number; count: number }>();
    for (const r of records) {
      const prev = partyMap.get(r.party_name) ?? { qty: 0, completed: 0, count: 0 };
      partyMap.set(r.party_name, {
        qty: prev.qty + r.qty,
        completed: prev.completed + r.completed_qty,
        count: prev.count + 1,
      });
    }
    const partyData = Array.from(partyMap.entries())
      .map(([name, v]) => ({
        name: name.length > 18 ? name.slice(0, 18) + "…" : name,
        fullName: name,
        ...v,
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);

    const designerMap = new Map<string, { name: string; total: number; completed: number; pending: number; qty: number }>();
    for (const r of records) {
      const dName = designers.find((d) => d.id === r.designer_id)?.full_name ?? "Unassigned";
      const prev = designerMap.get(dName) ?? { name: dName, total: 0, completed: 0, pending: 0, qty: 0 };
      designerMap.set(dName, {
        name: dName,
        total: prev.total + 1,
        completed: prev.completed + (r.is_completed ? 1 : 0),
        pending: prev.pending + (r.is_completed ? 0 : 1),
        qty: prev.qty + r.qty,
      });
    }
    const designerData = Array.from(designerMap.values()).sort((a, b) => b.total - a.total);

    const completedRecords = records.filter((r) => r.is_completed && r.completion_timestamp);
    const avgCompletionDays =
      completedRecords.length > 0
        ? Math.round(
            (completedRecords.reduce((s, r) => {
              const created = new Date(r.created_at).getTime();
              const done = new Date(r.completion_timestamp!).getTime();
              return s + (done - created) / (1000 * 60 * 60 * 24);
            }, 0) /
              completedRecords.length) *
              10
          ) / 10
        : null;

    return { completionRate, avgQty, completedQtyTotal, pendingQtyTotal, partyData, designerData, avgCompletionDays };
  }, [records, stats, designers]);

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await deleteRecord(deleteTarget.id);
    if (error) { toast.error(error); return; }
    toast.success("Record deleted");
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-4">
      {/* ── Salvedge Banner — matches Design Studio style ── */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-r from-primary/5 via-card to-card">
        <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary via-success to-warning" />
        <svg
          className="absolute right-0 top-0 h-full w-40 opacity-[0.03]"
          viewBox="0 0 160 80"
          aria-hidden="true"
        >
          {Array.from({ length: 20 }).map((_, i) => (
            <line key={`h${i}`} x1="0" y1={i * 4} x2="160" y2={i * 4} stroke="currentColor" strokeWidth="1" />
          ))}
          {Array.from({ length: 40 }).map((_, i) => (
            <line key={`v${i}`} x1={i * 4} y1="0" x2={i * 4} y2="80" stroke="currentColor" strokeWidth="0.5" />
          ))}
        </svg>
        <div className="relative flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Palette className="h-[18px] w-[18px] text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Salvedge</p>
              <p className="text-[11px] text-muted-foreground">
                {records.length} records · Fabric distribution tracking
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-1 sm:flex" title="Fabric color palette">
              <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-sm" />
              <span className="h-2.5 w-2.5 rounded-full bg-success shadow-sm" />
              <span className="h-2.5 w-2.5 rounded-full bg-warning shadow-sm" />
              <span className="h-2.5 w-2.5 rounded-full bg-destructive shadow-sm" />
            </div>
            {stats.pending > 0 && (
              <Badge
                className={cn(
                  "border transition-colors",
                  stats.pending > 3
                    ? "bg-destructive/10 text-destructive border-destructive/20 animate-pulse"
                    : "bg-warning/10 text-warning border-warning/20"
                )}
              >
                {stats.pending} pending
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Refresh</span>
            </Button>
            {isAdmin && (
              <Button size="sm" className="gap-1.5" onClick={() => { setEditRecord(null); setFormOpen(true); }}>
                <Plus className="h-3.5 w-3.5" /> Add Record
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Tab Switcher — Records first, Dashboard second ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-secondary p-1">
          <button
            type="button"
            onClick={() => setActiveTab("records")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors",
              activeTab === "records"
                ? "bg-primary text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Table2 className="h-3.5 w-3.5" />
            Records
            <Badge variant="secondary" className="ml-1 h-4 min-w-[18px] px-1 text-[10px]">
              {records.length}
            </Badge>
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab("dashboard")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors",
                activeTab === "dashboard"
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </button>
          )}
        </div>
      </div>

      {/* ── DASHBOARD TAB ── */}
      {activeTab === "dashboard" && isAdmin && (
        <div className="space-y-4">
          {/* KPI strip — flat divided grid matching Task / Concept dashboards */}
          <TextileHeroWrapper className="p-0 sm:p-0">
            <div className="grid grid-cols-2 divide-x divide-y divide-border/40 sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6">
              <FlatKpiTile icon={<Layers className="h-4 w-4 text-primary" />} label="Total Records" value={stats.total} tint="bg-primary/10" />
              <FlatKpiTile icon={<CheckCircle2 className="h-4 w-4 text-success" />} label="Completed" value={stats.completed} tint="bg-success/10" color="text-success" />
              <FlatKpiTile icon={<AlertCircle className="h-4 w-4 text-warning" />} label="Pending" value={stats.pending} tint="bg-warning/10" color="text-warning" />
              <FlatKpiTile icon={<BarChart3 className="h-4 w-4 text-primary" />} label="Total Qty" value={stats.totalQty} tint="bg-primary/10" />
              <FlatKpiTile icon={<TrendingUp className="h-4 w-4 text-success" />} label="Completion Rate" value={analytics.completionRate} tint="bg-success/10" color={analytics.completionRate >= 70 ? "text-success" : analytics.completionRate >= 40 ? "text-warning" : "text-destructive"} suffix="%" />
              <FlatKpiTile icon={<Clock className="h-4 w-4 text-primary" />} label="Avg Completion" value={analytics.avgCompletionDays ?? 0} tint="bg-primary/10" suffix={analytics.avgCompletionDays !== null ? "d" : ""} />
            </div>
          </TextileHeroWrapper>

          {analytics.pendingQtyTotal > 0 && stats.pending >= 3 ? (
            <AlertBanner
              variant="warning"
              title="Incomplete Salvedge"
              count={stats.pending}
              description={`${analytics.pendingQtyTotal} units still pending distribution.`}
            />
          ) : null}

          {/* Completion Ring + Party Distribution */}
          <div className="grid gap-3 lg:grid-cols-3">
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-4">
                <CompletionRing completed={stats.completed} total={records.length} />
                <div className="mt-4 grid w-full grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-success/10 px-3 py-2">
                    <p className="text-lg font-bold tabular-nums text-success">{analytics.completedQtyTotal}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Completed Qty</p>
                  </div>
                  <div className="rounded-lg bg-warning/10 px-3 py-2">
                    <p className="text-lg font-bold tabular-nums text-warning">{analytics.pendingQtyTotal}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Pending Qty</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-4 w-4 text-primary" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Party Distribution</p>
                    <p className="text-[11px] text-muted-foreground">Quantity distributed by party</p>
                  </div>
                </div>
                {analytics.partyData.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">No party data yet</p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(160, analytics.partyData.length * 36)}>
                    <BarChart data={analytics.partyData} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
                      <XAxis type="number" tick={{ fontSize: 10, fill: "rgb(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "rgb(var(--foreground))" }} axisLine={false} tickLine={false} />
                      <RechartsTooltip
                        contentStyle={{ background: "rgb(var(--card))", border: "1px solid rgb(var(--border))", borderRadius: 8, fontSize: 12 }}
                      />
                      <Bar dataKey="qty" radius={[0, 4, 4, 0]} maxBarSize={20}>
                        {analytics.partyData.map((_, i) => (
                          <Cell key={i} fill={i === 0 ? "rgb(var(--primary))" : i < 3 ? "rgb(var(--primary) / 0.7)" : "rgb(var(--primary) / 0.4)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Designer Workload */}
          <Card>
            <CardContent className="p-4">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                  <Users className="h-4 w-4 text-primary" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">Designer Workload</p>
                  <p className="text-[11px] text-muted-foreground">Records and completion by designer</p>
                </div>
              </div>
              {analytics.designerData.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">No designer data yet</p>
              ) : (
                <div className="space-y-3">
                  {analytics.designerData.map((d) => {
                    const pct = d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0;
                    return (
                      <div key={d.name} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                        <div className="w-full truncate text-[13px] font-medium text-foreground sm:w-28 sm:shrink-0" title={d.name}>
                          {d.name}
                        </div>
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-success transition-[width] duration-700"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-10 shrink-0 text-right text-[11px] font-medium tabular-nums text-muted-foreground">
                            {pct}%
                          </span>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-1.5 text-[10px]">
                          <span className="rounded-full bg-success/10 px-2 py-0.5 font-medium text-success">{d.completed} done</span>
                          {d.pending > 0 && (
                            <span className="rounded-full bg-warning/10 px-2 py-0.5 font-medium text-warning">{d.pending} pending</span>
                          )}
                          <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-muted-foreground">{d.qty} qty</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary strip — flat divided grid matching the KPI strip */}
          <TextileHeroWrapper className="p-0 sm:p-0">
            <div className="grid grid-cols-1 divide-x divide-y divide-border/40 sm:grid-cols-3 sm:divide-y-0">
              <div className="px-3 py-2.5 sm:px-4 sm:py-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Avg Completion Time
                </div>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground sm:text-xl">
                  {analytics.avgCompletionDays !== null ? `${analytics.avgCompletionDays} days` : "—"}
                </p>
                <p className="text-[9px] text-muted-foreground/60">From creation to completion</p>
              </div>
              <div className="px-3 py-2.5 sm:px-4 sm:py-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Package className="h-3 w-3" />
                  Avg Qty / Challan
                </div>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground sm:text-xl">{analytics.avgQty}</p>
                <p className="text-[9px] text-muted-foreground/60">Average quantity per record</p>
              </div>
              <div className="px-3 py-2.5 sm:px-4 sm:py-3">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Building2 className="h-3 w-3" />
                  Unique Parties
                </div>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground sm:text-xl">{analytics.partyData.length}</p>
                <p className="text-[9px] text-muted-foreground/60">
                  {analytics.designerData.length} designer{analytics.designerData.length !== 1 ? "s" : ""} assigned
                </p>
              </div>
            </div>
          </TextileHeroWrapper>
        </div>
      )}

      {/* ── RECORDS TAB ── */}
      {activeTab === "records" && (
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border bg-card/50 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">Salvedge Records</h2>
          </div>

          {isLoading ? (
            <div className="p-4"><SkeletonText lines={4} /></div>
          ) : records.length === 0 ? (
            <div className="py-8">
              <EmptyState
                icon={<Package className="h-10 w-10 text-muted-foreground/40" />}
                title="No salvedge records"
                description={isAdmin ? "Click '+ Add Record' to start." : "No records yet."}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className={TABLE_HEAD}>
                  <tr>
                    <th className={TABLE_TH}>Date/Time</th>
                    <th className={TABLE_TH}>Designer</th>
                    <th className={TABLE_TH}>Challan No.</th>
                    <th className={TABLE_TH}>Party Name</th>
                    <th className={TABLE_TH}>QTY</th>
                    <th className={TABLE_TH}>Completed</th>
                    <th className={TABLE_TH}>Pending</th>
                    <th className={TABLE_TH}>Done?</th>
                    <th className={TABLE_TH}>Completion</th>
                    <th className={TABLE_TH}>Comments</th>
                    <th className={cn(TABLE_TH, "text-right")}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <SalvedgeRow
                      key={r.id}
                      record={r}
                      designerName={designers.find((d) => d.id === r.designer_id)?.full_name ?? "—"}
                      isAdmin={isAdmin}
                      onEdit={() => { setEditRecord(r); setFormOpen(true); }}
                      onDelete={() => setDeleteTarget(r)}
                      onUpdate={updateRecord}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Form dialog */}
      <SalvedgeFormDialog
        open={formOpen}
        onOpenChange={(o) => { if (!o) setEditRecord(null); setFormOpen(o); }}
        editRecord={editRecord}
        designers={designers}
        clients={clients}
        onCreate={createRecord}
        onUpdate={updateRecord}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this record?"
        description={deleteTarget ? `Challan "${deleteTarget.challan_no}" will be permanently deleted.` : ""}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ============================================================================
// Form Dialog
// ============================================================================

function SalvedgeFormDialog({
  open, onOpenChange, editRecord, designers, clients, onCreate, onUpdate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editRecord: SalvedgeRecord | null;
  designers: { id: string; full_name: string }[];
  clients: { id: string; party_name: string }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onCreate: (data: any) => Promise<{ error: string | null }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdate: (id: string, data: any) => Promise<{ error: string | null }>;
}) {
  const isEdit = !!editRecord;

  const [designerId, setDesignerId] = useState(editRecord?.designer_id ?? "");
  const [challanNo, setChallanNo] = useState(editRecord?.challan_no ?? "");
  const [partyName, setPartyName] = useState(editRecord?.party_name ?? "");
  const [qty, setQty] = useState(editRecord?.qty != null ? String(editRecord.qty) : "");
  const [comments, setComments] = useState(editRecord?.additional_comments ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qtyNum = Number(qty) || 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!partyName.trim()) { setError("Party Name is required"); return; }
    if (qtyNum <= 0) { setError("QTY must be greater than 0"); return; }

    setSaving(true);
    setError(null);

    const data = {
      designer_id: designerId || null,
      challan_no: challanNo.trim() || "—",
      party_name: partyName.trim(),
      qty: qtyNum,
      additional_comments: comments.trim() || null,
    };

    const { error: e2 } = isEdit
      ? await onUpdate(editRecord.id, data)
      : await onCreate(data);

    setSaving(false);
    if (e2) { setError(e2); return; }
    toast.success(isEdit ? "Record updated" : "Record added");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Record" : "Add Salvedge Record"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-4">
          {/* Designer */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Designer</Label>
            <select value={designerId} onChange={(e) => setDesignerId(e.target.value)} disabled={saving}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
              <option value="">— Select designer —</option>
              {designers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
          </div>

          {/* Challan No */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Challan No.
            </Label>
            <Input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} placeholder="e.g. CHL-001" disabled={saving} />
          </div>

          {/* Party Name */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Party Name <span className="text-destructive">*</span>
            </Label>
            <select value={partyName} onChange={(e) => setPartyName(e.target.value)} disabled={saving}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
              <option value="">— Choose party —</option>
              {clients.map((c) => <option key={c.id} value={c.party_name}>{c.party_name}</option>)}
            </select>
          </div>

          {/* QTY */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              QTY <span className="text-destructive">*</span>
            </Label>
            <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} disabled={saving} />
          </div>

          {/* Comments */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Additional Comments</Label>
            <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2} disabled={saving}
              placeholder="Optional notes…"
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <LoadingButton type="submit" loading={saving} loadingText="Saving…">
              {isEdit ? "Save" : "Add Record"}
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Stat card
// ============================================================================

// ============================================================================
// Row with inline completed_qty editing + Done button
// ============================================================================

function SalvedgeRow({
  record: r,
  designerName,
  isAdmin,
  onEdit,
  onDelete,
  onUpdate,
}: {
  record: SalvedgeRecord;
  designerName: string;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdate: (id: string, data: any) => Promise<{ error: string | null }>;
}) {
  const [completedInput, setCompletedInput] = useState(String(r.completed_qty));
  const [saving, setSaving] = useState(false);

  const completedNum = Number(completedInput) || 0;
  const pendingCalc = Math.max(0, r.qty - completedNum);
  const canMarkDone = pendingCalc === 0 && !r.is_completed;

  async function handleUpdateQty() {
    if (completedNum === r.completed_qty) return;
    if (completedNum < 0 || completedNum > r.qty) {
      toast.error(`Completed qty must be between 0 and ${r.qty}`);
      return;
    }
    setSaving(true);
    const { error } = await onUpdate(r.id, { completed_qty: completedNum });
    setSaving(false);
    if (error) toast.error(error);
    else toast.success("Qty updated");
  }

  async function handleMarkDone() {
    setSaving(true);
    const { error } = await onUpdate(r.id, {
      is_completed: true,
      completed_qty: r.qty,
      completion_timestamp: new Date().toISOString(),
    });
    setSaving(false);
    if (error) toast.error(error);
    else toast.success("Marked as done ✓");
  }

  return (
    <tr className={cn(TABLE_ROW, "hover:bg-secondary/50")}>
      <td className={cn(TABLE_TD, "whitespace-nowrap text-[12px] text-muted-foreground")}>
        {formatDate(r.created_at)}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-foreground">{designerName}</td>
      <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-primary">{r.challan_no}</td>
      <td className="whitespace-nowrap px-3 py-3 text-foreground">{r.party_name}</td>
      <td className="px-3 py-3 tabular-nums text-foreground">{r.qty}</td>

      {/* Completed — editable inline */}
      <td className="px-3 py-3">
        {r.is_completed ? (
          <span className="tabular-nums text-success">{r.completed_qty}</span>
        ) : (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={r.qty}
              value={completedInput}
              onChange={(e) => setCompletedInput(e.target.value)}
              onBlur={() => void handleUpdateQty()}
              onKeyDown={(e) => { if (e.key === "Enter") void handleUpdateQty(); }}
              disabled={saving}
              className="h-8 w-16 rounded-md border border-input bg-card px-2 text-center text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
          </div>
        )}
      </td>

      {/* Pending */}
      <td className="px-3 py-3 tabular-nums">
        {r.is_completed ? (
          <span className="text-success">0</span>
        ) : pendingCalc > 0 ? (
          <span className="font-medium text-warning">{pendingCalc}</span>
        ) : (
          <span className="text-success">0</span>
        )}
      </td>

      {/* Done checkbox / button */}
      <td className="px-3 py-3 text-center">
        {r.is_completed ? (
          <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
        ) : canMarkDone ? (
          <button
            type="button"
            onClick={() => void handleMarkDone()}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md bg-success px-2 py-1 text-[11px] font-medium text-white hover:bg-success/90 disabled:opacity-50"
          >
            Done
          </button>
        ) : (
          <span className="inline-block h-4 w-4 rounded border border-border" title={`Complete ${pendingCalc} more to enable`} />
        )}
      </td>

      <td className="whitespace-nowrap px-3 py-3 text-[12px] text-muted-foreground">
        {r.completion_timestamp ? formatDate(r.completion_timestamp) : "—"}
      </td>
      <td className="px-3 py-3 text-[12px] text-muted-foreground">
        <span className="block max-w-[200px] truncate" title={r.additional_comments ?? ""}>
          {r.additional_comments || "—"}
        </span>
      </td>

      {/* Actions */}
      <td className="px-3 py-3 text-right">
        {isAdmin ? (
          <div className="flex items-center justify-end gap-1">
            <button type="button" onClick={onEdit}
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={onDelete}
              className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

function FlatKpiTile({ icon, label, value, tint, color, suffix }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tint: string;
  color?: string;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col justify-center gap-0.5 px-3 py-2.5 sm:px-4 sm:py-3">
      <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", tint)}>
        {icon}
      </div>
      <p className={cn("text-lg font-bold leading-none tabular-nums sm:text-xl", color ?? "text-foreground")}>
        {value}{suffix && <span className="text-sm">{suffix}</span>}
      </p>
      <p className="truncate text-[10px] font-medium text-muted-foreground sm:text-[11px]">{label}</p>
    </div>
  );
}

function CompletionRing({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const r = 50;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const color = pct >= 80 ? "stroke-success" : pct >= 50 ? "stroke-warning" : "stroke-destructive";

  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 120 120" className="-rotate-90 h-full w-full" aria-hidden>
        <circle cx="60" cy="60" r={r} className="fill-none stroke-secondary" strokeWidth={8} />
        <circle
          cx="60"
          cy="60"
          r={r}
          className={cn("fill-none", color)}
          strokeWidth={8}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-2xl font-bold tabular-nums text-foreground">{pct}%</p>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {completed}/{total}
        </p>
      </div>
    </div>
  );
}
