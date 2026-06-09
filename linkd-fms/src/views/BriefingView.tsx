import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  Image as ImageIcon,
  Loader2,
  Plus,
  Upload,
  X,
  ArrowRight,
  Paperclip,
  ClipboardList,
  Building2,
  MessageSquare,
  Sparkles,
  UserCheck,
  Layers,
  Clock,
  Trash2,
  Users,
  AlertCircle,
} from "lucide-react";
import { toast, Combobox } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompression";
import { useAuth } from "@/hooks/useAuth";
import { useTaskMutations } from "@/hooks/useTaskMutations";
import { useTaskAssignments } from "@/hooks/useTaskAssignments";
import { useClients } from "@/hooks/useClients";
import { useProfiles } from "@/hooks/useProfiles";
import { useConceptCategories } from "@/hooks/useConceptCategories";
import { useFabrics } from "@/hooks/useFabrics";
import { useAssignedByOptions, ASSIGNED_BY_OTHER } from "@/hooks/useAssignedByOptions";
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
import { initiateKitting, submitKittingForm } from "@/lib/kittingQueries";
import { sendNotificationToRole } from "@/lib/notifications";
import { WHATSAPP_GROUPS } from "@/lib/whatsappGroups";
import { WhatsAppIcon } from "@/components/ui/WhatsAppIcon";
import { cn } from "@/lib/utils";
import {
  FullKittingForm,
  KITTING_DEFAULT_VALUES,
  hasKittingFormContent,
  type KittingFormValues,
} from "@/components/tasks/FullKittingFormFields";
import type { Task, ClientGroup, BriefType } from "@/types/database";

// WhatsApp group catalogue lives in `lib/whatsappGroups.ts` so the brief
// form, EditTaskDialog, and any future surface stay in sync. See that file
// for the rename history and the isWhatsApp flag that drives the icon below.

// "Assigned By" roster is admin-managed (Settings → Assigned By) via
// useAssignedByOptions(); ASSIGNED_BY_OTHER (the "Other" sentinel) is imported
// from that hook. Picking "Other" reveals a free-text input for ad-hoc values.

// Today as yyyy-MM-dd in local time — the format <input type="date"> expects.
// Defined at module scope so initial useState evaluates it once per mount;
// don't memoize beyond that since "today" can change while the form is open
// (rare, but we re-read it for resets / start-fresh).
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const FULL_KITTING_NOTES_MAX = 1000;
const FULL_KITTING_MAX_BYTES = 100 * 1024 * 1024; // 100 MB
const FULL_KITTING_ACCEPT = "*/*";
const FULL_KITTING_BUCKET = "sample-files";

// Reference files attached to a brief (any file type, 50 MB each). They land
// in the task's `files` list so designers see them in the task detail drawer.
const REF_FILE_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const REF_FILE_BUCKET = "design-files";

// Sentinel for the (now mandatory) Assign To select — distinguishes a
// deliberate "Open Pool" choice from "nothing picked yet".
const ASSIGN_TO_POOL = "__pool__";

type Priority = "normal" | "urgent";

// ── Split rows builder ─────────────────────────────────────────────────────
interface BriefSplitRow {
  key: number;
  designer_id: string;
  qty_assigned: number;
  planned_deadline: string;
  design_type: string;
  fabric: string;
}
let splitRowKey = 0;

interface FormErrors {
  client_id?: string;
  concept?: string;
  description?: string;
  qty?: string;
  full_kitting_image?: string;
  whatsapp_group?: string;
  whatsapp_received_date?: string;
  whatsapp_received_time?: string;
  assigned_to?: string;
  assigned_by?: string;
  split_rows?: string;
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
      <DialogContent
        className="max-w-[700px] max-h-[95vh] min-h-[640px] overflow-y-auto p-0"
        srTitle="New Brief"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
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
  // ldClients is still exposed by the hook (used in Settings + other surfaces)
  // but the brief form only needs the Job Work list — LD briefs don't pick a
  // party. `clients` (full set) is kept for the lookup at submit / display time.
  const { clients, jobWorkClients } = useClients();
  const { profiles: designers } = useProfiles({
    roles: ["designer"],
  });
  const { categories: conceptCategories } = useConceptCategories();
  const { fabrics } = useFabrics();

  // ---------------- form state ----------------
  // Brief type drives the Party Name section. 'ld' hides the party picker
  // entirely (LD = internal work, no external party). 'job_work' requires a
  // pick from the Job Work roster.
  const [briefType, setBriefType] = useState<BriefType>("ld");
  const [clientId, setClientId] = useState("");
  const [concept, setConcept] = useState("");
  const [description, setDescription] = useState("");
  // Quantity stays visible but is no longer required — empty submits as qty=1
  // so the DB CHECK (qty > 0) still passes without bothering the coordinator.
  const [qty, setQty] = useState("");
  // Fabric / Meters / Planned deadline / Due time were dropped from the form
  // per product. The DB schema still has those columns (some NOT NULL), so
  // submission below sends placeholder defaults rather than nulls for the
  // required ones. Re-adding the inputs is a UI-only revert.
  const [fabric, setFabric] = useState("");
  const [plannedDeadline, setPlannedDeadline] = useState("");
  const isDesigner = profile?.role === "designer";
  const conceptStartDate = todayISO();
  const [priority, setPriority] = useState<Priority>("normal");
  const [whatsappGroup, setWhatsappGroup] = useState("");
  // When the WhatsApp message arrived (not when the brief was logged). The
  // coordinator types these manually — they often file the brief later in
  // the day, so we don't want to imply the WA message was received now.
  const [whatsappReceivedDate, setWhatsappReceivedDate] = useState("");
  const [whatsappReceivedTime, setWhatsappReceivedTime] = useState("");
  // Always starts unselected — the dropdown shows "Select a name…" until the
  // coordinator picks one explicitly. We used to pre-fill from the signed-in
  // profile, but that risked silently submitting the wrong name when the
  // person filing the brief wasn't the one who actually requested it.
  const [assignedBy, setAssignedBy] = useState("");
  // Defaults to Open Pool. ASSIGN_TO_POOL = Open Pool (→ null at submit), else
  // a designer id (→ assigned, 'in_progress').
  const [assignedTo, setAssignedTo] = useState<string>(ASSIGN_TO_POOL);

