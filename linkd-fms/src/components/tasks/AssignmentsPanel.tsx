import { useState } from "react";
import {
  AlertTriangle,
  Loader2,
  X,
  Users,
  CheckCircle2,
  Pencil,
  Layers,
  Sparkles,
  CalendarDays,
  Lock,
  Check,
  Minus,
  Plus,
  CornerDownLeft,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
} from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { ConfirmDialog, Switch, toast } from "@/components/ui";
import { Combobox } from "@/components/ui/Combobox";
import { useTaskAssignments } from "@/hooks/useTaskAssignments";
import { useFabrics } from "@/hooks/useFabrics";
import { useConceptCategories } from "@/hooks/useConceptCategories";
import { useAuth } from "@/hooks/useAuth";
import { isAdminOrCoordinator } from "@/lib/permissions";
import { isFullKittingBlocking } from "@/lib/taskHelpers";
import { cn, formatDate } from "@/lib/utils";
import type {
  TaskWithRelations,
  TaskAssignmentWithDesigner,
} from "@/types/database";

// ── Avatar colours (deterministic by id hash) ───────────────────────────────
const AV_COLORS = [
  "bg-[#4F46E5]",
  "bg-[#0EA5A4]",
  "bg-[#DB2777]",
  "bg-[#D97706]",
  "bg-[#7C3AED]",
  "bg-[#2563EB]",
  "bg-[#059669]",
];
function avColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AV_COLORS[Math.abs(h) % AV_COLORS.length];
}

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  assigned: {
    cls: "bg-secondary/60 text-muted-foreground border-border",
    label: "Assigned",
  },
  in_progress: {
    cls: "bg-primary/10 text-primary border-primary/25",
    label: "In Progress",
  },
  done: {
    cls: "bg-success/10 text-success border-success/25",
    label: "Done",
  },
  completed: {
    cls: "bg-success/10 text-success border-success/25",
    label: "Completed",
  },
};

// ── Main panel ──────────────────────────────────────────────────────────────

