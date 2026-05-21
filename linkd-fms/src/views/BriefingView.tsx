import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  Image as ImageIcon,
  Loader2,
  Plus,
  Upload,
  X,
  ArrowRight,
} from "lucide-react";
import { toast } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompression";
import { useAuth } from "@/hooks/useAuth";
import { useTaskMutations } from "@/hooks/useTaskMutations";
import { useClients } from "@/hooks/useClients";
import { useProfiles } from "@/hooks/useProfiles";
import { useConceptCategories } from "@/hooks/useConceptCategories";
import { useFabrics } from "@/hooks/useFabrics";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
} from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { Task } from "@/types/database";

const WHATSAPP_GROUPS = [
  "New Creation",
  "Job Work Concept",
  "Linkd Design",
  "LD-Garments Sublimation Prints",
] as const;

const FULL_KITTING_NOTES_MAX = 1000;
const FULL_KITTING_MAX_BYTES = 100 * 1024 * 1024; // 100 MB
const FULL_KITTING_ACCEPT = "*/*";
const FULL_KITTING_BUCKET = "sample-files";

type Priority = "normal" | "urgent";

interface FormErrors {
  client_id?: string;
  concept?: string;
  fabric?: string;
  qty?: string;
  planned_deadline?: string;
  full_kitting_image?: string;
}

// ============================================================================

/**
 * New Brief Dialog — opens as a centered popup.
 * Wraps BriefingForm in a Dialog. Use from KanbanView.
 */
export function NewBriefDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <BriefingForm
          onSuccess={() => {
            onOpenChange(false);
            onCreated?.();
          }}
          onCancel={() => onOpenChange(false)}
          isDialog
        />
      </DialogContent>
    </Dialog>
  );
}

/** Standalone page version (still works at /brief/new). */
export function BriefingView() {
  return <BriefingForm />;
}