  // ---------------- split assignment (opt-in) ----------------
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitRows, setSplitRows] = useState<BriefSplitRow[]>([]);
  // useTaskAssignments needs a taskId; null until created. We only call
  // splitTask after createTask returns the new id, so we instantiate the hook
  // with null and grab `splitTask` from it (which accepts tId as first arg).
  const { splitTask } = useTaskAssignments(null);

  // ---------------- reference files (optional) ----------------
  // Coordinator attaches any reference files (each ≤ 50 MB). Held as raw File
  // objects and uploaded after the task is created so nothing is orphaned if
  // the brief is cancelled.
  const [refFiles, setRefFiles] = useState<File[]>([]);
  const refFileInputRef = useRef<HTMLInputElement | null>(null);

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

  // Optional inline knitting-form digitization. When the coordinator fills any
  // of these fields, brief submit also writes a `form_payload` so the row
  // skips the DEO queue and lands as Completed.
  const [showInlineKittingForm, setShowInlineKittingForm] = useState(false);
  const [kittingFormValues, setKittingFormValues] = useState<KittingFormValues>(
    KITTING_DEFAULT_VALUES
  );
  // Bumping this remounts the embedded FullKittingForm, which is the cheapest
  // way to clear its internal state on reset / successful submit.
  const [kittingFormResetKey, setKittingFormResetKey] = useState(0);

  // ---------------- ui state ----------------
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [success, setSuccess] = useState<Task | null>(null);

  // ---------------- add-client inline ----------------
  // (Party-add UI moved out of the brief form — admins use Settings → Party
  // Name instead. The state vars previously kept here are gone.)

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

  // The fields a user MUST fill to submit a brief. We use these as the
  // "is this draft worth resuming?" signal — counting all persisted fields
  // would over-trigger because `priority` defaults to "normal" and
  // `assignedBy` auto-fills from the profile, so every fresh draft would look
  // like "2 fields filled" before the user types anything.
  // (Fabric / Quantity / Planned deadline were removed from the form, so
  // only the 3 truly required text fields remain.)
  const REQUIRED_DRAFT_FIELDS = [
    "clientId", "concept", "description",
  ] as const;
  // Prompt-to-resume threshold — show only when the user has put real effort
  // into the brief (2 of 3 required fields). Below this we silently discard
  // the draft and open a fresh form.
  const RESUME_THRESHOLD = 2;

  function countFilledRequired(payload: Record<string, any> | null | undefined): number {
    if (!payload || typeof payload !== "object") return 0;
    let n = 0;
    for (const k of REQUIRED_DRAFT_FIELDS) {
      const v = payload[k];
      if (typeof v === "string" ? v.trim().length > 0 : v != null && v !== false) {
        n += 1;
      }
    }
    return n;
  }

  // On mount: peek at localStorage. Show the "Resume draft?" prompt ONLY when
  // the user already filled at least RESUME_THRESHOLD required fields.
  // Anything thinner (a stray keystroke, just defaults) is silently discarded.
  const [filledFieldCount, setFilledFieldCount] = useState(0);

  useEffect(() => {
    if (!DRAFT_KEY) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const filled = countFilledRequired(parsed);
        if (filled >= RESUME_THRESHOLD) {
          savedDraftRef.current = parsed;
          setFilledFieldCount(filled);
          setDraftStatus("prompt");
          return;
        }
        // Sub-threshold husk left over — wipe it so it doesn't keep prompting.
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
      setBriefType((d.briefType === "job_work" ? "job_work" : "ld") as BriefType);
      setClientId(d.clientId ?? "");
      setConcept(d.concept ?? "");
      setDescription(d.description ?? "");
      setQty(d.qty ?? "");
      // conceptStartDate is now always today (auto-set, not user-editable)
      setPriority((d.priority === "urgent" ? "urgent" : "normal") as Priority);
      setWhatsappGroup(d.whatsappGroup ?? "");
      setWhatsappReceivedDate(d.whatsappReceivedDate ?? "");
      setWhatsappReceivedTime(d.whatsappReceivedTime ?? "");
      setAssignedBy(d.assignedBy ?? "");
      setAssignedTo(
        typeof d.assignedTo === "string" && d.assignedTo
          ? d.assignedTo
          : ASSIGN_TO_POOL
      );
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
        briefType, clientId, concept, description, qty, priority,
        whatsappGroup, whatsappReceivedDate, whatsappReceivedTime,
        assignedBy, assignedTo,
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
    briefType, clientId, concept, description, qty, conceptStartDate, priority,
    whatsappGroup, whatsappReceivedDate, whatsappReceivedTime,
    assignedBy, assignedTo,
    requiresFullKitting, fullKittingNotes,
  ]);

  function clearDraftOnSuccess() {
    if (DRAFT_KEY) {
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    }
    savedDraftRef.current = null;
  }

  // Client default removed by request — the user picks every time so the
  // wrong party isn't accidentally submitted for non-LD briefs.

  const submitting = isPending("create");

  function validate(): FormErrors {
    const e: FormErrors = {};
    // client_id is only required for Job Work briefs. LD briefs save without
    // a party row.
    if (briefType === "job_work" && !clientId) {
      e.client_id = "Pick a Job Work party.";
    }
    if (!description.trim()) e.description = "Description is required.";
    if (!whatsappGroup.trim()) e.whatsapp_group = "Group is required.";
    if (!whatsappReceivedDate) e.whatsapp_received_date = "Received date is required.";
    const selectedGroup = WHATSAPP_GROUPS.find((g) => g.name === whatsappGroup);
    if (selectedGroup?.isWhatsApp && !whatsappReceivedTime) e.whatsapp_received_time = "Received time is required for WhatsApp groups.";
    if (!assignedBy.trim()) e.assigned_by = "Assigned By is required.";
    if (qty.trim()) {
      const qtyNum = Number(qty);
      if (!Number.isFinite(qtyNum) || qtyNum < 0) {
        e.qty = "Quantity must be 0 or more.";
      }
    }

    if (splitEnabled) {
      // Split mode: validate rows, skip Assign To
      const qtyNum = Number(qty) || 0;
      if (splitRows.length < 2) {
        e.split_rows = "Add at least 2 designers to split.";
      } else {
        const ids = splitRows.map((r) => r.designer_id).filter(Boolean);
        const hasDupes = new Set(ids).size !== ids.length;
        const allFilled = splitRows.every(
          (r) => r.designer_id && r.qty_assigned >= 1
        );
        const totalAssigned = splitRows.reduce((s, r) => s + (r.qty_assigned || 0), 0);
        if (!allFilled) {
          e.split_rows = "Each designer needs a qty ≥ 1.";
        } else if (hasDupes) {
          e.split_rows = "A designer can only appear once.";
        } else if (qtyNum > 0 && totalAssigned > qtyNum) {
          e.split_rows = `Total assigned (${totalAssigned}) exceeds quantity (${qtyNum}).`;
        }
      }
    } else {
      // Single mode: validate Assign To
      if (!assignedTo) e.assigned_to = "Choose a designer or Open Pool.";
    }

    if (requiresFullKitting && !fullKittingPath) {
      e.full_kitting_image = "Upload the Full Knitting reference image.";
    }
    return e;
  }

  function resetForm() {
    setBriefType("ld");
    setClientId("");
    setConcept("");
    setDescription("");
    setQty("");
    // conceptStartDate is auto-set to today on submit
    setPriority("normal");
    setWhatsappGroup("");
    setWhatsappReceivedDate("");
    setWhatsappReceivedTime("");
    setAssignedBy("");
    setAssignedTo(ASSIGN_TO_POOL);
    setSplitEnabled(false);
    setSplitRows([]);
    setRefFiles([]);
    if (refFileInputRef.current) refFileInputRef.current.value = "";
    setRequiresFullKitting(false);
    clearFullKittingFile({ removeRemote: true });
    setFullKittingNotes("");
    setShowInlineKittingForm(false);
    setKittingFormValues(KITTING_DEFAULT_VALUES);
    setKittingFormResetKey((k) => k + 1);
    setErrors({});
    setSubmitAttempted(false);
    setSuccess(null);
  }

  // ---------------- reference-file helpers ----------------

  function onRefFilesPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    const accepted: File[] = [];
    for (const f of picked) {
      if (f.size > REF_FILE_MAX_BYTES) {
        toast.error(`${f.name} is too large — max 50 MB per file.`);
        continue;
      }
      accepted.push(f);
    }
    if (accepted.length) setRefFiles((prev) => [...prev, ...accepted]);
    // Reset so re-picking the same file fires onChange again.
    if (refFileInputRef.current) refFileInputRef.current.value = "";
  }

  function removeRefFile(index: number) {
    setRefFiles((prev) => prev.filter((_, i) => i !== index));
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    const validation = validate();
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      toast.error("Fix the highlighted fields.");
      return;
    }

    // Fabric / Meters / Planned deadline / Due time were dropped from the form
    // (UI-only). The DB schema still has them — fabric is NOT NULL but free-text,
    // so we send an empty string; the rest stay nullable and submit as null.
    // qty is validated as required + >= 1 above; parse defensively.
    const qtyParsed = Number(qty);
    const qtyValue = Number.isFinite(qtyParsed) && qtyParsed > 0 ? qtyParsed : 0;

    // When split is ON, create as pool task (assigned_to = null). The
    // splitTask call below flips is_split + status via the DB trigger.
    const effectiveAssignedTo = splitEnabled
      ? null
      : assignedTo === ASSIGN_TO_POOL
      ? null
      : assignedTo;

    const { data, error } = await createTask({
      brief_type: briefType,
      client_id: briefType === "job_work" ? clientId : null,
      concept: concept.trim(),
      qty: qtyValue,
      fabric: fabric.trim() || "",
      priority,
      assigned_to: effectiveAssignedTo,
      planned_deadline: plannedDeadline || null,
      due_time: null,
      whatsapp_group: whatsappGroup.trim() || null,
      whatsapp_received_date: whatsappReceivedDate || null,
      whatsapp_received_time: whatsappReceivedTime || null,
      description: description.trim() || null,
      mtr: null,
      assigned_by: assignedBy.trim() || null,
      concept_start_date: conceptStartDate || null,
      requires_full_kitting: requiresFullKitting,
      full_kitting_image_url: requiresFullKitting ? fullKittingPath : null,
      full_kitting_notes: requiresFullKitting
        ? fullKittingNotes.trim() || null
        : null,
    });

    if (error) {
      toast.error(error);
      return;
    }
    if (data) {
      // ── Split assignment (additive — only runs when toggle is ON) ───
      if (splitEnabled && splitRows.length >= 2) {
        const splits = splitRows.map((r) => ({
          designerId: r.designer_id,
          qty: r.qty_assigned,
          deadline: r.planned_deadline || undefined,
          designType: r.design_type.trim(),
          fabric: r.fabric.trim(),
        }));
        const { error: splitErr } = await splitTask(data.id, splits);
        if (splitErr) {
          toast.warning(
            `Brief created (${data.task_code}), but split failed: ${splitErr}. You can split it from the task drawer.`
          );
        }
      }
      // Upload any reference files now that the task exists. Each lands as a
      // row in `files` so designers see them in the task detail drawer. A
      // failure on one file warns but doesn't fail the whole brief.
      if (refFiles.length > 0 && user) {
        let failed = 0;
        for (let i = 0; i < refFiles.length; i++) {
          const f = refFiles[i];
          try {
            // Images get compressed; other types pass through unchanged.
            const processed = await compressImage(f);
            const safe = sanitizeFilename(processed.name);
            const path = `${user.id}/tasks/${data.id}/brief-${Date.now()}-${i}-${safe}`;
            const { error: upErr } = await supabase.storage
              .from(REF_FILE_BUCKET)
              .upload(path, processed, {
                contentType: processed.type || "application/octet-stream",
                upsert: false,
              });
            if (upErr) {
              failed++;
              continue;
            }
            const { error: insErr } = await supabase.from("files").insert({
              task_id: data.id,
              storage_url: path,
              file_name: f.name,
              file_size: processed.size,
              uploaded_by: user.id,
            });
            if (insErr) {
              void supabase.storage.from(REF_FILE_BUCKET).remove([path]);
              failed++;
            }
          } catch {
            failed++;
          }
        }
        if (failed > 0) {
          toast.warning(
            `Brief created, but ${failed} reference file${failed !== 1 ? "s" : ""} couldn't be attached. Open the task to re-upload.`
          );
        }
      }

      // If the coordinator uploaded a kitting photo at brief time, also create
      // a full_kitting_details row so the DEO sees it immediately in the
      // Knitting Queue. Visible warning if it fails so the coordinator knows
      // to retry via the row's ⋮ → "Full Knitting" action menu.
      if (requiresFullKitting && fullKittingPath && user) {
        // Seed party_name + form_date so the FK row identifies itself in
        // the Full Knitting screen before the DEO opens it; both get
        // overwritten when the DEO submits the 12-section form.
        const briefPartyName =
          clients.find((c) => c.id === clientId)?.party_name ?? null;
        const { data: kitRecord, error: kitErr } = await initiateKitting({
          taskId: data.id,
          submittedBy: user.id,
          imageUrl: fullKittingPath,
          partyName: briefPartyName,
          formDate: todayISO(),
        });
        if (kitErr || !kitRecord) {
          // Brief was created, but DEO queue entry wasn't — warn instead of
          // silently swallowing the error.
          console.warn("[briefing] initiateKitting failed:", kitErr);
          toast.warning(
            `Brief created, but couldn't send to DEO queue: ${kitErr ?? "unknown error"}. Open the task and use ⋮ → Full Knitting to retry.`
          );
        } else {
          // Did the coordinator also fill the form inline? If yes, write the
          // payload now — the 0021 trigger flips status to 'completed' and
          // we skip the DEO notification (no work left for them).
          const coordinatorFilledForm =
            showInlineKittingForm && hasKittingFormContent(kittingFormValues);
          if (coordinatorFilledForm) {
            const { error: submitErr } = await submitKittingForm({
              recordId: kitRecord.id,
              completedBy: user.id,
              values: kittingFormValues,
            });
            if (submitErr) {
              console.warn(
                "[briefing] inline knitting form submit failed:",
                submitErr
              );
              toast.warning(
                `Brief created and image uploaded, but the knitting form couldn't be saved: ${submitErr}. Open the task to retry.`
              );
            }
          } else {
            void sendNotificationToRole(
              ["deo"],
              "New knitting form",
              `${data.task_code} · ${data.concept ?? "task"} — form photo uploaded, ready to digitize.`,
              "info",
              ROUTES.kitting
            );
          }
        }
      }

      clearDraftOnSuccess();
      if (isDialog && onSuccess) {
        toast.success(
          splitEnabled && splitRows.length >= 2
            ? `Brief created & split among ${splitRows.length} designers: ${data.task_code}`
            : `Brief created: ${data.task_code}`
        );
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
    // resume — counts only the REQUIRED fields the user explicitly filled, so
    // we don't surface "2 fields saved" when the only real values are the
    // default `priority: 'normal'` and the auto-populated `assignedBy`.
    const filledCount = filledFieldCount;
    const previewBits = [
      d.concept ? `Design type: ${String(d.concept).slice(0, 40)}` : null,
      d.description ? `Description: ${String(d.description).slice(0, 40)}` : null,
      d.qty ? `Qty: ${d.qty}` : null,
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
      isDialog ? "px-4 py-3 sm:px-5 sm:py-4" : "mx-auto max-w-[680px] px-4 py-4",
      "space-y-2"
    )}>
      {/* ---------- Header banner ---------- */}
      <div className="relative overflow-hidden rounded-lg border border-primary/15 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-card px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm shadow-primary/20">
            <ClipboardList className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-sans text-sm font-semibold tracking-tight text-foreground sm:text-base">
              New Brief
            </h1>
            <p className="text-[10px] text-muted-foreground">
              Pre-Pool stage · a task code is assigned on submit.
            </p>
          </div>
          <Badge className="ml-auto hidden shrink-0 border border-primary/20 bg-primary/10 text-[10px] font-medium uppercase tracking-wider text-primary sm:inline-flex">
            Pre-Pool
          </Badge>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2" noValidate>
        {/* ============== BRIEF TYPE — LD / Job Work ==============
            LD = internal LinkD work, no external party (client_id stays NULL).
            Job Work = external client; show the Job Work party picker.
            Admins maintain the Job Work party list in Settings → Party Name. */}
        <SectionCard icon={Building2} title="Party Name" required>
          <div className="flex w-full rounded-md border border-border bg-card p-0.5">
            <BriefTypeChoice
              active={briefType === "ld"}
              onClick={() => {
                setBriefType("ld");
                // Clearing the picker selection avoids submitting a stale
                // Job Work party with brief_type='ld'.
                setClientId("");
              }}
              disabled={submitting}
            >
              LD
              <span className="ml-1 text-[10px] font-normal opacity-70">
                · internal
              </span>
            </BriefTypeChoice>
            <BriefTypeChoice
              active={briefType === "job_work"}
              onClick={() => setBriefType("job_work")}
              disabled={submitting}
            >
              Job Work
              <span className="ml-1 text-[10px] font-normal opacity-70">
                · external
              </span>
            </BriefTypeChoice>
          </div>

          {briefType === "job_work" && (
            <div className="space-y-1">
              <Label htmlFor="job-work-party">Job Work party</Label>
              <Picker
                id="job-work-party"
                value={clientId}
                onChange={setClientId}
                placeholder="Choose Job Work party"
                options={jobWorkClients.map((c) => ({
                  value: c.id,
                  label: c.party_name,
                }))}
                error={show("client_id")}
                disabled={submitting}
              />
            </div>
          )}
        </SectionCard>

        {/* ============== GROUP + REFERENCE FILES + MESSAGE ============== */}
        <SectionCard icon={MessageSquare} title="Source & Message">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field
              label="Group"
              htmlFor="wa"
              required
              error={show("whatsapp_group")}
            >
              <Picker
                id="wa"
                value={whatsappGroup}
                onChange={setWhatsappGroup}
                placeholder="Choose a group"
                options={WHATSAPP_GROUPS.map((g) => ({
                  value: g.name,
                  label: g.name,
                  icon: g.isWhatsApp ? <WhatsAppIcon /> : undefined,
                }))}
                disabled={submitting}
                error={show("whatsapp_group")}
              />
            </Field>
            <ReferenceFilesField
              files={refFiles}
              inputRef={refFileInputRef}
              onPick={onRefFilesPick}
              onRemove={removeRefFile}
              disabled={submitting}
            />
          </div>
          {/* WhatsApp received date + time — when the message originally
              arrived, not when the brief was logged. Now both required. */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field
              label="Received Date"
              htmlFor="wa_date"
              required
              error={show("whatsapp_received_date")}
            >
              <Input
                id="wa_date"
                type="date"
                value={whatsappReceivedDate}
                onChange={(e) => setWhatsappReceivedDate(e.target.value)}
                disabled={submitting}
              />
            </Field>
            <Field
              label="Received Time"
              htmlFor="wa_time"
              required={!!WHATSAPP_GROUPS.find((g) => g.name === whatsappGroup)?.isWhatsApp}
              error={show("whatsapp_received_time")}
            >
              <MessageTimeInput
                id="wa_time"
                value={whatsappReceivedTime}
                onChange={setWhatsappReceivedTime}
                disabled={submitting}
              />
            </Field>
          </div>
        </SectionCard>

        {/* ============== DESIGN BRIEF — Design Type + Quantity + Description ============== */}
        <SectionCard icon={Sparkles} title="Design Brief">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[140px_1fr]">
            <Field
              label="Quantity"
              htmlFor="qty"
              error={show("qty")}
            >
              <Input
                id="qty"
                type="number"
                min={0}
                step={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="Qty"
                disabled={submitting}
              />
            </Field>

            <Field
              label="Description"
              htmlFor="description"
              required
              error={show("description")}
            >
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Mood, palette, references, anything the designer should know."
              disabled={submitting}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
          </Field>
          </div>

          {(isDesigner || splitEnabled) && (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Field label="Design Type" htmlFor="concept_type" hint={splitEnabled ? "Default for new rows" : undefined}>
                <Picker
                  id="concept_type"
                  value={concept}
                  onChange={setConcept}
                  placeholder="Pick a design type"
                  options={conceptCategories.map((c) => ({ value: c.name, label: c.name }))}
                  disabled={submitting}
                />
              </Field>
              <Field label="Fabric" htmlFor="fabric_brief" hint={splitEnabled ? "Default for new rows" : undefined}>
                <Picker
                  id="fabric_brief"
                  value={fabric}
                  onChange={setFabric}
                  placeholder="Choose fabric"
                  options={fabrics.map((f) => ({ value: f.name, label: f.name }))}
                  disabled={submitting}
                />
              </Field>
              <Field label="Planned Deadline" htmlFor="deadline_brief" hint={splitEnabled ? "Default for new rows" : undefined}>
                <Input
                  id="deadline_brief"
                  type="date"
                  value={plannedDeadline}
                  onChange={(e) => setPlannedDeadline(e.target.value)}
                  disabled={submitting}
                />
              </Field>
            </div>
          )}
        </SectionCard>

        {/* ============== ASSIGNMENT — Assign To + Assigned By + Priority ============== */}
        <SectionCard icon={UserCheck} title="Assignment">
          {/* Split toggle */}
          <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-secondary/30 px-3 py-2 sm:items-center sm:gap-4">
            <div className="space-y-0.5">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wider text-white">
                  New
                </span>
                Split across multiple designers?
              </p>
              <p className="text-xs text-muted-foreground">
                Each designer gets their own design type, fabric &amp; deadline.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={splitEnabled}
              disabled={submitting}
              onClick={() => {
                const next = !splitEnabled;
                setSplitEnabled(next);
                if (next && splitRows.length === 0) {
                  setSplitRows([
                    { key: ++splitRowKey, designer_id: "", qty_assigned: 0, planned_deadline: plannedDeadline, design_type: "", fabric: "" },
                    { key: ++splitRowKey, designer_id: "", qty_assigned: 0, planned_deadline: plannedDeadline, design_type: "", fabric: "" },
                  ]);
                }
              }}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                splitEnabled ? "bg-primary" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "inline-block h-5 w-5 transform rounded-full bg-card shadow transition-transform duration-200 ease-in-out",
                  splitEnabled ? "translate-x-[22px]" : "translate-x-0.5"
                )}
              />
            </button>
          </div>

          {/* Single assignment (default) */}
          {!splitEnabled && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="assigned_to">
                  Assign To<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <select
                  id="assigned_to"
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  disabled={submitting}
                  className={cn(
                    "block h-9 w-full rounded-md border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50",
                    show("assigned_to") ? "border-destructive" : "border-input"
                  )}
                >
                  <option value={ASSIGN_TO_POOL}>Open Pool</option>
                  {designers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name}
                    </option>
                  ))}
                </select>
                {show("assigned_to") && (
                  <p className="text-xs text-destructive">{show("assigned_to")}</p>
                )}
              </div>

              <AssignedByPicker
                value={assignedBy}
                onChange={setAssignedBy}
                disabled={submitting}
                required
                error={show("assigned_by")}
              />

              <div className="space-y-1">
                <Label htmlFor="priority-normal">Priority</Label>
                <div className="inline-flex w-full rounded-md border border-border bg-card p-0.5">
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
              </div>
            </div>
          )}

          {/* Split rows builder */}
          {splitEnabled && (
            <SplitRowsBuilder
              rows={splitRows}
              onChange={setSplitRows}
              totalQty={Number(qty) || 0}
              defaultDesignType={concept}
              defaultFabric={fabric}
              defaultDeadline={plannedDeadline}
              designers={designers}
              disabled={submitting}
              error={show("split_rows")}
            />
          )}

          {/* Assigned By + Priority stay visible in split mode too */}
          {splitEnabled && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <AssignedByPicker
                value={assignedBy}
                onChange={setAssignedBy}
                disabled={submitting}
                required
                error={show("assigned_by")}
              />
              <div className="space-y-1">
                <Label htmlFor="priority-normal">Priority</Label>
                <div className="inline-flex w-full rounded-md border border-border bg-card p-0.5">
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
              </div>
            </div>
          )}
        </SectionCard>

        {/* ============== FULL KITTING ============== */}
        <FullKittingSection
          enabled={requiresFullKitting}
          onToggle={toggleFullKitting}
          disabled={submitting}
          sectionRef={fullKittingSectionRef}
          inputRef={fullKittingInputRef}
          file={fullKittingFile}
          previewUrl={fullKittingPreviewUrl}
          uploaded={!!fullKittingPath}
          uploading={uploadingFullKitting}
          progress={uploadProgress}
          notes={fullKittingNotes}
          onNotesChange={setFullKittingNotes}
          onPick={onFullKittingPick}
          onDrop={onFullKittingDrop}
          dragActive={dragActive}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onRemove={() => clearFullKittingFile({ removeRemote: true })}
          error={submitAttempted ? errors.full_kitting_image : undefined}
          inlineFormEnabled={showInlineKittingForm}
          onInlineFormToggle={setShowInlineKittingForm}
          inlineFormResetKey={kittingFormResetKey}
          inlineFormDefaults={kittingFormValues}
          onInlineFormChange={setKittingFormValues}
        />

        {/* ============== Submit ============== */}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
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
            disabled={
              submitting ||
              uploadingFullKitting ||
              (requiresFullKitting && !fullKittingPath)
            }
            className="gap-2 px-6 shadow-sm shadow-primary/20"
          >
            <Check className="h-4 w-4" />
            {splitEnabled
              ? `Create & split · ${splitRows.length} designer${splitRows.length === 1 ? "" : "s"}`
              : "Create brief"}
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
  inlineFormEnabled,
  onInlineFormToggle,
  inlineFormResetKey,
  inlineFormDefaults,
  onInlineFormChange,
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
  inlineFormEnabled: boolean;
  onInlineFormToggle: (next: boolean) => void;
  inlineFormResetKey: number;
  inlineFormDefaults: KittingFormValues;
  onInlineFormChange: (v: KittingFormValues) => void;
}) {
  return (
    <section
      className="space-y-1.5 rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors hover:border-primary/30 sm:px-3.5 sm:py-2.5"
      ref={sectionRef}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Layers className="h-3 w-3" />
        </span>
        <h2 className="text-[13px] font-semibold tracking-tight text-foreground">
          Full Knitting Requirements
        </h2>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-secondary/30 px-3 py-2 sm:items-center sm:gap-4">
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">
            Requires Full Knitting submission?
          </p>
          <p className="text-xs text-muted-foreground">
            Toggle on when a knitting reference image is needed before approval.
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
            <div className="space-y-1">
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
            <div className="space-y-1">
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

            {/* Optional inline knitting-form digitization. When the
                coordinator fills this in here, the row skips the DEO queue
                and lands as Completed. */}
            <div className="space-y-3 rounded-md border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3 sm:gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">
                    Digitize the knitting form now?
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Optional — fill the 12-section form here if details are
                    ready. Leave off to let the DEO digitize it later.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={inlineFormEnabled}
                  disabled={disabled}
                  onClick={() => onInlineFormToggle(!inlineFormEnabled)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                    inlineFormEnabled ? "bg-primary" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-5 w-5 transform rounded-full bg-card shadow transition-transform duration-200 ease-in-out",
                      inlineFormEnabled
                        ? "translate-x-[22px]"
                        : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>

              <div
                className={cn(
                  "grid overflow-hidden transition-[grid-template-rows] duration-300 ease-in-out",
                  inlineFormEnabled ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                )}
                aria-hidden={!inlineFormEnabled}
              >
                <div className="min-h-0">
                  {inlineFormEnabled && (
                    <div className="pt-3">
                      <FullKittingForm
                        key={inlineFormResetKey}
                        embedded
                        defaultValues={inlineFormDefaults}
                        onValuesChange={onInlineFormChange}
                        onSubmit={() => {
                          /* outer brief form owns submit */
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// SPLIT ROWS BUILDER
// ============================================================================

function SplitRowsBuilder({
  rows,
  onChange,
  totalQty,
  defaultDesignType,
  defaultFabric,
  defaultDeadline,
  designers,
  disabled,
  error,
}: {
  rows: BriefSplitRow[];
  onChange: (rows: BriefSplitRow[]) => void;
  totalQty: number;
  defaultDesignType: string;
  defaultFabric: string;
  defaultDeadline: string;
  designers: { id: string; full_name: string; is_active?: boolean | null }[];
  disabled?: boolean;
  error?: string;
}) {
  const { fabrics } = useFabrics();
  const { categories: conceptCategories } = useConceptCategories();

  const fabricOptions = useMemo(
    () => fabrics.map((f) => ({ value: f.name, label: f.name })),
    [fabrics]
  );
  const designTypeOptions = useMemo(
    () => conceptCategories.map((c) => ({ value: c.name, label: c.name })),
    [conceptCategories]
  );
  const activeDesigners = useMemo(
    () => designers.filter((d) => d.is_active !== false),
    [designers]
  );

  const assigned = rows.reduce((s, r) => s + (r.qty_assigned || 0), 0);
  const remaining = totalQty > 0 ? totalQty - assigned : 0;

  const duplicateDesigners = useMemo(() => {
    const ids = rows.map((r) => r.designer_id).filter(Boolean);
    return new Set(ids.filter((id, i) => ids.indexOf(id) !== i));
  }, [rows]);

  function updateRow(key: number, patch: Partial<BriefSplitRow>) {
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: number) {
    onChange(rows.filter((r) => r.key !== key));
  }

  function addRow() {
    onChange([
      ...rows,
      {
        key: ++splitRowKey,
        designer_id: "",
        qty_assigned: 0,
        planned_deadline: defaultDeadline,
        design_type: "",
        fabric: "",
      },
    ]);
  }

  return (
    <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/[0.02] p-3">
      {/* Header counter */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
          <Users className="h-3.5 w-3.5" />
          Team split
        </span>
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 font-mono text-xs font-semibold tabular-nums",
            assigned > totalQty && totalQty > 0
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : assigned === totalQty && totalQty > 0
              ? "border-success/40 bg-success/10 text-success"
              : "border-border bg-secondary text-foreground"
          )}
        >
          {assigned} / {totalQty || "—"}
        </span>
      </div>

      {/* Rows */}
      {rows.map((row, idx) => (
        <div
          key={row.key}
          className="relative rounded-lg border border-border bg-card p-2.5"
        >
          {/* Mobile remove — top-right (desktop uses the inline trash column).
              Only shown when removable (≥ 3 rows). */}
          {rows.length > 2 && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeRow(row.key)}
              className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30 sm:hidden"
              aria-label="Remove row"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {/* Designer · Qty · Deadline (· remove on desktop). On mobile the
              Designer takes a full row, then Qty + Deadline sit side by side. */}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-[1fr_64px_110px_28px] sm:items-end">
            <div className="col-span-2 sm:col-span-1">
              <Label className={cn("mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground", idx !== 0 && "sm:hidden")}>
                Designer <span className="text-destructive">*</span>
              </Label>
              <select
                value={row.designer_id}
                onChange={(e) =>
                  updateRow(row.key, { designer_id: e.target.value })
                }
                disabled={disabled}
                className={cn(
                  "h-9 w-full rounded-md border bg-card px-2 text-sm text-foreground outline-none transition-colors",
                  "focus:border-primary focus:ring-1 focus:ring-ring disabled:opacity-50",
                  duplicateDesigners.has(row.designer_id) &&
                    row.designer_id &&
                    "border-destructive"
                )}
              >
                <option value="">Select…</option>
                {activeDesigners.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className={cn("mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground", idx !== 0 && "sm:hidden")}>
                Qty <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                min={1}
                placeholder="0"
                value={row.qty_assigned || ""}
                onChange={(e) =>
                  updateRow(row.key, {
                    qty_assigned: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                disabled={disabled}
                className="h-9 tabular-nums"
              />
            </div>
            <div>
              <Label className={cn("mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground", idx !== 0 && "sm:hidden")}>
                Deadline
              </Label>
              <Input
                type="date"
                value={row.planned_deadline}
                onChange={(e) =>
                  updateRow(row.key, { planned_deadline: e.target.value })
                }
                onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                disabled={disabled}
                className="h-9 cursor-pointer text-xs"
              />
            </div>
            <button
              type="button"
              disabled={disabled || rows.length <= 2}
              onClick={() => removeRow(row.key)}
              className="hidden h-9 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30 sm:inline-flex"
              aria-label="Remove row"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Row 2: Design Type + Fabric */}
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <div>
              <Label className={cn("mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground", idx !== 0 && "sm:hidden")}>
                Design Type
              </Label>
              <Combobox
                value={row.design_type}
                onChange={(v) => updateRow(row.key, { design_type: v })}
                options={designTypeOptions}
                placeholder="Pick type"
                searchPlaceholder="Search…"
                clearable
                disabled={disabled}
              />
            </div>
            <div>
              <Label className={cn("mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground", idx !== 0 && "sm:hidden")}>
                Fabric
              </Label>
              <Combobox
                value={row.fabric}
                onChange={(v) => updateRow(row.key, { fabric: v })}
                options={fabricOptions}
                placeholder="Pick fabric"
                searchPlaceholder="Search…"
                clearable
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      ))}

      {/* Add designer */}
      <button
        type="button"
        onClick={addRow}
        disabled={disabled || (totalQty > 0 && remaining <= 0)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/30 bg-card py-2.5 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Add designer
      </button>

      {/* Hint text */}
      {rows.length < 2 ? (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Add at least 2 designers to split this task.
        </p>
      ) : assigned > totalQty && totalQty > 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Over by {assigned - totalQty} — reduce a designer's quantity.
        </p>
      ) : assigned === totalQty && totalQty > 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-success">
          <Check className="h-3.5 w-3.5 shrink-0" />
          Fully split across {rows.length} designers.
        </p>
      ) : remaining > 0 && totalQty > 0 ? (
        <p className="text-xs text-muted-foreground">
          {rows.length} designer{rows.length !== 1 ? "s" : ""} · {remaining} design{remaining !== 1 ? "s" : ""} left in pool, claimable by anyone.
        </p>
      ) : null}

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

// ============================================================================
// Small building blocks
// ============================================================================

/**
 * SectionCard — a rounded, bordered group with an icon badge + title. Gives the
 * brief form a modern, scannable card layout instead of flat stacked sections.
 */
function SectionCard({
  icon: Icon,
  title,
  hint,
  required,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  required?: boolean;
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
          {required && <span className="ml-0.5 text-destructive">*</span>}
          {hint && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{hint}</span>}
        </h2>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/**
 * AssignedByPicker — fixed-roster dropdown with an "Other" escape hatch.
 *
 * `value` is the canonical string we'll store in `tasks.assigned_by`.
 *  - If `value` is in ASSIGNED_BY_OPTIONS → dropdown selects that name.
 *  - Otherwise → "Other" is selected and a free-text input appears, pre-
 *    filled with whatever `value` currently holds (so legacy or auto-filled
 *    names like the signed-in user's profile name are editable, not lost).
 *
 * Switching FROM the roster TO "Other" clears the input so the user starts
 * typing fresh. Switching back to a roster name commits that name directly.
 *
 * We use a small dedicated `otherMode` boolean so the dropdown stays on
 * "Other" while the user is typing (even when the typed buffer is empty) —
 * a value-only derivation would jump back to the placeholder option as
 * soon as the field was cleared.
 */
function AssignedByPicker({
  value,
  onChange,
  disabled,
  required,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
}) {
  // Admin-managed roster (Settings → Assigned By).
  const { names: assignedByNames } = useAssignedByOptions();
  // Initial mode: if the seeded value isn't in the roster, we open in "Other"
  // mode so the user sees the input pre-populated and editable.
  const inRoster = (v: string): boolean => assignedByNames.includes(v);
  const [otherMode, setOtherMode] = useState(
    value !== "" && !inRoster(value)
  );

  // Dropdown's effective <select> value
  const dropdownValue = otherMode ? ASSIGNED_BY_OTHER : inRoster(value) ? value : "";

  function handleSelect(next: string) {
    if (next === ASSIGNED_BY_OTHER) {
      setOtherMode(true);
      onChange(""); // clear so the input starts empty
    } else {
      setOtherMode(false);
      onChange(next);
    }
  }

  return (
    <Field label="Assigned By" htmlFor="assigned_by" required={required} error={error}>
      <select
        id="assigned_by"
        value={dropdownValue}
        onChange={(e) => handleSelect(e.target.value)}
        disabled={disabled}
        className={cn(
          "block h-9 w-full rounded-md border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50",
          error ? "border-destructive" : "border-input"
        )}
      >
        <option value="">Select a name…</option>
        {assignedByNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        <option value={ASSIGNED_BY_OTHER}>Other</option>
      </select>
      {otherMode && (
        <Input
          value={value}
          maxLength={60}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type the name"
          disabled={disabled}
          className="mt-2"
          autoFocus
        />
      )}
    </Field>
  );
}

/**
 * ReferenceFilesField — optional multi-file picker shown beside the Group
 * dropdown. Any file type, 50 MB each. Files are held as raw File objects and
 * uploaded after the brief is created (see handleSubmit), so cancelling the
 * form never leaves orphaned uploads.
 */
function ReferenceFilesField({
  files,
  inputRef,
  onPick,
  onRemove,
  disabled,
}: {
  files: File[];
  inputRef: React.RefObject<HTMLInputElement>;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor="brief-ref-files">Reference Files</Label>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
      >
        <Upload className="h-4 w-4" />
        Add files
      </button>
      <input
        ref={inputRef}
        id="brief-ref-files"
        type="file"
        multiple
        accept="*/*"
        onChange={onPick}
        className="hidden"
      />
      <p className="text-[11px] text-muted-foreground">
        Optional · any file type · 50 MB each
      </p>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs"
            >
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-foreground">
                {f.name}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {(f.size / 1024 / 1024).toFixed(1)} MB
              </span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                disabled={disabled}
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                aria-label={`Remove ${f.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
        {hint && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">{hint}</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// Picker — thin wrapper around the Combobox primitive. The original native
// <select> couldn't keep up with the 1.6k-client list; the autocomplete
// combobox replaces it everywhere this is used (Client, WhatsApp Group,
// Concept Category, Fabric, Assigned By, Assignee) with one swap.
// (ClientGroupPicker was removed — the brief form no longer lets users
//  add a party inline; admins maintain the lists in Settings → Party Name.)

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
  options: { value: string; label: string; icon?: React.ReactNode }[];
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <Combobox
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder={`Search ${placeholder?.toLowerCase().replace(/^choose a |^select /, "") ?? "options"}…`}
      disabled={disabled}
      error={!!error}
      clearable
    />
  );
}

/** Pill segment used for the LD / Job Work toggle on the brief form.
 *  Mirrors PriorityChoice styling so the two pickers visually rhyme. */
function BriefTypeChoice({
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

// ============================================================================
// MessageTimeInput — 12-hour AM/PM time picker.
// Renders hour (1–12) + minute (00–59) selects and an AM/PM toggle, but reads
// and writes the SAME 24-hour "HH:MM" string the form already stores
// (`whatsapp_received_time`). Local part-state lets the user pick AM/PM or a
// single field first; the combined value is only emitted once both hour and
// minute are chosen (so the "required" validation still works).
// ============================================================================
function MessageTimeInput({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [h12, setH12] = useState("");
  const [min, setMin] = useState("");
  const [period, setPeriod] = useState<"AM" | "PM">("AM");

  const hrRef = useRef<HTMLInputElement>(null);
  const minRef = useRef<HTMLInputElement>(null);
  const autoAdvancing = useRef(false);
  const latestH12 = useRef(h12);
  const latestMin = useRef(min);
  latestH12.current = h12;
  latestMin.current = min;

  useEffect(() => {
    const current =
      h12 && min
        ? (() => {
            let h = parseInt(h12, 10) % 12;
            if (period === "PM") h += 12;
            return `${String(h).padStart(2, "0")}:${min.padStart(2, "0")}`;
          })()
        : "";
    if ((value ?? "") === current) return;

    const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
    if (!m) {
      setH12("");
      setMin("");
      setPeriod("AM");
      return;
    }
    let h = parseInt(m[1], 10);
    setPeriod(h >= 12 ? "PM" : "AM");
    h = h % 12;
    if (h === 0) h = 12;
    setH12(String(h).padStart(2, "0"));
    setMin(m[2]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function update(nextH: string, nextMin: string, nextPeriod: "AM" | "PM") {
    setH12(nextH);
    setMin(nextMin);
    setPeriod(nextPeriod);
    latestH12.current = nextH;
    latestMin.current = nextMin;
    if (!nextH || !nextMin) {
      onChange("");
      return;
    }
    let h = parseInt(nextH, 10) % 12;
    if (nextPeriod === "PM") h += 12;
    onChange(`${String(h).padStart(2, "0")}:${nextMin.padStart(2, "0")}`);
  }

  function clampHour(n: number): string {
    const c = ((n - 1 + 12) % 12) + 1;
    return String(c).padStart(2, "0");
  }
  function clampMin(n: number): string {
    return String(((n % 60) + 60) % 60).padStart(2, "0");
  }

  function onHourInput(raw: string) {
    const d = raw.replace(/\D/g, "").slice(0, 2);
    const n = parseInt(d, 10);
    const next = d === "" ? "" : String(Math.min(12, n || 0));
    update(next, latestMin.current, period);
    if (next && (next.length === 2 || n > 1)) {
      autoAdvancing.current = true;
      minRef.current?.focus();
      minRef.current?.select();
    }
  }
  function onMinInput(raw: string) {
    const d = raw.replace(/\D/g, "").slice(0, 2);
    const next = d === "" ? "" : d.length === 2 ? String(Math.min(59, parseInt(d, 10))).padStart(2, "0") : d;
    update(latestH12.current, next, period);
  }

  function onHourKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      minRef.current?.focus();
      minRef.current?.select();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const cur = parseInt(latestH12.current, 10) || 12;
      const next = clampHour(e.key === "ArrowUp" ? cur + 1 : cur - 1);
      update(next, latestMin.current, period);
    }
  }
  function onMinKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      hrRef.current?.focus();
      hrRef.current?.select();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const cur = parseInt(latestMin.current, 10) || 0;
      const next = clampMin(e.key === "ArrowUp" ? cur + 1 : cur - 1);
      update(latestH12.current, next, period);
    }
  }

  const partCls =
    "h-9 w-9 rounded-md bg-transparent text-center text-sm font-semibold tabular-nums text-foreground placeholder:font-medium placeholder:text-muted-foreground focus:bg-secondary/60 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/40 disabled:opacity-50";

  return (
    <div
      className={cn(
        "flex h-11 w-full items-center gap-0.5 rounded-lg border border-input bg-card pl-2.5 pr-1.5 transition-colors",
        "focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30",
        disabled && "opacity-50"
      )}
    >
      <Clock className="mr-1 h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        ref={hrRef}
        id={id}
        type="text"
        inputMode="numeric"
        aria-label="Hour"
        placeholder="HH"
        maxLength={2}
        className={partCls}
        value={h12}
        onChange={(e) => onHourInput(e.target.value)}
        onKeyDown={onHourKey}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          if (autoAdvancing.current) { autoAdvancing.current = false; return; }
          const v = latestH12.current;
          if (v) update(v.padStart(2, "0"), latestMin.current, period);
        }}
        disabled={disabled}
      />
      <span className="text-sm font-bold text-muted-foreground">:</span>
      <input
        ref={minRef}
        type="text"
        inputMode="numeric"
        aria-label="Minute"
        placeholder="MM"
        maxLength={2}
        className={partCls}
        value={min}
        onChange={(e) => onMinInput(e.target.value)}
        onKeyDown={onMinKey}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          const v = latestMin.current;
          if (v) update(latestH12.current, v.padStart(2, "0"), period);
        }}
        disabled={disabled}
      />
      {/* Segmented AM/PM — sits on a recessed track, active pill lifts. */}
      <div className="ml-auto inline-flex shrink-0 items-center rounded-md bg-secondary p-0.5">
        {(["AM", "PM"] as const).map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => update(h12, min, p)}
            aria-pressed={period === p}
            className={cn(
              "rounded-[5px] px-2.5 py-1 text-xs font-semibold transition-all disabled:cursor-not-allowed",
              "outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              period === p
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
