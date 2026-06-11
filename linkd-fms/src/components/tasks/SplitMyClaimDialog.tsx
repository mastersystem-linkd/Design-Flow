import { useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { toast } from "@/components/ui";
import { Minus, Plus, Split, Users } from "lucide-react";
import { useTaskAssignments } from "@/hooks/useTaskAssignments";
import type { TaskWithRelations } from "@/types/database";

interface SplitMyClaimDialogProps {
  task: TaskWithRelations;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires after a successful split so the parent can refresh. */
  onDone: () => void;
}

/**
 * Designer-facing "split my claim" — a designer who took the WHOLE task as an
 * individual decides to keep only part of it and release the rest to the pool
 * for other designers. Wraps `reduceMyClaim` (see useTaskAssignments): the kept
 * qty becomes their portion (a sub-task they keep working on); the remainder
 * surfaces in the pool and is claimable via the normal claimPortion flow.
 */
export function SplitMyClaimDialog({
  task,
  open,
  onOpenChange,
  onDone,
}: SplitMyClaimDialogProps) {
  const { reduceMyClaim } = useTaskAssignments(task.id);

  const done = task.qty_completed ?? 0;
  const min = Math.max(1, done);
  const max = task.qty - 1;
  // Default to a roughly even split, clamped into [min, max].
  const [keep, setKeep] = useState<number>(() =>
    Math.min(max, Math.max(min, Math.ceil(task.qty / 2)))
  );
  const [saving, setSaving] = useState(false);

  const released = Math.max(0, task.qty - keep);
  const valid = useMemo(
    () => Number.isFinite(keep) && keep >= min && keep <= max,
    [keep, min, max]
  );

  function clampSet(v: number) {
    if (!Number.isFinite(v)) return;
    setKeep(Math.min(max, Math.max(min, Math.floor(v))));
  }

  async function handleSubmit() {
    if (!valid) {
      toast.error(`Keep between ${min} and ${max} designs.`);
      return;
    }
    setSaving(true);
    const { error } = await reduceMyClaim(task.id, keep);
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`Kept ${keep} · released ${released} to the pool`);
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0" srTitle="Split this task">
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-primary/15 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-card px-5 py-3.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm shadow-primary/20">
            <Split className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Split this task</h2>
            <p className="text-[11px] text-muted-foreground">
              Keep some designs, send the rest back to the pool for other designers.
            </p>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Current claim summary */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">You claimed</span>
            <span className="font-semibold tabular-nums text-foreground">
              {task.qty} designs{done > 0 ? ` · ${done} completed` : ""}
            </span>
          </div>

          {/* Keep stepper */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              How many designs do you want to keep?
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => clampSet(keep - 1)}
                disabled={saving || keep <= min}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                aria-label="Decrease"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                min={min}
                max={max}
                value={keep}
                onChange={(e) => clampSet(Number(e.target.value))}
                disabled={saving}
                className="h-9 w-20 rounded-lg border border-input bg-card text-center text-sm font-semibold tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => clampSet(keep + 1)}
                disabled={saving || keep >= max}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                aria-label="Increase"
              >
                <Plus className="h-4 w-4" />
              </button>
              <span className="ml-auto text-[11px] text-muted-foreground">
                of {task.qty}
              </span>
            </div>
            {done > 0 && (
              <p className="text-[10px] text-muted-foreground">
                You can't keep fewer than the {done} you've already completed.
              </p>
            )}
          </div>

          {/* Live split preview */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">You keep</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{keep}</p>
            </div>
            <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-center">
              <p className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-warning">
                <Users className="h-3 w-3" /> To pool
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{released}</p>
            </div>
          </div>

          <p className="rounded-md border border-border bg-secondary/20 px-3 py-2 text-[11px] text-muted-foreground">
            You'll keep working on your <span className="font-medium text-foreground">{keep}</span>{" "}
            (complete {keep} or more). The remaining{" "}
            <span className="font-medium text-foreground">{released}</span> go to the open pool for
            another designer to claim.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <LoadingButton
            type="button"
            loading={saving}
            loadingText="Splitting…"
            onClick={() => void handleSubmit()}
            disabled={!valid}
            className="gap-2 px-5"
          >
            <Split className="h-3.5 w-3.5" />
            Split &amp; Release {released}
          </LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
