import { useState, useMemo } from "react";
import { Loader2, Plus, Trash2, Scissors } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge, toast } from "@/components/ui";
import { Combobox } from "@/components/ui/Combobox";
import { useProfiles } from "@/hooks/useProfiles";
import { useTaskAssignments } from "@/hooks/useTaskAssignments";
import { useFabrics } from "@/hooks/useFabrics";
import { useConceptCategories } from "@/hooks/useConceptCategories";
import { cn } from "@/lib/utils";

interface SplitTaskDialogProps {
  task: {
    id: string;
    task_code: string;
    concept: string;
    qty: number;
    qty_remaining?: number | null;
    client?: { party_name: string } | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSplit: () => void;
}

interface SplitRow {
  key: number;
  designer_id: string;
  qty_assigned: number;
  planned_deadline: string;
  design_type: string;
  fabric: string;
}

let rowKey = 0;
const emptyRow = (): SplitRow => ({
  key: ++rowKey,
  designer_id: "",
  qty_assigned: 1,
  planned_deadline: "",
  design_type: "",
  fabric: "",
});

export function SplitTaskDialog({
  task,
  open,
  onOpenChange,
  onSplit,
}: SplitTaskDialogProps) {
  const { profiles } = useProfiles({ roles: ["designer"] });
  const { splitTask } = useTaskAssignments(task.id);
  const { fabrics } = useFabrics();
  const { categories: conceptCategories } = useConceptCategories();
  const [rows, setRows] = useState<SplitRow[]>([emptyRow(), emptyRow()]);
  const [saving, setSaving] = useState(false);

  const designers = useMemo(
    () => profiles.filter((p) => p.is_active !== false),
    [profiles]
  );

  const fabricOptions = useMemo(
    () => fabrics.map((f) => ({ value: f.name, label: f.name })),
    [fabrics]
  );
  const designTypeOptions = useMemo(
    () => conceptCategories.map((c) => ({ value: c.name, label: c.name })),
    [conceptCategories]
  );

  const totalQty = task.qty;
  const assigned = rows.reduce((s, r) => s + (r.qty_assigned || 0), 0);
  const remaining = totalQty - assigned;

  const duplicateDesigners = useMemo(() => {
    const ids = rows.map((r) => r.designer_id).filter(Boolean);
    return new Set(ids.filter((id, i) => ids.indexOf(id) !== i));
  }, [rows]);

  const isValid =
    rows.length >= 2 &&
    rows.every(
      (r) =>
        r.designer_id &&
        r.qty_assigned >= 1 &&
        r.design_type.trim() &&
        r.fabric.trim()
    ) &&
    assigned <= totalQty &&
    duplicateDesigners.size === 0;

  function updateRow(key: number, patch: Partial<SplitRow>) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r))
    );
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  async function handleSubmit() {
    if (!isValid) return;
    setSaving(true);
    const splits = rows.map((r) => ({
      designerId: r.designer_id,
      qty: r.qty_assigned,
      deadline: r.planned_deadline || undefined,
      designType: r.design_type.trim(),
      fabric: r.fabric.trim(),
    }));
    const { error } = await splitTask(task.id, splits);
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`Task split among ${rows.length} designers`);
    onOpenChange(false);
    onSplit();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100%-2rem)] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Scissors className="h-4 w-4 text-primary" />
            Split Task
            <Badge className="ml-1 text-[10px]">{task.task_code}</Badge>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Divide <span className="font-semibold tabular-nums text-foreground">{totalQty}</span>{" "}
            designs among designers — each gets their own Design Type + Fabric
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              Assigned:{" "}
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  assigned > totalQty
                    ? "text-destructive"
                    : "text-foreground"
                )}
              >
                {assigned}
              </span>
              <span className="text-muted-foreground"> / {totalQty}</span>
            </span>
            {remaining > 0 && (
              <span className="text-muted-foreground">
                <span className="tabular-nums font-medium text-warning">
                  {remaining}
                </span>{" "}
                unassigned
              </span>
            )}
            {remaining === 0 && assigned === totalQty && (
              <span className="font-medium text-success">Fully assigned</span>
            )}
          </div>

          {rows.map((row, idx) => (
            <div
              key={row.key}
              className="rounded-lg border border-border bg-secondary/10 p-3"
            >
              {/* Row 1: Designer + Qty + Deadline + Delete */}
              <div className="grid grid-cols-[1fr_70px_120px_32px] items-end gap-2">
                <div>
                  {idx === 0 && (
                    <Label className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Designer <span className="text-destructive">*</span>
                    </Label>
                  )}
                  <select
                    value={row.designer_id}
                    onChange={(e) =>
                      updateRow(row.key, { designer_id: e.target.value })
                    }
                    className={cn(
                      "h-9 w-full rounded-md border bg-card px-2 text-sm text-foreground outline-none transition-colors",
                      "focus:border-primary focus:ring-1 focus:ring-ring",
                      duplicateDesigners.has(row.designer_id) &&
                        row.designer_id &&
                        "border-destructive"
                    )}
                  >
                    <option value="">Select...</option>
                    {designers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  {idx === 0 && (
                    <Label className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Qty <span className="text-destructive">*</span>
                    </Label>
                  )}
                  <Input
                    type="number"
                    min={1}
                    max={totalQty}
                    value={row.qty_assigned}
                    onChange={(e) =>
                      updateRow(row.key, {
                        qty_assigned: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    className="h-9 tabular-nums"
                  />
                </div>
                <div>
                  {idx === 0 && (
                    <Label className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Deadline
                    </Label>
                  )}
                  <Input
                    type="date"
                    value={row.planned_deadline}
                    onChange={(e) =>
                      updateRow(row.key, { planned_deadline: e.target.value })
                    }
                    onClick={(e) => e.currentTarget.showPicker?.()}
                    className="h-9 cursor-pointer text-xs"
                  />
                </div>
                <button
                  type="button"
                  disabled={rows.length <= 2}
                  onClick={() => removeRow(row.key)}
                  className="inline-flex h-9 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                  aria-label="Remove row"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Row 2: Design Type + Fabric */}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <Label className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Design Type <span className="text-destructive">*</span>
                  </Label>
                  <Combobox
                    value={row.design_type}
                    onChange={(v) => updateRow(row.key, { design_type: v })}
                    options={designTypeOptions}
                    placeholder="Pick type"
                    searchPlaceholder="Search…"
                    clearable
                  />
                </div>
                <div>
                  <Label className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Fabric <span className="text-destructive">*</span>
                  </Label>
                  <Combobox
                    value={row.fabric}
                    onChange={(v) => updateRow(row.key, { fabric: v })}
                    options={fabricOptions}
                    placeholder="Pick fabric"
                    searchPlaceholder="Search…"
                    clearable
                  />
                </div>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-1 gap-1.5 text-xs"
            onClick={() => setRows((prev) => [...prev, emptyRow()])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Designer
          </Button>
        </div>

        <DialogFooter className="border-t border-border px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!isValid || saving}
            onClick={() => void handleSubmit()}
            className="gap-1.5"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Split & Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