export function AssignmentsPanel({ task }: { task: TaskWithRelations }) {
  const {
    assignments,
    totalAssigned,
    totalCompleted,
    isLoading,
    removeAssignment,
    updateAssignmentQty,
    updateAssignmentClaim,
    updateAssignmentDetails,
    completePortion,
  } = useTaskAssignments(task.id);
  const { profile, user } = useAuth();
  const isAdmin = isAdminOrCoordinator(profile?.role);
  const [removeTarget, setRemoveTarget] = useState<TaskAssignmentWithDesigner | null>(null);
  const [removing, setRemoving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);

  if (isLoading) return null;
  if (assignments.length === 0) return null;

  // Completed split tasks are rendered entirely by CompletionSection's disclosure
  if (task.is_split && task.status === "completed") return null;

  const overallPct =
    task.qty > 0 ? Math.min(100, (totalCompleted / task.qty) * 100) : 0;
  const poolRemaining = Math.max(0, task.qty - totalAssigned);
  const fkBlocking = isFullKittingBlocking(task);

  async function handleRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    const { error } = await removeAssignment(removeTarget.id);
    setRemoving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Assignment removed");
    setRemoveTarget(null);
  }

  return (
    <section className="space-y-2">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          <Users className="h-3.5 w-3.5 text-primary" />
          Team Sub-tasks
        </h3>
        <span className="text-[11px] text-muted-foreground">
          {assignments.length} designer{assignments.length !== 1 ? "s" : ""}
          {" · "}
          <span className="tabular-nums font-medium text-foreground">
            {totalAssigned}
          </span>
          /{task.qty} assigned
        </span>
      </div>

      {/* Assignment cards */}
      <div className="space-y-1.5">
        {assignments.map((a) => {
          const isMine = user?.id === a.designer_id;
          const canAct = isMine || isAdmin;
          const isCompleted = a.status === "completed";
          // Can complete once they've done AT LEAST their assigned qty — extra
          // is allowed; less than assigned is NOT (stays locked until met).
          const canComplete =
            a.qty_completed >= a.qty_assigned && !isCompleted;
          const isHighlight =
            !isCompleted &&
            a.qty_completed > 0 &&
            a.qty_completed < a.qty_assigned &&
            a.qty_assigned >= 30;

          return (
            <AssignmentCard
              key={a.id}
              a={a}
              task={task}
              isMine={isMine}
              canAct={canAct}
              isAdmin={isAdmin}
              isCompleted={isCompleted}
              canComplete={canComplete}
              isHighlight={isHighlight}
              fkBlocking={fkBlocking}
              isEditing={editingId === a.id}
              isResizing={resizingId === a.id}
              poolRemaining={poolRemaining}
              onEdit={() =>
                setEditingId(editingId === a.id ? null : a.id)
              }
              onResize={() =>
                setResizingId(resizingId === a.id ? null : a.id)
              }
              onCompletePortion={completePortion}
              onRemove={() => setRemoveTarget(a)}
              onUpdateQty={updateAssignmentQty}
              onResizeClaim={updateAssignmentClaim}
              onUpdateDetails={updateAssignmentDetails}
            />
          );
        })}
      </div>

      {/* Claim / fully-assigned banner */}
      {poolRemaining === 0 ? (
        <div className="flex items-center justify-center gap-1.5 rounded-xl border border-success/25 bg-success/5 px-4 py-2 text-[11px] font-semibold text-success">
          <Check className="h-3 w-3" />
          Fully assigned — {totalAssigned}/{task.qty} claimed
        </div>
      ) : null}

      {/* Overall progress footer */}
      {(() => {
        const completedCount = assignments.filter((a) => a.status === "completed").length;
        const allCompleted = completedCount === assignments.length;
        const doneCount = assignments.filter((a) => a.status === "done" || a.status === "completed").length;
        return (
          <div className="rounded-xl border border-border bg-secondary/20 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Overall
              </p>
              <p className="text-[11px] font-semibold text-foreground">
                <span className="text-primary tabular-nums">{totalCompleted}</span>/{task.qty}
                {" · "}
                <span className={cn("tabular-nums text-[10px]", poolRemaining === 0 ? "text-success" : "text-muted-foreground")}>
                  {poolRemaining} in pool
                </span>
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary transition-[width] duration-500 ease-out"
                style={{ width: `${overallPct}%` }}
              />
            </div>
            {/* Completion hint */}
            <p className={cn(
              "mt-2 text-[10px] font-medium",
              allCompleted ? "text-success" : "text-muted-foreground"
            )}>
              {allCompleted ? (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  All portions completed — task auto-completed
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  {completedCount}/{assignments.length} portions completed
                  {doneCount > completedCount && ` · ${doneCount - completedCount} awaiting completion`}
                  {" — task auto-completes when all finish"}
                </span>
              )}
            </p>
          </div>
        );
      })()}

      {/* FK blocking banner */}
      {fkBlocking && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Waiting for Full Knitting details</p>
              <p className="text-xs text-muted-foreground">The coordinator needs to add Full Knitting details before portions can be completed. Designers can keep updating progress.</p>
            </div>
          </div>
        </div>
      )}

      {/* Remove confirmation */}
      <ConfirmDialog
        open={!!removeTarget}
        title="Remove assignment?"
        description={
          removeTarget
            ? `${removeTarget.designer?.full_name ?? "This designer"}'s ${removeTarget.qty_assigned} designs will return to the pool.`
            : ""
        }
        variant="danger"
        confirmLabel={removing ? "Removing…" : "Remove"}
        onConfirm={() => void handleRemove()}
        onCancel={() => setRemoveTarget(null)}
      />
    </section>
  );
}

// ── Single assignment card ──────────────────────────────────────────────────

