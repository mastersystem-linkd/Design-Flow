import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { Combobox } from "@/components/ui/Combobox";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/Toaster";
import { useFabrics } from "@/hooks/useFabrics";
import { useConceptCategories } from "@/hooks/useConceptCategories";
import { useTaskMutations } from "@/hooks/useTaskMutations";
import { isFullKittingBlocking } from "@/lib/taskHelpers";
import type { TaskWithRelations } from "@/types/database";

// ============================================================================
// PostDoneModal — capture completion fabric + mtr to close a 'done' task
// ----------------------------------------------------------------------------
// Opens automatically right after a task is marked done, and also from the
// Done tab's per-row "Complete" button. Moves the task 'done' → 'completed'.
// Fabric is required; mtr is optional. "Skip for Now" leaves it in 'done' so
// the details can be added later (by the designer OR a coordinator).
// ============================================================================

interface PostDoneModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The task that was just marked done (or picked from the Done tab). */
  task: TaskWithRelations | null;
  /** Fired after a successful completion so the parent can refetch. */
  onCompleted: () => void;
}

export function PostDoneModal({
  open,
  onOpenChange,
  task,
  onCompleted,
}: PostDoneModalProps) {
  const { fabrics } = useFabrics();
  const { categories: conceptCategories } = useConceptCategories();
  const { completeTask } = useTaskMutations();

  const [fabric, setFabric] = useState("");
  const [designType, setDesignType] = useState("");
  const [samplingRequired, setSamplingRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && task) {
      setFabric(task.fabric?.trim() ? task.fabric : "");
      setDesignType(task.concept?.trim() ? task.concept : "");
      setSamplingRequired(task.sampling_required ?? false);
    }
  }, [open, task]);

  async function handleComplete() {
    if (!task) return;
    if (isFullKittingBlocking(task)) {
      toast.error(
        "Full Knitting details are required before completing. Ask the coordinator to add them."
      );
      return;
    }
    if (!fabric.trim()) {
      toast.error("Fabric is required to complete this task.");
      return;
    }
    if (!designType.trim()) {
      toast.error("Design type is required to complete this task.");
      return;
    }
    // completeTask persists `concept` (design type) atomically with the
    // status change — no separate pre-update needed.
    setSubmitting(true);
    const { error } = await completeTask(task.id, {
      fabric,
      designType: designType.trim(),
      samplingRequired,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Task fully completed! 🎉");
    try {
      void confetti({ particleCount: 80, spread: 70, origin: { y: 0.7 } });
    } catch {
      // decorative only
    }
    onOpenChange(false);
    onCompleted();
  }

  function handleSkip() {
    onOpenChange(false);
    toast.info("Task saved as done. You can add completion details later.");
  }

  const partyOrCode =
    task?.client?.party_name || task?.task_code || "this task";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" srTitle="Add completion details">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            Complete Task
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          {/* Task context */}
          <div className="rounded-xl bg-secondary/30 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Task
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
              {partyOrCode}
            </p>
            {task?.task_code && task?.client?.party_name && (
              <p className="truncate text-xs text-muted-foreground">
                {task.task_code}
              </p>
            )}
          </div>

          {/* Completion form */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Completion Details
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="completion-design-type">
                Design Type <span className="text-destructive">*</span>
              </Label>
              <Combobox
                id="completion-design-type"
                value={designType}
                onChange={setDesignType}
                options={conceptCategories.map((c) => ({ value: c.name, label: c.name }))}
                placeholder="Pick a design type"
                searchPlaceholder="Search type…"
                disabled={submitting}
                clearable
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="completion-fabric">
                Fabric <span className="text-destructive">*</span>
              </Label>
              <Combobox
                id="completion-fabric"
                value={fabric}
                onChange={setFabric}
                options={fabrics.map((f) => ({ value: f.name, label: f.name }))}
                placeholder="Choose fabric"
                searchPlaceholder="Search fabric…"
                disabled={submitting}
                clearable
              />
            </div>

            {/* Sampling Required toggle — optional, defaults OFF */}
            <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-secondary/30 p-3">
              <div className="flex-1 pr-3">
                <p className="text-sm font-medium text-foreground">Sampling Required?</p>
                <p className="text-xs text-muted-foreground">
                  Turn on if this design needs sampling. It&apos;ll be added to the Sampling queue.
                </p>
              </div>
              <Switch
                checked={samplingRequired}
                onCheckedChange={setSamplingRequired}
                disabled={submitting}
                aria-label="Sampling required"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-1">
            <LoadingButton
              type="button"
              onClick={handleComplete}
              loading={submitting}
              loadingText="Completing…"
              disabled={!fabric.trim() || !designType.trim()}
              className="w-full"
            >
              Save &amp; Complete Task
            </LoadingButton>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={handleSkip}
              disabled={submitting}
            >
              Skip for Now
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Design type and fabric are required to complete. You can skip for now
            and add them later — the task stays in Done until then.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
