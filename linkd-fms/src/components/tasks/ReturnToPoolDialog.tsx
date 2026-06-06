import { useState } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui";
import {
  AlertTriangle,
  RotateCcw,
  Split,
  UserPlus,
} from "lucide-react";
import { useTaskMutations } from "@/hooks/useTaskMutations";
import { useProfiles } from "@/hooks/useProfiles";
import type { TaskWithRelations } from "@/types/database";
import { cn } from "@/lib/utils";

type PoolMode = "reset" | "split-pool" | "split-assign";

interface ReturnToPoolDialogProps {
  task: TaskWithRelations;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function ReturnToPoolDialog({
  task,
  open,
  onOpenChange,
  onDone,
}: ReturnToPoolDialogProps) {
  const { returnToPool, isPending } = useTaskMutations();
  const { profiles: designers } = useProfiles({ roles: ["designer"] });
  const [mode, setMode] = useState<PoolMode>("reset");
  const [assignToId, setAssignToId] = useState("");
  const busy = isPending("returnToPool", task.id);

  const qtyDone = task.qty_completed ?? 0;
  const qtyRemaining = task.qty - qtyDone;
  const designerName = task.assignee?.full_name ?? "The designer";
  const others = designers.filter((d) => d.id !== task.assigned_to);

  async function handleConfirm() {
    if (mode === "split-assign" && !assignToId) {
      toast.error("Pick a designer for the remaining designs");
      return;
    }

    const { error } = await returnToPool(task.id, {
      mode,
      ...(mode === "split-assign" ? { assignToDesignerId: assignToId } : {}),
    });
    if (error) {
      toast.error(error);
      return;
    }

    const msgs: Record<PoolMode, string> = {
      reset: "Task reset and sent to pool",
      "split-pool": `${designerName}'s ${qtyDone} designs preserved — ${qtyRemaining} sent to pool`,
      "split-assign": `${designerName}'s ${qtyDone} designs preserved — ${qtyRemaining} assigned`,
    };
    toast.success(msgs[mode]);
    onOpenChange(false);
    onDone();
  }

  const OPTIONS: {
    key: PoolMode;
    icon: typeof RotateCcw;
    label: string;
    desc: string;
  }[] = [
    {
      key: "reset",
      icon: RotateCcw,
      label: "Reset & Send to Pool",
      desc: `Deletes all ${qtyDone} completed designs. Task starts fresh from 0/${task.qty} in the pool.`,
    },
    {
      key: "split-pool",
      icon: Split,
      label: "Keep Progress & Pool Remaining",
      desc: `${designerName} keeps ${qtyDone} designs as a sub-task. Remaining ${qtyRemaining} go to open pool for anyone to claim.`,
    },
    {
      key: "split-assign",
      icon: UserPlus,
      label: "Keep Progress & Assign Remaining",
      desc: `${designerName} keeps ${qtyDone} designs as a sub-task. Assign remaining ${qtyRemaining} to a specific designer.`,
    },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md p-0" srTitle="Return to pool">
        <div className="border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Return Task to Pool
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {designerName} has completed{" "}
            <span className="font-semibold text-foreground">
              {qtyDone}/{task.qty}
            </span>{" "}
            designs. How would you like to proceed?
          </p>
        </div>

        <div className="space-y-2 px-5 py-4">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = mode === opt.key;
            const isDanger = opt.key === "reset";
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setMode(opt.key)}
                disabled={busy}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition-all",
                  selected
                    ? isDanger
                      ? "border-destructive/50 bg-destructive/5 ring-1 ring-destructive/30"
                      : "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
                    : "border-border bg-card hover:bg-secondary/30"
                )}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                      selected
                        ? isDanger
                          ? "border-destructive bg-destructive"
                          : "border-primary bg-primary"
                        : "border-muted-foreground/40 bg-transparent"
                    )}
                  >
                    {selected && (
                      <div className="h-1.5 w-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Icon
                        className={cn(
                          "h-3.5 w-3.5",
                          selected
                            ? isDanger
                              ? "text-destructive"
                              : "text-primary"
                            : "text-muted-foreground"
                        )}
                      />
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          selected ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {opt.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      {opt.desc}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}

          {mode === "split-assign" && (
            <div className="ml-7 mt-1 space-y-1.5">
              <Label className="text-xs">
                Assign remaining {qtyRemaining} to
              </Label>
              <select
                value={assignToId}
                onChange={(e) => setAssignToId(e.target.value)}
                disabled={busy}
                className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">Select designer…</option>
                {others.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <LoadingButton
            loading={busy}
            onClick={() => void handleConfirm()}
            disabled={mode === "split-assign" && !assignToId}
            className={cn(
              "gap-1.5",
              mode === "reset" &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            )}
          >
            {mode === "reset"
              ? "Reset & Send to Pool"
              : mode === "split-pool"
                ? "Keep & Pool Remaining"
                : "Keep & Assign"}
          </LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
