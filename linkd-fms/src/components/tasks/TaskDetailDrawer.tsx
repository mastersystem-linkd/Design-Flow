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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast, LazyImage } from "@/components/ui";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
} from "@/components/ui/avatar";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompression";
import { useAuth } from "@/hooks/useAuth";
import { useTaskDetail, type FileWithUploader, type TaskLogWithUser } from "@/hooks/useTaskDetail";
import { useTaskMutations, type UpdateTaskFields } from "@/hooks/useTaskMutations";
import { useTaskComments } from "@/hooks/useTaskComments";
import { useProfiles } from "@/hooks/useProfiles";
import { sendNotification } from "@/lib/notifications";
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
}

export function TaskDetailDrawer({
  taskId,
  open,
  onOpenChange,
  onChange,
}: TaskDetailDrawerProps) {
  const { task, files, logs, isLoading, error, refetch } = useTaskDetail(taskId);
  const { profile, user } = useAuth();
  const { updateTask, deleteTask, isPending: isMutPending } = useTaskMutations();

  const [editMode, setEditMode] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Edit visible to admin/coordinator OR the designer who owns the task
  const isOwner = !!(task && (task.assigned_to === user?.id || task.created_by === user?.id));
  const canEdit = isAdminRole(profile?.role) || isOwner;
  const canDelete = isAdminRole(profile?.role) || isOwner;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] w-[95vw] max-w-[560px] flex-col gap-0 overflow-hidden p-0 sm:rounded-xl"
        srTitle={task?.task_code ? `Task ${task.task_code}` : "Task details"}
      >
        {isLoading || !task ? (
          <DrawerSkeleton error={error} />
        ) : (
          <>
            <DrawerHeader
              task={task}
              editMode={editMode}
              canEdit={!!canEdit}
              canDelete={canDelete}
              onEdit={() => setEditMode(true)}
              onDelete={() => setDeleteOpen(true)}
            />

            <div
              className={cn(
                "flex-1 space-y-4 overflow-y-auto px-5 py-4",
                editMode && "bg-primary/[0.02]"
              )}
            >
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

              {/* Full Kitting reference — visible to ALL roles. Shows the
                  coordinator-uploaded photo + any DEO progress so designers
                  see the kitting context before they start. */}
              <FullKittingReference task={task} />

              {task.status === "in_progress" && (
                <QtyTracker
                  task={task}
                  hasFiles={files.length > 0}
                  onUpdated={handleChanged}
                />
              )}

              <ActivityLog logs={logs} />

              <Discussion task={task} />

              {/* SamplingRecords removed — sampling is now decoupled from tasks. */}
            </div>

            <ActionFooter
              task={task}
              files={files}
              onChanged={handleChanged}
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
          </>
        )}
      </DialogContent>
    </Dialog>
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
  return (
    <div className="shrink-0 border-b border-border bg-card/80 px-5 pt-4 pb-3 backdrop-blur">
      {/* Row 1: code + status + action buttons */}
      <div className="flex items-center gap-2 pr-8">
        <span className="font-mono text-[11px] uppercase tracking-wider text-primary">
          {task.task_code}
        </span>
        <Badge className={cn("text-[10px]", STATUS_COLORS[task.status])}>
          {statusLabelForTask(task)}
        </Badge>
        {editMode && (
          <Badge className="bg-primary/10 text-primary border border-primary/20 text-[10px]">
            Editing
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1">
          {!editMode && canEdit && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
            >
              Edit
            </button>
          )}
          {!editMode && canDelete && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Row 2: concept */}
      <h2 className="mt-2 font-sans text-2xl leading-tight tracking-tight text-foreground">
        {task.concept}
      </h2>

      {/* Row 3: client + urgent */}
      <div className="mt-1 flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          {task.client?.party_name ?? "—"}
        </span>
        {task.priority === "urgent" && (
          <Badge className="bg-destructive px-1.5 py-0 text-[10px] uppercase tracking-wider text-destructive-foreground">
            Urgent
          </Badge>
        )}
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
  done: "Completed",
};

function ProgressPipeline({ current }: { current: TaskStatus }) {
  const effectiveCurrent: TaskStatus =
    current === "approved" ||
    current === "sampling" ||
    current === "full_kitting" ||
    current === "todo"
      ? "in_progress"
      : current;
  const currentIndex = PIPELINE_STAGES.indexOf(effectiveCurrent);
  const lastIndex = PIPELINE_STAGES.length - 1;

  return (
    <Section title="Pipeline">
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
      <p className="mt-3 rounded-md border border-border bg-card/50 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">
          {STATUS_LABELS[effectiveCurrent]}
        </span>
        {" — "}
        {STAGE_HINTS[effectiveCurrent]}
      </p>
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
            <span>Fabric: {task.fabric}</span>
            <span>Client: {task.client?.party_name ?? "—"}</span>
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
// 3 — BRIEF DETAILS (read-only view)
// ============================================================================

function BriefDetails({
  task,
  onChanged,
}: {
  task: TaskWithRelations;
  onChanged: () => void;
}) {
  const { profile } = useAuth();
  const isAdmin = isAdminRole(profile?.role);

  const days = daysUntil(task.planned_deadline);
  const sev = daysSeverity(days);
  const qtyPct = task.qty > 0 ? Math.min(100, (task.qty_completed / task.qty) * 100) : 0;
  const qtyPartial = task.qty_completed > 0 && task.qty_completed < task.qty;

  return (
    <Section title="Brief details">
      <div className="grid grid-cols-2 gap-2">
        <InfoCard label="Fabric">{task.fabric}</InfoCard>

        <InfoCard label="Quantity">
          <span className="tabular-nums">
            {qtyPartial ? (
              <>
                {task.qty_completed} / {task.qty} m completed
              </>
            ) : (
              <>
                <span className="font-semibold">{task.qty}</span> m
              </>
            )}
          </span>
          {qtyPartial && (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-success transition-[width] duration-300"
                style={{ width: `${qtyPct}%` }}
              />
            </div>
          )}
        </InfoCard>

        <InfoCard label="Deadline">
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
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </InfoCard>

        <InfoCard label="Due time">
          {task.due_time ? task.due_time.slice(0, 5) : <span className="text-muted-foreground">—</span>}
        </InfoCard>

        <InfoCard label="Priority">
          {task.priority === "urgent" ? (
            <Badge className="bg-destructive px-1.5 py-0 text-[10px] uppercase tracking-wider text-destructive-foreground">
              Urgent
            </Badge>
          ) : (
            <span className="text-muted-foreground">Normal</span>
          )}
        </InfoCard>

        <InfoCard label="Assigned to">
          <AssigneeRow
            task={task}
            isAdmin={isAdmin}
            onAssigned={onChanged}
          />
        </InfoCard>
      </div>

      {(task.description || task.notes || task.whatsapp_group) && (
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          {task.description && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Description
              </p>
              <p className="mt-0.5 whitespace-pre-wrap leading-relaxed text-foreground">
                {task.description}
              </p>
            </div>
          )}
          {task.notes && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Notes
              </p>
              <p className="mt-0.5 text-foreground">{task.notes}</p>
            </div>
          )}
          {task.whatsapp_group && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                WhatsApp
              </p>
              <p className="mt-0.5 text-foreground">{task.whatsapp_group}</p>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

function InfoCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5 text-sm font-medium text-foreground">{children}</div>
    </div>
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
function AssigneeRow({
  task,
  isAdmin,
  onAssigned,
}: {
  task: TaskWithRelations;
  isAdmin: boolean;
  onAssigned: () => void;
}) {
  const { assignTask, updateTask, isPending } = useTaskMutations();
  const { profiles } = useProfiles({ roles: ["designer"] });
  const pending = isPending("assign", task.id) || isPending("updateTask", task.id);
  const currentId = task.assigned_to ?? null;

  async function assign(designerId: string) {
    if (designerId === currentId) return; // no-op
    const { error } = await assignTask(task.id, designerId);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(currentId ? "Designer changed" : "Task assigned");
    onAssigned();
  }

  // Reassignment is locked once the task reaches a "finished" state —
  // changing who owns a task that's already shipped (or about to ship)
  // rewrites history and confuses analytics. Admins can still see the
  // current assignee, just not change it.
  const isFinished =
    task.status === "done" ||
    task.status === "approved" ||
    task.status === "sampling";
  const canReassign = isAdmin && !isFinished;
  // "Send back to pool" — same gate, plus we need an assignee to clear.
  const canUnassign = !!currentId && canReassign;

  async function unassign() {
    const { error } = await updateTask(task.id, { assigned_to: null });
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Task sent back to Pool");
    onAssigned();
  }

  // Designer / non-admin view: read-only label.
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

  // Admin / coordinator view: name (or "Open Pool") + change trigger.
  // The Change button is hidden entirely once the task is finished — see
  // `canReassign` above. We keep the read-only assignee chip so it still
  // shows who owned the task at completion.
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
      {!canReassign ? (
        <span
          className="ml-auto shrink-0 rounded-md border border-border bg-secondary/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          title={`Assignee is locked once a task is ${task.status}.`}
        >
          Locked
        </span>
      ) : (
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
                  onSelect={() => void unassign()}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-destructive outline-none data-[highlighted]:bg-destructive/5"
                >
                  Send back to Pool
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
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
}: {
  task: TaskWithRelations;
  hasFiles: boolean;
  onUpdated: () => void;
}) {
  const { updateQtyCompleted, isPending } = useTaskMutations();
  const [draft, setDraft] = useState<number>(task.qty_completed);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setDraft(task.qty_completed);
  }, [task.qty_completed, task.id]);

  const pct = task.qty > 0 ? Math.min(100, (draft / task.qty) * 100) : 0;
  const pending = isPending("updateQty", task.id);
  const dirty = draft !== task.qty_completed;
  const min = task.qty_completed; // cannot reduce
  const max = task.qty;
  const valid = Number.isFinite(draft) && draft >= min && draft <= max;
  const willComplete = draft === task.qty && task.qty > 0;

  function clamp(n: number): number {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.round(n)));
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
    if (willComplete) {
      setConfirming(true);
      return;
    }
    void performUpdate();
  }

  async function handleConfirmCompletion() {
    setConfirming(false);
    await performUpdate();
  }

  return (
    <Section title="Progress tracker">
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Big progress bar with overlay */}
        <div className="relative h-7 overflow-hidden rounded-md border border-border bg-secondary">
          <div
            className="h-full rounded-md bg-success transition-[width] duration-300"
            style={{ width: `${pct}%` }}
            aria-hidden
          />
          <div className="absolute inset-0 flex items-center justify-center text-[11px] font-medium tabular-nums text-foreground">
            {draft} of {task.qty} m
          </div>
        </div>

        {/* Stepper + Update */}
        <div className="flex items-center gap-2">
          <StepperButton onClick={() => step(-1)} disabled={pending || draft <= min}>
            <Minus className="h-3.5 w-3.5" />
          </StepperButton>
          <Input
            type="number"
            min={min}
            max={max}
            step={1}
            value={draft}
            onChange={(e) => setDraft(clamp(Number(e.target.value)))}
            disabled={pending}
            className="h-9 w-24 text-center tabular-nums"
            aria-label="Quantity completed"
          />
          <StepperButton onClick={() => step(1)} disabled={pending || draft >= max}>
            <Plus className="h-3.5 w-3.5" />
          </StepperButton>
          <LoadingButton
            type="submit"
            size="sm"
            loading={pending}
            loadingText="Saving…"
            disabled={!valid || !dirty}
            className="ml-auto"
          >
            Update
          </LoadingButton>
        </div>

        {willComplete && !hasFiles && isConceptTrackTask(task) && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              You haven't uploaded a design file yet. Upload one below before marking this complete.
            </span>
          </div>
        )}
      </form>

      <ConfirmDialog
        open={confirming}
        variant="warning"
        title="Mark as fully kitted?"
        description={
          hasFiles || !isConceptTrackTask(task)
            ? "All meters will be marked completed and the task moves to Full Knitting for review."
            : "All meters will be marked completed. Make sure you've uploaded the design file before submitting for review."
        }
        itemRef={task.task_code}
        confirmLabel="Yes, update"
        onCancel={() => setConfirming(false)}
        onConfirm={handleConfirmCompletion}
      />
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

  // Show full drag-drop when: no files AND status = in_progress
  const showFullUploadZone = noFiles && isInProgress;
  // Show small "upload more" button when: files exist AND admin AND status is in_progress or past
  const showCompactUpload =
    !noFiles && (isAdmin || (isInProgress && profile?.id === task.assigned_to));

  return (
    <Section title="Design files" countBadge={files.length}>
      {showFullUploadZone ? (
        <FileUploadZone task={task} variant="full" onUploaded={onUploaded} />
      ) : noFiles ? (
        <p className="rounded-md border border-dashed border-border bg-card px-3 py-4 text-center text-xs text-muted-foreground">
          {isPreInProgress
            ? "Files will appear here once design work begins."
            : "No files uploaded."}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {files.map((f) => (
              <FileTile key={f.id} file={f} />
            ))}
          </div>
          {showCompactUpload && (
            <FileUploadZone task={task} variant="compact" onUploaded={onUploaded} />
          )}
        </>
      )}
    </Section>
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
  const isImage = /\.(jpe?g|png)$/i.test(file.file_name);

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
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="relative h-20 w-full bg-secondary">
        {isImage && thumb ? (
          <LazyImage
            src={thumb}
            alt={file.file_name}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FileIcon className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <button
          type="button"
          onClick={handleDownload}
          className="absolute right-1 top-1 rounded-md bg-black/80 p-1 text-white hover:bg-primary"
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
    <Section title="Activity" countBadge={cleaned.length}>
      {cleaned.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">No activity yet.</p>
      ) : (
        <>
          <ol className="space-y-3">
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

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        {isCreation ? (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/30">
            <Sparkles className="h-3 w-3 text-foreground" />
          </span>
        ) : (
          <span
            className={cn(
              "mt-1 h-2 w-2 rounded-full",
              COLUMN_DOT[log.status_to]
            )}
          />
        )}
        {!isLast && <span className="w-px flex-1 bg-border" />}
      </div>
      <div className="flex-1 pb-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {isCreation ? (
            <span className="font-semibold text-foreground">Created</span>
          ) : log.status_from ? (
            <>
              <span className="text-muted-foreground">
                {activityStatusLabel(log.status_from)}
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="font-semibold text-foreground">
                {activityStatusLabel(log.status_to)}
              </span>
            </>
          ) : (
            <span className="font-semibold text-foreground">
              {activityStatusLabel(log.status_to)}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {log.changer && (
            <span className="font-medium text-foreground">
              {log.changer.full_name}
            </span>
          )}
          {when && (
            <span title={when.toISOString()}>
              · {formatDistanceToNow(when, { addSuffix: true })}
            </span>
          )}
        </div>
        {log.note && (
          <blockquote className="mt-1.5 border-l-2 border-border bg-secondary/40 px-2 py-1 text-xs italic text-foreground">
            {log.note}
          </blockquote>
        )}
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
}: {
  task: TaskWithRelations;
  files: FileWithUploader[];
  onChanged: () => void;
}) {
  const { profile, user } = useAuth();
  const { assignTask, updateTaskStatus, isPending } = useTaskMutations();
  const role = profile?.role;
  const userId = user?.id ?? null;

  // Sub-state for log completion flow (revision flow was removed when
  // task approval/revision was scoped to concepts-only).
  const [logCompletionOpen, setLogCompletionOpen] = useState(false);
  const [submitWarning, setSubmitWarning] = useState<string | null>(null);

  if (!role || !userId) {
    return <FooterShell />;
  }

  const isAdmin = isAdminRole(role);
  const isAssignee = task.assigned_to === userId;
  const isUnassigned = !task.assigned_to;
  const hasFiles = files.length > 0;
  const qtyComplete = task.qty_completed >= task.qty && task.qty > 0;

  async function accept() {
    if (!userId) return;
    const { error } = await assignTask(task.id, userId);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Task accepted");
    onChanged();
  }

  async function advance(next: TaskStatus, successMsg?: string) {
    const { error } = await updateTaskStatus(task.id, next);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(successMsg ?? `Moved to ${STATUS_LABELS[next]}`);
    onChanged();
  }

  function attemptSubmit() {
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

  // ----------------- POOL: Accept Task (designer / admin) -----------------
  if (task.status === "pool" && isUnassigned) {
    return (
      <FooterShell>
        <LoadingButton
          loading={isPending("assign", task.id)}
          onClick={accept}
          className="w-full bg-primary text-foreground hover:bg-primary/90"
          size="lg"
        >
          <HandPlatter className="mr-1.5 h-4 w-4" />
          Accept Task
        </LoadingButton>
      </FooterShell>
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

  // ----------------- IN_PROGRESS: Mark Completed -----------------
  if (task.status === "in_progress" && (isAssignee || isAdmin)) {
    return (
      <FooterShell>
        <div className="w-full space-y-2">
          {submitWarning && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 animate-fade-in">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{submitWarning}</span>
            </div>
          )}
          <LoadingButton
            loading={isPending("updateStatus", task.id)}
            onClick={attemptSubmit}
            className="w-full bg-primary text-foreground hover:bg-primary/90"
            size="lg"
          >
            <Send className="mr-1.5 h-4 w-4" />
            Mark Completed
          </LoadingButton>
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
  children,
}: {
  title: string;
  countBadge?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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

// ============================================================================
// Section 9 — Discussion (task_comments)
// ============================================================================

const COMMENT_MAX = 2000;

function Discussion({ task }: { task: TaskWithRelations }) {
  const { user } = useAuth();
  const {
    comments,
    isLoading,
    addComment,
    editComment,
    deleteComment,
  } = useTaskComments(task.id);

  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);

  // Scroll the comment list to the bottom whenever a new comment lands.
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [comments.length]);

  const trimmedLen = draft.trim().length;
  const canPost = trimmedLen > 0 && trimmedLen <= COMMENT_MAX && !posting;

  async function handlePost() {
    if (!canPost) return;
    setPosting(true);
    const body = draft.trim();
    const { data, error } = await addComment(body);
    setPosting(false);

    if (error) {
      toast.error(error);
      return;
    }
    setDraft("");
    toast.success("Comment added");

    // Notify the assignee if it's someone other than the commenter.
    if (
      data &&
      task.assigned_to &&
      task.assigned_to !== user?.id
    ) {
      void sendNotification(
        task.assigned_to,
        `New comment on ${task.task_code}`,
        body.length > 100 ? body.slice(0, 100) + "…" : body,
        "info",
        `/dashboard?task=${task.id}`
      );
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl/Cmd+Enter posts (familiar from Slack / GitHub).
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void handlePost();
    }
  }

  return (
    <Section title="Discussion" countBadge={comments.length}>
      {isLoading && comments.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          No comments yet. Start the discussion.
        </p>
      ) : (
        <ol
          ref={listRef}
          className="max-h-[300px] space-y-3 overflow-y-auto pr-1"
        >
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              isOwn={c.user_id === user?.id}
              onEdit={editComment}
              onDelete={deleteComment}
            />
          ))}
        </ol>
      )}

      {/* Composer */}
      <div className="mt-3 space-y-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, COMMENT_MAX))}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment…"
          rows={2}
          maxLength={COMMENT_MAX}
          disabled={posting}
          className="w-full resize-none rounded-md border border-border bg-card px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        <div className="flex items-center justify-end gap-2">
          {trimmedLen > 1500 && (
            <span
              className={cn(
                "text-xs text-muted-foreground tabular-nums",
                trimmedLen >= COMMENT_MAX && "text-destructive"
              )}
            >
              {trimmedLen}/{COMMENT_MAX}
            </span>
          )}
          <LoadingButton
            type="button"
            size="sm"
            onClick={() => void handlePost()}
            loading={posting}
            loadingText="Posting…"
            disabled={!canPost}
          >
            Post
          </LoadingButton>
        </div>
      </div>
    </Section>
  );
}

function CommentItem({
  comment,
  isOwn,
  onEdit,
  onDelete,
}: {
  comment: import("@/types/database").TaskCommentWithAuthor;
  isOwn: boolean;
  onEdit: (id: string, body: string) => Promise<{ error: string | null }>;
  onDelete: (id: string) => Promise<{ error: string | null }>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const when = comment.created_at
    ? formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })
    : "";
  const wasEdited =
    comment.updated_at &&
    comment.created_at &&
    new Date(comment.updated_at).getTime() -
      new Date(comment.created_at).getTime() >
      1000;

  async function handleSave() {
    if (!draft.trim() || draft === comment.body) {
      setEditing(false);
      setDraft(comment.body);
      return;
    }
    setSaving(true);
    const { error } = await onEdit(comment.id, draft);
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    setEditing(false);
    toast.success("Comment updated");
  }

  async function handleDelete() {
    const { error } = await onDelete(comment.id);
    setConfirmDel(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Comment deleted");
  }

  return (
    <li className="flex gap-2">
      <Avatar className="h-7 w-7 shrink-0">
        {comment.author?.avatar_url ? (
          <AvatarImage src={comment.author.avatar_url} />
        ) : null}
        <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
          {getInitials(comment.author?.full_name ?? "")}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="text-sm font-medium text-foreground">
            {comment.author?.full_name ?? "Unknown user"}
          </p>
          <p className="text-xs text-muted-foreground">
            {when}
            {wasEdited && (
              <span className="ml-1 italic text-muted-foreground/70">
                (edited)
              </span>
            )}
          </p>
        </div>

        {editing ? (
          <div className="mt-1 space-y-1.5">
            <textarea
              value={draft}
              onChange={(e) =>
                setDraft(e.target.value.slice(0, COMMENT_MAX))
              }
              rows={2}
              disabled={saving}
              className="w-full resize-none rounded-md border border-border bg-card px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <LoadingButton
                type="button"
                size="sm"
                onClick={() => void handleSave()}
                loading={saving}
                loadingText="Saving…"
                disabled={!draft.trim()}
              >
                Save
              </LoadingButton>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setDraft(comment.body);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">
              {comment.body}
            </p>
            {isOwn && (
              <div className="mt-1 flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDel(true)}
                  className="inline-flex items-center gap-1 text-destructive hover:underline"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDel}
        title="Delete this comment?"
        description="Other people in this thread won't see it anymore. This action can't be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDel(false)}
      />
    </li>
  );
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
    <Section title="Full Knitting" countBadge={record ? 1 : undefined}>
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

          {/* Form photo preview (signed URL, 1h TTL) */}
          {imagePath ? (
            photoUrl ? (
              <a
                href={photoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-lg border border-border bg-secondary/30"
                title="Open full size"
              >
                <img
                  src={photoUrl}
                  alt="Kitting form photo"
                  className="block max-h-48 w-full object-contain"
                />
              </a>
            ) : (
              <div className="flex h-32 items-center justify-center rounded-lg border border-border bg-secondary/30 text-xs text-muted-foreground">
                Loading photo…
              </div>
            )
          ) : (
            <p className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground">
              The coordinator hasn't uploaded the kitting form photo yet.
              You'll see it here once they do.
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

