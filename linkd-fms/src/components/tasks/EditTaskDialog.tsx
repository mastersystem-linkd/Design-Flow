import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { toast } from "@/components/ui/Toaster";
import { useClients } from "@/hooks/useClients";
import { useProfiles } from "@/hooks/useProfiles";
import { useFabrics } from "@/hooks/useFabrics";
import { useConceptCategories } from "@/hooks/useConceptCategories";
import { ASSIGNED_BY_OPTIONS } from "@/lib/constants";
import type { TaskWithRelations, TaskPriority } from "@/types/database";
import type { UpdateTaskFields } from "@/hooks/useTaskMutations";

const WHATSAPP_GROUPS = [
  "New Creation",
  "Job Work Concept",
  "Linkd Design",
  "LD-Garments Sublimation Prints",
] as const;

interface Props {
  task: TaskWithRelations;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (
    taskId: string,
    fields: UpdateTaskFields
  ) => Promise<{ data: unknown; error: string | null }>;
  onSaved: () => void;
}

export function EditTaskDialog({
  task,
  open,
  onOpenChange,
  onSave,
  onSaved,
}: Props) {
  const { clients } = useClients();
  const { profiles: designers } = useProfiles({ roles: ["designer"] });
  const { fabrics } = useFabrics();
  const { categories: concepts } = useConceptCategories();

  // ── Form state (initialize from task) ───────────────────────────────
  const [concept, setConcept] = useState(task.concept ?? "");
  const [description, setDescription] = useState(task.description ?? "");
  const [clientId, setClientId] = useState(task.client_id ?? "");
  const [fabric, setFabric] = useState(task.fabric ?? "");
  const [qty, setQty] = useState(String(task.qty ?? ""));
  const [mtr, setMtr] = useState(task.mtr != null ? String(task.mtr) : "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority ?? "normal");
  const [deadline, setDeadline] = useState(task.planned_deadline ?? "");
  const [dueTime, setDueTime] = useState(task.due_time ?? "");
  const [whatsappGroup, setWhatsappGroup] = useState(task.whatsapp_group ?? "");
  const [assignedTo, setAssignedTo] = useState(task.assigned_to ?? "");
  const [assignedBy, setAssignedBy] = useState(task.assigned_by ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [conceptStartDate, setConceptStartDate] = useState(
    task.concept_start_date ?? ""
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync form when a different task is opened
  useEffect(() => {
    if (!open) return;
    setConcept(task.concept ?? "");
    setDescription(task.description ?? "");
    setClientId(task.client_id ?? "");
    setFabric(task.fabric ?? "");
    setQty(String(task.qty ?? ""));
    setMtr(task.mtr != null ? String(task.mtr) : "");
    setPriority(task.priority ?? "normal");
    setDeadline(task.planned_deadline ?? "");
    setDueTime(task.due_time ?? "");
    setWhatsappGroup(task.whatsapp_group ?? "");
    setAssignedTo(task.assigned_to ?? "");
    setAssignedBy(task.assigned_by ?? "");
    setNotes(task.notes ?? "");
    setConceptStartDate(task.concept_start_date ?? "");
    setError(null);
  }, [task, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!concept.trim()) {
      setError("Concept is required.");
      return;
    }
    const qtyNum = Number(qty);
    if (!Number.isFinite(qtyNum) || qtyNum < 1) {
      setError("Quantity must be at least 1.");
      return;
    }

    setSaving(true);
    setError(null);

    const mtrNum = mtr ? Number(mtr) : null;
    const fields: UpdateTaskFields = {
      concept: concept.trim(),
      description: description.trim() || null,
      client_id: clientId || undefined,
      fabric: fabric || undefined,
      qty: qtyNum,
      mtr: Number.isFinite(mtrNum as number) ? (mtrNum as number) : null,
      priority,
      planned_deadline: deadline || null,
      due_time: dueTime || null,
      whatsapp_group: whatsappGroup || null,
      assigned_to: assignedTo || null,
      assigned_by: assignedBy.trim() || null,
      notes: notes.trim() || null,
      concept_start_date: conceptStartDate || null,
    };

    const { error: saveErr } = await onSave(task.id, fields);
    setSaving(false);

    if (saveErr) {
      setError(saveErr);
      return;
    }

    toast.success("Task updated");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Edit Task{" "}
            <span className="font-mono text-xs text-primary">
              {task.task_code}
            </span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 px-6 py-4 sm:grid-cols-2">
            {/* Concept */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="edit-concept">
                Concept <span className="text-destructive">*</span>
              </Label>
              <select
                id="edit-concept"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                disabled={saving}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Pick —</option>
                {concepts.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="edit-desc">Description</Label>
              <textarea
                id="edit-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                disabled={saving}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            </div>

            {/* Client */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-client">Client</Label>
              <select
                id="edit-client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                disabled={saving}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Choose —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.party_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Fabric */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-fabric">Fabric</Label>
              <select
                id="edit-fabric"
                value={fabric}
                onChange={(e) => setFabric(e.target.value)}
                disabled={saving}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Choose —</option>
                {fabrics.map((f) => (
                  <option key={f.id} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Qty + Mtr */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-qty">
                Quantity <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-qty"
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-mtr">Meters (Mtr)</Label>
              <Input
                id="edit-mtr"
                type="number"
                min={0}
                step={0.5}
                value={mtr}
                onChange={(e) => setMtr(e.target.value)}
                disabled={saving}
              />
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-priority">Priority</Label>
              <select
                id="edit-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                disabled={saving}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            {/* WhatsApp Group */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-wa">WhatsApp Group</Label>
              <select
                id="edit-wa"
                value={whatsappGroup}
                onChange={(e) => setWhatsappGroup(e.target.value)}
                disabled={saving}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— None —</option>
                {WHATSAPP_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            {/* Deadline + Due Time */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-deadline">Planned Deadline</Label>
              <Input
                id="edit-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-due-time">Due Time</Label>
              <Input
                id="edit-due-time"
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                disabled={saving}
              />
            </div>

            {/* Concept Start Date */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-start-date">Concept Start Date</Label>
              <Input
                id="edit-start-date"
                type="date"
                value={conceptStartDate}
                onChange={(e) => setConceptStartDate(e.target.value)}
                disabled={saving}
              />
            </div>

            {/* Assigned To */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-assigned-to">Assigned To</Label>
              <select
                id="edit-assigned-to"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                disabled={saving}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Unassigned —</option>
                {designers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Assigned By */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-assigned-by">Assigned By</Label>
              <select
                id="edit-assigned-by"
                value={assignedBy}
                onChange={(e) => setAssignedBy(e.target.value)}
                disabled={saving}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Select —</option>
                {ASSIGNED_BY_OPTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="edit-notes">Notes</Label>
              <textarea
                id="edit-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                disabled={saving}
                placeholder="Running notes…"
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="sm:col-span-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <LoadingButton
              type="submit"
              loading={saving}
              loadingText="Saving…"
            >
              Save Changes
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
