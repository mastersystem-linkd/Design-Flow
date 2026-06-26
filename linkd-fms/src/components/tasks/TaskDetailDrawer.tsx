import { useEffect, useMemo, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Check,
  X,
  Play,
  Send,
  ArrowRight,
  Loader2,
  Upload,
  Paperclip,
  FileIcon,
  Download,
  Sparkles,
  HandPlatter,
  Minus,
  Plus,
  AlertTriangle,
  MessageSquare,
  Pencil,
  Trash2,
  Package,
  CalendarDays,
  FlaskConical,
  Flag,
  UserCircle2,
  Layers,
  Split,
  History,
  ClipboardList,
  ChevronRight,
  Workflow,
  FolderOpen,
  Users,
  Clock,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast, LazyImage } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PostDoneModal } from "@/components/tasks/PostDoneModal";
import { ClaimTaskModal } from "@/components/tasks/ClaimTaskModal";
import { SplitMyClaimDialog } from "@/components/tasks/SplitMyClaimDialog";
import { AssignmentsPanel } from "@/components/tasks/AssignmentsPanel";
import { ReturnToPoolDialog } from "@/components/tasks/ReturnToPoolDialog";
import { useTaskAssignments } from "@/hooks/useTaskAssignments";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
} from "@/components/ui/avatar";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompression";
import { useAuth } from "@/hooks/useAuth";
import { useFabrics } from "@/hooks/useFabrics";
import { useConceptCategories } from "@/hooks/useConceptCategories";
import { useTaskDetail, type FileWithUploader, type TaskLogWithUser } from "@/hooks/useTaskDetail";
import { useTaskMutations, type UpdateTaskFields } from "@/hooks/useTaskMutations";
import { useProfiles } from "@/hooks/useProfiles";
import {
  STATUS_ORDER,
  STATUS_LABELS,
  STATUS_COLORS,
  COLUMN_DOT,
} from "@/lib/constants";
import {
  daysUntil,
  daysSeverity,
  daysLabel,
  DAYS_DOT_CLASS,
  DAYS_TEXT_CLASS,
} from "@/lib/days";
import { cn, formatDate } from "@/lib/utils";
import { isAdminOrCoordinator } from "@/lib/permissions";
import { isFullKittingBlocking } from "@/lib/taskHelpers";
import { flagFkPendingToCoordinator } from "@/lib/fkCoordinatorTask";
import { ExternalOriginBadge } from "@/components/integration/ExternalOriginBadge";
import type {
  TaskStatus,
  TaskPriority,
  TaskWithRelations,
  UserRole,
  Profile,
  Sample,
} from "@/types/database";

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB


function isAdminRole(role: UserRole | null | undefined): boolean {
  return isAdminOrCoordinator(role);
}

// ============================================================================
// Drawer entrypoint
// ============================================================================

export interface TaskDetailDrawerProps {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange?: () => void;
  /** When provided, the drawer delegates the "Claim Task" action to the parent
   *  (which can run skip + FK warning chain before opening the claim modal).
   *  If not provided, the drawer handles FK locally and opens its own claim modal. */
  onClaimTask?: (taskId: string) => void;
}

