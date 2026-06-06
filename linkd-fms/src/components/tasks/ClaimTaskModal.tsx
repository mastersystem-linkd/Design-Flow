import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ArrowDownToLine,
  AlertTriangle,
  Paperclip,
  Layers,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import confetti from "canvas-confetti";
import { formatDistanceToNow } from "date-fns";
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
import { Combobox } from "@/components/ui/Combobox";
import { supabase } from "@/lib/supabase";
import { kittingDetailPath } from "@/lib/routes";
import { useFabrics } from "@/hooks/useFabrics";
import { useConceptCategories } from "@/hooks/useConceptCategories";
import {
  useTaskMutations,
  type PoolTaskPreview,
} from "@/hooks/useTaskMutations";
import { useTaskAssignments } from "@/hooks/useTaskAssignments";

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
  const [fabric, setFabric] = useState("");
  const [designType, setDesignType] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [portionQty, setPortionQty] = useState<number | null>(null);

  const [files, setFiles] = useState<RefFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [kitting, setKitting] = useState<KittingPreview | null>(null);

  // Load existing assignments for the task (split tasks show who's already working)
  const { assignments, totalAssigned, claimPortion, isLoading: assignmentsLoading } = useTaskAssignments(
    open && task ? task.id : null
  );

  // Determine if this task requires portion claiming.
  // Prefer live assignment data over potentially-stale task.qty_remaining.
  const qtyRemaining = task
    ? !assignmentsLoading && (assignments.length > 0 || totalAssigned > 0)
      ? Math.max(0, task.qty - totalAssigned)
      : (task.qty_remaining ?? task.qty)
    : 0;
  const isPartiallyAssigned = task != null && (task.qty_remaining != null || totalAssigned > 0);
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
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setDeadline("");
    setFabric("");
    setDesignType("");
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
    if (!open || !taskId) { setFiles([]); setKitting(null); return; }
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
    // FK image + form status
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
      const { error } = await claimPortion(task.id, { qty, deadline, designType, fabric });
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
    const { error } = await claimPoolTask(task.id, deadline, fabric, designType);
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
      >
        {/* ── Header banner ── */}
        <div className="relative overflow-hidden border-b border-primary/15 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-card px-4 py-2">
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
                  Received {formatDistanceToNow(new Date(receivedRef))} ago
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

              {/* Already working — show existing assignments */}
              {assignments.length > 0 && (
                <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Already working ({totalAssigned}/{task.qty} assigned)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {assignments.map((a) => (
                      <span
                        key={a.id}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground"
                      >
                        {a.designer?.full_name ?? "Unknown"}
                        <span className="tabular-nums text-muted-foreground">({a.qty_assigned})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

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
                    Design Type <span className="normal-case font-normal text-muted-foreground/70">(optional)</span>
                  </Label>
                  <Combobox
                    id="claim-design-type"
                    value={designType}
                    onChange={setDesignType}
                    options={conceptCategories.map((c) => ({ value: c.name, label: c.name }))}
                    placeholder="Pick a design type"
                    searchPlaceholder="Search type…"
                    disabled={claiming}
                    clearable
                  />
                </div>
                <div>
                  <Label htmlFor="claim-fabric" className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Fabric <span className="normal-case font-normal text-muted-foreground/70">(optional)</span>
                  </Label>
                  <Combobox
                    id="claim-fabric"
                    value={fabric}
                    onChange={setFabric}
                    options={fabrics.map((f) => ({ value: f.name, label: f.name }))}
                    placeholder="Choose fabric"
                    searchPlaceholder="Search fabric…"
                    disabled={claiming}
                    clearable
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
                <LoadingButton
                  type="button"
                  onClick={handleClaim}
                  loading={claiming}
                  loadingText="Claiming…"
                  disabled={!deadline || (showPortionInput && ((portionQty ?? 0) < 1 || qtyRemaining === 0))}
                  className="gap-1.5 px-5 shadow-sm shadow-primary/20"
                >
                  <ArrowDownToLine className="h-4 w-4" />
                  {showPortionInput && portionQty != null && portionQty < qtyRemaining
                    ? `Claim ${portionQty}`
                    : "Claim"}
                </LoadingButton>
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

