import { useMemo, useState } from "react";
import {
  Plus, Pencil, Trash2, Package, RefreshCw, CheckCircle2,
} from "lucide-react";
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

  // Stats
  const stats = useMemo(() => {
    const total = records.length;
    const completed = records.filter((r) => r.is_completed).length;
    const pending = records.filter((r) => !r.is_completed).length;
    const totalQty = records.reduce((s, r) => s + r.qty, 0);
    return { total, completed, pending, totalQty };
  }, [records]);

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await deleteRecord(deleteTarget.id);
    if (error) { toast.error(error); return; }
    toast.success("Record deleted");
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Salvedge</h1>
            <p className="text-xs text-muted-foreground">
              {records.length} records · Challan-based fabric distribution
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          {isAdmin && (
            <Button size="sm" className="gap-1.5" onClick={() => { setEditRecord(null); setFormOpen(true); }}>
              <Plus className="h-3.5 w-3.5" /> Add Record
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      {isAdmin && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Completed" value={stats.completed} color="text-success" />
          <StatCard label="Pending" value={stats.pending} color="text-warning" />
          <StatCard label="Total Qty" value={stats.totalQty} />
        </div>
      )}

      {/* Table */}
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
              <thead>
                <tr className="border-b border-border bg-card/30 text-left text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  <th className="px-3 py-2 font-medium">Date/Time</th>
                  <th className="px-3 py-2 font-medium">Designer</th>
                  <th className="px-3 py-2 font-medium">Challan No.</th>
                  <th className="px-3 py-2 font-medium">Party Name</th>
                  <th className="px-3 py-2 font-medium">QTY</th>
                  <th className="px-3 py-2 font-medium">Completed</th>
                  <th className="px-3 py-2 font-medium">Pending</th>
                  <th className="px-3 py-2 font-medium">Done?</th>
                  <th className="px-3 py-2 font-medium">Completion</th>
                  <th className="px-3 py-2 font-medium">Comments</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
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
    <tr className="border-b border-border/60 transition-colors hover:bg-card/60">
      <td className="whitespace-nowrap px-3 py-3 text-[12px] text-muted-foreground">
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

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className={cn("text-2xl font-bold tabular-nums", color ?? "text-foreground")}>{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
