import { useMemo, useState } from "react";
import {
  Plus, Search, CheckCircle2, Clock, RefreshCw,
  Trash2, X, ClipboardList, Calendar, User,
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
import { TABLE_HEAD, TABLE_TH, TABLE_ROW, TABLE_TD } from "@/lib/tableStyles";
import type { CoordinatorTask } from "@/types/database";

export function CoordinatorTasksView() {
  const { profile } = useAuth();
  const canLog = isCoordinator(profile?.role) || profile?.role === "admin" || profile?.role === "super_admin";
  const { tasks, isLoading, refetch, createTask, toggleComplete, deleteTask } = useCoordinatorTasks();

  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "completed">("all");
  const [deleteTarget, setDeleteTarget] = useState<CoordinatorTask | null>(null);

  const filtered = useMemo(() => {
    let list = tasks;
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
  }, [tasks, search, statusFilter]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.is_completed).length;
    const pending = total - completed;
    return { total, completed, pending };
  }, [tasks]);

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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Coordinator Tasks
            </h1>
            <p className="text-xs text-muted-foreground">
              Design & photo search requests · {stats.total} total
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {canLog && (
            <Button size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Log Task
            </Button>
          )}
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="swatch-edge">
          <CardContent className="flex items-center gap-3 px-3 py-2.5">
            <ClipboardList className="h-4 w-4 text-primary" />
            <div>
              <p className="text-lg font-bold tabular-nums text-foreground">{stats.total}</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card className="swatch-edge">
          <CardContent className="flex items-center gap-3 px-3 py-2.5">
            <Clock className="h-4 w-4 text-warning" />
            <div>
              <p className="text-lg font-bold tabular-nums text-warning">{stats.pending}</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card className="swatch-edge">
          <CardContent className="flex items-center gap-3 px-3 py-2.5">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <div>
              <p className="text-lg font-bold tabular-nums text-success">{stats.completed}</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Done</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by requester or description…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="inline-flex rounded-lg bg-secondary p-0.5">
          {(["all", "pending", "completed"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                statusFilter === f ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f === "all" ? `All ${stats.total}` : f === "pending" ? `Pending ${stats.pending}` : `Done ${stats.completed}`}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <Card><CardContent className="p-4"><SkeletonText lines={5} /></CardContent></Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? "No tasks match" : "No tasks logged yet"}
          description={canLog ? "Click 'Log Task' to record a new request." : "No coordinator tasks to display."}
          action={canLog && !search ? { label: "Log Task", onClick: () => setFormOpen(true) } : undefined}
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={cn(TABLE_TH, "w-8")}>#</th>
                  <th className={TABLE_TH}>Requester</th>
                  <th className={cn(TABLE_TH, "w-full")}>Description</th>
                  <th className={TABLE_TH}>Requested</th>
                  <th className={TABLE_TH}>Status</th>
                  <th className={TABLE_TH}>Completed</th>
                  {canLog && <th className={cn(TABLE_TH, "text-right")}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => (
                  <tr key={t.id} className={cn(TABLE_ROW, "hover:bg-secondary/30")}>
                    <td className={cn(TABLE_TD, "tabular-nums text-muted-foreground")}>{i + 1}</td>
                    <td className={cn(TABLE_TD, "whitespace-nowrap font-medium text-foreground")}>
                      <span className="flex items-center gap-1.5">
                        <User className="h-3 w-3 text-muted-foreground" />
                        {t.requester_name}
                      </span>
                    </td>
                    <td className={TABLE_TD}>
                      <p className="text-foreground">{t.description}</p>
                      {t.notes && <p className="mt-0.5 text-[11px] text-muted-foreground">{t.notes}</p>}
                    </td>
                    <td className={cn(TABLE_TD, "whitespace-nowrap text-muted-foreground")}>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(t.requested_at)}
                      </span>
                    </td>
                    <td className={TABLE_TD}>
                      {canLog ? (
                        <button
                          type="button"
                          onClick={() => void handleToggle(t)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors",
                            t.is_completed
                              ? "bg-success/15 text-success hover:bg-success/25"
                              : "bg-warning/15 text-warning hover:bg-warning/25"
                          )}
                        >
                          {t.is_completed ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          {t.is_completed ? "Done" : "Pending"}
                        </button>
                      ) : (
                        <Badge className={t.is_completed ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}>
                          {t.is_completed ? "Done" : "Pending"}
                        </Badge>
                      )}
                    </td>
                    <td className={cn(TABLE_TD, "whitespace-nowrap text-muted-foreground")}>
                      {t.completed_at ? formatDate(t.completed_at) : "—"}
                    </td>
                    {canLog && (
                      <td className={cn(TABLE_TD, "text-right")}>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(t)}
                          className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
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
  const [requestedAt, setRequestedAt] = useState(() => new Date().toISOString().slice(0, 16));
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
      requested_at: requestedAt ? new Date(requestedAt).toISOString() : undefined,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (err) { setError(err); return; }
    toast.success("Task logged");
    setRequester("");
    setDescription("");
    setRequestedAt(new Date().toISOString().slice(0, 16));
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
          {/* Requester + Date side by side */}
          <section className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm transition-colors hover:border-primary/30">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
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
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Date & Time
                  </span>
                </Label>
                <Input
                  type="datetime-local"
                  value={requestedAt}
                  onChange={(e) => setRequestedAt(e.target.value)}
                  disabled={saving}
                />
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
