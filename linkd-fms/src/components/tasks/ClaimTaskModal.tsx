import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ArrowDownToLine,
  AlertTriangle,
  Paperclip,
  Layers,
  ExternalLink,
  Sparkles,
  History,
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import confetti from "canvas-confetti";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { SkeletonText } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toaster";
import { MultiCombobox, joinMulti } from "@/components/ui/MultiCombobox";
import { formatDistanceToNow as fmtDist } from "date-fns";
import { supabase } from "@/lib/supabase";
import { kittingDetailPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useFabrics } from "@/hooks/useFabrics";
import { useConceptCategories } from "@/hooks/useConceptCategories";
import {
  useTaskMutations,
  type PoolTaskPreview,
} from "@/hooks/useTaskMutations";
import { useTaskAssignments } from "@/hooks/useTaskAssignments";
import type { TaskAssignmentWithDesigner } from "@/types/database";

const REF_FILE_BUCKET = "design-files";

interface RefFile {
  id: string;
  file_name: string;
  file_size: number | null;
  storage_url: string;
}

interface KittingPreview {
  id: string;
  imageUrl: string | null;
  status: string;
}

interface TaskLogEntry {
  id: string;
  status_from: string | null;
  status_to: string;
  note: string | null;
  timestamp: string;
  changer: { full_name: string } | null;
}

interface ClaimTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClaimed: () => void;
  /** When set, load this specific task instead of the FIFO top-1.
   *  Used when the designer picks a row from the visible pool table. */
  preselectedTaskId?: string;
}

