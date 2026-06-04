import { useMemo, useRef, useState } from "react";
import {
  Plus, Search, CheckCircle2, Clock, RefreshCw,
  Trash2, X, ClipboardList, Calendar, User, Download,
} from "lucide-react";
import { useCoordinatorTasks } from "@/hooks/useCoordinatorTasks";
import { useAuth } from "@/hooks/useAuth";
import {
  Card, CardContent, Badge, Button, Input, Label,
  ConfirmDialog, EmptyState, SkeletonText, toast,
} from "@/components/ui";
import { LoadingButton } from "@/components/ui/LoadingButton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatDate } from "@/lib/utils";
import { isCoordinator } from "@/lib/permissions";
import { exportToCSV, type CsvColumn } from "@/lib/exportCSV";
import { TABLE_HEAD, TABLE_TH, TABLE_ROW, TABLE_TD } from "@/lib/tableStyles";
import type { CoordinatorTask } from "@/types/database";

function todayISO() { return new Date().toISOString().slice(0, 10); }
function monthStartISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; }

export function CoordinatorTasksView() {
  const { profile } = useAuth();
  const canLog = isCoordinator(profile?.role) || profile?.role === "admin" || profile?.role === "super_admin";
  const { tasks, isLoading, refetch, createTask, toggleComplete, deleteTask } = useCoordinatorTasks();

  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "completed">("all");
  const [deleteTarget, setDeleteTarget] = useState<CoordinatorTask | null>(null);
  const [dateFrom, setDateFrom] = useState(monthStartISO());
  const [dateTo, setDateTo] = useState(todayISO());

  const filtered = useMemo(() => {
    let list = tasks;
    if (dateFrom) list = list.filter((t) => t.requested_at >= dateFrom);
    if (dateTo) list = list.filter((t) => t.requested_at <= dateTo + "T23:59:59");
    if (statusFilter === "pending") list = list.filter((t) => !t.is_completed);
    if (statusFilter === "completed") list = list.filter((t) => t.is_completed);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.requester_name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          (t.notes ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [tasks, search, statusFilter, dateFrom, dateTo]);

  const dateFiltered = useMemo(() => {
    let list = tasks;
    if (dateFrom) list = list.filter((t) => t.requested_at >= dateFrom);
    if (dateTo) list = list.filter((t) => t.requested_at <= dateTo + "T23:59:59");
    return list;
  }, [tasks, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const total = dateFiltered.length;
    const completed = dateFiltered.filter((t) => t.is_completed).length;
    const pending = total - completed;
    return { total, completed, pending };
  }, [dateFiltered]);

  function handleExport() {
    const cols: CsvColumn<CoordinatorTask>[] = [
      { key: "requester_name", label: "Requester" },
      { key: "description", label: "Description" },
      { key: "requested_at", label: "Requested" },
      { key: "is_completed", label: "Status", transform: (v) => v ? "Completed" : "Pending" },
      { key: "completed_at", label: "Completed At" },
      { key: "notes", label: "Notes" },
    ];
    exportToCSV(filtered as Record<string, unknown>[], `coordinator-tasks-${dateFrom}-to-${dateTo}`, cols as CsvColumn<Record<string, unknown>>[]);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await deleteTask(deleteTarget.id);
    if (error) { toast.error(error); return; }
    toast.success("Task deleted");
    setDeleteTarget(null);
  }

  async function handleToggle(task: CoordinatorTask) {
    const { error } = await toggleComplete(task.id, !task.is_completed);
    if (error) toast.error(error);
    else toast.success(task.is_completed ? "Marked as pending" : "Marked as completed");
  }

  return (
    <div className="space-y-3">
      {/* ── Compact header: KPIs + date + actions — one row ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <KpiChip label="All" value={stats.total} tone="primary" active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
          <KpiChip label="Pending" value={stats.pending} tone="warning" active={statusFilter === "pending"} onClick={() => setStatusFilter("pending")} />
          <KpiChip label="Completed" value={stats.completed} tone="success" active={statusFilter === "completed"} onClick={() => setStatusFilter("completed")} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-7 w-[120px] rounded-md border border-border bg-card pl-7 pr-2 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:w-[150px]"
            />
          </div>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="h-7 w-full rounded-md border border-border bg-card px-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-ring sm:w-auto" />
          <span className="text-[10px] text-muted-foreground">–</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="h-7 w-full rounded-md border border-border bg-card px-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-ring sm:w-auto" />
          {filtered.length > 0 && (
            <Button variant="outline" size="icon" onClick={handleExport} className="h-7 w-7" title="Export CSV">
              <Download className="h-3 w-3" />
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={() => void refetch()} className="h-7 w-7" title="Refresh">
            <RefreshCw className="h-3 w-3" />
          </Button>
          {canLog && (
            <Button size="sm" className="h-7 gap-1 px-2.5 text-[11px]" onClick={() => setFormOpen(true)}>
              <Plus className="h-3 w-3" /> Log Task
            </Button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      {isLoading ? (
        <Card><CardContent className="p-4"><SkeletonText lines={5} /></CardContent></Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? "No tasks match" : "No tasks logged yet"}
          description={canLog ? "Click 'Log Task' to record a new request." : "No coordinator tasks to display."}
          action={canLog && !search ? { label: "Log Task", onClick: () => setFormOpen(true) } : undefined}
        />
      ) : (
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={cn(TABLE_TH, "w-[130px]")}>Requester</th>
                  <th className={TABLE_TH}>Description</th>
                  <th className={cn(TABLE_TH, "w-[100px]")}>Requested</th>
                  <th className={cn(TABLE_TH, "w-[80px]")}>Status</th>
                  {canLog && <th className={cn(TABLE_TH, "w-10 text-right")} />}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className={cn(TABLE_ROW, "hover:bg-secondary/30")}>
                    <td className={cn(TABLE_TD, "font-medium text-foreground")}>
                      <span className="truncate block">{t.requester_name}</span>
                    </td>
                    <td className={TABLE_TD}>
                      <p className="text-foreground truncate" title={t.description}>{t.description}</p>
                      {t.notes && <p className="truncate text-[10px] text-muted-foreground" title={t.notes}>{t.notes}</p>}
                    </td>
                    <td className={cn(TABLE_TD, "whitespace-nowrap text-[11px] text-muted-foreground")}>{formatDate(t.requested_at)}</td>
                    <td className={TABLE_TD}>
                      {canLog ? (
                        <button type="button" onClick={() => void handleToggle(t)}
                          className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors",
                            t.is_completed ? "bg-success/15 text-success hover:bg-success/25" : "bg-warning/15 text-warning hover:bg-warning/25"
                          )}>
                          {t.is_completed ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          {t.is_completed ? "Done" : "Pending"}
                        </button>
                      ) : (
                        <Badge className={t.is_completed ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}>
                          {t.is_completed ? "Done" : "Pending"}
                        </Badge>
                      )}
                    </td>
                    {canLog && (
                      <td className={cn(TABLE_TD, "text-right")}>
                        <button type="button" onClick={() => setDeleteTarget(t)} className="rounded p-1 text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive" title="Delete">
                          <Trash2 className="h-3 w-3" />
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

      {/* Add form dialog */}
      <AddTaskDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreate={createTask}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this task?"
        description={deleteTarget ? `"${deleteTarget.description.slice(0, 60)}" will be permanently deleted.` : ""}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function AddTaskDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreate: (input: { requester_name: string; description: string; requested_at?: string; notes?: string | null }) => Promise<{ error: string | null }>;
}) {
  const [requester, setRequester] = useState("");
  const [description, setDescription] = useState("");
  const [requestDate, setRequestDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [requestTime, setRequestTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requester.trim()) { setError("Requester name is required"); return; }
    if (!description.trim()) { setError("Description is required"); return; }

    setSaving(true);
    setError(null);
    const { error: err } = await onCreate({
      requester_name: requester.trim(),
      description: description.trim(),
      requested_at: requestDate && requestTime
        ? new Date(`${requestDate}T${requestTime}`).toISOString()
        : new Date().toISOString(),
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (err) { setError(err); return; }
    toast.success("Task logged");
    setRequester("");
    setDescription("");
    setRequestDate(new Date().toISOString().slice(0, 10));
    setRequestTime(new Date().toTimeString().slice(0, 5));
    setNotes("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] max-h-[92vh] overflow-y-auto p-0" srTitle="Log new task">
        {/* Gradient header */}
        <div className="relative overflow-hidden border-b border-primary/15 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-card px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm shadow-primary/20">
              <ClipboardList className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">Log New Request</h2>
              <p className="text-[10px] text-muted-foreground">Record a design or photo search task</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2.5 px-5 py-4" noValidate>
          {/* Requester */}
          <section className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm transition-colors hover:border-primary/30">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                Requester <span className="text-destructive">*</span>
              </span>
            </Label>
            <Input
              value={requester}
              onChange={(e) => setRequester(e.target.value)}
              placeholder="Who requested this?"
              disabled={saving}
              className="mt-1.5"
            />
          </section>

          {/* Date + Time side by side */}
          <section className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm transition-colors hover:border-primary/30">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Date
                  </span>
                </Label>
                <Input
                  type="date"
                  value={requestDate}
                  onChange={(e) => setRequestDate(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Time
                  </span>
                </Label>
                <TimeInput12h value={requestTime} onChange={setRequestTime} disabled={saving} />
              </div>
            </div>
          </section>

          {/* Description */}
          <section className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm transition-colors hover:border-primary/30">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="flex items-center gap-1">
                <Search className="h-3 w-3" />
                What to search <span className="text-destructive">*</span>
              </span>
            </Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the design or photo to search for…"
              disabled={saving}
              rows={3}
              className="mt-1.5 w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
          </section>

          {/* Notes */}
          <section className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm transition-colors hover:border-primary/30">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Additional Notes <span className="font-normal normal-case text-muted-foreground/70">(optional)</span>
            </Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any reference links, context, or priority…"
              disabled={saving}
              className="mt-1.5"
            />
          </section>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <LoadingButton type="submit" loading={saving} loadingText="Saving…" className="gap-2 px-6 shadow-sm shadow-primary/20">
              <Plus className="h-3.5 w-3.5" /> Log Task
            </LoadingButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const PILL_ACTIVE: Record<string, string> = {
  primary: "border-primary/40 bg-primary/10 text-primary ring-1 ring-primary/20",
  warning: "border-warning/40 bg-warning/10 text-warning ring-1 ring-warning/20",
  success: "border-success/40 bg-success/10 text-success ring-1 ring-success/20",
};
const PILL_DOT: Record<string, string> = {
  primary: "bg-primary",
  warning: "bg-warning",
  success: "bg-success",
};
const PILL_COUNT: Record<string, string> = {
  primary: "text-primary",
  warning: "text-warning",
  success: "text-success",
};

function KpiChip({ label, value, tone, active, onClick }: {
  label: string;
  value: number;
  tone: "primary" | "warning" | "success";
  active: boolean;
  onClick: () => void;
}) {
  const TONE_BG: Record<string, string> = { primary: "bg-primary/10 border-primary/20", warning: "bg-warning/10 border-warning/20", success: "bg-success/10 border-success/20" };
  const TONE_NUM: Record<string, string> = { primary: "text-primary", warning: "text-warning", success: "text-success" };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-all",
        active ? TONE_BG[tone] : "border-border bg-card hover:bg-secondary/50"
      )}
    >
      <span className={cn("text-lg font-bold tabular-nums leading-none", active ? TONE_NUM[tone] : "text-foreground")}>{value}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    </button>
  );
}

function TimeInput12h({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  // Parse 24h "HH:MM" → 12h parts
  const parsed = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
  const initH = parsed ? ((parseInt(parsed[1]) % 12) || 12) : 12;
  const initM = parsed ? parsed[2] : "00";
  const initP = parsed ? (parseInt(parsed[1]) >= 12 ? "PM" : "AM") : "AM";

  const [h12, setH12] = useState(String(initH).padStart(2, "0"));
  const [min, setMin] = useState(initM);
  const [period, setPeriod] = useState<"AM" | "PM">(initP as "AM" | "PM");
  const minRef = useRef<HTMLInputElement>(null);
  const autoAdv = useRef(false);
  const latestH = useRef(h12);
  const latestM = useRef(min);
  latestH.current = h12;
  latestM.current = min;

  function emit(h: string, m: string, p: "AM" | "PM") {
    if (!h || !m) return;
    let h24 = parseInt(h) % 12;
    if (p === "PM") h24 += 12;
    onChange(`${String(h24).padStart(2, "0")}:${m.padStart(2, "0")}`);
  }

  function onHourInput(raw: string) {
    const d = raw.replace(/\D/g, "").slice(0, 2);
    const n = parseInt(d, 10);
    const next = d === "" ? "" : String(Math.min(12, n || 0));
    setH12(next); latestH.current = next;
    emit(next, latestM.current, period);
    if (next && (next.length === 2 || n > 1)) {
      autoAdv.current = true;
      minRef.current?.focus();
      minRef.current?.select();
    }
  }

  function onMinInput(raw: string) {
    const d = raw.replace(/\D/g, "").slice(0, 2);
    const next = d === "" ? "" : d.length === 2 ? String(Math.min(59, parseInt(d, 10))).padStart(2, "0") : d;
    setMin(next); latestM.current = next;
    emit(latestH.current, next, period);
  }

  const cls = "h-8 w-8 rounded bg-transparent text-center text-sm font-semibold tabular-nums text-foreground placeholder:text-muted-foreground focus:bg-secondary/60 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/40 disabled:opacity-50";

  return (
    <div className={cn("flex h-10 items-center gap-0.5 rounded-lg border border-input bg-card pl-2.5 pr-1 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30", disabled && "opacity-50")}>
      <Clock className="mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <input type="text" inputMode="numeric" placeholder="HH" maxLength={2} className={cls} value={h12}
        onChange={(e) => onHourInput(e.target.value)} onFocus={(e) => e.target.select()}
        onBlur={() => { if (autoAdv.current) { autoAdv.current = false; return; } const v = latestH.current; if (v) { setH12(v.padStart(2, "0")); emit(v.padStart(2, "0"), latestM.current, period); } }}
        disabled={disabled} />
      <span className="text-sm font-bold text-muted-foreground">:</span>
      <input ref={minRef} type="text" inputMode="numeric" placeholder="MM" maxLength={2} className={cls} value={min}
        onChange={(e) => onMinInput(e.target.value)} onFocus={(e) => e.target.select()}
        onBlur={() => { const v = latestM.current; if (v) { setMin(v.padStart(2, "0")); emit(latestH.current, v.padStart(2, "0"), period); } }}
        disabled={disabled} />
      <div className="ml-auto inline-flex shrink-0 items-center rounded-md bg-secondary p-0.5">
        {(["AM", "PM"] as const).map((p) => (
          <button key={p} type="button" disabled={disabled}
            onClick={() => { setPeriod(p); emit(latestH.current, latestM.current, p); }}
            className={cn("rounded px-2 py-1 text-[10px] font-semibold transition-all", period === p ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >{p}</button>
        ))}
      </div>
    </div>
  );
}