function BriefingForm({
  onSuccess,
  onCancel,
  isDialog,
}: {
  onSuccess?: () => void;
  onCancel?: () => void;
  isDialog?: boolean;
} = {}) {
  const { user, profile } = useAuth();
  const { createTask, isPending } = useTaskMutations();
  const { clients, refetch: refetchClients } = useClients();
  const { profiles: designers } = useProfiles({
    roles: ["designer"],
  });
  const { categories: conceptCategories } = useConceptCategories();
  const { fabrics: fabricList } = useFabrics();

  // ---------------- form state ----------------
  const [clientId, setClientId] = useState("");
  const [concept, setConcept] = useState("");
  const [description, setDescription] = useState("");
  const [fabric, setFabric] = useState("");
  const [qty, setQty] = useState("");
  const [mtr, setMtr] = useState("");
  const [plannedDeadline, setPlannedDeadline] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [conceptStartDate, setConceptStartDate] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [whatsappGroup, setWhatsappGroup] = useState("");
  const [assignedBy, setAssignedBy] = useState(
    profile?.full_name ?? ""
  );
  const [assignedTo, setAssignedTo] = useState<string | null>(null); // null = Open Pool

  // ---------------- full kitting state ----------------
  const [requiresFullKitting, setRequiresFullKitting] = useState(false);
  const [fullKittingFile, setFullKittingFile] = useState<File | null>(null);
  const [fullKittingPath, setFullKittingPath] = useState<string | null>(null);
  const [fullKittingPreviewUrl, setFullKittingPreviewUrl] =
    useState<string | null>(null);
  const [fullKittingNotes, setFullKittingNotes] = useState("");
  const [uploadingFullKitting, setUploadingFullKitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const fullKittingInputRef = useRef<HTMLInputElement | null>(null);
  const fullKittingSectionRef = useRef<HTMLDivElement | null>(null);

  // ---------------- ui state ----------------
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [success, setSuccess] = useState<Task | null>(null);

  // ---------------- add-client inline ----------------
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [addingClient, setAddingClient] = useState(false);

  // ---------------- draft persistence ----------------
  // Brief forms get abandoned a lot — admin/coordinator gathers context from
  // WhatsApp + phone calls and may need to close the dialog mid-flow. We
  // persist all the serialisable fields under a per-user key so reopening the
  // form offers a "Resume / Start fresh" choice instead of silently restoring
  // (which surprises the user when they want a blank slate). Mirrors the
  // SubmitConceptDialog pattern.
  //
  // NOT persisted: full_kitting file (File objects don't serialise), upload
  // progress, drag/error/UI flags. The notes textarea + toggle survive.
  const DRAFT_KEY = user?.id ? `linkd-brief-draft:${user.id}` : null;
  const [draftStatus, setDraftStatus] = useState<"checking" | "prompt" | "ready">(
    "checking"
  );
  const savedDraftRef = useRef<Record<string, any> | null>(null);

  // On mount: peek at localStorage. If there's a draft with any non-default
  // value, show the prompt; otherwise jump straight to ready.
  useEffect(() => {
    if (!DRAFT_KEY) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const hasContent = parsed && typeof parsed === "object" && Object.values(parsed).some(
          (v) => v !== "" && v !== null && v !== false && v !== undefined
        );
        if (hasContent) {
          savedDraftRef.current = parsed;
          setDraftStatus("prompt");
          return;
        }
        // Empty husk left over — wipe it so it doesn't keep prompting.
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      // Corrupted JSON / disabled storage — just continue with an empty form.
    }
    setDraftStatus("ready");
  }, [DRAFT_KEY]);

  function applyDraft() {
    const d = savedDraftRef.current;
    if (d) {
      setClientId(d.clientId ?? "");
      setConcept(d.concept ?? "");
      setDescription(d.description ?? "");
      setFabric(d.fabric ?? "");
      setQty(d.qty ?? "");
      setMtr(d.mtr ?? "");
      setPlannedDeadline(d.plannedDeadline ?? "");
      setDueTime(d.dueTime ?? "");
      setConceptStartDate(d.conceptStartDate ?? "");
      setPriority((d.priority === "urgent" ? "urgent" : "normal") as Priority);
      setWhatsappGroup(d.whatsappGroup ?? "");
      setAssignedBy(d.assignedBy ?? profile?.full_name ?? "");
      setAssignedTo(d.assignedTo ?? null);
      setRequiresFullKitting(!!d.requiresFullKitting);
      setFullKittingNotes(d.fullKittingNotes ?? "");
    }
    setDraftStatus("ready");
  }

  function discardDraft() {
    if (DRAFT_KEY) {
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    }
    savedDraftRef.current = null;
    setDraftStatus("ready");
  }

  // Debounced persist on every keystroke (once the user has chosen their
  // path — never write while the prompt is showing or before mount-check).
  useEffect(() => {
    if (!DRAFT_KEY || draftStatus !== "ready") return;
    const t = setTimeout(() => {
      const payload = {
        clientId, concept, description, fabric, qty, mtr,
        plannedDeadline, dueTime, conceptStartDate, priority,
        whatsappGroup, assignedBy, assignedTo,
        requiresFullKitting, fullKittingNotes,
      };
      // Skip writing if the payload is fully empty — avoids leaving a husk
      // that would trigger the prompt next time.
      const hasContent = Object.values(payload).some(
        (v) => v !== "" && v !== null && v !== false && v !== undefined
      );
      try {
        if (hasContent) {
          localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
        } else {
          localStorage.removeItem(DRAFT_KEY);
        }
      } catch { /* storage full / disabled */ }
    }, 300);
    return () => clearTimeout(t);
  }, [
    DRAFT_KEY, draftStatus,
    clientId, concept, description, fabric, qty, mtr,
    plannedDeadline, dueTime, conceptStartDate, priority,
    whatsappGroup, assignedBy, assignedTo,
    requiresFullKitting, fullKittingNotes,
  ]);

  function clearDraftOnSuccess() {
    if (DRAFT_KEY) {
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    }
    savedDraftRef.current = null;
  }

  const submitting = isPending("create");

  function validate(): FormErrors {
    const e: FormErrors = {};
    if (!clientId) e.client_id = "Pick a client.";
    if (!concept.trim()) e.concept = "Concept is required.";
    if (!fabric) e.fabric = "Pick a fabric.";
    const qtyNum = Number(qty);
    if (!qty || !Number.isFinite(qtyNum) || qtyNum < 1) {
      e.qty = "Quantity must be at least 1.";
    }
    if (!plannedDeadline) e.planned_deadline = "Deadline is required.";
    return e;
  }

  function resetForm() {
    setClientId("");
    setConcept("");
    setDescription("");
    setFabric("");
    setQty("");
    setMtr("");
    setPlannedDeadline("");
    setConceptStartDate("");
    setDueTime("");
    setPriority("normal");
    setWhatsappGroup("");
    setAssignedBy(profile?.full_name ?? "");
    setAssignedTo(null);
    setRequiresFullKitting(false);
    clearFullKittingFile({ removeRemote: true });
    setFullKittingNotes("");
    setErrors({});
    setSubmitAttempted(false);
    setSuccess(null);
    setShowAddClient(false);
    setNewClientName("");
  }

  // ---------------- full kitting helpers ----------------

  function sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  async function removeRemoteFullKitting(path: string) {
    const { error } = await supabase.storage
      .from(FULL_KITTING_BUCKET)
      .remove([path]);
    if (error) {
      console.warn("[briefing] failed to clean up full-kitting upload", error);
    }
  }

  function clearFullKittingFile(opts: { removeRemote: boolean }) {
    if (opts.removeRemote && fullKittingPath) {
      void removeRemoteFullKitting(fullKittingPath);
    }
    if (fullKittingPreviewUrl) URL.revokeObjectURL(fullKittingPreviewUrl);
    setFullKittingFile(null);
    setFullKittingPath(null);
    setFullKittingPreviewUrl(null);
    setUploadProgress(0);
    if (fullKittingInputRef.current) fullKittingInputRef.current.value = "";
  }

  async function handleFullKittingFile(file: File) {
    if (!user) {
      toast.error("Not authenticated");
      return;
    }
    if (file.size > FULL_KITTING_MAX_BYTES) {
      toast.error("File too large — max 100 MB");
      return;
    }
    // replace any prior upload
    if (fullKittingPath) void removeRemoteFullKitting(fullKittingPath);
    if (fullKittingPreviewUrl) URL.revokeObjectURL(fullKittingPreviewUrl);

    setFullKittingFile(file);
    setUploadingFullKitting(true);
    setUploadProgress(8); // visual kickoff

    // simulated smooth progress (supabase-js v2.45 has no upload-progress hook)
    const progressTimer = window.setInterval(() => {
      setUploadProgress((p) => (p >= 90 ? p : p + Math.random() * 12));
    }, 180);

    // Shrink large JPEG/PNG/WebP photos before upload (PSD/PDF/video pass through).
    const processed = await compressImage(file);

    const safe = sanitizeFilename(processed.name);
    const path = `${user.id}/tasks/full-kitting/draft-${Date.now()}-${safe}`;

    if (processed.type.startsWith("image/")) {
      setFullKittingPreviewUrl(URL.createObjectURL(processed));
    } else {
      setFullKittingPreviewUrl(null);
    }

    const { error } = await supabase.storage
      .from(FULL_KITTING_BUCKET)
      .upload(path, processed, {
        contentType: processed.type || "application/octet-stream",
        upsert: false,
      });

    window.clearInterval(progressTimer);

    if (error) {
      setUploadingFullKitting(false);
      setUploadProgress(0);
      setFullKittingFile(null);
      setFullKittingPath(null);
      if (fullKittingPreviewUrl) URL.revokeObjectURL(fullKittingPreviewUrl);
      setFullKittingPreviewUrl(null);
      toast.error(error.message);
      return;
    }

    setFullKittingPath(path);
    setUploadProgress(100);
    // brief pause so the bar settles before disappearing
    window.setTimeout(() => {
      setUploadingFullKitting(false);
    }, 250);
    // clear the image-required error once a file lands
    setErrors((curr) => {
      if (!curr.full_kitting_image) return curr;
      const { full_kitting_image: _, ...rest } = curr;
      return rest;
    });
  }

  function onFullKittingDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFullKittingFile(file);
  }

  function onFullKittingPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFullKittingFile(file);
  }

  function toggleFullKitting(next: boolean) {
    setRequiresFullKitting(next);
    if (!next) {
      clearFullKittingFile({ removeRemote: true });
      setFullKittingNotes("");
      setErrors((curr) => {
        if (!curr.full_kitting_image) return curr;
        const { full_kitting_image: _, ...rest } = curr;
        return rest;
      });
    }
  }

  async function handleAddClient() {
    const name = newClientName.trim();
    if (!name) return;
    setAddingClient(true);
    const { data, error } = await supabase
      .from("clients")
      .insert({ party_name: name })
      .select()
      .single();
    setAddingClient(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refetchClients();
    setClientId(data.id);
    setShowAddClient(false);
    setNewClientName("");
    toast.success(`Added ${data.party_name}`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    const validation = validate();
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      toast.error("Fix the highlighted fields.");
      return;
    }

    const mtrNum = mtr.trim() === "" ? null : Number(mtr);

    const { data, error } = await createTask({
      client_id: clientId,
      concept: concept.trim(),
      qty: Number(qty),
      fabric,
      priority,
      assigned_to: assignedTo, // null → server sets status='pool', else 'todo'
      planned_deadline: plannedDeadline,
      due_time: dueTime || null,
      whatsapp_group: whatsappGroup.trim() || null,
      description: description.trim() || null,
      mtr: Number.isFinite(mtrNum as number) ? (mtrNum as number) : null,
      assigned_by: assignedBy.trim() || null,
      concept_start_date: conceptStartDate || null,
    });

    if (error) {
      toast.error(error);
      return;
    }
    if (data) {
      clearDraftOnSuccess();
      if (isDialog && onSuccess) {
        toast.success(`Brief created: ${data.task_code}`);
        onSuccess();
      } else {
        setSuccess(data);
      }
    }
  }

  // ---------------- SUCCESS SCREEN ----------------
  if (success) {
    return (
      <SuccessScreen
        task={success}
        whatsappGroup={whatsappGroup}
        onCreateAnother={resetForm}
      />
    );
  }

  // ---------------- FORM ----------------
  const show = (key: keyof FormErrors) =>
    submitAttempted && errors[key] ? errors[key] : undefined;

  // While we're checking localStorage, suppress the form to avoid a flicker
  // of empty inputs that then get overwritten when the draft is restored.
  if (draftStatus === "checking") {
    return (
      <div className={cn(
        isDialog ? "px-6 py-5" : "mx-auto max-w-[700px] pb-12"
      )}>
        <div className="h-32 animate-pulse rounded-lg bg-secondary/40" />
      </div>
    );
  }

  // Resume-or-start-fresh prompt. Shown only when there's saved content from
  // an earlier session; the user explicitly chooses before the form renders.
  if (draftStatus === "prompt") {
    const d = savedDraftRef.current ?? {};
    // Quick "what's in the draft" preview so the user can decide whether to
    // resume — counts the non-empty fields and surfaces the headline ones.
    const filledCount = Object.values(d).filter(
      (v) => v !== "" && v !== null && v !== false && v !== undefined
    ).length;
    const previewBits = [
      d.concept ? `Concept: ${String(d.concept).slice(0, 40)}` : null,
      d.fabric ? `Fabric: ${String(d.fabric).slice(0, 40)}` : null,
      d.qty ? `Qty: ${d.qty}m` : null,
      d.plannedDeadline ? `Deadline: ${d.plannedDeadline}` : null,
    ].filter(Boolean);
    return (
      <div className={cn(
        isDialog ? "px-6 py-5" : "mx-auto max-w-[700px] pb-12",
        "space-y-5"
      )}>
        <header className="space-y-1">
          <h1 className={cn(
            "font-sans tracking-tight text-foreground",
            isDialog ? "text-lg font-semibold" : "text-3xl"
          )}>
            New Brief
          </h1>
        </header>
        <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-5">
          <div className="mb-3 flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
              <ImageIcon className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">
                Resume your draft?
              </h3>
              <p className="text-xs text-muted-foreground">
                You started a brief earlier and didn't submit it. We saved
                {" "}{filledCount} field{filledCount !== 1 ? "s" : ""} for you.
              </p>
            </div>
          </div>
          {previewBits.length > 0 && (
            <ul className="mb-4 space-y-1 rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-xs text-muted-foreground">
              {previewBits.map((bit) => (
                <li key={bit as string} className="truncate">• {bit}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={discardDraft}
            >
              Start fresh
            </Button>
            <Button
              type="button"
              onClick={applyDraft}
            >
              Continue draft
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      isDialog ? "px-6 py-5" : "mx-auto max-w-[700px] pb-12",
      isDialog ? "space-y-4" : "space-y-8"
    )}>
      {/* ---------- Header ---------- */}
      <header className={cn(isDialog ? "space-y-1" : "space-y-2")}>
        {!isDialog && (
          <div className="flex items-center gap-3">
            <Badge className="border border-dashed border-muted bg-card text-[10px] uppercase tracking-wider text-muted-foreground">
              DRAFT
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              ID assigned on submit
            </span>
          </div>
        )}
        <h1 className={cn(
          "font-sans tracking-tight text-foreground",
          isDialog ? "text-lg font-semibold" : "text-4xl"
        )}>
          New Brief
        </h1>
        <p className="text-xs text-muted-foreground">
          Fill in the details below. Task code is assigned on submit.
        </p>
      </header>

      <form onSubmit={handleSubmit} className={cn(isDialog ? "space-y-4" : "space-y-8")} noValidate>
        {/* ============== CLIENT ============== */}
        <FormSection title="Client" required>
          {!showAddClient ? (
            <div className="flex gap-2">
              <Picker
                id="client"
                value={clientId}
                onChange={setClientId}
                placeholder="Choose a client"
                options={clients.map((c) => ({ value: c.id, label: c.party_name }))}
                error={show("client_id")}
                disabled={submitting}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddClient(true)}
                disabled={submitting}
                className="shrink-0 gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Add new
              </Button>
            </div>
          ) : (
            <div className="space-y-2 rounded-md border border-border bg-card p-3">
              <Label htmlFor="new-client">New client name</Label>
              <div className="flex gap-2">
                <Input
                  id="new-client"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="e.g. Westside Stores"
                  autoFocus
                  disabled={addingClient}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleAddClient();
                    }
                  }}
                />
                <Button
                  type="button"
                  onClick={handleAddClient}
                  disabled={addingClient || !newClientName.trim()}
                  className="shrink-0 gap-1.5"
                >
                  {addingClient && <Loader2 className="h-4 w-4 animate-spin" />}
                  Add
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowAddClient(false);
                    setNewClientName("");
                  }}
                  disabled={addingClient}
                  className="shrink-0"
                  aria-label="Cancel"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </FormSection>

        {!isDialog && <Divider />}

        {/* ============== WHATSAPP GROUP ============== */}
        <FormSection title="WhatsApp Group" hint="Optional — pick the coordination thread.">
          <Field label="Group" htmlFor="wa">
            <Picker
              id="wa"
              value={whatsappGroup}
              onChange={setWhatsappGroup}
              placeholder="Choose a group"
              options={WHATSAPP_GROUPS.map((g) => ({ value: g, label: g }))}
              disabled={submitting}
            />
          </Field>
        </FormSection>

        {!isDialog && <Divider />}

        {/* ============== WORK ============== */}
        <FormSection title="The work">
          <Field
            label="Concept"
            htmlFor="concept"
            required
            error={show("concept")}
          >
            <Picker
              id="concept"
              value={concept}
              onChange={setConcept}
              placeholder="Pick a concept"
              options={conceptCategories.map((c) => ({
                value: c.name,
                label: c.name,
              }))}
              disabled={submitting}
              error={show("concept")}
            />
          </Field>

          <Field label="Description" htmlFor="description">
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Mood, palette, references, anything the designer should know."
              disabled={submitting}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Fabric"
              htmlFor="fabric"
              required
              error={show("fabric")}
            >
              <Picker
                id="fabric"
                value={fabric}
                onChange={setFabric}
                placeholder="Pick a fabric"
                options={fabricList.map((f) => ({
                  value: f.name,
                  label: f.name,
                }))}
                disabled={submitting}
              />
            </Field>
            <Field
              label="Quantity (m)"
              htmlFor="qty"
              required
              error={show("qty")}
            >
              <Input
                id="qty"
                type="number"
                min={1}
                step={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="200"
                disabled={submitting}
              />
            </Field>
          </div>

          <Field label="Meters (Mtr)" htmlFor="mtr">
            <Input
              id="mtr"
              type="number"
              min={0}
              step={0.5}
              value={mtr}
              onChange={(e) => setMtr(e.target.value)}
              placeholder="e.g. 5.5"
              disabled={submitting}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Total fabric meters needed (separate from design count).
            </p>
          </Field>
        </FormSection>

        {!isDialog && <Divider />}

        {/* ============== TIMING ============== */}
        <FormSection title="Timing">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Planned deadline"
              htmlFor="deadline"
              required
              error={show("planned_deadline")}
            >
              <Input
                id="deadline"
                type="date"
                value={plannedDeadline}
                onChange={(e) => setPlannedDeadline(e.target.value)}
                disabled={submitting}
              />
            </Field>
            <Field label="Due time" htmlFor="due_time">
              <Input
                id="due_time"
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                disabled={submitting}
              />
            </Field>
          </div>
          <Field label="Concept start date" htmlFor="concept_start_date">
            <Input
              id="concept_start_date"
              type="date"
              value={conceptStartDate}
              onChange={(e) => setConceptStartDate(e.target.value)}
              disabled={submitting}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Planned kickoff date. Used to flag tasks that started late.
            </p>
          </Field>
        </FormSection>

        {!isDialog && <Divider />}

        {/* ============== PRIORITY ============== */}
        <FormSection title="Priority">
          <div className="inline-flex rounded-md border border-border bg-card p-0.5">
            <PriorityChoice
              active={priority === "normal"}
              onClick={() => setPriority("normal")}
              disabled={submitting}
            >
              Normal
            </PriorityChoice>
            <PriorityChoice
              active={priority === "urgent"}
              onClick={() => setPriority("urgent")}
              disabled={submitting}
              urgent
            >
              Urgent
            </PriorityChoice>
          </div>
        </FormSection>

        {!isDialog && <Divider />}

        {/* ============== ASSIGNMENT ============== */}
        <FormSection
          title="Assign to"
          hint="Default is the open Pool — anyone can claim it."
        >
          <div className="flex flex-wrap gap-2">
            <AssigneeChoice
              active={assignedTo === null}
              onClick={() => setAssignedTo(null)}
              disabled={submitting}
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-muted">
                <Plus className="h-3 w-3 text-muted-foreground" />
              </div>
              Open Pool
            </AssigneeChoice>
            {designers.map((d) => (
              <AssigneeChoice
                key={d.id}
                active={assignedTo === d.id}
                onClick={() => setAssignedTo(d.id)}
                disabled={submitting}
              >
                <Avatar className="h-6 w-6">
                  {d.avatar_url ? <AvatarImage src={d.avatar_url} /> : null}
                  <AvatarFallback className="text-[9px]">
                    {getInitials(d.full_name)}
                  </AvatarFallback>
                </Avatar>
                {d.full_name}
              </AssigneeChoice>
            ))}
          </div>
        </FormSection>

        {!isDialog && <Divider />}

        {/* ============== ASSIGNED BY ============== */}
        <FormSection title="Assigned By">
          <Field label="Assigned By" htmlFor="assigned_by">
            <Input
              id="assigned_by"
              value={assignedBy}
              maxLength={60}
              onChange={(e) => setAssignedBy(e.target.value)}
              placeholder="Coordinator name"
              disabled={submitting}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Who is creating this brief? (e.g. Harshali, Admin)
            </p>
          </Field>
        </FormSection>

        {/* ============== Submit ============== */}
        <div className={cn(
          "flex items-center justify-between",
          isDialog ? "pt-2" : "border-t border-border pt-6"
        )}>
          {isDialog && onCancel ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              asChild
              disabled={submitting}
            >
              <Link to={ROUTES.dashboard}>Cancel</Link>
            </Button>
          )}
          <LoadingButton
            type="submit"
            size="lg"
            loading={submitting}
            loadingText="Creating…"
            disabled={submitting}
          >
            Create brief
          </LoadingButton>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// SUCCESS SCREEN
// ============================================================================

function SuccessScreen({
  task,
  whatsappGroup,
  onCreateAnother,
}: {
  task: Task;
  whatsappGroup: string;
  onCreateAnother: () => void;
}) {
  const mtrLabel =
    task.mtr != null && Number.isFinite(task.mtr) ? `${task.mtr} m required` : null;
  return (
    <div className="mx-auto flex max-w-[700px] flex-col items-center justify-center pb-12 pt-8 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/30">
        <Check className="h-8 w-8 text-foreground" strokeWidth={2.5} />
      </div>
      <h2 className="font-sans text-3xl tracking-tight text-foreground">
        Brief created
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The team has been notified and this brief is now on the board.
      </p>

      <div className="mt-8 inline-flex items-center gap-3 rounded-lg border border-border bg-card px-6 py-4">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Task ID
        </span>
        <span className="font-mono text-2xl font-medium tracking-wider text-foreground">
          {task.task_code}
        </span>
      </div>

      {(task.requires_full_kitting || mtrLabel || whatsappGroup) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {task.requires_full_kitting && (
            <Badge className="border-primary/40 bg-primary/20 text-foreground">
              <Check className="mr-1 h-3 w-3" strokeWidth={2.5} />
              Full Knitting Attached
            </Badge>
          )}
          {mtrLabel && (
            <span className="text-xs text-muted-foreground">
              {task.fabric} · {mtrLabel}
            </span>
          )}
          {whatsappGroup && (
            <Badge variant="outline" className="border-border bg-card text-muted-foreground">
              {whatsappGroup}
            </Badge>
          )}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={onCreateAnother} className="gap-2">
          <Plus className="h-4 w-4" />
          Create another
        </Button>
        <Button variant="outline" asChild className="gap-2">
          <Link to={ROUTES.dashboard}>
            View on dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// FULL KITTING SECTION
// ============================================================================

function FullKittingSection({
  enabled,
  onToggle,
  disabled,
  sectionRef,
  inputRef,
  file,
  previewUrl,
  uploaded,
  uploading,
  progress,
  notes,
  onNotesChange,
  onPick,
  onDrop,
  dragActive,
  onDragOver,
  onDragLeave,
  onRemove,
  error,
}: {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  disabled?: boolean;
  sectionRef: React.RefObject<HTMLDivElement>;
  inputRef: React.RefObject<HTMLInputElement>;
  file: File | null;
  previewUrl: string | null;
  uploaded: boolean;
  uploading: boolean;
  progress: number;
  notes: string;
  onNotesChange: (v: string) => void;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  dragActive: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onRemove: () => void;
  error?: string;
}) {
  return (
    <section className="space-y-4" ref={sectionRef}>
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Full Knitting Requirements
        </h2>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-card p-4">
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">
            Requires Full Knitting submission?
          </p>
          <p className="text-xs text-muted-foreground">
            Toggle on when a kitting reference image is needed before approval.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={disabled}
          onClick={() => onToggle(!enabled)}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
            enabled ? "bg-primary" : "bg-muted"
          )}
        >
          <span
            className={cn(
              "inline-block h-5 w-5 transform rounded-full bg-card shadow transition-transform duration-200 ease-in-out",
              enabled ? "translate-x-[22px]" : "translate-x-0.5"
            )}
          />
        </button>
      </div>

      <div
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows] duration-300 ease-in-out",
          enabled ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
        aria-hidden={!enabled}
      >
        <div className="min-h-0">
          <div className="space-y-4 pt-1">
            {/* Upload zone */}
            <div className="space-y-1.5">
              <Label htmlFor="full-kitting-file">
                Full Knitting Reference Image
                <span className="ml-0.5 text-destructive">*</span>
              </Label>
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                className={cn(
                  "rounded-md border-2 border-dashed transition-colors",
                  error
                    ? "border-destructive bg-destructive/5"
                    : dragActive
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card",
                  uploaded ? "p-3" : "p-6"
                )}
              >
                {!file && !uploaded ? (
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-foreground">
                        Drag &amp; drop your image here
                      </p>
                      <p className="text-xs text-muted-foreground">
                        JPG / PNG / PSD / GIF / MP4 · up to 100 MB
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => inputRef.current?.click()}
                      disabled={disabled}
                    >
                      Choose file
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-card">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt="Full kitting preview"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {file?.name ?? "Uploaded"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : ""}
                        {uploaded && !uploading ? " · uploaded" : ""}
                      </p>
                      {uploading && (
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-primary transition-[width] duration-200 ease-out"
                            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={onRemove}
                      disabled={disabled || uploading}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                )}
                <input
                  ref={inputRef}
                  id="full-kitting-file"
                  type="file"
                  accept={FULL_KITTING_ACCEPT}
                  onChange={onPick}
                  className="hidden"
                />
              </div>
              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="full-kitting-notes">Full Knitting Remarks</Label>
              <textarea
                id="full-kitting-notes"
                value={notes}
                onChange={(e) =>
                  onNotesChange(
                    e.target.value.slice(0, FULL_KITTING_NOTES_MAX)
                  )
                }
                rows={4}
                disabled={disabled}
                placeholder="Color references, special instructions, mood board notes…"
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
              <p className="text-right text-xs text-muted-foreground">
                {notes.length}/{FULL_KITTING_NOTES_MAX}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Small building blocks
// ============================================================================

function FormSection({
  title,
  hint,
  required,
  children,
}: {
  title: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {title}
          {required && <span className="ml-1 text-destructive">*</span>}
        </h2>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Divider() {
  return <div className="h-px bg-border" aria-hidden />;
}

function Field({
  label,
  htmlFor,
  required,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Picker({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  error,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        "h-10 w-full rounded-md border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        error ? "border-destructive" : "border-input"
      )}
    >
      <option value="">{placeholder ?? "Select…"}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
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
        "rounded-[5px] px-5 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
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

function AssigneeChoice({
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
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
        active
          ? "border-primary bg-primary text-white"
          : "border-border bg-card text-foreground hover:border-primary/40"
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