function AssignmentCard({
  a,
  task,
  isMine,
  canAct,
  isAdmin,
  isCompleted,
  canComplete,
  fkBlocking,
  isHighlight,
  isEditing,
  isResizing,
  poolRemaining,
  onEdit,
  onResize,
  onCompletePortion,
  onRemove,
  onUpdateQty,
  onResizeClaim,
  onUpdateDetails,
}: {
  a: TaskAssignmentWithDesigner;
  task: TaskWithRelations;
  isMine: boolean;
  canAct: boolean;
  isAdmin: boolean;
  isCompleted: boolean;
  canComplete: boolean;
  fkBlocking: boolean;
  isHighlight: boolean;
  isEditing: boolean;
  isResizing: boolean;
  poolRemaining: number;
  onEdit: () => void;
  onResize: () => void;
  onCompletePortion: (
    id: string,
    fabricOverride?: string,
    designTypeOverride?: string,
    samplingRequired?: boolean
  ) => Promise<{ error: string | null }>;
  onRemove: () => void;
  onUpdateQty: (
    id: string,
    qty: number
  ) => Promise<{ error: string | null }>;
  onResizeClaim: (
    id: string,
    qty: number
  ) => Promise<{ error: string | null }>;
  onUpdateDetails: (
    id: string,
    patch: { deadline?: string; designType?: string; fabric?: string }
  ) => Promise<{ error: string | null }>;
}) {
  const { fabrics } = useFabrics();
  const { categories } = useConceptCategories();
  const [completing, setCompleting] = useState(false);
  const [showCompletionPrompt, setShowCompletionPrompt] = useState(false);
  const [completionFabric, setCompletionFabric] = useState(a.completion_fabric ?? "");
  const [completionDesignType, setCompletionDesignType] = useState(a.design_type ?? "");
  const [completionSampling, setCompletionSampling] = useState(false);

  const pct =
    a.qty_assigned > 0
      ? Math.min(100, (a.qty_completed / a.qty_assigned) * 100)
      : 0;
  const badge = STATUS_BADGE[a.status] ?? STATUS_BADGE.assigned;

  // Always open the prompt so the designer confirms fabric + design and can
  // flag "Sampling Required?" for THIS portion — each portion may use a
  // different fabric/design and get its own sample.
  function handleComplete() {
    setShowCompletionPrompt(true);
  }

  async function handleCompleteWithDetails() {
    if (fkBlocking) {
      toast.error("Full Knitting details must be added before completing");
      return;
    }
    if (!completionFabric.trim()) {
      toast.error("Fabric is required to complete");
      return;
    }
    if (!completionDesignType.trim()) {
      toast.error("Design type is required to complete");
      return;
    }
    setCompleting(true);
    const { error } = await onCompletePortion(
      a.id,
      completionFabric.trim(),
      completionDesignType.trim(),
      completionSampling
    );
    setCompleting(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(
      completionSampling ? "Sub-task completed — added to sampling" : "Sub-task completed!"
    );
    setShowCompletionPrompt(false);
    setCompletionSampling(false);
  }

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5 transition-all",
        isCompleted
          ? "border-success/25 bg-gradient-to-b from-success/[0.04] to-card"
          : isHighlight
            ? "border-warning/40 shadow-[0_0_0_2px_rgba(242,201,125,0.12)]"
            : "border-border bg-card"
      )}
    >
      {/* Row 1: Avatar + name + badge + chips + admin remove */}
      <div className="flex items-center gap-2">
        <Avatar
          className={cn(
            "h-8 w-8 shrink-0 text-white",
            avColor(a.designer_id)
          )}
        >
          {a.designer?.avatar_url ? (
            <AvatarImage src={a.designer.avatar_url} />
          ) : null}
          <AvatarFallback
            className={cn(
              "text-[10px] font-bold text-white",
              avColor(a.designer_id)
            )}
          >
            {getInitials(a.designer?.full_name ?? "?")}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold text-foreground">
              {a.designer?.full_name ?? "Unknown"}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full border px-1.5 py-px text-[9px] font-semibold",
                badge.cls
              )}
            >
              {badge.label}
            </span>
            {/* Inline chips */}
            {!isEditing && a.design_type && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary">
                <Sparkles className="h-2.5 w-2.5" />
                {a.design_type}
              </span>
            )}
            {!isEditing && a.completion_fabric && (
              <span className="text-[10px] text-muted-foreground">
                · {a.completion_fabric}
              </span>
            )}
            {!isEditing && a.planned_deadline && (
              <span className="text-[10px] text-muted-foreground">
                · {formatDate(a.planned_deadline)}
              </span>
            )}
          </div>
        </div>

        {isAdmin && !isCompleted && (
          <button
            type="button"
            onClick={onRemove}
            title="Remove assignment"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Completion details (for completed portions) */}
      {isCompleted && (a.completed_at || a.completion_fabric || a.design_type) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          {a.completed_at && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-2.5 w-2.5" />
              Completed {formatDate(a.completed_at)}
            </span>
          )}
        </div>
      )}

      {/* Progress tracker */}
      <div className="mt-2">
        <ProgressTracker
          assignmentId={a.id}
          current={a.qty_completed}
          max={a.qty_assigned}
          isCompleted={isCompleted}
          canAct={canAct}
          onUpdate={onUpdateQty}
        />
      </div>

      {isEditing && (
        <EditDetailsPanel
          assignment={a}
          onSave={onUpdateDetails}
          onClose={onEdit}
        />
      )}

      {isResizing && (
        <ResizePanel
          assignment={a}
          maxQty={a.qty_assigned + poolRemaining}
          onSave={onResizeClaim}
          onClose={onResize}
        />
      )}

      {/* Controls row */}
      {!isEditing && !isResizing && (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-dashed border-border/50 pt-2">
          <div className="flex items-center gap-1.5">
            {!isCompleted && canAct && (
              <button
                type="button"
                onClick={onResize}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              >
                <Pencil className="h-3 w-3" />
                Resize
              </button>
            )}
            {!isCompleted && canAct && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              >
                <Sparkles className="h-3 w-3" />
                Edit
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {isCompleted ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-success/25 bg-success/5 px-2.5 py-1 text-[11px] font-semibold text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Completed
              </span>
            ) : canComplete ? (
              <LoadingButton
                size="sm"
                onClick={() => void handleComplete()}
                loading={completing}
                loadingText="…"
                disabled={fkBlocking}
                title={fkBlocking ? "Waiting for Full Knitting details" : undefined}
                className="h-auto gap-1 rounded-md bg-success px-3 py-1 text-[11px] font-semibold text-white shadow-sm shadow-success/30 hover:bg-success/90"
              >
                <Check className="h-3.5 w-3.5" />
                Complete
              </LoadingButton>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/5 px-2.5 py-1 text-[11px] font-medium text-warning">
                <Lock className="h-3 w-3" />
                {a.qty_completed}/{a.qty_assigned} done
              </span>
            )}
          </div>
        </div>
      )}

      {/* Inline completion details prompt — shown when fabric or design type is missing */}
      {showCompletionPrompt && (
        <div className="mt-2 rounded-xl border border-success/20 bg-success/[0.03] p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-success">
            <Layers className="h-3 w-3" />
            Add details to complete
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                Design Type <span className="text-destructive">*</span>
              </Label>
              <Combobox
                value={completionDesignType}
                onChange={setCompletionDesignType}
                options={categories.map((c) => ({
                  value: c.name,
                  label: c.name,
                }))}
                placeholder="Select…"
                searchPlaceholder="Search…"
              />
            </div>
            <div>
              <Label className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                Fabric <span className="text-destructive">*</span>
              </Label>
              <Combobox
                value={completionFabric}
                onChange={setCompletionFabric}
                options={fabrics.map((f) => ({
                  value: f.name,
                  label: f.name,
                }))}
                placeholder="Select…"
                searchPlaceholder="Search…"
              />
            </div>
          </div>

          {/* Sampling Required for THIS portion (its own fabric/design → its own sample) */}
          <div className="mt-2.5 flex items-center justify-between rounded-lg border border-border bg-card/50 p-2.5">
            <div className="flex-1 pr-2">
              <p className="text-[11px] font-semibold text-foreground">Sampling Required?</p>
              <p className="text-[10px] text-muted-foreground">
                Add this portion&apos;s design to the Sampling queue.
              </p>
            </div>
            <Switch
              checked={completionSampling}
              onCheckedChange={setCompletionSampling}
              disabled={completing}
              aria-label="Sampling required for this portion"
            />
          </div>

          <div className="mt-2.5 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setShowCompletionPrompt(false);
                setCompletionFabric(a.completion_fabric ?? "");
                setCompletionDesignType(a.design_type ?? "");
                setCompletionSampling(false);
              }}
              className="h-9 rounded-lg border border-border bg-card px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary"
            >
              Cancel
            </button>
            <LoadingButton
              size="sm"
              onClick={() => void handleCompleteWithDetails()}
              loading={completing}
              loadingText="…"
              className="h-9 gap-1 rounded-lg bg-success px-3 text-[11px] font-semibold text-white shadow-sm shadow-success/30 hover:bg-success/90"
            >
              <Check className="h-3 w-3" />
              Complete
            </LoadingButton>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Progress tracker (bar + stepper + Update) ─────────────────────────────

