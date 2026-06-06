import { useEffect, useRef, useState } from "react";
import {
  Building2,
  MessageSquare,
  Sparkles,
  UserCheck,
  ClipboardList,
  Paperclip,
  Upload,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { toast, Combobox } from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useProfiles } from "@/hooks/useProfiles";
import { useAuth } from "@/hooks/useAuth";
import { useConceptCategories } from "@/hooks/useConceptCategories";
import { useAssignedByOptions, ASSIGNED_BY_OTHER } from "@/hooks/useAssignedByOptions";
import { WHATSAPP_GROUPS } from "@/lib/whatsappGroups";
import { WhatsAppIcon } from "@/components/ui/WhatsAppIcon";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { TaskWithRelations, TaskPriority, BriefType, FileRecord } from "@/types/database";
import type { UpdateTaskFields } from "@/hooks/useTaskMutations";

const REF_FILE_MAX_BYTES = 50 * 1024 * 1024;
const REF_FILE_BUCKET = "design-files";

// "Assigned By" roster is admin-managed (Settings → Assigned By) via
// useAssignedByOptions(); ASSIGNED_BY_OTHER is the "Other" free-text sentinel.

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
  const { user } = useAuth();
  const { clients, jobWorkClients } = useClients();
  const { profiles: designers } = useProfiles({ roles: ["designer"] });
  const { categories: concepts } = useConceptCategories();
  const { names: assignedByNames } = useAssignedByOptions();

  const [briefType, setBriefType] = useState<BriefType>("ld");
  const [concept, setConcept] = useState("");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState("");
  const [qty, setQty] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [whatsappGroup, setWhatsappGroup] = useState("");
  const [whatsappReceivedDate, setWhatsappReceivedDate] = useState("");
  const [whatsappReceivedTime, setWhatsappReceivedTime] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [assignedBy, setAssignedBy] = useState("");
  const [fabric, setFabric] = useState("");
  const [notes, setNotes] = useState("");

  const [existingFiles, setExistingFiles] = useState<FileRecord[]>([]);
  const [removedFileIds, setRemovedFileIds] = useState<Set<string>>(new Set());
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const newFileInputRef = useRef<HTMLInputElement | null>(null);

  const visibleExistingFiles = existingFiles.filter((f) => !removedFileIds.has(f.id));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setExistingFiles(task.files ?? []);
    setRemovedFileIds(new Set());
    setNewFiles([]);
    if (newFileInputRef.current) newFileInputRef.current.value = "";
    setBriefType((task.brief_type as BriefType) ?? "ld");
    setConcept(task.concept ?? "");
    setDescription(task.description ?? "");
    setClientId(task.client_id ?? "");
    setQty(String(task.qty ?? ""));
    setPriority(task.priority ?? "normal");
    setWhatsappGroup(task.whatsapp_group ?? "");
    setWhatsappReceivedDate(task.whatsapp_received_date ?? "");
    setWhatsappReceivedTime(task.whatsapp_received_time ?? "");
    setAssignedTo(task.assigned_to ?? "");
    // Prefer the claim-time fabric; fall back to the completion fabric so a
    // value entered at completion (stored in completion_fabric) still pre-fills.
    setFabric(task.fabric || task.completion_fabric || "");
    setAssignedBy(task.assigned_by ?? "");
    setNotes(task.notes ?? "");
    setError(null);
  }, [task, open]);

  function onNewFilesPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    const accepted: File[] = [];
    for (const f of picked) {
      if (f.size > REF_FILE_MAX_BYTES) {
        toast.error(`"${f.name}" exceeds 50 MB limit.`);
      } else {
        accepted.push(f);
      }
    }
    if (accepted.length) setNewFiles((prev) => [...prev, ...accepted]);
    if (newFileInputRef.current) newFileInputRef.current.value = "";
  }

  function removeExistingFile(id: string) {
    setRemovedFileIds((prev) => new Set(prev).add(id));
  }

  function removeNewFile(index: number) {
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function openExistingFile(storagePath: string | null | undefined) {
    if (!storagePath) { toast.error("File path missing."); return; }
    const { data, error: urlErr } = await supabase.storage
      .from(REF_FILE_BUCKET)
      .createSignedUrl(storagePath, 60 * 5);
    if (urlErr || !data) { toast.error("Could not open file."); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qtyNum = Number(qty);
    if (!Number.isFinite(qtyNum) || qtyNum < 0) {
      setError("Quantity cannot be negative.");
      return;
    }

    setSaving(true);
    setError(null);

    const fields: UpdateTaskFields = {
      brief_type: briefType,
      concept: concept.trim(),
      description: description.trim() || null,
      client_id: briefType === "job_work" ? (clientId || null) : null,
      qty: qtyNum,
      priority,
      whatsapp_group: whatsappGroup || null,
      whatsapp_received_date: whatsappReceivedDate || null,
      whatsapp_received_time: whatsappReceivedTime || null,
      assigned_to: assignedTo || null,
      assigned_by: assignedBy.trim() || null,
      fabric: fabric.trim() || "",
      // If the task was already completed (fabric captured in completion_fabric),
      // keep that column in sync so the completion view reflects the edit too.
      ...(task.completion_fabric != null
        ? { completion_fabric: fabric.trim() || null }
        : {}),
      notes: notes.trim() || null,
    };

    const { error: saveErr } = await onSave(task.id, fields);

    if (saveErr) {
      setSaving(false);
      setError(saveErr);
      return;
    }

    // Delete removed files
    const toDelete = existingFiles.filter((f) => removedFileIds.has(f.id));
    for (const f of toDelete) {
      if (f.storage_url) {
        await supabase.storage.from(REF_FILE_BUCKET).remove([f.storage_url]);
      }
      await supabase.from("files").delete().eq("id", f.id);
    }

    // Upload new files
    if (newFiles.length > 0 && user) {
      let failed = 0;
      for (const f of newFiles) {
        const ext = f.name.split(".").pop() ?? "bin";
        const path = `${user.id}/tasks/${task.id}/brief-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
        const { error: upErr } = await supabase.storage.from(REF_FILE_BUCKET).upload(path, f);
        if (upErr) { failed++; continue; }
        const { error: dbErr } = await supabase.from("files").insert({
          task_id: task.id,
          storage_url: path,
          file_name: f.name,
          file_size: f.size,
          uploaded_by: user.id,
        });
        if (dbErr) {
          failed++;
          void supabase.storage.from(REF_FILE_BUCKET).remove([path]);
        }
      }
      if (failed > 0) {
        toast.error(`${failed} file${failed !== 1 ? "s" : ""} couldn't be attached.`);
      }
    }

    setSaving(false);
    toast.success("Task updated");
    onOpenChange(false);
    onSaved();
  }

  const inRoster = (v: string) => assignedByNames.includes(v);
  // `otherMode` is true ONLY when the user explicitly picks "Other" to type a
  // brand-new name — never auto-entered for an existing stored value.
  const [otherMode, setOtherMode] = useState(false);
  useEffect(() => {
    if (open) setOtherMode(false);
  }, [open, task]);

  // A stored name that isn't part of the managed roster (e.g. a free-text name
  // entered on the brief) is surfaced as its own selectable option, so it shows
  // directly instead of collapsing into the confusing "Other + textbox" state.
  const extraName = assignedBy && !inRoster(assignedBy) ? assignedBy : "";

  const dropdownValue = otherMode ? ASSIGNED_BY_OTHER : assignedBy;

  function handleAssignedBySelect(next: string) {
    if (next === ASSIGNED_BY_OTHER) {
      setOtherMode(true);
      setAssignedBy("");
    } else {
      setOtherMode(false);
      setAssignedBy(next);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[700px] max-h-[90vh] overflow-y-auto p-0"
        srTitle="Edit Task"
      >
        <div className="px-4 py-3 sm:px-5 sm:py-4 space-y-2">
          {/* Header */}
          <div className="relative overflow-hidden rounded-lg border border-primary/15 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-card px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm shadow-primary/20">
                <ClipboardList className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <h1 className="font-sans text-sm font-semibold tracking-tight text-foreground sm:text-base">
                  Edit Task
                </h1>
                <p className="text-[10px] text-muted-foreground">
                  Modify the brief details below.
                </p>
              </div>
              <Badge className="ml-auto shrink-0 border border-primary/20 bg-primary/10 font-mono text-[10px] font-medium text-primary">
                {task.task_code}
              </Badge>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-2" noValidate>
            {/* Party Name */}
            <Section icon={Building2} title="Party Name">
              <div className="flex w-full rounded-md border border-border bg-card p-0.5">
                <ToggleChoice
                  active={briefType === "ld"}
                  onClick={() => { setBriefType("ld"); setClientId(""); }}
                  disabled={saving}
                >
                  LD<span className="ml-1 text-[10px] font-normal opacity-70">· internal</span>
                </ToggleChoice>
                <ToggleChoice
                  active={briefType === "job_work"}
                  onClick={() => setBriefType("job_work")}
                  disabled={saving}
                >
                  Job Work<span className="ml-1 text-[10px] font-normal opacity-70">· external</span>
                </ToggleChoice>
              </div>
              {briefType === "job_work" && (
                <div className="space-y-1">
                  <Label htmlFor="edit-client">Job Work party</Label>
                  <Combobox
                    id="edit-client"
                    value={clientId}
                    onChange={setClientId}
                    options={jobWorkClients.map((c) => ({ value: c.id, label: c.party_name }))}
                    placeholder="Choose Job Work party"
                    disabled={saving}
                    clearable
                  />
                </div>
              )}
            </Section>

            {/* Source & Message */}
            <Section icon={MessageSquare} title="Source & Message">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="edit-wa">Group</Label>
                  <Combobox
                    id="edit-wa"
                    value={whatsappGroup}
                    onChange={setWhatsappGroup}
                    options={WHATSAPP_GROUPS.map((g) => ({
                      value: g.name,
                      label: g.name,
                      icon: g.isWhatsApp ? <WhatsAppIcon /> : undefined,
                    }))}
                    placeholder="Choose a group"
                    disabled={saving}
                    clearable
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-ref-files">Reference Files</Label>
                  <button
                    type="button"
                    onClick={() => newFileInputRef.current?.click()}
                    disabled={saving}
                    className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" />
                    Add files
                  </button>
                  <input
                    ref={newFileInputRef}
                    id="edit-ref-files"
                    type="file"
                    multiple
                    accept="*/*"
                    onChange={onNewFilesPick}
                    className="hidden"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Optional · any file type · 50 MB each
                  </p>
                </div>
              </div>
              {/* Existing + new file chips */}
              {(visibleExistingFiles.length > 0 || newFiles.length > 0) && (
                <ul className="space-y-1">
                  {visibleExistingFiles.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <button
                        type="button"
                        onClick={() => void openExistingFile(f.storage_url)}
                        className="min-w-0 flex-1 truncate text-left text-foreground hover:text-primary hover:underline"
                      >
                        {f.file_name}
                      </button>
                      {f.file_size != null && (
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {(f.file_size / 1024 / 1024).toFixed(1)} MB
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeExistingFile(f.id)}
                        disabled={saving}
                        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                        aria-label={`Remove ${f.file_name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                  {newFiles.map((f, i) => (
                    <li
                      key={`new-${f.name}-${i}`}
                      className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs"
                    >
                      <Upload className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {f.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {(f.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                      <button
                        type="button"
                        onClick={() => removeNewFile(i)}
                        disabled={saving}
                        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                        aria-label={`Remove ${f.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="edit-wa-date">Received Date</Label>
                  <Input
                    id="edit-wa-date"
                    type="date"
                    value={whatsappReceivedDate}
                    onChange={(e) => setWhatsappReceivedDate(e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-wa-time">Received Time</Label>
                  <Input
                    id="edit-wa-time"
                    type="time"
                    value={whatsappReceivedTime}
                    onChange={(e) => setWhatsappReceivedTime(e.target.value)}
                    disabled={saving}
                  />
                </div>
              </div>
            </Section>

            {/* Design Brief */}
            <Section icon={Sparkles} title="Design Brief">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <div className="sm:col-span-2 space-y-1">
                  <Label htmlFor="edit-concept">
                    Design Type
                  </Label>
                  <Combobox
                    id="edit-concept"
                    value={concept}
                    onChange={setConcept}
                    options={concepts.map((c) => ({ value: c.name, label: c.name }))}
                    placeholder="Pick a design type"
                    disabled={saving}
                    clearable
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-qty">
                    Quantity
                  </Label>
                  <Input
                    id="edit-qty"
                    type="number"
                    min={0}
                    step={1}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    placeholder="Enter quantity"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-fabric">Fabric</Label>
                  <Input
                    id="edit-fabric"
                    value={fabric}
                    onChange={(e) => setFabric(e.target.value)}
                    placeholder="e.g. Cotton, Silk"
                    disabled={saving}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-desc">Description</Label>
                <textarea
                  id="edit-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  disabled={saving}
                  placeholder="Mood, palette, references, anything the designer should know."
                  className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                />
              </div>
              <div className="space-y-1">
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
            </Section>

            {/* Assignment */}
            <Section icon={UserCheck} title="Assignment">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="edit-assigned-to">Assign To</Label>
                  <select
                    id="edit-assigned-to"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    disabled={saving}
                    className="block h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  >
                    <option value="">Open Pool</option>
                    {designers.map((d) => (
                      <option key={d.id} value={d.id}>{d.full_name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-assigned-by">Assigned By</Label>
                  <select
                    id="edit-assigned-by"
                    value={dropdownValue}
                    onChange={(e) => handleAssignedBySelect(e.target.value)}
                    disabled={saving}
                    className="block h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  >
                    <option value="">Select a name…</option>
                    {extraName && (
                      <option value={extraName}>{extraName}</option>
                    )}
                    {assignedByNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                    <option value={ASSIGNED_BY_OTHER}>Other</option>
                  </select>
                  {otherMode && (
                    <Input
                      value={assignedBy}
                      maxLength={60}
                      onChange={(e) => setAssignedBy(e.target.value)}
                      placeholder="Type the name"
                      disabled={saving}
                      className="mt-1"
                      autoFocus
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Priority</Label>
                  <div className="inline-flex w-full rounded-md border border-border bg-card p-0.5">
                    <PriorityChoice
                      active={priority === "normal"}
                      onClick={() => setPriority("normal")}
                      disabled={saving}
                    >
                      Normal
                    </PriorityChoice>
                    <PriorityChoice
                      active={priority === "urgent"}
                      onClick={() => setPriority("urgent")}
                      disabled={saving}
                      urgent
                    >
                      Urgent
                    </PriorityChoice>
                  </div>
                </div>
              </div>
            </Section>

            {/* Error */}
            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <LoadingButton
                type="submit"
                loading={saving}
                loadingText="Saving…"
                className="gap-2 px-6 shadow-sm shadow-primary/20"
              >
                Save Changes
              </LoadingButton>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Building blocks ──────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors hover:border-primary/30 sm:px-3.5 sm:py-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-3 w-3" />
        </span>
        <h2 className="text-[13px] font-semibold tracking-tight text-foreground">
          {title}
        </h2>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function ToggleChoice({
  active,
  children,
  onClick,
  disabled,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex-1 rounded-[5px] px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
        active
          ? "bg-primary text-white"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function PriorityChoice({
  active,
  urgent,
  children,
  onClick,
  disabled,
}: {
  active: boolean;
  urgent?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex-1 rounded-[5px] px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
        active
          ? urgent
            ? "bg-destructive text-destructive-foreground"
            : "bg-primary text-white"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