export function TaskDetailDrawer({
  taskId,
  open,
  onOpenChange,
  onChange,
  onClaimTask,
}: TaskDetailDrawerProps) {
  const { task, files, logs, isLoading, error, refetch } = useTaskDetail(taskId);
  const { profile, user } = useAuth();
  const { updateTask, deleteTask, completeTask, isPending: isMutPending } =
    useTaskMutations();

  const [editMode, setEditMode] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [postDoneOpen, setPostDoneOpen] = useState(false);
  const [splitMineOpen, setSplitMineOpen] = useState(false);

  // Edit visible to admin/coordinator OR the designer who owns the task
  const isOwner = !!(task && (task.assigned_to === user?.id || task.created_by === user?.id));
  const canEdit = isAdminRole(profile?.role) || isOwner;
  const canDelete = isAdminRole(profile?.role);
  // Working a task — updating progress (qty) + completing it — is the ASSIGNED
  // designer's job ONLY. Admins/coordinators manage tasks (edit fields, assign,
  // hand off) but must never update progress or complete on a designer's behalf.
  const canWork = !!(task && task.assigned_to === user?.id);

  // The ASSIGNEE can split off their own claim: keep part, release the rest to
  // the pool. Only on an in-progress, not-yet-split task with room to release.
  const canSplitMine = !!(
    task &&
    task.assigned_to === user?.id &&
    !task.is_split &&
    (task.status === "in_progress" || task.status === "full_kitting") &&
    task.qty > 1 &&
    Math.max(1, task.qty_completed ?? 0) <= task.qty - 1
  );

  // One-step completion: the moment a task the owner just worked on transitions
  // to 'done', auto-open the completion modal so Design Type + Fabric + Sampling
  // are captured immediately (instead of a separate "Add Completion Details"
  // click). The modal's "Skip for Now" still lets them defer.
  const prevStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevStatusRef.current;
    if (task && prev && prev !== "done" && task.status === "done" && isOwner) {
      setPostDoneOpen(true);
    }
    prevStatusRef.current = task?.status;
  }, [task?.status, isOwner]);

  // Reset edit mode when drawer closes or task changes
  useEffect(() => {
    setEditMode(false);
  }, [taskId, open]);

  function handleChanged() {
    void refetch();
    onChange?.();
  }

  async function handleDelete() {
    if (!task) return;
    const { error: delErr } = await deleteTask(task.id);
    if (delErr) {
      toast.error(delErr);
      return;
    }
    toast.success("Task deleted");
    setDeleteOpen(false);
    onOpenChange(false);
    onChange?.();
  }

  // Complete a 'done' task. If both fabric AND design type are set, finish
  // straight away; otherwise open PostDoneModal to capture missing fields.
  // Full Knitting gate: block if FK is required but not yet added.
  async function handleComplete() {
    if (!task) return;
    if (isFullKittingBlocking(task)) {
      toast.error(
        "Full Knitting details are required before completing this task. Ask the coordinator to add them."
      );
      return;
    }
    if (task.qty > 0 && task.qty_completed < task.qty) {
      toast.error(`Complete progress first (${task.qty_completed}/${task.qty}).`);
      return;
    }
    // Completion details (Design Type + Fabric + Sampling Required) are
    // MANDATORY for every task — always open the modal, never auto-complete.
    setPostDoneOpen(true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[95vh] w-[95vw] max-w-[640px] flex-col gap-0 overflow-hidden p-0 sm:rounded-xl !top-[1vh] !translate-y-0"
        srTitle={task?.task_code ? `Task ${task.task_code}` : "Task details"}
      >
        {isLoading || !task ? (
          <DrawerSkeleton error={error} />
        ) : (
          <>
            <DrawerHeader
              task={task}
              editMode={editMode}
              canEdit={isAdminRole(profile?.role)}
              canDelete={canDelete}
              onEdit={() => setEditMode(true)}
              onDelete={() => setDeleteOpen(true)}
            />

            <div
              className={cn(
                "flex-1 space-y-2 overflow-y-auto px-4 py-2",
                editMode && "bg-primary/[0.02]"
              )}
            >
              {!editMode && <CarryForwardBanner task={task} />}
              {!editMode && (
                isConceptTrackTask(task) ? (
                  <ConceptStagesPipeline current={task.status} />
                ) : (
                  <ProgressPipeline current={task.status} />
                )
              )}
              {editMode ? (
                <EditableBriefDetails
                  task={task}
                  onSave={async (fields) => {
                    const { error: e } = await updateTask(task.id, fields);
                    if (e) {
                      toast.error(e);
                      return;
                    }
                    // Log the field edit in task_logs
                    const changedKeys = Object.keys(fields).filter(
                      (k) => (fields as Record<string, unknown>)[k] !== undefined
                    );
                    if (changedKeys.length > 0) {
                      void supabase.from("task_logs").insert({
                        task_id: task.id,
                        status_from: task.status,
                        status_to: task.status,
                        changed_by: user?.id ?? "",
                        note: `Fields updated: ${changedKeys.join(", ")}`,
                      });
                    }
                    toast.success("Task updated");
                    setEditMode(false);
                    handleChanged();
                  }}
                  onCancel={() => setEditMode(false)}
                  isPending={isMutPending("updateTask", task.id)}
                />
              ) : (
                <BriefDetails task={task} onChanged={handleChanged} />
              )}

              {/* Sales ERP Brief — collapsible panel showing the original ERP brief JSONB */}
              {!editMode && task.external_source && task.external_brief && (
                <SalesErpBriefPanel brief={task.external_brief} refId={task.external_ref_id} />
              )}

              {/* Team Assignments — visible when a task has been split among multiple designers */}
              {!editMode && <AssignmentsPanel task={task} />}

              {/* Progress Tracker — visible for in_progress + done until completed.
                 Hidden when task is split — AssignmentsPanel's OVERALL section is the source of truth. */}
              {!editMode && !task.is_split && task.status !== "completed" && task.status !== "pool" && (
                task.qty > 0 ? (
                  <QtyTracker
                    task={task}
                    hasFiles={files.length > 0}
                    onUpdated={handleChanged}
                    readOnly={!canWork}
                  />
                ) : (
                  <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Progress Tracker</p>
                    <p className="mt-1 text-xs text-muted-foreground">Locked — quantity not set yet. Admin/coordinator will add it.</p>
                  </div>
                )
              )}

              {/* Split my claim — the assignee can keep part and release the
                  rest to the pool (turns a full individual claim into a split). */}
              {!editMode && canSplitMine && (
                <button
                  type="button"
                  onClick={() => setSplitMineOpen(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 bg-primary/[0.03] px-3 py-2 text-xs font-medium text-primary transition-colors hover:border-primary hover:bg-primary/10"
                >
                  <Split className="h-3.5 w-3.5" />
                  Split task — keep fewer, release the rest to the pool
                </button>
              )}

              {!editMode && (
                <CompletionSection
                  task={task}
                  canComplete={canWork}
                  onAddDetails={() => void handleComplete()}
                />
              )}

              {!editMode && <HandoffControl task={task} onChanged={handleChanged} />}

              {/* Full Kitting reference — visible to ALL roles. Shows the
                  coordinator-uploaded photo + any DEO progress so designers
                  see the kitting context before they start. */}
              <FullKittingReference task={task} />

              {/* Reference + design files — the brief's attached references and
                  the designer's uploads, so designers have what they need to
                  work. (Previously this section was never mounted.) */}
              <FilesSection task={task} files={files} onUploaded={handleChanged} />

              <ActivityLog logs={logs} />

              {/* SamplingRecords removed — sampling is now decoupled from tasks. */}
            </div>

            <ActionFooter
              task={task}
              files={files}
              onChanged={handleChanged}
              onClaimTask={onClaimTask}
            />

            <ConfirmDialog
              open={deleteOpen}
              title="Delete this task?"
              description={`"${task.task_code}" will be soft-deleted. It won't appear on the board but can be recovered by an admin.`}
              variant="danger"
              confirmLabel="Delete"
              onConfirm={() => void handleDelete()}
              onCancel={() => setDeleteOpen(false)}
            />

            <PostDoneModal
              open={postDoneOpen}
              onOpenChange={setPostDoneOpen}
              task={task}
              onCompleted={handleChanged}
            />

            <SplitMyClaimDialog
              task={task}
              open={splitMineOpen}
              onOpenChange={setSplitMineOpen}
              onDone={handleChanged}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Completion details — done → completed
// ----------------------------------------------------------------------------
// 'done' = design work finished. If fabric was chosen at claim time, the
// "Complete" button finishes the task directly; otherwise it opens the
// PostDoneModal to capture fabric first. 'completed' = fully closed; shows the
// captured fabric / who-filled-it / when.
// ============================================================================

function CompletionSection({
  task,
  canComplete,
  onAddDetails,
}: {
  task: TaskWithRelations;
  canComplete: boolean;
  onAddDetails: () => void;
}) {
  const hasAssignments = task.is_split || task.status === "completed" || task.status === "done";
  const { assignments } = useTaskAssignments(hasAssignments ? task.id : null);
  const [expanded, setExpanded] = useState(false);
  const disclosureId = `completion-subtasks-${task.id}`;

  // Re-collapse when task changes (drawer reopened / different task)
  useEffect(() => {
    setExpanded(false);
  }, [task.id]);

  // Flag-sampling-later for an already-completed task (status stays completed).
  // flagSamplingRequired self-invalidates the tasks query, so the drawer refreshes.
  // Only the owner designer or an admin/coordinator may flag (matches RLS).
  const { profile, user } = useAuth();
  const canFlagSampling =
    isAdminOrCoordinator(profile?.role) || task.assigned_to === user?.id;
  const { flagSamplingRequired } = useTaskMutations();
  const [samplingConfirm, setSamplingConfirm] = useState(false);
  const [flaggingSampling, setFlaggingSampling] = useState(false);

  async function handleFlagSampling() {
    setFlaggingSampling(true);
    const { error } = await flagSamplingRequired(task.id);
    setFlaggingSampling(false);
    setSamplingConfirm(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Added to sampling queue");
  }

  // For completed tasks with assignments: disclosure card with per-designer grid + expandable sub-task cards
  if (assignments.length > 0 && task.status === "completed") {
    const completedPortions = assignments.filter((a) => a.status === "completed");
    const totalQtyCompleted = assignments.reduce((s, a) => s + a.qty_completed, 0);
    const lastCompletedAt = completedPortions
      .map((a) => a.completed_at)
      .filter(Boolean)
      .sort()
      .pop();

    return (
      <div className="space-y-2">
        {/* Q3: Slim overall line */}
        <div className="flex items-center gap-2 rounded-lg border border-success/25 bg-success/5 px-3 py-2">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
          <span className="text-[11px] font-medium text-muted-foreground">
            Overall ·{" "}
            <span className="tabular-nums font-semibold text-foreground">
              {totalQtyCompleted}/{task.qty}
            </span>
            {" · "}
            <span className="font-semibold text-success">Completed</span>
          </span>
        </div>

        {/* Completion Details disclosure */}
        <div className="rounded-xl border border-success/30 bg-success/10">
          {/* Clickable header */}
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            aria-expanded={expanded}
            aria-controls={disclosureId}
            className="flex w-full items-center justify-between p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-success">
                Completion Details
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {assignments.length} designer{assignments.length !== 1 ? "s" : ""}
                {" · "}
                <span className="tabular-nums font-medium">{totalQtyCompleted}/{task.qty}</span>
                {lastCompletedAt && (
                  <> · auto-completed {formatDate(lastCompletedAt)}</>
                )}
              </p>
            </div>
            <ChevronDown
              aria-hidden
              className={cn(
                "h-4 w-4 shrink-0 text-success transition-transform duration-200",
                expanded && "rotate-180"
              )}
            />
          </button>

          {/* Always-visible: per-designer completion grid */}
          <div className="space-y-2 px-4 pb-4">
            {assignments.map((a) => (
              <div
                key={a.id}
                className={cn(
                  "rounded-lg border px-3 py-2",
                  a.status === "completed"
                    ? "border-success/20 bg-success/5"
                    : "border-border bg-card"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-foreground">
                    {a.designer?.full_name ?? "Unknown"}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {a.qty_completed}/{a.qty_assigned} designs
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-x-3 text-[11px]">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                      Design Type
                    </span>
                    <p className="font-medium text-foreground">
                      {a.design_type || "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                      Fabric
                    </span>
                    <p className="font-medium text-foreground">
                      {a.completion_fabric || "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                      Completed
                    </span>
                    <p className="font-medium text-foreground">
                      {a.completed_at ? formatDate(a.completed_at) : "—"}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {/* Task auto-completed footer */}
            {lastCompletedAt && (
              <div className="flex items-center justify-between border-t border-success/20 pt-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Task auto-completed
                </span>
                <span className="text-[12px] font-semibold text-success">
                  {formatDate(lastCompletedAt)}
                </span>
              </div>
            )}

            {/* Expandable: full sub-task cards */}
            <div
              id={disclosureId}
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
                expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              )}
              style={{ willChange: expanded ? "auto" : "grid-template-rows, opacity" }}
            >
              <div className="overflow-hidden">
                <div className="space-y-2 pt-2 border-t border-success/20">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    Team Sub-tasks
                  </p>
                  {assignments.map((a) => (
                    <CompletedSubtaskCard key={a.id} a={a} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Non-split only — a split task is completed per-portion (the parent never
  // shows its own completion CTA, which would mint a spurious parent sample).
  if (task.status === "done" && !task.is_split) {
    const fkBlocking = isFullKittingBlocking(task);
    const hasFabric = !!task.fabric?.trim();
    const hasDesignType = !!task.concept?.trim();
    const qtyMet = task.qty > 0 && task.qty_completed >= task.qty;
    const isReady = hasFabric && hasDesignType && qtyMet && !fkBlocking;
    const missing: string[] = [];
    if (!qtyMet) missing.push(`progress (${task.qty_completed}/${task.qty})`);
    if (!hasDesignType) missing.push("design type");
    if (!hasFabric) missing.push("fabric");
    if (fkBlocking) missing.push("Full Knitting");
    return (
      <div
        className={cn(
          "rounded-xl border p-4",
          isReady
            ? "border-success/30 bg-success/10"
            : "border-warning/30 bg-warning/10"
        )}
      >
        <div className="flex items-start gap-2.5">
          {isReady ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {isReady ? "Ready to Complete" : "Completion Details Needed"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isReady
                ? `${task.concept} · ${task.fabric}. Mark this task completed.`
                : fkBlocking && missing.length === 1
                  ? "Waiting for coordinator to add Full Knitting details."
                  : `Add ${missing.join(" & ")} to complete.`}
            </p>
            {canComplete && (
              <Button
                type="button"
                size="sm"
                onClick={onAddDetails}
                disabled={fkBlocking}
                className="mt-3 gap-1.5"
                title={fkBlocking ? "Full Knitting details are required before completing" : undefined}
              >
                <Check className="h-3.5 w-3.5" />
                {isReady ? "Complete Task" : "Add Completion Details"}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (task.status === "completed" && !task.is_split) {
    return (
      <>
      <div className="rounded-xl border border-success/30 bg-success/10 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-success">
          Completion Details
        </p>
        <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Fabric
            </dt>
            <dd className="font-medium text-foreground">
              {task.completion_fabric || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Design Type
            </dt>
            <dd className="font-medium text-foreground">
              {task.concept?.trim() || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Completed by
            </dt>
            <dd className="font-medium text-foreground">
              {task.filler?.full_name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Completed on
            </dt>
            <dd className="font-medium text-foreground">
              {task.completion_filled_at
                ? formatDate(task.completion_filled_at)
                : "—"}
            </dd>
          </div>
        </dl>

        {/* Sampling-required flag — badge if set, else a button to flag later. */}
        {task.sampling_required ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
            <FlaskConical className="h-3.5 w-3.5 shrink-0" />
            <span>
              Sampling Required
              {task.sampling_flagged_at && (
                <span className="font-normal text-muted-foreground">
                  {" · "}flagged {formatDate(task.sampling_flagged_at)}
                </span>
              )}
            </span>
          </div>
        ) : canFlagSampling && !task.is_split ? (
          <button
            type="button"
            onClick={() => setSamplingConfirm(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Mark Sampling Required
          </button>
        ) : null}
      </div>

      <ConfirmDialog
        open={samplingConfirm}
        title="Add this task to the sampling queue?"
        description="This task will be flagged for sampling and added to the Sampling queue. The task stays completed."
        confirmLabel={flaggingSampling ? "Adding…" : "Add to Sampling"}
        onConfirm={() => void handleFlagSampling()}
        onCancel={() => setSamplingConfirm(false)}
      />
      </>
    );
  }

  return null;
}

// Read-only sub-task card for completed split tasks (inside disclosure)
function CompletedSubtaskCard({ a }: { a: { id: string; designer_id: string; designer?: { full_name: string; avatar_url: string | null } | null; status: string; qty_completed: number; qty_assigned: number; design_type?: string | null; completion_fabric?: string | null; planned_deadline?: string | null; completed_at?: string | null } }) {
  const pct = a.qty_assigned > 0 ? Math.min(100, (a.qty_completed / a.qty_assigned) * 100) : 0;

  return (
    <div className="rounded-xl border border-success/25 bg-gradient-to-b from-success/[0.04] to-card px-3 py-2.5">
      {/* Avatar + name + badge + chips */}
      <div className="flex items-center gap-2">
        <Avatar className="h-7 w-7 shrink-0 bg-success/20 text-success">
          <AvatarFallback className="bg-success/20 text-[9px] font-bold text-success">
            {getInitials(a.designer?.full_name ?? "?")}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[12px] font-semibold text-foreground">
              {a.designer?.full_name ?? "Unknown"}
            </span>
            <span className="shrink-0 rounded-full border border-success/25 bg-success/10 px-1.5 py-px text-[9px] font-semibold text-success">
              Completed
            </span>
            {a.design_type && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary">
                <Sparkles className="h-2.5 w-2.5" />
                {a.design_type}
              </span>
            )}
            {a.completion_fabric && (
              <span className="text-[10px] text-muted-foreground">
                · {a.completion_fabric}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar (read-only) */}
      <div className="mt-2">
        <div className="relative h-5 overflow-hidden rounded-md border border-border bg-secondary">
          <div
            className="h-full rounded-md bg-gradient-to-r from-success/80 to-success"
            style={{ width: `${pct}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center gap-1 text-[10px] font-medium tabular-nums text-foreground">
            {a.qty_completed}/{a.qty_assigned}
            <span className="text-[9px] text-foreground/70">({Math.round(pct)}%)</span>
          </div>
        </div>
      </div>

      {/* Completed date */}
      {a.completed_at && (
        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
          <CalendarDays className="h-2.5 w-2.5" />
          Completed {formatDate(a.completed_at)}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// 1 — FIXED HEADER
// ============================================================================

/**
 * Concept-track briefs use the new design pipeline labels instead of the
 * generic task-status labels. Falls back to STATUS_LABELS for regular tasks.
 */
function statusLabelForTask(task: TaskWithRelations): string {
  if (!isConceptTrackTask(task)) {
    // Full knitting displays as "In Progress" for regular tasks
    if (task.status === "full_kitting") return STATUS_LABELS.in_progress;
    return STATUS_LABELS[task.status];
  }
  switch (task.status) {
    case "pool":
      return "Briefing";
    case "todo":
      return "Research";
    case "in_progress":
      return "Digital Designing";
    case "full_kitting":
      return "Design Approval";
    case "approved":
    case "sampling":
      return "Finalization";
    case "done":
      return "Completed";
    default:
      return STATUS_LABELS[task.status];
  }
}

function DrawerHeader({
  task,
  editMode,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  task: TaskWithRelations;
  editMode?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const isUrgent = task.priority === "urgent";
  return (
    <div className="relative shrink-0 overflow-hidden border-b border-border bg-gradient-to-br from-primary/[0.07] via-card to-card px-5 pt-4 pb-4 backdrop-blur">
      {/* Warp-line accent (loom thread) — the app's textile signature. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-primary/70 via-warning/40 to-success/50"
      />
      {/* Woven dot grid — faint texture behind the title. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgb(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "14px 14px",
        }}
      />

      <div className="relative">
        {/* Row 1: code + status + action buttons */}
        <div className="flex items-center gap-2 pr-8">
          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider text-primary">
            {task.task_code}
          </span>
          <ExternalOriginBadge source={task.external_source} refId={task.external_ref_id} size="md" />
          <Badge className={cn("text-[10px]", STATUS_COLORS[task.status])}>
            {statusLabelForTask(task)}
          </Badge>
          {editMode && (
            <Badge className="border border-primary/20 bg-primary/10 text-[10px] text-primary">
              Editing
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-1">
            {!editMode && canEdit && onEdit && (
              <button
                type="button"
                onClick={onEdit}
                title="Edit task"
                aria-label="Edit task"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card/60 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {!editMode && canDelete && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                title="Delete task"
                aria-label="Delete task"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card/60 text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: concept */}
        <div className="mt-2.5 flex items-start gap-2.5">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-sans text-2xl font-semibold leading-tight tracking-tight text-foreground">
              {task.concept}
            </h2>
            {/* Row 3: client + urgent */}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {task.client?.party_name ?? (task.brief_type === "ld" ? "LD Silk Mills" : "—")}
              </span>
              {isUrgent && (
                <Badge className="gap-1 bg-destructive px-1.5 py-0 text-[10px] uppercase tracking-wider text-destructive-foreground">
                  <Flag className="h-2.5 w-2.5" />
                  Urgent
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 2 — PROGRESS PIPELINE
// ============================================================================

/**
 * The visible pipeline excludes "approved" AND "sampling" — approval is a
 * concepts-only concern, and tasks now go directly from Full Kitting to Done
 * when marked completed. Any task still sitting in `approved` or `sampling`
 * status (legacy data) renders as if it were in "full_kitting" so the dot
 * positions stay sensible.
 */
const PIPELINE_STAGES: TaskStatus[] = STATUS_ORDER.filter(
  (s) =>
    s !== "approved" &&
    s !== "sampling" &&
    s !== "full_kitting" &&
    s !== "todo"
);

const STAGE_HINTS: Record<TaskStatus, string> = {
  pool: "Unclaimed — anyone can pick it up",
  todo: "Assigned, waiting to start",
  in_progress: "Designer is working on it",
  full_kitting: "Submitted, waiting on admin review",
  approved: "Approved (legacy)",
  sampling: "Sampling (legacy)",
  done: "Design done — awaiting completion details",
  completed: "Fully completed",
};

function ProgressPipeline({ current }: { current: TaskStatus }) {
  const effectiveCurrent: TaskStatus =
    current === "approved" ||
    current === "sampling" ||
    current === "full_kitting" ||
    current === "todo"
      ? "in_progress"
      : current === "completed"
        ? "done"
        : current;
  const currentIndex = PIPELINE_STAGES.indexOf(effectiveCurrent);
  const lastIndex = PIPELINE_STAGES.length - 1;

  return (
    <Section title="Pipeline" icon={<Workflow className="h-3.5 w-3.5" />}>
      {/* Dots + connector lines */}
      <div className="flex items-start">
        {PIPELINE_STAGES.map((s, i) => {
          const isPast = i < currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <div
              key={s}
              className="flex flex-1 flex-col items-stretch last:flex-none"
            >
              <div className="flex items-center">
                <div
                  className={cn(
                    "relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                    isCurrent
                      ? "h-7 w-7 border-primary bg-primary"
                      : isPast
                        ? "border-primary bg-primary"
                        : "border-border bg-card"
                  )}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={STATUS_LABELS[s]}
                  title={STAGE_HINTS[s]}
                >
                  {isPast && <Check className="h-3 w-3 text-white" />}
                  {isCurrent && (
                    <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-40" />
                  )}
                </div>
                {i < lastIndex && (
                  <div
                    className={cn(
                      "h-px flex-1",
                      i < currentIndex ? "bg-primary" : "bg-border"
                    )}
                  />
                )}
              </div>

              {/* Label under every dot */}
              <div
                className={cn(
                  "mt-2 pr-2 text-[10px] leading-tight",
                  isCurrent
                    ? "font-semibold text-foreground"
                    : isPast
                      ? "text-foreground/70"
                      : "text-muted-foreground"
                )}
                title={STAGE_HINTS[s]}
              >
                {STATUS_LABELS[s]}
              </div>
            </div>
          );
        })}
      </div>

      {/* Plain-English description of the current stage */}
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-primary/15 bg-primary/[0.04] px-3 py-2 text-[11px] text-muted-foreground">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
        <span>
          <span className="font-semibold text-foreground">
            {STATUS_LABELS[effectiveCurrent]}
          </span>
          {" — "}
          {STAGE_HINTS[effectiveCurrent]}
        </span>
      </div>
    </Section>
  );
}

// ============================================================================
// 2b — CONCEPT-TRACK PIPELINE
// ============================================================================
// Concept-track briefs (tasks where concept = "Concepts") follow a different
// workflow than regular task production — they go through the team's design
// pipeline: Briefing → Research → Concept Dev → Digital Design → Approval →
// Finalization → Handoff. If Approval comes back NOT approved, the work loops
// back to Digital Designing.

const CONCEPT_TRACK_FLAG = "Concepts";

function isConceptTrackTask(task: TaskWithRelations): boolean {
  return (task.concept ?? "").trim().toLowerCase() === CONCEPT_TRACK_FLAG.toLowerCase();
}

interface ConceptStage {
  id: string;
  label: string;
  hint: string;
  owner: string;
}

const CONCEPT_STAGES: readonly ConceptStage[] = [
  {
    id: "briefing",
    label: "Briefing",
    hint: "Design Manager received the brief",
    owner: "Design Manager · Mail/Document",
  },
  {
    id: "research",
    label: "Research & Inspiration",
    hint: "Online research, mood-boarding",
    owner: "Designer · Online research",
  },
  {
    id: "concept_dev",
    label: "Concept Development",
    hint: "Ideation with digital tools",
    owner: "Designer · Digital tools & software",
  },
  {
    id: "digital_design",
    label: "Digital Designing",
    hint: "Designing in Adobe Photoshop",
    owner: "Designers · Adobe Photoshop",
  },
  {
    id: "approval",
    label: "Design Approval",
    hint: "Senior leadership review",
    owner: "Senior leadership · Meetings",
  },
  {
    id: "finalization",
    label: "Finalization & Documentation",
    hint: "Cleanup + GDS documentation",
    owner: "Designers · GDS",
  },
  {
    id: "handoff",
    label: "Handoff to Production",
    hint: "File transfer to production",
    owner: "Designer · File transfer",
  },
];

/**
 * Map a task.status onto the concept-track stage we should highlight as
 * "current". This is a rough mapping since the existing task_status enum has
 * only 5 working states — Concept Dev and Finalization don't have a 1:1
 * counterpart, so they appear in the diagram but are never "current".
 */
function conceptStageIndexForStatus(status: TaskStatus): number {
  switch (status) {
    case "pool":
      return 0; // Briefing
    case "todo":
      return 1; // Research
    case "in_progress":
      return 3; // Digital Design (work-in-progress stage)
    case "full_kitting":
    case "approved": // legacy
      return 4; // Approval
    case "sampling": // legacy
      return 5; // Finalization
    case "done":
      return 6; // Handoff
    default:
      return 0;
  }
}

function ConceptStagesPipeline({ current }: { current: TaskStatus }) {
  const currentIndex = conceptStageIndexForStatus(current);
  const stage = CONCEPT_STAGES[currentIndex];

  return (
    <Section title="Pipeline (Concept)">
      <ol className="space-y-1">
        {CONCEPT_STAGES.map((s, i) => {
          const isPast = i < currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <li key={s.id} className="relative flex items-start gap-3 pb-1">
              {/* Connector line (drawn behind each dot except the last) */}
              {i < CONCEPT_STAGES.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-[11px] top-6 h-[calc(100%-12px)] w-px",
                    isPast ? "bg-primary" : "bg-border"
                  )}
                />
              )}

              {/* Dot */}
              <div
                className={cn(
                  "relative z-10 mt-1 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-all",
                  isCurrent
                    ? "border-primary bg-primary"
                    : isPast
                      ? "border-primary bg-primary"
                      : "border-border bg-card"
                )}
                aria-current={isCurrent ? "step" : undefined}
                title={s.hint}
              >
                {isPast && <Check className="h-3 w-3 text-white" />}
                {isCurrent && (
                  <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-40" />
                )}
              </div>

              {/* Label + hint */}
              <div className="min-w-0 pt-0.5">
                <div
                  className={cn(
                    "text-[12px] leading-tight",
                    isCurrent
                      ? "font-semibold text-foreground"
                      : isPast
                        ? "text-foreground/80"
                        : "text-muted-foreground"
                  )}
                >
                  {s.label}
                </div>
                <div className="text-[10px] leading-snug text-muted-foreground">
                  {s.owner}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Loop note */}
      <p className="mt-2 rounded-md border border-dashed border-destructive/30 bg-destructive/5 px-3 py-1.5 text-[10px] text-destructive">
        ↻ If Design Approval comes back <strong>not approved</strong>, the work
        loops back to <strong>Digital Designing</strong> for revisions.
      </p>

      {/* Plain-English current-stage description */}
      <p className="mt-2 rounded-md border border-border bg-card/50 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{stage.label}</span>
        {" — "}
        {stage.hint}
      </p>
    </Section>
  );
}

// ============================================================================
// 3 — BRIEF DETAILS (2×3 grid)
// ============================================================================

// ============================================================================
// 3a — EDITABLE BRIEF DETAILS (inline edit mode)
// ============================================================================

function EditableBriefDetails({
  task,
  onSave,
  onCancel,
  isPending,
}: {
  task: TaskWithRelations;
  onSave: (fields: UpdateTaskFields) => Promise<void>;
  onCancel: () => void;
  isPending: boolean;
}) {
  const { profiles: designers } = useProfiles({ roles: ["designer"] });

  // Reassignment lock matches the same rule used by the inline AssigneeRow
  // (admin-only Change dropdown). Once the task hits a finished state we
  // keep the field visible but read-only so the form still shows who owns
  // it without inviting an edit that would rewrite history.
  const assignmentLocked =
    task.status === "done" ||
    task.status === "approved" ||
    task.status === "sampling";

  const [description, setDescription] = useState(task.description ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [deadline, setDeadline] = useState(task.planned_deadline ?? "");
  const [priority, setPriority] = useState(task.priority ?? "normal");
  const [assignedTo, setAssignedTo] = useState(task.assigned_to ?? "");
  const [whatsappGroup, setWhatsappGroup] = useState(task.whatsapp_group ?? "");
  const [qty, setQty] = useState(String(task.qty ?? ""));
  const [mtr, setMtr] = useState(task.mtr != null ? String(task.mtr) : "");
  const [fabric, setFabric] = useState(task.fabric ?? "");
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    const qtyNum = Number(qty);
    if (!Number.isFinite(qtyNum) || qtyNum < 1) {
      setErr("Quantity must be at least 1.");
      return;
    }
    setErr(null);

    const mtrNum = mtr ? Number(mtr) : null;

    const fields: UpdateTaskFields = {
      description: description.trim() || null,
      notes: notes.trim() || null,
      planned_deadline: deadline || null,
      priority,
      // Drop assigned_to entirely when the task is finished — belt-and-braces
      // alongside the disabled <select>. Even if a stale form submits, the
      // assignee stays put.
      ...(assignmentLocked ? {} : { assigned_to: assignedTo || null }),
      whatsapp_group: whatsappGroup.trim() || null,
      qty: qtyNum,
      mtr: Number.isFinite(mtrNum as number) ? (mtrNum as number) : null,
      fabric: fabric.trim(),
    };

    await onSave(fields);
  }

  return (
    <Section title="Edit details">
      <div className="space-y-3">
        {/* Qty + Mtr */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <Label htmlFor="ed-qty" className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Quantity (m) *
            </Label>
            <Input
              id="ed-qty"
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ed-mtr" className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Meters (Mtr)
            </Label>
            <Input
              id="ed-mtr"
              type="number"
              min={0}
              step={0.5}
              value={mtr}
              onChange={(e) => setMtr(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>

        {/* Deadline + Priority */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <Label htmlFor="ed-deadline" className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Deadline
            </Label>
            <Input
              id="ed-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ed-priority" className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Priority
            </Label>
            <select
              id="ed-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              disabled={isPending}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        {/* Assigned to — locked once the task is finished. */}
        <div className="space-y-1">
          <Label htmlFor="ed-assigned" className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Assigned to
            {assignmentLocked && (
              <span className="rounded-full border border-border bg-secondary/40 px-1.5 py-0 text-[9px] font-medium text-muted-foreground">
                Locked
              </span>
            )}
          </Label>
          <select
            id="ed-assigned"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            disabled={isPending || assignmentLocked}
            title={
              assignmentLocked
                ? `Assignee can't be changed after the task is ${task.status}.`
                : undefined
            }
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            <option value="">Unassigned</option>
            {designers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </select>
        </div>

        {/* WhatsApp */}
        <div className="space-y-1">
          <Label htmlFor="ed-wa" className="text-[10px] uppercase tracking-wider text-muted-foreground">
            WhatsApp group
          </Label>
          <Input
            id="ed-wa"
            value={whatsappGroup}
            onChange={(e) => setWhatsappGroup(e.target.value)}
            disabled={isPending}
          />
        </div>

        {/* Fabric — editable so a mistyped entry can be corrected here. */}
        <div className="space-y-1">
          <Label htmlFor="ed-fabric" className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Fabric
          </Label>
          <Input
            id="ed-fabric"
            value={fabric}
            onChange={(e) => setFabric(e.target.value)}
            disabled={isPending}
            placeholder="e.g. Cotton 60×60"
          />
        </div>

        {/* Description */}
        <div className="space-y-1">
          <Label htmlFor="ed-desc" className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Description
          </Label>
          <textarea
            id="ed-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            disabled={isPending}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
        </div>

        {/* Notes */}
        <div className="space-y-1">
          <Label htmlFor="ed-notes" className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Notes / Remarks
          </Label>
          <textarea
            id="ed-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            disabled={isPending}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
        </div>

        {/* Read-only fields for reference */}
        <div className="rounded-lg border border-border bg-card/50 p-3 text-xs text-muted-foreground">
          <p className="text-[10px] uppercase tracking-wider font-medium mb-1">Read-only</p>
          <div className="grid grid-cols-2 gap-1">
            <span>Client: {task.client?.party_name ?? (task.brief_type === "ld" ? "LD Silk Mills" : "—")}</span>
            <span>Concept: {task.concept}</span>
            <span>Code: {task.task_code}</span>
          </div>
        </div>

        {err && (
          <p className="text-xs text-destructive">{err}</p>
        )}

        {/* Save / Cancel */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
          <LoadingButton
            className="flex-1"
            loading={isPending}
            loadingText="Saving…"
            onClick={() => void handleSave()}
          >
            Save Changes
          </LoadingButton>
        </div>
      </div>
    </Section>
  );
}

// ============================================================================
// ============================================================================
// Sales ERP Brief — collapsible panel showing the original external brief JSONB
// ============================================================================

function SalesErpBriefPanel({
  brief,
  refId,
}: {
  brief: Record<string, unknown>;
  refId?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const entries = Object.entries(brief).filter(
    ([, v]) => v !== null && v !== undefined && v !== ""
  );
  if (entries.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <Workflow className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
          Sales ERP Brief
        </span>
        {refId && (
          <span className="ml-1 rounded bg-primary/10 px-1 py-0.5 text-[9px] font-medium text-primary/70">
            {refId}
          </span>
        )}
        <ChevronRight
          className={cn(
            "h-3 w-3 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-90"
          )}
        />
        {!expanded && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {entries.length} field{entries.length !== 1 ? "s" : ""}
          </span>
        )}
      </button>
      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-primary/20 bg-primary/[0.03] p-3">
          {entries.map(([key, val]) => (
            <div key={key} className={typeof val === "object" ? "col-span-2" : ""}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {key.replace(/_/g, " ")}
              </p>
              <p className="mt-0.5 text-xs text-foreground break-words">
                {typeof val === "object" ? JSON.stringify(val, null, 2) : String(val)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 3 — BRIEF DETAILS (read-only view)
// ============================================================================

function BriefDetails({
  task,
  onChanged,
}: {
  task: TaskWithRelations;
  onChanged: () => void;
}) {
  const { user, profile } = useAuth();
  const isAdmin = isAdminRole(profile?.role);
  const isOwner = !!(task.assigned_to === user?.id || task.created_by === user?.id);
  // The CREATOR of the brief (a designer who logged it from My Board → New
  // Brief) may edit its assigned qty — it's their own task. Tasks created by
  // someone else (admin/coordinator, or the external Sales ERP) stay read-only.
  const isCreator = !!(task.created_by === user?.id);
  const canEdit = isAdmin || isOwner;
  const [expanded, setExpanded] = useState(true);

  const days = daysUntil(task.planned_deadline);
  const sev = daysSeverity(days);
  const qtyPct = task.qty > 0 ? Math.min(100, (task.qty_completed / task.qty) * 100) : 0;
  const qtyPartial = task.qty_completed > 0 && task.qty_completed < task.qty;
  const qtyExtra = task.qty_completed > task.qty ? task.qty_completed - task.qty : 0;

  // Read-mode display for the quantity value (shared by the editable +
  // read-only branches of the Quantity card).
  const qtyValueInner =
    qtyExtra > 0 ? (
      <>
        {task.qty_completed} / {task.qty} m
        <span className="ml-1 rounded bg-primary/15 px-1 py-0.5 text-[10px] font-semibold text-primary">
          +{qtyExtra} extra
        </span>
      </>
    ) : qtyPartial ? (
      <>
        {task.qty_completed} / {task.qty} m completed
      </>
    ) : (
      <>
        <span className="font-semibold">{task.qty}</span> m
      </>
    );

  const hasFabric = !!task.fabric?.trim();
  const hasWa = !!task.whatsapp_group;
  const hasMsgDate = !!task.whatsapp_received_date;
  const hasMsgTime = !!task.whatsapp_received_time;
  const hasAssignedBy = !!task.assigned_by;

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Brief details
        </span>
        <ChevronRight
          className={cn(
            "h-3 w-3 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-90"
          )}
        />
        {!expanded && (
          <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{task.qty}m</span>
            <span className="text-border">·</span>
            <span className="truncate max-w-[100px]">{task.assignee?.full_name ?? "Pool"}</span>
            <span className="text-border">·</span>
            {task.planned_deadline ? (
              <span className={cn("font-medium", DAYS_TEXT_CLASS[sev])}>
                {formatDate(task.planned_deadline)}
              </span>
            ) : (
              <span>No deadline</span>
            )}
            {task.priority === "urgent" && (
              <>
                <span className="text-border">·</span>
                <span className="font-semibold text-destructive">Urgent</span>
              </>
            )}
          </span>
        )}
      </button>

      {expanded && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <InfoCard
              label={`Quantity${task.qty_completed > 0 ? ` (${task.qty_completed}/${task.qty})` : ""}`}
              icon={<Package className="h-3 w-3" />}
              tone="primary"
            >
              {/* Assigned qty is editable by coordinator+ OR the designer who
                  CREATED the brief (their own task). A designer merely assigned
                  someone else's task — or an ERP/admin-created one — sees it
                  read-only and changes only their PROGRESS via the QtyTracker. */}
              {isAdmin || isCreator ? (
                <EditableQtyCell taskId={task.id} qty={task.qty} onSaved={onChanged}>
                  <span className="tabular-nums">{qtyValueInner}</span>
                </EditableQtyCell>
              ) : (
                <span className="tabular-nums">{qtyValueInner}</span>
              )}
              {(qtyPartial || qtyExtra > 0) && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-300",
                      qtyExtra > 0 ? "bg-primary" : "bg-success"
                    )}
                    style={{ width: `${qtyPct}%` }}
                  />
                </div>
              )}
            </InfoCard>

            <InfoCard
              label="Deadline"
              icon={<CalendarDays className="h-3 w-3" />}
              tone={
                sev === "overdue" || sev === "critical"
                  ? "destructive"
                  : sev === "today" || sev === "warning"
                    ? "warning"
                    : "muted"
              }
            >
              {task.planned_deadline ? (
                <div className="flex flex-col gap-1">
                  <span className="text-foreground">
                    {formatDate(task.planned_deadline)}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1 text-[10px]",
                      DAYS_TEXT_CLASS[sev]
                    )}
                  >
                    <span
                      className={cn("h-1.5 w-1.5 rounded-full", DAYS_DOT_CLASS[sev])}
                    />
                    ({daysLabel(days)})
                  </span>
                </div>
              ) : canEdit ? (
                <InlineDeadlineFabricSetter taskId={task.id} field="planned_deadline" onSaved={onChanged} />
              ) : (
                <span className="text-muted-foreground">Not set</span>
              )}
            </InfoCard>

            <InfoCard
              label="Priority"
              icon={<Flag className="h-3 w-3" />}
              tone={task.priority === "urgent" ? "destructive" : "muted"}
            >
              {task.priority === "urgent" ? (
                <Badge className="bg-destructive px-1.5 py-0 text-[10px] uppercase tracking-wider text-destructive-foreground">
                  Urgent
                </Badge>
              ) : (
                <span className="text-muted-foreground">Normal</span>
              )}
            </InfoCard>

            <InfoCard
              label="Assigned to"
              icon={<UserCircle2 className="h-3 w-3" />}
              tone="primary"
            >
              <AssigneeRow task={task} isAdmin={isAdmin} onAssigned={onChanged} />
            </InfoCard>

            {task.is_split ? (
              <SplitTeamBreakdown task={task} />
            ) : (
              <>
                <InfoCard
                  label="Fabric"
                  icon={<Layers className="h-3 w-3" />}
                >
                  {canEdit ? (
                    <EditableFieldCell taskId={task.id} field="fabric" currentValue={task.fabric ?? ""} onSaved={onChanged} />
                  ) : (
                    <span className={hasFabric ? "text-foreground" : "text-muted-foreground"}>{task.fabric || "Not set"}</span>
                  )}
                </InfoCard>

                <InfoCard
                  label="Design Type"
                  icon={<Sparkles className="h-3 w-3" />}
                >
                  {canEdit ? (
                    <EditableFieldCell taskId={task.id} field="concept" currentValue={task.concept ?? ""} onSaved={onChanged} />
                  ) : (
                    <span className={task.concept?.trim() ? "text-foreground" : "text-muted-foreground"}>{task.concept || "Not set"}</span>
                  )}
                </InfoCard>
              </>
            )}

            {hasWa && (
              <InfoCard label="WhatsApp group" icon={<MessageSquare className="h-3 w-3" />}>
                {task.whatsapp_group}
              </InfoCard>
            )}

            {hasAssignedBy && (
              <InfoCard label="Assigned By" icon={<UserCircle2 className="h-3 w-3" />}>
                {task.assigned_by}
              </InfoCard>
            )}

            {hasMsgDate && (
              <InfoCard label="Received Date" icon={<CalendarDays className="h-3 w-3" />}>
                {task.whatsapp_received_date}
              </InfoCard>
            )}

            {hasMsgTime && (
              <InfoCard label="Received Time" icon={<Clock className="h-3 w-3" />}>
                {task.whatsapp_received_time}
              </InfoCard>
            )}
          </div>

          {(task.description || task.notes) && (
            <div className="mt-1.5 space-y-1.5">
              {task.description && (
                <div className="rounded-lg border border-border bg-card px-2.5 py-2">
                  <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                    Description
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-snug text-foreground">
                    {task.description}
                  </p>
                </div>
              )}
              {task.notes && (
                <div className="rounded-lg border border-border bg-card px-2.5 py-2">
                  <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                    Notes
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-snug text-foreground">
                    {task.notes}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const INFO_TONE: Record<string, string> = {
  muted: "bg-secondary text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  warning: "bg-warning/10 text-warning",
  success: "bg-success/10 text-success",
  destructive: "bg-destructive/10 text-destructive",
};

function EditableFieldCell({
  taskId,
  field,
  currentValue,
  onSaved,
}: {
  taskId: string;
  field: "fabric" | "concept";
  currentValue: string;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(currentValue);
  const [saving, setSaving] = useState(false);
  const { fabrics } = useFabrics();
  const { categories } = useConceptCategories();
  const { user } = useAuth();

  useEffect(() => { setVal(currentValue); }, [currentValue]);

  async function handleSave() {
    if (val.trim() === currentValue.trim()) { setEditing(false); return; }
    setSaving(true);
    const { error } = await supabase.from("tasks").update({ [field]: val.trim() }).eq("id", taskId);
    if (!error) {
      void supabase.from("task_logs").insert({
        task_id: taskId,
        status_from: "in_progress",
        status_to: "in_progress",
        changed_by: user?.id ?? "",
        note: `${field === "concept" ? "Design type" : "Fabric"} changed: "${currentValue || "—"}" → "${val.trim()}"`,
      });
      toast.success(`${field === "concept" ? "Design type" : "Fabric"} updated`);
      setEditing(false);
      onSaved();
    } else {
      toast.error(error.message);
    }
    setSaving(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-secondary/60"
        title={`Change ${field === "concept" ? "design type" : "fabric"}`}
      >
        <span className={cn("flex-1 text-[13px]", currentValue ? "font-medium text-foreground" : "text-muted-foreground")}>
          {currentValue || "Not set"}
        </span>
        <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
      </button>
    );
  }

  const options = field === "fabric" ? fabrics.map((f) => ({ id: f.id, name: f.name })) : categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="flex items-center gap-1.5">
      <select value={val} onChange={(e) => setVal(e.target.value)} autoFocus disabled={saving}
        className="h-7 w-full rounded-md border border-primary/30 bg-card px-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
        <option value="">Select…</option>
        {options.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
      </select>
      <button type="button" onClick={handleSave} disabled={saving || !val.trim()}
        className="shrink-0 rounded-md bg-primary px-2 py-1 text-[10px] font-medium text-white disabled:opacity-50">
        {saving ? "…" : "Save"}
      </button>
      <button type="button" onClick={() => { setEditing(false); setVal(currentValue); }}
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// Inline numeric editor for the brief quantity (mirrors EditableFieldCell).
// Read mode shows the value + a pencil; edit mode is a number input. Saves to
// tasks.qty (CHECK requires > 0) and logs the change.
function EditableQtyCell({
  taskId,
  qty,
  onSaved,
  children,
}: {
  taskId: string;
  qty: number;
  onSaved: () => void;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(qty));
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  useEffect(() => { setVal(String(qty)); }, [qty]);

  async function handleSave() {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 1) { toast.error("Quantity must be at least 1."); return; }
    if (n === qty) { setEditing(false); return; }
    setSaving(true);
    const { error } = await supabase.from("tasks").update({ qty: n }).eq("id", taskId);
    if (!error) {
      void supabase.from("task_logs").insert({
        task_id: taskId,
        status_from: "in_progress",
        status_to: "in_progress",
        changed_by: user?.id ?? "",
        note: `Quantity changed: ${qty}m → ${n}m`,
      });
      toast.success("Quantity updated");
      setEditing(false);
      onSaved();
    } else {
      toast.error(error.message);
    }
    setSaving(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={1}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          autoFocus
          disabled={saving}
          className="h-7 w-16 rounded-md border border-primary/30 bg-card px-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <span className="text-[11px] text-muted-foreground">m</span>
        <button type="button" onClick={handleSave} disabled={saving}
          className="shrink-0 rounded-md bg-primary px-2 py-1 text-[10px] font-medium text-white disabled:opacity-50">
          {saving ? "…" : "Save"}
        </button>
        <button type="button" onClick={() => { setEditing(false); setVal(String(qty)); }}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-secondary/60"
      title="Change quantity"
    >
      <span className="flex-1">{children}</span>
      <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
    </button>
  );
}

function InlineDeadlineFabricSetter({
  taskId,
  field,
  onSaved,
}: {
  taskId: string;
  field: "planned_deadline" | "fabric" | "concept";
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);
  const { fabrics } = useFabrics();
  const { categories } = useConceptCategories();

  async function handleSave() {
    if (!val.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("tasks")
      .update({ [field]: val.trim() })
      .eq("id", taskId);
    setSaving(false);
    if (error) {
      toast.error("Failed to save: " + error.message);
      return;
    }
    toast.success(field === "planned_deadline" ? "Deadline set" : field === "concept" ? "Design type set" : "Fabric set");
    setEditing(false);
    onSaved();
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-[11px] font-medium text-primary hover:underline"
      >
        + Set {field === "planned_deadline" ? "deadline" : field === "concept" ? "design type" : "fabric"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {field === "fabric" ? (
        <select
          value={val}
          onChange={(e) => setVal(e.target.value)}
          autoFocus
          disabled={saving}
          className="h-7 w-full rounded border border-input bg-card px-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Select fabric…</option>
          {fabrics.map((f) => (
            <option key={f.id} value={f.name}>{f.name}</option>
          ))}
        </select>
      ) : field === "concept" ? (
        <select
          value={val}
          onChange={(e) => setVal(e.target.value)}
          autoFocus
          disabled={saving}
          className="h-7 w-full rounded border border-input bg-card px-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Select design type…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
      ) : (
        <input
          type="date"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          autoFocus
          disabled={saving}
          className="h-7 w-full rounded border border-input bg-card px-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !val.trim()}
        className="shrink-0 rounded bg-primary px-2 py-1 text-[10px] font-medium text-white disabled:opacity-50"
      >
        {saving ? "…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  );
}

function InfoCard({
  label,
  icon,
  tone = "muted",
  className,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  tone?: keyof typeof INFO_TONE;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card px-2.5 py-2 transition-colors hover:border-primary/20",
        className
      )}
    >
      <div className="flex items-center gap-1">
        {icon && (
          <span
            className={cn(
              "flex h-4 w-4 shrink-0 items-center justify-center rounded",
              INFO_TONE[tone] ?? INFO_TONE.muted
            )}
          >
            {icon}
          </span>
        )}
        <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      </div>
      <div className="mt-1 text-[13px] font-medium text-foreground">{children}</div>
    </div>
  );
}

function SplitTeamBreakdown({ task }: { task: TaskWithRelations }) {
  const { assignments, isLoading } = useTaskAssignments(task.id);

  if (isLoading || assignments.length === 0) {
    return (
      <InfoCard
        label="Team Breakdown"
        icon={<Users className="h-3 w-3" />}
        className="col-span-2"
      >
        <span className="text-muted-foreground">Loading…</span>
      </InfoCard>
    );
  }

  const designTypes = [...new Set(assignments.map((a) => a.design_type).filter(Boolean))];
  const fabrics = [...new Set(assignments.map((a) => a.completion_fabric).filter(Boolean))];

  return (
    <InfoCard
      label="Team Breakdown"
      icon={<Users className="h-3 w-3" />}
      className="col-span-2"
      tone="primary"
    >
      <div className="space-y-1.5">
        <p className="text-[11px] text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{assignments.length}</span>
          {" designer"}{assignments.length !== 1 ? "s" : ""}
          {designTypes.length > 0 && (
            <>
              {" · "}
              <span className="font-medium text-foreground">{designTypes.join(", ")}</span>
            </>
          )}
          {fabrics.length > 0 && (
            <>
              {" · "}
              <span className="font-medium text-foreground">{fabrics.join(", ")}</span>
            </>
          )}
        </p>
        <div className="space-y-0.5">
          {assignments.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-[11px]">
              <span className="min-w-0 truncate font-medium text-foreground" style={{ width: "80px", flexShrink: 0 }}>
                {a.designer?.full_name ?? "Unknown"}
              </span>
              <span className="text-muted-foreground">—</span>
              {a.design_type && (
                <span className="inline-flex items-center gap-0.5 rounded border border-primary/20 bg-primary/5 px-1 py-0 text-[10px] text-primary">
                  <Sparkles className="h-2 w-2" />
                  {a.design_type}
                </span>
              )}
              {a.completion_fabric && (
                <span className="inline-flex items-center gap-0.5 rounded border border-border bg-secondary/40 px-1 py-0 text-[10px] text-foreground">
                  <Layers className="h-2 w-2 text-muted-foreground" />
                  {a.completion_fabric}
                </span>
              )}
              <span className="ml-auto tabular-nums text-muted-foreground">
                {a.qty_completed}/{a.qty_assigned}
              </span>
            </div>
          ))}
        </div>
      </div>
    </InfoCard>
  );
}

/**
 * Assignee row in the brief-details grid.
 *
 * Two modes:
 *   - Unassigned (Open Pool): admins/coordinators see "Open Pool" + an
 *     "Assign" dropdown to pick a designer.
 *   - Assigned: everyone sees the avatar + name. Admins/coordinators also
 *     see a "Change" trigger that opens the same designer picker, plus an
 *     "Unassign" option (sends the task back to the pool) when status allows.
 *
 * Why merged with the pool case: admins repeatedly asked for a one-click
 * reassign after a designer claims a task in the wrong column or goes on
 * leave. Forcing them into the Edit drawer was an extra step that hid the
 * action.
 */
// ============================================================================
// CarryForwardBanner — shown to the (new) owner when a task was handed off
// mid-progress. Tells them why + by whom so they continue from where it was
// left. Only relevant while the task is still being worked.
// ============================================================================
function CarryForwardBanner({ task }: { task: TaskWithRelations }) {
  if (!task.carry_forward_note) return null;
  if (task.status !== "in_progress" && task.status !== "pool") return null;
  const from = task.carry_forwarder?.full_name;
  return (
    <div className="flex gap-2.5 rounded-lg border border-warning/30 border-l-[3px] border-l-warning bg-warning/[0.06] p-3">
      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-warning">
          Carried forward{from ? ` from ${from}` : ""} · continue from{" "}
          {task.qty_completed}/{task.qty}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-snug text-foreground">
          {task.carry_forward_note}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// HandoffControl — admin/coordinator hands a partially-done IN-PROGRESS task to
// another designer or back to the open pool, with a REQUIRED note. Progress
// (qty_completed / fabric / deadline / files) is preserved by the mutation.
// ============================================================================
function HandoffControl({
  task,
  onChanged,
}: {
  task: TaskWithRelations;
  onChanged: () => void;
}) {
  const { profile } = useAuth();
  const { handoffTask, isPending } = useTaskMutations();
  const { profiles: designers } = useProfiles({ roles: ["designer"] });
  const [open, setOpen] = useState(false);
  const [poolDialogOpen, setPoolDialogOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [note, setNote] = useState("");
  const busy = isPending("handoff", task.id);

  if (!isAdminOrCoordinator(profile?.role)) return null;
  if (task.status !== "in_progress") return null;

  const others = designers.filter((d) => d.id !== task.assigned_to);
  const hasProgress = (task.qty_completed ?? 0) > 0;

  async function submit() {
    if (!targetId && hasProgress) {
      setOpen(false);
      setPoolDialogOpen(true);
      return;
    }

    const target = targetId
      ? ({ kind: "designer", designerId: targetId } as const)
      : ({ kind: "pool" } as const);
    const { error } = await handoffTask(task.id, target, note);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(targetId ? "Task handed off" : "Task returned to the pool");
    setOpen(false);
    setNote("");
    setTargetId("");
    onChanged();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.04] hover:text-primary"
      >
        <HandPlatter className="h-3.5 w-3.5" />
        Hand off / carry forward
      </button>

      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
        <DialogContent className="max-w-md p-0" srTitle="Hand off task">
          <div className="border-b border-border px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <HandPlatter className="h-4 w-4 text-primary" /> Hand off this task
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Progress is preserved — the next designer continues from{" "}
              {task.qty_completed}/{task.qty}.
            </p>
          </div>
          <div className="space-y-4 px-5 py-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Hand off to</Label>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                disabled={busy}
                className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">Open Pool (anyone can claim)</option>
                {others.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </select>
              {!targetId && hasProgress && (
                <p className="text-[11px] text-warning">
                  This task has {task.qty_completed}/{task.qty} progress — you'll choose how to handle it next.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Note / reason <span className="text-destructive">*</span>
              </Label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busy}
                rows={3}
                placeholder="e.g. Designer unavailable — please continue the remaining designs in the same style."
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              <p className="text-[11px] text-muted-foreground">
                The next designer sees this as a "carried forward" note.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <LoadingButton
              loading={busy}
              disabled={!note.trim()}
              onClick={() => void submit()}
              className="gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {targetId ? "Hand off" : "Return to pool"}
            </LoadingButton>
          </div>
        </DialogContent>
      </Dialog>

      {poolDialogOpen && (
        <ReturnToPoolDialog
          task={task}
          open={poolDialogOpen}
          onOpenChange={setPoolDialogOpen}
          onDone={onChanged}
        />
      )}
    </>
  );
}

function AssigneeRow({
  task,
  isAdmin,
  onAssigned,
}: {
  task: TaskWithRelations;
  isAdmin: boolean;
  onAssigned: () => void;
}) {
  const { assignTask, returnToPool, isPending } = useTaskMutations();
  const { profiles } = useProfiles({ roles: ["designer"] });
  const [poolDialogOpen, setPoolDialogOpen] = useState(false);
  const pending = isPending("assign", task.id) || isPending("returnToPool", task.id);
  const currentId = task.assigned_to ?? null;

  async function assign(designerId: string) {
    if (designerId === currentId) return;
    const { error } = await assignTask(task.id, designerId);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(currentId ? "Designer changed" : "Task assigned");
    onAssigned();
  }

  const isFinished =
    task.status === "done" ||
    task.status === "approved" ||
    task.status === "sampling";
  const canReassign = isAdmin && !isFinished;
  const canUnassign = !!currentId && canReassign;
  // Broken state: status is not pool but assigned_to is null (from old bugs)
  const isBrokenState =
    !currentId &&
    task.status !== "pool" &&
    task.status !== "completed" &&
    task.status !== "done" &&
    canReassign;

  function handleSendToPool() {
    const hasProgress = (task.qty_completed ?? 0) > 0 && !!currentId;
    if (hasProgress) {
      setPoolDialogOpen(true);
    } else {
      void doResetToPool();
    }
  }

  async function doResetToPool() {
    const { error } = await returnToPool(task.id, { mode: "reset" });
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Task sent back to Pool");
    onAssigned();
  }

  if (!isAdmin) {
    return task.assignee ? (
      <span className="flex items-center gap-1.5">
        <Avatar className="h-5 w-5">
          {task.assignee.avatar_url ? (
            <AvatarImage src={task.assignee.avatar_url} />
          ) : null}
          <AvatarFallback className="text-[9px]">
            {getInitials(task.assignee.full_name)}
          </AvatarFallback>
        </Avatar>
        <span className="truncate">{task.assignee.full_name}</span>
      </span>
    ) : (
      <span className="italic text-muted-foreground">Open Pool</span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {task.assignee ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <Avatar className="h-5 w-5">
            {task.assignee.avatar_url ? (
              <AvatarImage src={task.assignee.avatar_url} />
            ) : null}
            <AvatarFallback className="text-[9px]">
              {getInitials(task.assignee.full_name)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate">{task.assignee.full_name}</span>
        </span>
      ) : (
        <span className="italic text-muted-foreground">Open Pool</span>
      )}

      {/* Fix broken state: status!=pool but no assignee */}
      {isBrokenState && (
        <button
          type="button"
          disabled={pending}
          onClick={() => void doResetToPool()}
          className="ml-auto shrink-0 rounded-md border border-warning/50 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning transition-colors hover:bg-warning/20 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Fix: Return to Pool"}
        </button>
      )}

      {!canReassign && !isBrokenState ? (
        <span
          className="ml-auto shrink-0 rounded-md border border-border bg-secondary/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          title={`Assignee is locked once a task is ${task.status}.`}
        >
          Locked
        </span>
      ) : !isBrokenState ? (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            disabled={pending}
            className="ml-auto shrink-0 rounded-md border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : task.assignee ? (
              "Change"
            ) : (
              "Assign"
            )}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            sideOffset={4}
            align="end"
            className="z-[60] max-h-[320px] min-w-[220px] overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg"
          >
            {profiles.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                No designers found
              </div>
            )}
            {profiles.map((d) => {
              const isCurrent = d.id === currentId;
              return (
                <DropdownMenu.Item
                  key={d.id}
                  onSelect={() => void assign(d.id)}
                  disabled={isCurrent}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm outline-none data-[highlighted]:bg-secondary",
                    isCurrent && "cursor-default opacity-60"
                  )}
                >
                  <Avatar className="h-5 w-5">
                    {d.avatar_url ? <AvatarImage src={d.avatar_url} /> : null}
                    <AvatarFallback className="text-[9px]">
                      {getInitials(d.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate">{d.full_name}</span>
                  {isCurrent && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Current
                    </span>
                  )}
                </DropdownMenu.Item>
              );
            })}
            {canUnassign && (
              <>
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                <DropdownMenu.Item
                  onSelect={handleSendToPool}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-destructive outline-none data-[highlighted]:bg-destructive/5"
                >
                  Send back to Pool
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      ) : null}

      {poolDialogOpen && (
        <ReturnToPoolDialog
          task={task}
          open={poolDialogOpen}
          onOpenChange={setPoolDialogOpen}
          onDone={onAssigned}
        />
      )}
    </div>
  );
}

// ============================================================================
// 3.5 — FULL KITTING (visible only for tasks where requires_full_kitting=true)
// ============================================================================

const FULL_KITTING_BUCKET = "sample-files";
const FULL_KITTING_MAX_BYTES = 100 * 1024 * 1024; // 100 MB
const FULL_KITTING_ACCEPT = "*/*";

function FullKittingSection({
  task,
  onChanged,
}: {
  task: TaskWithRelations;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Pull a fresh signed URL when the path changes (1-hour TTL).
  useEffect(() => {
    let cancelled = false;
    async function fetchSigned() {
      if (!task.full_kitting_image_url) {
        if (!cancelled) setSignedUrl(null);
        return;
      }
      const { data } = await supabase.storage
        .from(FULL_KITTING_BUCKET)
        .createSignedUrl(task.full_kitting_image_url, 3600);
      if (!cancelled) setSignedUrl(data?.signedUrl ?? null);
    }
    void fetchSigned();
    return () => {
      cancelled = true;
    };
  }, [task.full_kitting_image_url]);

  function safeFileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  async function handleFile(file: File) {
    if (!user) {
      toast.error("Not authenticated");
      return;
    }
    if (file.size > FULL_KITTING_MAX_BYTES) {
      toast.error("File too large — max 100 MB");
      return;
    }
    setUploading(true);
    setProgress(8);

    const timer = window.setInterval(() => {
      setProgress((p) => (p >= 90 ? p : p + Math.random() * 12));
    }, 180);

    // Shrink large JPEG/PNG/WebP photos before upload. PSD / PDF / video pass through.
    const processed = await compressImage(file);
    const path = `${user.id}/tasks/${task.id}/full-kitting-${Date.now()}-${safeFileName(processed.name)}`;

    const { error: upErr } = await supabase.storage
      .from(FULL_KITTING_BUCKET)
      .upload(path, processed, {
        contentType: processed.type || "application/octet-stream",
        upsert: false,
      });

    window.clearInterval(timer);

    if (upErr) {
      setUploading(false);
      setProgress(0);
      toast.error(upErr.message);
      return;
    }

    // Best-effort: remove previous full-kitting file (no FK so safe to ignore errors)
    if (task.full_kitting_image_url) {
      void supabase.storage
        .from(FULL_KITTING_BUCKET)
        .remove([task.full_kitting_image_url]);
    }

    const { error: updErr } = await supabase
      .from("tasks")
      .update({
        full_kitting_image_url: path,
        full_kitting_submitted_at: new Date().toISOString(),
        full_kitting_submitted_by: user.id,
      })
      .eq("id", task.id);

    if (updErr) {
      setUploading(false);
      setProgress(0);
      toast.error(updErr.message);
      return;
    }

    setProgress(100);
    window.setTimeout(() => {
      setUploading(false);
      setProgress(0);
    }, 250);
    toast.success("Full knitting file uploaded");
    onChanged();
    if (inputRef.current) inputRef.current.value = "";
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  const hasImage = !!task.full_kitting_image_url;
  const isImage = hasImage && /\.(jpe?g|png|gif|webp)$/i.test(
    task.full_kitting_image_url ?? ""
  );
  const isConceptTrack = isConceptTrackTask(task);
  const sectionTitle = isConceptTrack ? "Design Submission" : "Full Knitting";
  const uploadCopy = isConceptTrack
    ? hasImage
      ? "Replace the design file"
      : "Upload the design file"
    : hasImage
      ? "Replace the kitting file"
      : "Upload the kitting file";

  return (
    <Section title={sectionTitle}>
      {/* Context fields — read-only */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-md border border-border bg-card/40 p-3 text-[12px]">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            UID
          </div>
          <div className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-foreground">
            {task.task_code}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Designer
          </div>
          <div className="mt-0.5 truncate text-foreground">
            {task.assignee?.full_name ?? (
              <span className="italic text-muted-foreground">Unassigned</span>
            )}
          </div>
        </div>
        <div className="col-span-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Concept
          </div>
          <div className="mt-0.5 text-foreground">{task.concept || "—"}</div>
        </div>
        <div className="col-span-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Description
          </div>
          <div className="mt-0.5 whitespace-pre-wrap text-foreground">
            {task.description || "—"}
          </div>
        </div>
      </div>

      {/* Image preview (if uploaded) */}
      {hasImage && (
        <div className="mt-3 overflow-hidden rounded-md border border-border bg-card">
          {isImage && signedUrl ? (
            <a href={signedUrl} target="_blank" rel="noreferrer">
              <img
                src={signedUrl}
                alt="Full knitting"
                className="block max-h-[260px] w-full object-contain"
              />
            </a>
          ) : (
            <div className="flex items-center justify-between gap-3 px-3 py-2 text-[12px] text-foreground">
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {task.full_kitting_image_url}
              </span>
              {signedUrl && (
                <a
                  href={signedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  Open
                </a>
              )}
            </div>
          )}
          {task.full_kitting_submitted_at && (
            <div className="border-t border-border bg-card/60 px-3 py-1.5 text-[10px] text-muted-foreground">
              Submitted{" "}
              {formatDistanceToNow(new Date(task.full_kitting_submitted_at), {
                addSuffix: true,
              })}
            </div>
          )}
        </div>
      )}

      {/* Upload zone */}
      <div className="mt-3 rounded-md border-2 border-dashed border-border bg-card/40 p-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <div className="text-[12px] text-foreground">{uploadCopy}</div>
          <p className="text-[10px] text-muted-foreground">
            All file types · up to 100 MB
          </p>
          {uploading && (
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-200 ease-out"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {hasImage ? "Replace file" : "Choose file"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept={FULL_KITTING_ACCEPT}
            className="hidden"
            onChange={onPick}
          />
        </div>
      </div>

      {/* Notes (read-only — set at briefing or via separate edit) */}
      {task.full_kitting_notes && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Notes
          </div>
          <p className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-card/40 px-3 py-2 text-[12px] text-foreground">
            {task.full_kitting_notes}
          </p>
        </div>
      )}
    </Section>
  );
}

// ============================================================================
// 4 — QTY TRACKER (in_progress only)
// ============================================================================

function QtyTracker({
  task,
  hasFiles,
  onUpdated,
  readOnly = false,
}: {
  task: TaskWithRelations;
  hasFiles: boolean;
  onUpdated: () => void;
  readOnly?: boolean;
}) {
  const { updateQtyCompleted, isPending } = useTaskMutations();
  const [draft, setDraft] = useState<number>(task.qty_completed);

  useEffect(() => {
    setDraft(task.qty_completed);
  }, [task.qty_completed, task.id]);

  const pct = task.qty > 0 ? Math.min(100, (draft / task.qty) * 100) : 0;
  const pending = isPending("updateQty", task.id);
  const dirty = draft !== task.qty_completed;
  const min = 0;
  const valid = Number.isFinite(draft) && draft >= 0;
  const willComplete = draft >= task.qty && task.qty > 0 && task.qty_completed < task.qty;
  const extraCount = draft > task.qty ? draft - task.qty : 0;

  function clamp(n: number): number {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.round(n));
  }

  function step(delta: number) {
    setDraft((d) => clamp(d + delta));
  }

  async function performUpdate() {
    if (!valid || !dirty) return;
    const { error } = await updateQtyCompleted(task.id, draft);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Progress updated ✓");
    onUpdated();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void performUpdate();
  }

  return (
    <Section title="Progress tracker">
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Big progress bar with overlay */}
        <div className="relative h-7 overflow-hidden rounded-md border border-border bg-secondary">
          <div
            className={cn(
              "h-full rounded-md transition-[width] duration-300",
              extraCount > 0 ? "bg-primary" : "bg-success"
            )}
            style={{ width: `${pct}%` }}
            aria-hidden
          />
          <div className="absolute inset-0 flex items-center justify-center gap-1.5 text-[11px] font-medium tabular-nums text-foreground">
            {draft} of {task.qty} m
            {extraCount > 0 && (
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                +{extraCount} extra
              </span>
            )}
          </div>
        </div>

        {/* Stepper + Update */}
        <div className="flex items-center gap-2">
          <StepperButton onClick={() => step(-1)} disabled={readOnly || pending || draft <= min}>
            <Minus className="h-3.5 w-3.5" />
          </StepperButton>
          <Input
            type="number"
            min={min}
            step={1}
            value={draft}
            onChange={(e) => setDraft(clamp(Number(e.target.value)))}
            disabled={readOnly || pending}
            className="h-9 w-24 text-center tabular-nums"
            aria-label="Quantity completed"
          />
          <StepperButton onClick={() => step(1)} disabled={readOnly || pending}>
            <Plus className="h-3.5 w-3.5" />
          </StepperButton>
          <LoadingButton
            type="submit"
            size="sm"
            loading={pending}
            loadingText="Saving…"
            disabled={readOnly || !valid || !dirty}
            className="ml-auto"
          >
            Update
          </LoadingButton>
        </div>

        {/* Full Knitting gate note — Mark Completed stays locked until the
            coordinator adds the Full Knitting details. */}
        {isFullKittingBlocking(task) && (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              You can update your progress, but{" "}
              <strong>Mark Completed is locked</strong> until the coordinator
              adds the Full Knitting details for this task.
            </span>
          </div>
        )}

        {willComplete && !hasFiles && isConceptTrackTask(task) && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              You haven't uploaded a design file yet. Upload one below before marking this complete.
            </span>
          </div>
        )}
      </form>

    </Section>
  );
}

function StepperButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
    >
      {children}
    </button>
  );
}

// ============================================================================
// 5 — FILES SECTION
// ============================================================================

function FilesSection({
  task,
  files,
  onUploaded,
}: {
  task: TaskWithRelations;
  files: FileWithUploader[];
  onUploaded: () => void;
}) {
  const { profile } = useAuth();
  const isAdmin = isAdminRole(profile?.role);
  const noFiles = files.length === 0;
  const isInProgress = task.status === "in_progress";
  const isPreInProgress =
    STATUS_ORDER.indexOf(task.status) < STATUS_ORDER.indexOf("in_progress");

  const canUpload = isAdmin || (isInProgress && profile?.id === task.assigned_to);
  const [filesExpanded, setFilesExpanded] = useState(files.length > 0);

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setFilesExpanded((p) => !p)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Design files
        </span>
        {files.length > 0 && (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-primary">{files.length}</span>
        )}
        <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition-transform duration-200", filesExpanded && "rotate-90")} />
      </button>

      {filesExpanded && (
        <>
          {noFiles ? (
            canUpload ? (
              <FileUploadZone task={task} variant="compact" onUploaded={onUploaded} />
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {isPreInProgress ? "Files appear once work begins." : "No files yet."}
              </p>
            )
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {files.map((f) => (
                  <FileTile key={f.id} file={f} />
                ))}
              </div>
              {canUpload && (
                <FileUploadZone task={task} variant="compact" onUploaded={onUploaded} />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function FileUploadZone({
  task,
  variant,
  onUploaded,
}: {
  task: TaskWithRelations;
  variant: "full" | "compact";
  onUploaded: () => void;
}) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  function validate(file: File): string | null {
    if (file.size > MAX_FILE_BYTES) {
      return `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — max 100 MB.`;
    }
    return null;
  }

  async function handleFile(file: File) {
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    const err = validate(file);
    if (err) {
      toast.error(err);
      return;
    }
    setUploading(true);

    // Shrink large JPEG/PNG/WebP photos before upload (PSD/PDF/video pass through).
    const processed = await compressImage(file);

    const safeName = processed.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const path = `${user.id}/tasks/${task.id}/${Date.now()}-${safeName}`;

    const { error: uploadErr } = await supabase.storage
      .from("design-files")
      .upload(path, processed, { contentType: processed.type, upsert: false });

    if (uploadErr) {
      setUploading(false);
      toast.error(`Upload failed: ${uploadErr.message}`);
      return;
    }

    const { error: insertErr } = await supabase.from("files").insert({
      task_id: task.id,
      storage_url: path,
      file_name: file.name,
      file_size: processed.size,
      uploaded_by: user.id,
    });

    if (insertErr) {
      void supabase.storage.from("design-files").remove([path]);
      setUploading(false);
      toast.error(`Save failed: ${insertErr.message}`);
      return;
    }

    toast.success("File uploaded ✓");
    onUploaded();
    // No auto-advance — designer marks the task Done explicitly with the
    // Completed CTA. Keeps the simplified Pool → In Progress → Done flow.
    setUploading(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) void handleFile(f);
  }

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-card py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        Upload additional file
        <input
          ref={fileInputRef}
          type="file"
          accept="*/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            if (e.target) e.target.value = "";
          }}
        />
      </button>
    );
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="*/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          if (e.target) e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={uploading}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 transition-colors",
          dragging
            ? "border-primary bg-primary/10"
            : "border-border bg-card hover:border-primary hover:bg-secondary/30",
          uploading && "cursor-wait opacity-60"
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-foreground" />
            <span className="text-sm font-medium">Uploading…</span>
          </>
        ) : (
          <>
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">Drop file or click to browse</span>
            <span className="text-[11px] text-muted-foreground">
              All file types · max 100 MB
            </span>
          </>
        )}
      </button>
    </>
  );
}

function FileTile({ file }: { file: FileWithUploader }) {
  const [thumb, setThumb] = useState<string | null>(null);
  const isImage = isImagePath(file.file_name);
  const ext = fileExt(file.file_name);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    supabase.storage
      .from("design-files")
      .createSignedUrl(file.storage_url, 60 * 60)
      .then(({ data }) => {
        if (!cancelled) setThumb(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [file.storage_url, isImage]);

  async function handleDownload() {
    const { data, error } = await supabase.storage
      .from("design-files")
      .createSignedUrl(file.storage_url, 60, { download: file.file_name });
    if (error || !data) {
      toast.error("Could not generate download link");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <div className="group overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/30">
      <div className="relative h-20 w-full bg-gradient-to-br from-secondary to-secondary/40">
        {isImage && thumb ? (
          <LazyImage
            src={thumb}
            alt={file.file_name}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <FileIcon className="h-6 w-6" />
            {ext && (
              <span className="rounded bg-card px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
                {ext}
              </span>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={handleDownload}
          className="absolute right-1.5 top-1.5 rounded-lg bg-black/75 p-1.5 text-white backdrop-blur transition-colors hover:bg-primary"
          aria-label={`Download ${file.file_name}`}
        >
          <Download className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-0.5 px-2 py-1.5">
        <p
          className="truncate text-[11px] font-medium text-foreground"
          title={file.file_name}
        >
          {file.file_name}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {formatBytes(file.file_size)}
          {file.uploader?.full_name && (
            <> · {file.uploader.full_name.split(" ")[0]}</>
          )}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// 6 — ACTIVITY LOG
// ============================================================================

const COMPACT_LIMIT = 5;

/**
 * Activity-log labels for the simplified Pool → In Progress → Done pipeline.
 * Legacy DB statuses (`todo`, `full_kitting`, `approved`, `sampling`) collapse
 * onto the closest visible stage so old transitions don't expose retired stage
 * names ("To-Do", "Submitted"). The `cleanLogs` helper then drops any entries
 * whose from/to labels resolve to the same value (e.g. an in-flight
 * to-do → in_progress transition now renders as In Progress → In Progress and
 * is filtered out).
 */
const ACTIVITY_LABELS: Record<string, string> = {
  pool: "Pool",
  todo: "In Progress",
  in_progress: "In Progress",
  full_kitting: "In Progress",
  approved: "Done",
  sampling: "Done",
  done: "Done",
};

function activityStatusLabel(status: string): string {
  return ACTIVITY_LABELS[status] ?? status;
}

/**
 * Clean up log entries:
 * - Remap status names to user-friendly labels
 * - Remove entries where from and to resolve to the same label
 *   (e.g. full_kitting → done both showing as "Done → Done")
 */
function cleanLogs(logs: TaskLogWithUser[]): TaskLogWithUser[] {
  const result: TaskLogWithUser[] = [];
  for (const log of logs) {
    if (
      log.status_from &&
      log.status_to &&
      !log.note &&
      activityStatusLabel(log.status_from) === activityStatusLabel(log.status_to)
    ) {
      continue;
    }
    result.push(log);
  }
  return result;
}

function ActivityLog({ logs }: { logs: TaskLogWithUser[] }) {
  const cleaned = useMemo(() => cleanLogs(logs), [logs]);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? cleaned : cleaned.slice(0, COMPACT_LIMIT);
  const hidden = Math.max(0, cleaned.length - COMPACT_LIMIT);

  return (
    <Section
      title="Activity"
      countBadge={cleaned.length}
      icon={<History className="h-3.5 w-3.5" />}
    >
      {cleaned.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">No activity yet.</p>
      ) : (
        <>
          <ol className="space-y-0">
            {visible.map((l, i) => (
              <LogEntry key={l.id} log={l} isLast={i === visible.length - 1} />
            ))}
          </ol>
          {!expanded && hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-3 text-[11px] font-medium text-foreground underline-offset-2 hover:underline"
            >
              Show all {logs.length} entries
            </button>
          )}
        </>
      )}
    </Section>
  );
}

function LogEntry({
  log,
  isLast,
}: {
  log: TaskLogWithUser;
  isLast: boolean;
}) {
  const when = log.timestamp ? new Date(log.timestamp) : null;
  const isCreation = !log.status_from;
  const actor = log.changer?.full_name ?? "System";

  return (
    <li className="flex gap-3">
      {/* Timeline rail — consistent node size + connecting line. */}
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-2 ring-card",
            isCreation ? "bg-primary/15 text-primary" : "border border-border bg-card"
          )}
        >
          {isCreation ? (
            <Sparkles className="h-3 w-3" />
          ) : (
            <span
              className={cn("h-2.5 w-2.5 rounded-full", COLUMN_DOT[log.status_to])}
            />
          )}
        </span>
        {!isLast && <span className="mt-1 w-px flex-1 bg-border" />}
      </div>

      <div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-4")}>
        {/* Actor + time, justified to fill the row width. */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {actor}
          </span>
          {when && (
            <span
              className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
              title={when.toISOString()}
            >
              {formatDistanceToNow(when, { addSuffix: true })}
            </span>
          )}
        </div>

        {/* Action line — status transition shown as pills, or note-only. */}
        {(() => {
          const sameLabel = log.status_from && log.status_to &&
            activityStatusLabel(log.status_from) === activityStatusLabel(log.status_to);
          const isNoteOnly = sameLabel && !!log.note;
          return (
            <>
              {isNoteOnly ? (
                <p className="mt-1 text-xs text-foreground">{log.note}</p>
              ) : (
                <>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {isCreation ? (
                      <span>created this task</span>
                    ) : log.status_from ? (
                      <>
                        <span>moved</span>
                        <span className="rounded-md bg-secondary px-1.5 py-0.5 font-medium text-foreground">
                          {activityStatusLabel(log.status_from)}
                        </span>
                        <ArrowRight className="h-3 w-3" />
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                          {activityStatusLabel(log.status_to)}
                        </span>
                      </>
                    ) : (
                      <>
                        <span>set to</span>
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                          {activityStatusLabel(log.status_to)}
                        </span>
                      </>
                    )}
                  </div>
                  {log.note && (
                    <p className="mt-1.5 rounded-lg bg-secondary/50 px-2.5 py-1.5 text-xs text-foreground">
                      {log.note}
                    </p>
                  )}
                </>
              )}
            </>
          );
        })()}
      </div>
    </li>
  );
}

// ============================================================================
// 7 — FIXED FOOTER (context-aware actions)
// ============================================================================

function ActionFooter({
  task,
  files,
  onChanged,
  onClaimTask,
}: {
  task: TaskWithRelations;
  files: FileWithUploader[];
  onChanged: () => void;
  onClaimTask?: (taskId: string) => void;
}) {
  const { profile, user } = useAuth();
  const { updateTaskStatus, isPending } = useTaskMutations();
  const role = profile?.role;
  const userId = user?.id ?? null;

  // Sub-state for log completion flow (revision flow was removed when
  // task approval/revision was scoped to concepts-only).
  const [logCompletionOpen, setLogCompletionOpen] = useState(false);
  const [submitWarning, setSubmitWarning] = useState<string | null>(null);
  // Pool claim flow — opening the full ClaimTaskModal (design type / fabric /
  // deadline / how-many) instead of a one-click accept.
  const [claimOpen, setClaimOpen] = useState(false);
  const [fkWarnOpen, setFkWarnOpen] = useState(false);
  const [fkNotifying, setFkNotifying] = useState(false);

  if (!role || !userId) {
    return <FooterShell />;
  }

  const isAdmin = isAdminRole(role);
  const isAssignee = task.assigned_to === userId;
  const isUnassigned = !task.assigned_to;
  const hasFiles = files.length > 0;
  const qtyComplete = task.qty_completed >= task.qty && task.qty > 0;

  async function advance(next: TaskStatus, successMsg?: string) {
    // Hard gate: a task that requires Full Knitting can NEVER be completed
    // (advanced to 'done') until the coordinator adds the details — regardless
    // of which footer/role triggered it (in_progress AND full_kitting paths).
    if (next === "done" && isFullKittingBlocking(task)) {
      toast.error("Full Knitting details must be added before completing this task.");
      return;
    }
    const { error } = await updateTaskStatus(task.id, next);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(successMsg ?? `Moved to ${STATUS_LABELS[next]}`);
    onChanged();
  }

  function attemptSubmit() {
    if (isFullKittingBlocking(task)) {
      toast.error("Full Knitting details must be added before completing.");
      return;
    }
    setSubmitWarning(null);
    const needsFiles = isConceptTrackTask(task) && !hasFiles;
    if (!qtyComplete || needsFiles) {
      setSubmitWarning(
        !qtyComplete && needsFiles
          ? "Complete all designs and upload files before submitting."
          : !qtyComplete
            ? "Update the quantity completed to total before submitting."
            : "Upload at least one design file before submitting."
      );
      return;
    }
    // Simplified pipeline: In Progress → Done (skips full_kitting hop).
    void advance("done", "Marked completed ✓");
  }

  // ----------------- DONE: completion badge -----------------
  if (task.status === "done") {
    return (
      <FooterShell>
        <div className="flex w-full items-center justify-center gap-2 text-sm">
          <Check className="h-4 w-4 text-success" />
          <span className="font-medium text-foreground">Completed</span>
          <span className="text-muted-foreground">· {formatDate(task.updated_at)}</span>
        </div>
      </FooterShell>
    );
  }

  // ----------------- POOL: Claim Task (designer only) ---------------------
  // Admins / coordinators don't claim — they assign via the header "Assign"
  // button. Only designers see the full-width "Claim Task" footer CTA.
  if (task.status === "pool" && isUnassigned && !isAdmin) {
    if (onClaimTask) {
      return (
        <FooterShell>
          <LoadingButton
            loading={false}
            onClick={() => onClaimTask(task.id)}
            className="w-full bg-primary text-white hover:bg-primary/90"
            size="lg"
          >
            <HandPlatter className="mr-1.5 h-4 w-4" />
            Claim Task
          </LoadingButton>
        </FooterShell>
      );
    }

    const fkBlocking = isFullKittingBlocking(task);
    return (
      <>
        <FooterShell>
          <LoadingButton
            loading={false}
            onClick={() => fkBlocking ? setFkWarnOpen(true) : setClaimOpen(true)}
            className="w-full bg-primary text-white hover:bg-primary/90"
            size="lg"
          >
            <HandPlatter className="mr-1.5 h-4 w-4" />
            Claim Task
          </LoadingButton>
        </FooterShell>

        {/* FK warning dialog */}
        <Dialog open={fkWarnOpen} onOpenChange={setFkWarnOpen}>
          <DialogContent className="max-w-sm" srTitle="Full Knitting warning">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-5 w-5 text-warning" />
                Full Knitting Not Added Yet
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 px-6 pb-2">
              <p className="text-sm text-muted-foreground">
                This task requires Full Knitting details, but the coordinator
                hasn&apos;t added them yet.
              </p>
              <p className="text-sm text-muted-foreground">
                You can claim and start working, but you won&apos;t be able to
                mark it complete until the coordinator adds the Full Knitting details.
              </p>
            </div>
            <DialogFooter className="flex-col gap-2 px-6 pb-6 sm:flex-col">
              <Button
                onClick={() => {
                  // Just open the claim form — the coordinator notification +
                  // to-do only fire when the designer actually claims (onClaimed).
                  setFkWarnOpen(false);
                  setClaimOpen(true);
                }}
                className="w-full"
              >
                Continue Without Full Knitting
              </Button>
              <Button
                variant="outline"
                disabled={fkNotifying}
                onClick={async () => {
                  setFkNotifying(true);
                  try {
                    // Deduped per task (RPC) → one "Full Knitting Needed" ping.
                    await flagFkPendingToCoordinator(
                      task.id,
                      task.task_code ?? "a task",
                      profile?.full_name ?? "A designer",
                      `${profile?.full_name ?? "A designer"} is waiting on Full Knitting details for ${task.task_code ?? "a task"}`
                    );
                    toast.info("Coordinator notified");
                  } catch {
                    toast.error("Failed to notify coordinator");
                  }
                  setFkNotifying(false);
                  setFkWarnOpen(false);
                }}
                className="w-full"
              >
                {fkNotifying ? "Notifying…" : "Ask Coordinator to Add"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setFkWarnOpen(false)}
                className="w-full text-muted-foreground"
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ClaimTaskModal
          open={claimOpen}
          onOpenChange={setClaimOpen}
          preselectedTaskId={task.id}
          onClaimed={() => {
            // FK coordinator notification + to-do fire ONLY on a REAL claim,
            // with the actual claimer — never on "Continue Without FK" intent.
            if (isFullKittingBlocking(task)) {
              void flagFkPendingToCoordinator(
                task.id,
                task.task_code ?? "a task",
                profile?.full_name ?? "A designer"
              );
            }
            setClaimOpen(false);
            onChanged();
          }}
        />
      </>
    );
  }

  // ----------------- TODO: Start Working -----------------
  if (task.status === "todo" && (isAssignee || isAdmin)) {
    return (
      <FooterShell>
        <LoadingButton
          loading={isPending("updateStatus", task.id)}
          onClick={() => advance("in_progress", "Started working")}
          className="w-full"
          size="lg"
        >
          <Play className="mr-1.5 h-4 w-4" />
          Start Working
        </LoadingButton>
      </FooterShell>
    );
  }

  // ----------------- IN_PROGRESS: Mark Completed (designer only) -----------------
  if (task.status === "in_progress" && isAssignee) {
    const progressMet = task.qty > 0 && task.qty_completed >= task.qty;
    const fkGate = isFullKittingBlocking(task);
    return (
      <FooterShell>
        <div className="w-full space-y-2">
          {submitWarning && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 animate-fade-in">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{submitWarning}</span>
            </div>
          )}
          {progressMet && !fkGate ? (
            <LoadingButton
              loading={isPending("updateStatus", task.id)}
              onClick={attemptSubmit}
              className="w-full bg-primary text-white hover:bg-primary/90"
              size="lg"
            >
              <Send className="mr-1.5 h-4 w-4" />
              Mark Completed
            </LoadingButton>
          ) : !fkGate ? (
            <p className="text-center text-[11px] text-muted-foreground">
              {task.qty === 0 ? "Quantity not set — ask admin to add it." : `Complete progress (${task.qty_completed}/${task.qty}) to mark done.`}
            </p>
          ) : null}
          {fkGate && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Waiting for Full Knitting details</p>
                  <p className="text-xs text-muted-foreground">The coordinator needs to add Full Knitting details before you can complete this task. You can keep updating your progress.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </FooterShell>
    );
  }

  // ----------------- FULL_KITTING action -----------------
  // For concept-track briefs, this stage is "Design Approval" and shows the
  // Approve / Request Revision pair (Revision loops the task back to
  // Digital Designing, i.e. in_progress).
  // For regular tasks, this stage is "Full Kitting" and a single
  // "Mark Completed" action sends the task straight to Done.
  if (task.status === "full_kitting" && (isAssignee || isAdmin)) {
    if (isConceptTrackTask(task) && isAdmin) {
      return (
        <FooterShell>
          <div className="flex w-full gap-2">
            <LoadingButton
              loading={isPending("updateStatus", task.id)}
              onClick={() => advance("done", "Approved ✓")}
              className="flex-[3] bg-success text-white hover:bg-success/90"
              size="lg"
            >
              <Check className="mr-1.5 h-4 w-4" />
              Approve
            </LoadingButton>
            <LoadingButton
              loading={isPending("updateStatus", task.id)}
              onClick={() =>
                advance("in_progress", "Sent back for revision ↩")
              }
              className="flex-[2] border border-destructive/40 bg-card text-destructive hover:bg-destructive/5"
              size="lg"
            >
              <ArrowRight className="mr-1.5 h-4 w-4 rotate-180" />
              Request Revision
            </LoadingButton>
          </div>
        </FooterShell>
      );
    }
    if (isFullKittingBlocking(task)) {
      return (
        <FooterShell>
          <div className="w-full rounded-lg border border-warning/30 bg-warning/10 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Waiting for Full Knitting details</p>
                <p className="text-xs text-muted-foreground">
                  The coordinator needs to add the Full Knitting details before this task can be completed.
                </p>
              </div>
            </div>
          </div>
        </FooterShell>
      );
    }
    return (
      <FooterShell>
        <LoadingButton
          loading={isPending("updateStatus", task.id)}
          onClick={() => advance("done", "Marked completed ✓")}
          className="w-full bg-success text-white hover:bg-success/90"
          size="lg"
        >
          <Check className="mr-1.5 h-4 w-4" />
          Mark Completed
        </LoadingButton>
      </FooterShell>
    );
  }

  // ----------------- APPROVED: Send to Sampling -----------------
  if (task.status === "approved" && isAdmin) {
    return (
      <FooterShell>
        <LoadingButton
          loading={isPending("updateStatus", task.id)}
          onClick={() => advance("sampling", "Sent to sampling")}
          className="w-full bg-success text-white hover:bg-success/90"
          size="lg"
        >
          <ArrowRight className="mr-1.5 h-4 w-4" />
          Send to Sampling
        </LoadingButton>
      </FooterShell>
    );
  }

  // ----------------- SAMPLING: Log Completion -----------------
  if (task.status === "sampling" && isAdmin) {
    return (
      <FooterShell tall={logCompletionOpen}>
        {logCompletionOpen ? (
          <LogCompletionForm
            task={task}
            onCancel={() => setLogCompletionOpen(false)}
            onLogged={() => {
              setLogCompletionOpen(false);
              onChanged();
            }}
          />
        ) : (
          <Button
            size="lg"
            className="w-full bg-success text-white hover:bg-success/90"
            onClick={() => setLogCompletionOpen(true)}
          >
            <Check className="mr-1.5 h-4 w-4" />
            Log Completion
          </Button>
        )}
      </FooterShell>
    );
  }

  // ----------------- No actions available -----------------
  return <FooterShell />;
}

function FooterShell({
  tall,
  children,
}: {
  tall?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "shrink-0 border-t border-border bg-card/80 px-5 py-3 backdrop-blur",
        tall && "py-4"
      )}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Log-completion inline form (sampling → done)
// ============================================================================

function LogCompletionForm({
  task,
  onCancel,
  onLogged,
}: {
  task: TaskWithRelations;
  onCancel: () => void;
  onLogged: () => void;
}) {
  const { user } = useAuth();
  const { updateTaskStatus } = useTaskMutations();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [meters, setMeters] = useState<string>(String(task.qty));
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const metersNum = Number(meters);
  const valid = Number.isFinite(metersNum) && metersNum > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!valid) {
      toast.error("Enter meters printed");
      return;
    }
    setSubmitting(true);

    // 1. Upload proof photo if provided.
    let proofPath: string | null = null;
    if (photo) {
      // Shrink large JPEG/PNG/WebP photos before upload.
      const processedPhoto = await compressImage(photo);
      const safeName = processedPhoto.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      proofPath = `proofs/${task.id}/${Date.now()}-${safeName}`;
      const { error: uploadErr } = await supabase.storage
        .from("proof-photos")
        .upload(proofPath, processedPhoto, {
          contentType: processedPhoto.type,
          upsert: false,
        });
      if (uploadErr) {
        setSubmitting(false);
        toast.error(`Photo upload failed: ${uploadErr.message}`);
        return;
      }
    }

    // 2. Insert sampling_log row.
    const { error: logErr } = await supabase.from("sampling_logs").insert({
      task_id: task.id,
      meters_printed: metersNum,
      proof_url: proofPath,
      logged_by: user.id,
    });
    if (logErr) {
      setSubmitting(false);
      if (proofPath) {
        void supabase.storage.from("proof-photos").remove([proofPath]);
      }
      toast.error(`Save failed: ${logErr.message}`);
      return;
    }

    // 3. Advance task to done.
    const { error: statusErr } = await updateTaskStatus(task.id, "done");
    setSubmitting(false);
    if (statusErr) {
      toast.error(statusErr);
      return;
    }
    toast.success("Completion logged ✓");
    onLogged();
  }

  return (
    <form onSubmit={submit} className="w-full space-y-3">
      <div className="space-y-1">
        <Label htmlFor="meters" className="text-xs">
          Meters printed <span className="text-destructive">*</span>
        </Label>
        <Input
          id="meters"
          type="number"
          min={0}
          step={1}
          value={meters}
          onChange={(e) => setMeters(e.target.value)}
          disabled={submitting}
          autoFocus
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Proof photo (optional)</Label>
        <input
          ref={photoInputRef}
          type="file"
          accept="*/*"
          className="hidden"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        />
        {photo ? (
          <div className="flex items-center justify-between rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
            <span className="flex items-center gap-1.5 truncate">
              <Paperclip className="h-3 w-3" />
              <span className="truncate">{photo.name}</span>
              <span className="text-muted-foreground">
                ({formatBytes(photo.size)})
              </span>
            </span>
            <button
              type="button"
              onClick={() => setPhoto(null)}
              disabled={submitting}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Remove"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-card py-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
            JPG or PNG · max 10 MB
          </button>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <LoadingButton
          type="submit"
          size="sm"
          loading={submitting}
          loadingText="Saving…"
          className="bg-success text-white hover:bg-success/90"
          disabled={!valid}
        >
          Log & mark done
        </LoadingButton>
      </div>
    </form>
  );
}

// ============================================================================
// Skeleton + tiny atoms
// ============================================================================

function DrawerSkeleton({ error }: { error: string | null }) {
  return (
    <div className="space-y-6 p-6">
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
            <div className="h-7 w-3/4 animate-pulse rounded bg-secondary" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-secondary" />
          </div>
          <div className="h-7 w-full animate-pulse rounded bg-secondary" />
          <div className="grid grid-cols-2 gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-md border border-border bg-card p-2.5"
              >
                <div className="h-2.5 w-16 animate-pulse rounded bg-secondary" />
                <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-secondary" />
              </div>
            ))}
          </div>
          <div className="h-32 w-full animate-pulse rounded bg-secondary/60" />
        </>
      )}
    </div>
  );
}

function Section({
  title,
  countBadge,
  icon,
  children,
}: {
  title: string;
  countBadge?: number;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon && (
          <span className="flex h-4 w-4 items-center justify-center text-primary/70">
            {icon}
          </span>
        )}
        {title}
        {countBadge !== undefined && countBadge > 0 && (
          <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums text-foreground">
            {countBadge}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** True when a storage path / filename looks like a browser-renderable image. */
function isImagePath(path: string): boolean {
  return /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i.test(path);
}

/** Uppercase extension (no dot) for a path, or "" if none. */
function fileExt(path: string): string {
  const m = path.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toUpperCase() : "";
}

/** Last path segment, used as a display label for a stored file. */
function fileLabel(path: string): string {
  const seg = path.split("/").pop() ?? path;
  // Strip our timestamp prefixes (e.g. "full-kitting-1717...-name.pdf") for a
  // cleaner label, falling back to the raw segment.
  return seg.replace(/^(full-kitting-|brief-)?\d{10,}-/, "") || seg;
}

// Re-export Profile type for jsdoc-style consumers
export type { Profile };

// ============================================================================
// FullKittingReference — read-only section visible to all roles
// ============================================================================
//
// Designers + admins + coordinators all need visibility into the task's
// full-kitting status. This section shows:
//   * Nothing — if the task doesn't require kitting (no section rendered).
//   * "Awaiting form upload" — if requires_full_kitting=true but no record + no image.
//   * Photo preview + status pill + DEO progress — once a kitting record exists.
//
// Sources used (any of):
//   * tasks.full_kitting_image_url   (legacy / new brief upload)
//   * tasks.full_kitting_notes       (legacy)
//   * full_kitting_details.image_url (Stage A / unified path)
//   * full_kitting_details.data_entry_status / form_payload (DEO digitization)
// ============================================================================

interface KittingRecord {
  id: string;
  image_url: string | null;
  data_entry_status:
    | "pending_image"
    | "pending_deo"
    | "in_progress"
    | "completed";
  completed_at: string | null;
}

const KITTING_STATUS_LABEL: Record<KittingRecord["data_entry_status"], string> = {
  pending_image: "Awaiting image",
  pending_deo: "Pending DEO",
  in_progress: "DEO in progress",
  completed: "Digitized",
};

const KITTING_STATUS_TONE: Record<KittingRecord["data_entry_status"], string> = {
  pending_image: "bg-muted/30 text-muted-foreground border-border",
  pending_deo: "bg-warning/10 text-warning border-warning/30",
  in_progress: "bg-primary/10 text-primary border-primary/30",
  completed: "bg-success/10 text-success border-success/30",
};

function FullKittingReference({ task }: { task: TaskWithRelations }) {
  const [record, setRecord] = useState<KittingRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // Only render the section when the task has been flagged for kitting OR a
  // kitting image was uploaded at brief time (legacy column). Otherwise skip
  // the network call entirely — most tasks don't need this section.
  const hasFlag =
    !!task.requires_full_kitting || !!task.full_kitting_image_url;

  useEffect(() => {
    if (!hasFlag) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data } = await supabase
        .from("full_kitting_details")
        .select("id, image_url, data_entry_status, completed_at")
        .eq("task_id", task.id)
        .maybeSingle();
      if (cancelled) return;
      setRecord((data as KittingRecord | null) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [task.id, hasFlag]);

  // Resolve a signed URL for whichever image we have (record's image_url
  // takes priority over the legacy task column).
  const imagePath = record?.image_url ?? task.full_kitting_image_url ?? null;
  useEffect(() => {
    let cancelled = false;
    if (!imagePath) {
      setPhotoUrl(null);
      return;
    }
    void (async () => {
      const { data } = await supabase.storage
        .from("sample-files")
        .createSignedUrl(imagePath, 3600);
      if (cancelled) return;
      setPhotoUrl(data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [imagePath]);

  if (!hasFlag) return null;

  return (
    <Section
      title="Full Knitting"
      countBadge={record ? 1 : undefined}
      icon={<Layers className="h-3.5 w-3.5" />}
    >
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3">
          {/* Status pill (top) */}
          <div className="flex items-center gap-2">
            {record ? (
              <Badge
                variant="outline"
                className={cn(
                  "border text-[11px]",
                  KITTING_STATUS_TONE[record.data_entry_status]
                )}
              >
                {KITTING_STATUS_LABEL[record.data_entry_status]}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-border bg-muted/30 text-[11px] text-muted-foreground"
              >
                {imagePath ? "Photo on file" : "Awaiting form upload"}
              </Badge>
            )}
          </div>

          {/* Form file preview (signed URL, 1h TTL). Images render inline; any
              other type (PDF, doc, …) renders a file chip so it doesn't show a
              broken <img>. */}
          {imagePath ? (
            photoUrl ? (
              isImagePath(imagePath) ? (
                <a
                  href={photoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-xl border border-border bg-secondary/30"
                  title="Open full size"
                >
                  <img
                    src={photoUrl}
                    alt="Kitting form"
                    className="block max-h-56 w-full object-contain"
                  />
                </a>
              ) : (
                <a
                  href={photoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 transition-colors hover:border-primary/30"
                  title="Open file"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileIcon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {fileLabel(imagePath)}
                    </span>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {fileExt(imagePath) || "FILE"} · tap to open
                    </span>
                  </span>
                  <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                </a>
              )
            ) : (
              <div className="flex h-32 items-center justify-center rounded-xl border border-border bg-secondary/30 text-xs text-muted-foreground">
                Loading file…
              </div>
            )
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-secondary/30 px-3 py-3 text-[11px] text-muted-foreground">
              The coordinator hasn't uploaded the kitting form yet. You'll see it
              here once they do.
            </p>
          )}

          {/* Legacy notes from the New Brief form (pre-digitization era) */}
          {task.full_kitting_notes && (
            <div className="rounded-md border border-border bg-secondary/30 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Coordinator notes
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-xs text-foreground">
                {task.full_kitting_notes}
              </p>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