function ProgressTracker({
  assignmentId,
  current,
  max,
  isCompleted,
  canAct,
  onUpdate,
}: {
  assignmentId: string;
  current: number;
  max: number;
  isCompleted: boolean;
  canAct: boolean;
  onUpdate: (
    id: string,
    qty: number
  ) => Promise<{ error: string | null }>;
}) {
  const [draft, setDraft] = useState(current);
  const [saving, setSaving] = useState(false);

  const pct = max > 0 ? Math.min(100, (draft / max) * 100) : 0;
  const dirty = draft !== current;
  const interactive = canAct && !isCompleted;

  function clamp(n: number) {
    if (!Number.isFinite(n)) return 0;
    // No upper cap — a designer may finish MORE than assigned (extra designs).
    return Math.max(0, Math.round(n));
  }

  function step(delta: number) {
    setDraft((d) => clamp(d + delta));
  }

  const extra = draft > max ? draft - max : 0;

  async function save() {
    if (!dirty) return;
    setSaving(true);
    const { error } = await onUpdate(assignmentId, draft);
    setSaving(false);
    if (error) toast.error(error);
  }

  return (
    <div className="space-y-1.5">
      {/* Progress bar with overlay text */}
      <div className="relative h-6 overflow-hidden rounded-md border border-border bg-secondary">
        <div
          className={cn(
            "h-full rounded-md transition-[width] duration-300",
            isCompleted
              ? "bg-gradient-to-r from-success/80 to-success"
              : pct >= 100
                ? "bg-gradient-to-r from-success/80 to-success"
                : "bg-gradient-to-r from-primary/70 to-primary"
          )}
          style={{ width: `${pct}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-center gap-1 text-[11px] font-medium tabular-nums text-foreground">
          {draft}/{max}
          <span className="text-[10px] text-foreground/70">
            ({Math.round(pct)}%)
          </span>
          {extra > 0 && (
            <span className="rounded bg-primary/15 px-1 text-[9px] font-semibold text-primary">
              +{extra} extra
            </span>
          )}
        </div>
      </div>

      {/* Stepper row */}
      {interactive && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={saving || draft <= 0}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <input
            type="number"
            min={0}
            step={1}
            value={draft}
            onChange={(e) => setDraft(clamp(Number(e.target.value)))}
            disabled={saving}
            className="h-8 w-16 rounded-md border border-border bg-card text-center text-xs font-semibold tabular-nums text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            aria-label="Designs completed"
          />
          <button
            type="button"
            onClick={() => step(1)}
            disabled={saving}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <LoadingButton
            size="sm"
            onClick={() => void save()}
            loading={saving}
            loadingText="…"
            disabled={!dirty}
            className="ml-auto h-8 px-3 text-[11px]"
          >
            Update
          </LoadingButton>
        </div>
      )}
    </div>
  );
}

// ── Edit Details Panel ──────────────────────────────────────────────────────

function EditDetailsPanel({
  assignment,
  onSave,
  onClose,
}: {
  assignment: TaskAssignmentWithDesigner;
  onSave: (
    id: string,
    patch: { deadline?: string; designType?: string; fabric?: string }
  ) => Promise<{ error: string | null }>;
  onClose: () => void;
}) {
  const { fabrics } = useFabrics();
  const { categories } = useConceptCategories();
  const [dt, setDt] = useState(assignment.design_type ?? "");
  const [fb, setFb] = useState(assignment.completion_fabric ?? "");
  const [dl, setDl] = useState(assignment.planned_deadline ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await onSave(assignment.id, {
      designType: dt.trim() || undefined,
      fabric: fb.trim() || undefined,
      deadline: dl || undefined,
    });
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Details updated");
    onClose();
  }

  return (
    <div className="mt-3 rounded-xl border border-primary/15 bg-primary/[0.02] p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
        <Pencil className="h-3 w-3" />
        Edit sub-task details
      </p>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
            Design Type
          </Label>
          <Combobox
            value={dt}
            onChange={setDt}
            options={categories.map((c) => ({
              value: c.name,
              label: c.name,
            }))}
            placeholder="Select…"
            searchPlaceholder="Search…"
            clearable
          />
        </div>
        <div>
          <Label className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
            Fabric
          </Label>
          <Combobox
            value={fb}
            onChange={setFb}
            options={fabrics.map((f) => ({
              value: f.name,
              label: f.name,
            }))}
            placeholder="Select…"
            searchPlaceholder="Search…"
            clearable
          />
        </div>
        <div>
          <Label className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
            Deadline
          </Label>
          <Input
            type="date"
            value={dl}
            onChange={(e) => setDl(e.target.value)}
            onClick={(e) =>
              (e.currentTarget as HTMLInputElement).showPicker?.()
            }
            className="h-9 cursor-pointer text-xs"
          />
        </div>
      </div>
      <div className="mt-2.5 flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-primary px-3 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="inline h-3 w-3 animate-spin" />
          ) : (
            "Save"
          )}
        </button>
      </div>
    </div>
  );
}

// ── Resize claim panel ──────────────────────────────────────────────────────

function ResizePanel({
  assignment,
  maxQty,
  onSave,
  onClose,
}: {
  assignment: TaskAssignmentWithDesigner;
  maxQty: number;
  onSave: (
    id: string,
    qty: number
  ) => Promise<{ error: string | null }>;
  onClose: () => void;
}) {
  const floor = assignment.qty_completed;
  const [qty, setQty] = useState(assignment.qty_assigned);
  const [saving, setSaving] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const canDelete = floor === 0;
  const delta = qty - assignment.qty_assigned;
  const dirty = qty !== assignment.qty_assigned;
  const pct = maxQty > 0 ? Math.min(100, (qty / maxQty) * 100) : 0;

  function clamp(n: number) {
    if (!Number.isFinite(n)) return canDelete ? 0 : floor;
    return Math.max(canDelete ? 0 : floor, Math.min(maxQty, Math.round(n)));
  }

  function step(d: number) {
    setQty((q) => clamp(q + d));
  }

  async function save() {
    if (!dirty) {
      onClose();
      return;
    }
    if (qty === 0 && canDelete) {
      setReleaseOpen(true);
      return;
    }
    setSaving(true);
    const { error } = await onSave(assignment.id, qty);
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    const returned = assignment.qty_assigned - qty;
    toast.success(
      returned > 0
        ? `${returned} designs returned to the pool`
        : `Claim resized to ${qty}`
    );
    onClose();
  }

  async function confirmRelease() {
    setSaving(true);
    const { error } = await onSave(assignment.id, 0);
    setSaving(false);
    setReleaseOpen(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Released — designs returned to pool");
    onClose();
  }

  let preview = "";
  let previewCls = "";
  if (delta < 0) {
    preview = `returning ${-delta} to pool`;
    previewCls = "text-success";
  } else if (delta > 0) {
    preview = `pulling ${delta} from pool`;
    previewCls = "text-primary";
  }

  return (
    <div className="mt-2 space-y-1.5 rounded-xl border border-primary/15 bg-primary/[0.02] p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
        <Pencil className="h-3 w-3" />
        Resize claim
        <span className="text-[10px] font-normal text-muted-foreground">
          — floor {floor} (done), up to {maxQty}
        </span>
      </p>

      {/* Progress bar */}
      <div className="relative h-6 overflow-hidden rounded-md border border-border bg-secondary">
        <div
          className={cn(
            "h-full rounded-md transition-[width] duration-300",
            qty === 0
              ? "bg-destructive/60"
              : delta < 0
                ? "bg-gradient-to-r from-warning/70 to-warning"
                : "bg-gradient-to-r from-primary/70 to-primary"
          )}
          style={{ width: `${pct}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-center gap-1.5 text-[11px] font-medium tabular-nums text-foreground">
          {qty} of {maxQty}
          <span className={cn("text-[10px]", previewCls)}>
            {preview && `(${preview})`}
          </span>
        </div>
      </div>

      {/* Stepper row */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={saving || qty <= (canDelete ? 0 : floor)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <input
          type="number"
          min={canDelete ? 0 : floor}
          max={maxQty}
          step={1}
          value={qty}
          onChange={(e) => setQty(clamp(Number(e.target.value)))}
          disabled={saving}
          className="h-8 w-16 rounded-md border border-border bg-card text-center text-xs font-semibold tabular-nums text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          aria-label="Claim quantity"
        />
        <button
          type="button"
          onClick={() => step(1)}
          disabled={saving || qty >= maxQty}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-lg border border-border bg-card px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold text-white transition-colors disabled:opacity-50",
              qty === 0
                ? "bg-destructive hover:bg-destructive/90"
                : "bg-primary hover:bg-primary/90"
            )}
          >
            {saving ? (
              <Loader2 className="inline h-3 w-3 animate-spin" />
            ) : qty === 0 ? (
              <>
                <CornerDownLeft className="h-3 w-3" />
                Release
              </>
            ) : (
              <>
                <Check className="h-3 w-3" />
                Apply
              </>
            )}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={releaseOpen}
        title="Release this sub-task back to the pool?"
        description={`All ${assignment.qty_assigned} designs will return to the pool for other designers to claim.`}
        variant="danger"
        confirmLabel={saving ? "Releasing…" : "Release to Pool"}
        onConfirm={() => void confirmRelease()}
        onCancel={() => setReleaseOpen(false)}
      />
    </div>
  );
}