function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function ClaimTaskModal({
  open,
  onOpenChange,
  onClaimed,
  preselectedTaskId,
}: ClaimTaskModalProps) {
  const { getNextPoolTasks, claimPoolTask } = useTaskMutations();
  const { fabrics } = useFabrics();
  const { categories: conceptCategories } = useConceptCategories();

  const [loading, setLoading] = useState(true);
  const [poolCount, setPoolCount] = useState(0);
  const [task, setTask] = useState<PoolTaskPreview | null>(null);
  const [deadline, setDeadline] = useState("");
  // Multiple fabrics / design types — stored comma-joined on the task.
  const [fabricList, setFabricList] = useState<string[]>([]);
  const [designTypeList, setDesignTypeList] = useState<string[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [portionQty, setPortionQty] = useState<number | null>(null);

  const [files, setFiles] = useState<RefFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [kitting, setKitting] = useState<KittingPreview | null>(null);
  const [logs, setLogs] = useState<TaskLogEntry[]>([]);

  // Load existing assignments for the task (split tasks show who's already working)
  const { assignments, totalAssigned, claimPortion, isLoading: assignmentsLoading } = useTaskAssignments(
    open && task ? task.id : null
  );

  // Determine if this task requires portion claiming.
  // Prefer live assignment data over potentially-stale task.qty_remaining.
  // While assignments are loading, fall back to task.qty (NOT task.qty_remaining
  // which can be stale/0 from a prior session) to avoid falsely disabling the button.
  const qtyRemaining = task
    ? !assignmentsLoading && (assignments.length > 0 || totalAssigned > 0)
      ? Math.max(0, task.qty - totalAssigned)
      : assignmentsLoading
        ? task.qty
        : (task.qty_remaining ?? task.qty)
    : 0;
  const isPartiallyAssigned = task != null && !assignmentsLoading && (task.qty_remaining != null || totalAssigned > 0);
  const showPortionInput = task != null && (isPartiallyAssigned || task.qty > 1);

  // Reset portionQty when task or remaining changes
  useEffect(() => {
    if (showPortionInput && qtyRemaining > 0) {
      setPortionQty(qtyRemaining);
    } else {
      setPortionQty(null);
    }
  }, [showPortionInput, qtyRemaining]);

  useEffect(() => {
    if (!open) {
      setTask(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setTask(null);
    setDeadline("");
    setFabricList([]);
    setDesignTypeList([]);
    setKitting(null);
    setPortionQty(null);

    if (preselectedTaskId) {
      // Load a specific task chosen by the designer from the pool table.
      void supabase
        .from("tasks")
        .select("*, client:clients(party_name)")
        .eq("id", preselectedTaskId)
        .maybeSingle()
        .then(({ data, error: qErr }) => {
          if (cancelled) return;
          const isClaimable =
            data &&
            (data.status === "pool" ||
              (data.qty_remaining != null && data.qty_remaining > 0)) &&
            data.qty_remaining !== 0;
          if (isClaimable) {
            setTask(data as unknown as PoolTaskPreview);
            setPoolCount(1);
          } else {
            setTask(null);
            setPoolCount(0);
          }
          setLoading(false);
        });
    } else {
      // Default FIFO flow — load the single next task.
      console.log("[ClaimModal] FIFO flow (no preselectedTaskId)");
      void getNextPoolTasks(1).then((res) => {
        if (cancelled) return;
        console.log("[ClaimModal] FIFO result:", { poolCount: res.poolCount, taskCount: res.tasks.length, firstTask: res.tasks[0]?.id });
        setPoolCount(res.poolCount);
        setTask(res.tasks[0] ?? null);
        setLoading(false);
      });
    }
    return () => { cancelled = true; };
  }, [open, getNextPoolTasks, preselectedTaskId]);

  useEffect(() => {
    const taskId = task?.id;
    if (!open || !taskId) { setFiles([]); setKitting(null); setLogs([]); return; }
    let cancelled = false;
    setFilesLoading(true);
    void supabase
      .from("files")
      .select("id, file_name, file_size, storage_url")
      .eq("task_id", taskId)
      .order("uploaded_at", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setFiles((data as RefFile[]) ?? []);
        setFilesLoading(false);
      });
    void supabase
      .from("full_kitting_details")
      .select("id, image_url, data_entry_status")
      .eq("task_id", taskId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setKitting({
          id: data.id,
          imageUrl: data.image_url,
          status: data.data_entry_status,
        });
      });
    void supabase
      .from("task_logs")
      .select("id, status_from, status_to, note, timestamp, changer:profiles!task_logs_changed_by_fkey(full_name)")
      .eq("task_id", taskId)
      .order("timestamp", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setLogs((data as unknown as TaskLogEntry[]) ?? []);
      });
    return () => { cancelled = true; };
  }, [open, task?.id]);

  async function refresh() {
    const res = await getNextPoolTasks(1);
    setPoolCount(res.poolCount);
    setTask(res.tasks[0] ?? null);
  }

  async function handleClaim() {
    if (!deadline || !task) return;
    setClaiming(true);

    // Split/partial tasks always use portion claiming (parent is already
    // in_progress, so claimPoolTask's `.eq("status","pool")` lock would fail).
    const isSplitTask = task.qty_remaining != null || isPartiallyAssigned;

    if (isSplitTask || (showPortionInput && portionQty != null && portionQty < qtyRemaining)) {
      const qty = portionQty ?? qtyRemaining;
      const { error } = await claimPortion(task.id, {
        qty,
        deadline,
        designType: joinMulti(designTypeList),
        fabric: joinMulti(fabricList),
      });
      setClaiming(false);
      if (error) {
        toast.error(error);
        await refresh();
        return;
      }
      toast.success(`Claimed ${qty} of ${task.qty} designs!`);
      try {
        void confetti({ particleCount: 70, spread: 65, origin: { y: 0.7 } });
      } catch { /* decorative */ }
      onOpenChange(false);
      onClaimed();
      return;
    }

    // Full task claim (standard flow — task is in pool status)
    const { error } = await claimPoolTask(
      task.id,
      deadline,
      joinMulti(fabricList),
      joinMulti(designTypeList)
    );
    setClaiming(false);
    if (error) {
      toast.error(error);
      await refresh();
      return;
    }
    toast.success("Task claimed! Start working 🚀");
    try {
      void confetti({ particleCount: 70, spread: 65, origin: { y: 0.7 } });
    } catch { /* decorative */ }
    onOpenChange(false);
    onClaimed();
  }

  const isUrgent = task?.priority === "urgent";
  const receivedRef = task?.requirement_received_at || task?.created_at;
  const hasTask = !loading && poolCount > 0 && !!task;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[780px] max-h-[92vh] overflow-y-auto p-0"
        srTitle="Claim next task"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* ── Header banner ── (pr-12 keeps the priority badge clear of the
            dialog's absolute close ✕ at right-4) */}
        <div className="relative overflow-hidden border-b border-primary/15 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-card py-2 pl-4 pr-12">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm shadow-primary/20">
              <ArrowDownToLine className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="font-sans text-sm font-semibold tracking-tight text-foreground">
                {loading ? "Loading…" : poolCount === 0 || !task ? "Pool Empty" : "Claim Task"}
              </h1>
              {hasTask && receivedRef && (
                <p className="text-[10px] text-muted-foreground">
                  Received {fmtDist(new Date(receivedRef))} ago
                </p>
              )}
            </div>
            {hasTask && (
              isUrgent ? (
                <Badge className="animate-urgent-pulse border border-destructive/30 bg-destructive/15 text-destructive text-[10px]">
                  <AlertTriangle className="mr-1 h-3 w-3" /> Urgent
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">Normal</Badge>
              )
            )}
          </div>
        </div>

        <div className="px-5 py-5 sm:px-6">
          {loading ? (
            <SkeletonText lines={4} />
          ) : !hasTask ? (
            <div className="flex flex-col items-center py-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={1.5} />
              <p className="mt-3 text-sm font-medium text-foreground">Pool is empty — all tasks have been claimed!</p>
              <Button variant="outline" className="mt-4" onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Task details card */}
              <TaskDetails task={task} files={files} filesLoading={filesLoading} kitting={kitting} />

              {/* FK gate warning — task requires Full Knitting but it hasn't been added */}
              {task.requires_full_kitting && !task.full_kitting_image_url && !kitting && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold text-warning">Full Knitting Not Added Yet</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        This task requires Full Knitting, but the coordinator hasn&apos;t added it yet.
                        You can claim and start working, but you <span className="font-semibold text-foreground">won&apos;t be able to complete</span> until the coordinator adds the Full Knitting details.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Carry-forward banner */}
              {task.carry_forward_note && (
                <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
                    <ArrowRight className="h-3 w-3" />
                    Carried forward
                    {task.qty_completed ? ` · ${task.qty_completed}/${task.qty} done` : ""}
                  </div>
                  <p className="mt-1 text-xs text-foreground">{task.carry_forward_note}</p>
                </div>
              )}

              {/* Already working — show existing assignments */}
              {assignments.length > 0 && (
                <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Already working ({totalAssigned}/{task.qty} assigned)
                  </p>
                  <div className="space-y-1.5">
                    {assignments.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-semibold text-foreground">
                            {a.designer?.full_name ?? "Unknown"}
                          </span>
                          <span className="ml-1.5 tabular-nums text-[11px] text-muted-foreground">
                            {a.qty_completed}/{a.qty_assigned}
                          </span>
                          {(a.design_type || a.completion_fabric) && (
                            <p className="text-[10px] text-muted-foreground">
                              {[
                                a.design_type ? `Type: ${a.design_type}` : null,
                                a.completion_fabric ? `Fabric: ${a.completion_fabric}` : null,
                              ].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        {(a.status === "completed" || a.status === "done") && (
                          <span className="shrink-0 rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                            Done
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Task History — completed assignments + activity log */}
              <TaskHistory assignments={assignments} logs={logs} />

              {/* Available-to-claim hint — shown whenever portion claiming is
                  offered so the designer knows they can take a slice. */}
              {showPortionInput && qtyRemaining > 0 && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
                  <span className="font-semibold tabular-nums text-primary">{qtyRemaining}</span>
                  {" "}of {task.qty} design{task.qty === 1 ? "" : "s"} available — take the lot, or claim a portion and leave the rest for other designers.
                </div>
              )}

              {/* Fabric + Deadline + Portion + Claim button */}
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 sm:gap-4">
                <div>
                  <Label htmlFor="claim-design-type" className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Design Type <span className="normal-case font-normal text-muted-foreground/70">(optional · multiple)</span>
                  </Label>
                  <MultiCombobox
                    id="claim-design-type"
                    values={designTypeList}
                    onChange={setDesignTypeList}
                    options={conceptCategories.map((c) => ({ value: c.name, label: c.name }))}
                    placeholder="Pick design type(s)"
                    searchPlaceholder="Search type…"
                    disabled={claiming}
                  />
                </div>
                <div>
                  <Label htmlFor="claim-fabric" className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Fabric <span className="normal-case font-normal text-muted-foreground/70">(optional · multiple)</span>
                  </Label>
                  <MultiCombobox
                    id="claim-fabric"
                    values={fabricList}
                    onChange={setFabricList}
                    options={fabrics.map((f) => ({ value: f.name, label: f.name }))}
                    placeholder="Choose fabric(s)"
                    searchPlaceholder="Search fabric…"
                    disabled={claiming}
                  />
                </div>
                <div>
                  <Label htmlFor="claim-deadline" className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Deadline <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="claim-deadline"
                    type="date"
                    min={todayISO()}
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                    disabled={claiming}
                    className="cursor-pointer"
                    required
                  />
                </div>
                {showPortionInput && qtyRemaining > 0 && (
                  <div>
                    <Label htmlFor="claim-portion" className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      How many designs? <span className="normal-case font-normal text-muted-foreground/70">(max {qtyRemaining})</span>
                    </Label>
                    <Input
                      id="claim-portion"
                      type="number"
                      min={1}
                      max={qtyRemaining}
                      value={portionQty ?? qtyRemaining}
                      onChange={(e) => setPortionQty(Math.max(1, Math.min(qtyRemaining, Number(e.target.value) || 1)))}
                      disabled={claiming}
                    />
                    {portionQty != null && portionQty > 0 && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        You'll claim <span className="font-semibold tabular-nums text-foreground">{portionQty}</span>
                        {" · "}
                        <span className="tabular-nums font-medium text-primary">{Math.max(0, qtyRemaining - portionQty)}</span> still in pool
                      </p>
                    )}
                  </div>
                )}
                {showPortionInput && qtyRemaining === 0 && (
                  <div className="col-span-full rounded-lg border border-success/20 bg-success/5 px-3 py-2 text-xs font-medium text-success">
                    Fully assigned — no designs available to claim.
                  </div>
                )}
                <div className="space-y-1">
                  <LoadingButton
                    type="button"
                    onClick={handleClaim}
                    loading={claiming}
                    loadingText="Claiming…"
                    disabled={!deadline || (showPortionInput && ((portionQty ?? 0) < 1 || qtyRemaining === 0))}
                    className="w-full gap-1.5 px-5 shadow-sm shadow-primary/20"
                  >
                    <ArrowDownToLine className="h-4 w-4" />
                    {showPortionInput && portionQty != null && portionQty < qtyRemaining
                      ? `Claim ${portionQty}`
                      : "Claim"}
                  </LoadingButton>
                  {!deadline && (
                    <p className="text-center text-[10px] font-medium text-destructive">
                      Set a deadline to enable claiming
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Task Details Section ──────────────────────────────────────────────────

function TaskDetails({
  task,
  files,
  filesLoading,
  kitting,
}: {
  task: PoolTaskPreview;
  files: RefFile[];
  filesLoading: boolean;
  kitting: KittingPreview | null;
}) {
  const partyName = task.client?.party_name ?? (task.brief_type === "ld" ? "LD Silk Mills" : "—");
  const briefTypeLabel = task.brief_type === "job_work" ? "Job Work" : task.brief_type === "ld" ? "LD" : null;
  const messageDateTime = [task.whatsapp_received_date, task.whatsapp_received_time].filter(Boolean).join(" ") || null;

  return (
    <section className="space-y-4 rounded-xl border border-border bg-secondary/20 px-5 py-5 sm:px-6">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Task Details</h2>
        {task.task_code && (
          <Badge className="ml-auto shrink-0 border border-primary/20 bg-primary/10 font-mono text-[10px] font-medium text-primary">
            {task.task_code}
          </Badge>
        )}
      </div>

      {/* All fields — 2 columns on mobile, 3 on desktop */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Detail label="Design Type" value={task.concept} />
        <Detail label="Party Name" value={partyName} />
        <Detail label="Quantity" value={task.qty != null ? `${task.qty}` : null} />
        <Detail label="Source" value={task.whatsapp_group} />
        <Detail label="Assigned By" value={task.assigned_by} />
        {briefTypeLabel && <Detail label="Brief Type" value={briefTypeLabel} />}
        {messageDateTime && <Detail label="Message Date & Time" value={messageDateTime} />}
      </dl>

      {/* Description — full width */}
      {task.description?.trim() && (
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description</dt>
          <dd className="mt-1 text-sm leading-relaxed text-foreground">{task.description.trim()}</dd>
        </div>
      )}

      {/* Attachments row */}
      {(task.requires_full_kitting || filesLoading || files.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
          {task.requires_full_kitting && (
            <>
              <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary">
                <Layers className="h-3 w-3" /> Full Knitting
              </span>
              {kitting?.imageUrl && <FkImageButton path={kitting.imageUrl} />}
              {kitting && kitting.status === "completed" && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); window.open(kittingDetailPath(kitting.id), "_blank", "noopener"); }}
                  className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  <ExternalLink className="h-3 w-3" /> Form
                </button>
              )}
            </>
          )}
          {files.map((f) => <FileChip key={f.id} file={f} />)}
        </div>
      )}
    </section>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-medium leading-snug text-foreground" title={value ?? undefined}>{value?.toString().trim() || "—"}</dd>
    </div>
  );
}

function FileChip({ file }: { file: RefFile }) {
  const [opening, setOpening] = useState(false);
  async function open() {
    setOpening(true);
    const { data, error } = await supabase.storage.from(REF_FILE_BUCKET).createSignedUrl(file.storage_url, 300);
    setOpening(false);
    if (error || !data) { toast.error("Could not open file."); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }
  return (
    <button
      type="button"
      onClick={open}
      disabled={opening}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
      title={file.file_name}
    >
      <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="max-w-[120px] truncate">{file.file_name}</span>
    </button>
  );
}

// ── Status label helpers ────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  pool: "Pool",
  in_progress: "In Progress",
  done: "Done",
  completed: "Completed",
  todo: "To Do",
  full_kitting: "Full Kitting",
};

function statusLabel(s: string): string {
  return STATUS_LABEL[s] ?? s;
}

// ── Task History (activity log + completed assignments) ─────────────────────

function TaskHistory({
  assignments,
  logs,
}: {
  assignments: TaskAssignmentWithDesigner[];
  logs: TaskLogEntry[];
}) {
  const [expanded, setExpanded] = useState(false);

  const completedAssignments = assignments.filter(
    (a) => a.status === "completed" || a.status === "done"
  );

  const meaningfulLogs = useMemo(() => {
    return logs.filter((l) => {
      if (!l.status_from && l.note === "Task created") return true;
      if (l.note) return true;
      if (l.status_from && l.status_to && statusLabel(l.status_from) !== statusLabel(l.status_to)) return true;
      return false;
    });
  }, [logs]);

  if (completedAssignments.length === 0 && meaningfulLogs.length <= 1) return null;

  const visibleLogs = expanded ? meaningfulLogs : meaningfulLogs.slice(0, 4);

  return (
    <section className="rounded-xl border border-border bg-secondary/20">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Task History
        </span>
        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
          {meaningfulLogs.length}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className="border-t border-border/40 px-4 py-3 space-y-3">
          {/* Completed work by previous designers */}
          {completedAssignments.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Previous work
              </p>
              {completedAssignments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">
                      {a.designer?.full_name ?? "Designer"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {[
                        `${a.qty_completed}/${a.qty_assigned} designs`,
                        a.design_type ? `Type: ${a.design_type}` : null,
                        a.completion_fabric ? `Fabric: ${a.completion_fabric}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                    Completed
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Activity timeline */}
          {meaningfulLogs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Activity log
              </p>
              <ol className="space-y-0">
                {visibleLogs.map((l, i) => {
                  const when = new Date(l.timestamp);
                  const actor = l.changer?.full_name ?? "System";
                  const sameLabel =
                    l.status_from &&
                    l.status_to &&
                    statusLabel(l.status_from) === statusLabel(l.status_to);
                  const isNoteOnly = sameLabel && !!l.note;
                  const isCreation = !l.status_from;

                  return (
                    <li key={l.id} className="flex gap-2.5">
                      <div className="flex flex-col items-center">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                        </span>
                        {i < visibleLogs.length - 1 && (
                          <span className="mt-0.5 w-px flex-1 bg-border" />
                        )}
                      </div>
                      <div className={cn("min-w-0 flex-1", i < visibleLogs.length - 1 ? "pb-2.5" : "pb-0")}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-xs font-semibold text-foreground">
                            {actor}
                          </span>
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                            {fmtDist(when, { addSuffix: true })}
                          </span>
                        </div>
                        {isNoteOnly ? (
                          <p className="mt-0.5 text-[11px] text-foreground">{l.note}</p>
                        ) : (
                          <>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                              {isCreation ? (
                                <span>created this task</span>
                              ) : l.status_from ? (
                                <>
                                  <span>moved</span>
                                  <span className="rounded bg-secondary px-1 py-0.5 text-[10px] font-medium text-foreground">
                                    {statusLabel(l.status_from)}
                                  </span>
                                  <ArrowRight className="h-2.5 w-2.5" />
                                  <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary">
                                    {statusLabel(l.status_to)}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span>set to</span>
                                  <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary">
                                    {statusLabel(l.status_to)}
                                  </span>
                                </>
                              )}
                            </div>
                            {l.note && (
                              <p className="mt-1 rounded-md bg-secondary/50 px-2 py-1 text-[11px] text-foreground">
                                {l.note}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {!expanded && meaningfulLogs.length > 4 && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="text-[10px] font-medium text-primary hover:underline"
                >
                  Show all {meaningfulLogs.length} entries
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FkImageButton({ path }: { path: string }) {
  const [opening, setOpening] = useState(false);
  async function open(e: React.MouseEvent) {
    e.stopPropagation();
    setOpening(true);
    const { data, error } = await supabase.storage.from("sample-files").createSignedUrl(path, 300);
    setOpening(false);
    if (error || !data) { toast.error("Could not open image."); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }
  return (
    <button
      type="button"
      onClick={open}
      disabled={opening}
      className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
    >
      <ExternalLink className="h-3 w-3" /> Image
    </button>
  );
}

