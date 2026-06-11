import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Trash2,
  Upload,
  X,
  ExternalLink,
  Camera,
  Paperclip,
  Image as ImageIcon,
  Video as VideoIcon,
  PenLine,
  Building2,
  Package,
  ClipboardList,
  Settings2,
  CheckSquare,
} from "lucide-react";
import { toast, Combobox } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompression";
import { useAuth } from "@/hooks/useAuth";
import { useClients } from "@/hooks/useClients";
import { useFabrics } from "@/hooks/useFabrics";
import { useProfiles } from "@/hooks/useProfiles";
import { useConceptCategories } from "@/hooks/useConceptCategories";
import { useAssignedByOptions } from "@/hooks/useAssignedByOptions";
import { useSamplingDropdowns } from "@/hooks/useSamplingDropdowns";
import { initiateKitting, getKittingBySample } from "@/lib/kittingQueries";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import type { Sample, SampleInsert, SampleUpdate } from "@/types/database";

const FK_BUCKET = "sample-files";
const MAX_FILE_BYTES = 100 * 1024 * 1024;

type FileField =
  | "photo_url"
  | "video_url"
  | "signature_url"
  | "full_kitting_image_url";

const FIELD_ACCEPT: Record<FileField, string> = {
  photo_url: "image/*",
  video_url: "video/*",
  signature_url: "image/*",
  full_kitting_image_url: "image/*,application/pdf",
};

const FIELD_LABEL: Record<FileField, string> = {
  photo_url: "Photo",
  video_url: "Video",
  signature_url: "Signature",
  full_kitting_image_url: "Full Knitting Image",
};

const FIELD_ICON: Record<FileField, React.ComponentType<{ className?: string }>> = {
  photo_url: ImageIcon,
  video_url: VideoIcon,
  signature_url: PenLine,
  full_kitting_image_url: ImageIcon,
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** If set, we're editing/viewing an existing record. Otherwise creating. */
  editSample?: Sample | null;
  /** Optional delete handler — only wired when the parent allows deletion
   *  (admins). When provided, a Delete button appears in the dialog footer. */
  onDelete?: (id: string) => Promise<{ error: string | null }>;
  onCreate: (data: SampleInsert) => Promise<{ data: unknown; error: string | null }>;
  onUpdate: (id: string, data: SampleUpdate) => Promise<{ data: unknown; error: string | null }>;
}

// ============================================================================
// SamplingFormDialog — centered popup that creates, views, and edits a
// sampling record. Every column from the Samples table is editable here so
// the table itself can stay read-only (rows are clickable, no inline edits).
// ============================================================================
export function SamplingFormDialog({
  open,
  onOpenChange,
  editSample,
  onDelete,
  onCreate,
  onUpdate,
}: Props) {
  const { user } = useAuth();
  const { clients } = useClients();
  const { fabrics } = useFabrics();
  const { names: assignedByNames } = useAssignedByOptions("sampling");
  const { names: samplingNames } = useSamplingDropdowns();
  const { profiles: allProfiles } = useProfiles({ roles: ["admin", "design_coordinator"] });
  const { categories: concepts } = useConceptCategories();
  const isEdit = !!editSample;

  // ── Form state ─────────────────────────────────────────────────────────
  const [partyName, setPartyName] = useState("");
  const [quality, setQuality] = useState("");
  const [totalFabrics, setTotalFabrics] = useState("");
  const [requirement, setRequirement] = useState("");
  const [assignedBy, setAssignedBy] = useState("");
  const [samplingDoneBy, setSamplingDoneBy] = useState("");
  const [printedMtr, setPrintedMtr] = useState("0");
  const [srNo, setSrNo] = useState("");
  const [orderOrSample, setOrderOrSample] = useState<"order" | "sample" | "">("sample");
  const [isCompleted, setIsCompleted] = useState(false);
  const [fusingOperator, setFusingOperator] = useState("");
  const [neatlyPrepared, setNeatlyPrepared] = useState(false);
  const [additionalComments, setAdditionalComments] = useState("");
  const [requiresFullKitting, setRequiresFullKitting] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [fkImageUrl, setFkImageUrl] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Computed pending qty (display only — DB column is GENERATED)
  const totalNum = Number(totalFabrics) || 0;
  const printedNum = Number(printedMtr) || 0;
  const pending = Math.max(0, totalNum - printedNum);

  // ── Sync from `editSample` whenever the dialog opens ──────────────────
  useEffect(() => {
    if (!open) return;
    setPartyName(editSample?.party_name ?? "");
    setQuality(editSample?.quality ?? "");
    setTotalFabrics(
      editSample?.total_fabrics_received != null
        ? String(editSample.total_fabrics_received)
        : ""
    );
    setRequirement(editSample?.requirement ?? "");
    setAssignedBy(editSample?.assigned_by ?? "");
    setSamplingDoneBy(editSample?.sampling_done_by ?? "");
    setPrintedMtr(
      editSample?.printed_mtr != null ? String(editSample.printed_mtr) : "0"
    );
    setSrNo(editSample?.sr_no != null ? String(editSample.sr_no) : "");
    // Default to "sample" for new entries and for legacy rows that never
    // had an explicit type set — the team's overwhelming default is
    // sampling, so we save the user a click.
    setOrderOrSample(editSample?.order_or_sample || "sample");
    setIsCompleted(editSample?.is_completed ?? false);
    setFusingOperator(editSample?.fusing_operator ?? "");
    setNeatlyPrepared(editSample?.neatly_prepared ?? false);
    setAdditionalComments(editSample?.additional_comments ?? "");
    setRequiresFullKitting(editSample?.requires_full_kitting ?? false);
    setPhotoUrl(editSample?.photo_url ?? null);
    setVideoUrl(editSample?.video_url ?? null);
    setSignatureUrl(editSample?.signature_url ?? null);
    setFkImageUrl(editSample?.full_kitting_image_url ?? null);
    setError(null);
  }, [open, editSample]);

  function resetAll() {
    setPartyName("");
    setQuality("");
    setTotalFabrics("");
    setRequirement("");
    setAssignedBy("");
    setSamplingDoneBy("");
    setPrintedMtr("0");
    setSrNo("");
    setOrderOrSample("sample");
    setIsCompleted(false);
    setFusingOperator("");
    setNeatlyPrepared(false);
    setAdditionalComments("");
    setRequiresFullKitting(false);
    setPhotoUrl(null);
    setVideoUrl(null);
    setSignatureUrl(null);
    setFkImageUrl(null);
    setError(null);
  }

  async function handleSubmit() {
    if (!partyName.trim()) {
      setError("Party name is required.");
      return;
    }
    setSaving(true);
    setError(null);

    // Stamp/clear completion_timestamp when the toggle changes vs. saved
    // state — keeps the audit trail tight without exposing the timestamp
    // as a separate input.
    const prevCompleted = editSample?.is_completed ?? false;
    const completionTimestamp =
      isCompleted === prevCompleted
        ? undefined // leave alone
        : isCompleted
          ? new Date().toISOString()
          : null;

    const payload: SampleUpdate = {
      party_name: partyName.trim(),
      quality: quality.trim() || null,
      total_fabrics_received: totalNum || null,
      printed_mtr: printedNum,
      requirement: requirement.trim() || null,
      assigned_by: assignedBy.trim() || null,
      sampling_done_by: samplingDoneBy.trim() || null,
      sr_no: srNo.trim() === "" ? null : Number(srNo),
      order_or_sample: orderOrSample,
      is_completed: isCompleted,
      fusing_operator: fusingOperator.trim() || null,
      neatly_prepared: neatlyPrepared,
      additional_comments: additionalComments.trim() || null,
      photo_url: photoUrl,
      video_url: videoUrl,
      signature_url: signatureUrl,
      requires_full_kitting: requiresFullKitting,
      full_kitting_image_url: fkImageUrl,
      ...(completionTimestamp !== undefined
        ? { completion_timestamp: completionTimestamp }
        : {}),
      // Advance the sampling lifecycle ON SAVE. A task-sourced sample (from the
      // Pending tab) leaves Pending only when the coordinator saves it:
      // in_progress while being worked, completed when marked done. Manual
      // samples only flip to completed (they never sit in the Pending tab).
      ...(editSample?.source === "task_completion" || editSample?.source === "sales_erp"
        ? {
            sample_status: (isCompleted ? "completed" : "in_progress") as
              | "completed"
              | "in_progress",
          }
        : isCompleted
          ? { sample_status: "completed" as const }
          : {}),
    };

    if (isEdit && editSample) {
      const { error: e } = await onUpdate(editSample.id, payload);
      if (e) {
        setSaving(false);
        setError(e);
        return;
      }
      // FK row creation runs after the sample save so we have a stable
      // sample_id. Edit mode: only create if a FK row doesn't already exist
      // (the DEO may have already started filling it in).
      await ensureKittingRow(editSample.id);
      setSaving(false);
      toast.success("Sample updated");
      onOpenChange(false);
    } else {
      const insertPayload: SampleInsert = {
        ...(payload as SampleInsert),
        party_name: partyName.trim(),
      };
      const { data: created, error: e } = await onCreate(insertPayload);
      if (e) {
        setSaving(false);
        setError(e);
        return;
      }
      const newSampleId = (created as { id?: string } | null)?.id;
      if (newSampleId) await ensureKittingRow(newSampleId);
      setSaving(false);
      toast.success("Sample added");
      onOpenChange(false);
    }
  }

  // ── FK row provisioning ────────────────────────────────────────────────
  // Mirrors the brief flow: as soon as the coordinator saves a sample with
  // `requires_full_kitting = true` AND a `full_kitting_image_url`, we create
  // a full_kitting_details row linked via sample_id. The DEO sees it in
  // their queue immediately; admins see it in the new Sampling → Full
  // Knitting sub-tab with red "Pending" until the DEO fills the form.
  async function ensureKittingRow(sampleId: string) {
    if (!user) return;
    if (!requiresFullKitting || !fkImageUrl) return;
    const { data: existing } = await getKittingBySample(sampleId);
    if (existing) return; // already initiated — don't clobber DEO progress
    const { error: kitErr } = await initiateKitting({
      sampleId,
      submittedBy: user.id,
      imageUrl: fkImageUrl,
      partyName: partyName.trim() || null,
      formDate: new Date().toISOString().slice(0, 10),
    });
    if (kitErr) {
      console.warn("[sample] initiateKitting failed:", kitErr);
      toast.warning(
        `Sample saved, but couldn't send to DEO queue: ${kitErr}.`
      );
    }
  }

  async function handleDelete() {
    if (!editSample || !onDelete) return;
    setDeleting(true);
    const { error: e } = await onDelete(editSample.id);
    setDeleting(false);
    setConfirmingDelete(false);
    if (e) {
      toast.error(e);
      return;
    }
    toast.success("Sample deleted");
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetAll();
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[700px]"
        srTitle={isEdit ? "Sample Details" : "Add Sample"}
      >
        {/* Header */}
        <div className="shrink-0 relative overflow-hidden border-b border-primary/15 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-card px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm shadow-primary/20">
              <Upload className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-tight text-foreground sm:text-base">
                {isEdit ? "Sample Details" : "Add Sample"}
              </h2>
              <p className="text-[10px] text-muted-foreground">
                {isEdit ? "View or update this sampling record." : "Log a new sampling entry."}
              </p>
            </div>
            {isEdit && editSample?.uid && (
              <Badge className="ml-auto shrink-0 border border-primary/20 bg-primary/10 font-mono text-[10px] font-medium text-primary">
                {editSample.uid}
              </Badge>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3 sm:px-5">
          {/* Party & Requirement */}
          <section className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors hover:border-primary/30">
            <SectionHeader icon={Building2} title="Party & Requirement" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Field label="Party Name" required>
                <Combobox
                  value={partyName}
                  onChange={setPartyName}
                  options={clients.map((c) => ({ value: c.party_name, label: c.party_name }))}
                  placeholder="Search party…"
                  disabled={saving}
                  clearable
                />
              </Field>
              <Field label="Quality (Fabric)">
                <Combobox
                  value={quality}
                  onChange={setQuality}
                  options={fabrics.map((f) => ({ value: f.name, label: f.name }))}
                  placeholder="Choose fabric"
                  disabled={saving}
                  clearable
                />
              </Field>
              <Field label="Requirement">
                <Combobox
                  value={requirement}
                  onChange={setRequirement}
                  options={samplingNames.requirement.map((n) => ({ value: n, label: n }))}
                  placeholder="Select requirement"
                  disabled={saving}
                  clearable
                />
              </Field>
            </div>
          </section>

          {/* Team — Printed Mtr moved here (its own section removed); the
              Order / Sample toggle was removed per spec. */}
          <section className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors hover:border-primary/30">
            <SectionHeader icon={ClipboardList} title="Team" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
              <Field label="Printed Mtr">
                <Input type="number" min={0} step={0.5} value={printedMtr} onChange={(e) => setPrintedMtr(e.target.value)} disabled={saving} />
              </Field>
              <Field label="Assigned By">
                <Combobox
                  value={assignedBy}
                  onChange={setAssignedBy}
                  options={assignedByNames.map((n) => ({ value: n, label: n }))}
                  placeholder="Select"
                  disabled={saving}
                  clearable
                />
              </Field>
              <Field label="Sampling Done By">
                <Combobox
                  value={samplingDoneBy}
                  onChange={setSamplingDoneBy}
                  options={samplingNames.sampling_done_by.map((n) => ({ value: n, label: n }))}
                  placeholder="Select"
                  disabled={saving}
                  clearable
                />
              </Field>
              <Field label="Fusing Operator">
                <Combobox
                  value={fusingOperator}
                  onChange={setFusingOperator}
                  options={samplingNames.fusing_operator.map((n) => ({ value: n, label: n }))}
                  placeholder="Select"
                  disabled={saving}
                  clearable
                />
              </Field>
            </div>
          </section>

          {/* Attachments */}
          <section className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors hover:border-primary/30">
            <SectionHeader icon={Paperclip} title="Attachments" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <FileSlot field="photo_url" value={photoUrl} onChange={setPhotoUrl} userId={user?.id ?? null} disabled={saving} />
              <FileSlot field="video_url" value={videoUrl} onChange={setVideoUrl} userId={user?.id ?? null} disabled={saving} />
              <FileSlot field="signature_url" value={signatureUrl} onChange={setSignatureUrl} userId={user?.id ?? null} disabled={saving} />
            </div>
          </section>

          {/* Toggles + Comments */}
          <section className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors hover:border-primary/30">
            <SectionHeader icon={CheckSquare} title="Status" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 mb-2">
              <ToggleRow label="Completed" checked={isCompleted} onChange={setIsCompleted} disabled={saving} />
              <ToggleRow label="Neatly Prepared" checked={neatlyPrepared} onChange={setNeatlyPrepared} disabled={saving} />
            </div>
            <Field label="Comments">
              <textarea value={additionalComments} onChange={(e) => setAdditionalComments(e.target.value)} rows={2} disabled={saving}
                placeholder="Optional notes…"
                className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" />
            </Field>
          </section>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            {isEdit && onDelete && (
              <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(true)} disabled={saving || deleting}
                className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <LoadingButton loading={saving} loadingText="Saving…" onClick={() => void handleSubmit()} className="gap-2 px-6 shadow-sm shadow-primary/20">
              {isEdit ? "Save Changes" : "Add Sample"}
            </LoadingButton>
          </div>
        </div>
      </DialogContent>

      {isEdit && onDelete && (
        <ConfirmDialog
          open={confirmingDelete}
          title="Delete sample record?"
          description={`"${editSample?.party_name ?? "This record"}" will be permanently deleted.`}
          variant="danger"
          confirmLabel="Delete"
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </Dialog>
  );
}

// ============================================================================
// Hoisted sub-components — defined outside the parent so their identity is
// stable across renders. If they lived inside SamplingFormDialog, every
// keystroke would unmount/remount the inputs and steal focus.
// ============================================================================

function SectionHeader({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3 w-3" />
      </span>
      <h3 className="text-[13px] font-semibold tracking-tight text-foreground">{title}</h3>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2">
      <Label className="text-[11px] font-medium text-foreground">{label}</Label>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
          checked ? "bg-primary" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
            checked ? "translate-x-4" : "translate-x-1"
          )}
        />
      </button>
    </div>
  );
}

function FileSlot({
  field,
  value,
  onChange,
  userId,
  disabled,
}: {
  field: FileField;
  value: string | null;
  onChange: (v: string | null) => void;
  userId: string | null;
  disabled?: boolean;
}) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // Photo + Signature are images → offer a camera-capture option too. Video
  // keeps a single upload (no in-app recording).
  const isImage = field !== "video_url";

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !userId) return;
    if (f.size > MAX_FILE_BYTES) {
      toast.error(`${f.name} is too large (max 100 MB).`);
      return;
    }
    setBusy(true);
    // Skip compression for video — compressImage only handles images.
    const processed = field === "video_url" ? f : await compressImage(f);
    const safe = processed.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/samples/${field}-${Date.now()}-${safe}`;
    const { error: upErr } = await supabase.storage
      .from(FK_BUCKET)
      .upload(path, processed, {
        contentType: processed.type,
        upsert: false,
      });
    setBusy(false);
    if (upErr) {
      toast.error(`Upload failed: ${upErr.message}`);
      return;
    }
    // Fire-and-forget cleanup of the previous file if one existed.
    if (value) void supabase.storage.from(FK_BUCKET).remove([value]);
    onChange(path);
  }

  async function openSigned() {
    if (!value) return;
    const { data } = await supabase.storage
      .from(FK_BUCKET)
      .createSignedUrl(value, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  function clear() {
    if (!value) return;
    void supabase.storage.from(FK_BUCKET).remove([value]);
    onChange(null);
  }

  const FieldIcon = FIELD_ICON[field];

  return (
    <div className="rounded-lg border border-border/60 bg-secondary/20 p-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-foreground">
        <FieldIcon className="h-3.5 w-3.5 text-muted-foreground" />
        {FIELD_LABEL[field]}
      </div>

      {value ? (
        <div className="flex items-center gap-1.5 rounded-md border border-success/30 bg-success/5 px-2 py-1.5 text-[11px]">
          <button
            type="button"
            onClick={() => void openSigned()}
            className="flex flex-1 items-center gap-1 truncate text-success hover:underline"
            title="Open file"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            View
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="shrink-0 text-muted-foreground hover:text-destructive"
            title="Remove"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => uploadRef.current?.click()}
            disabled={busy || disabled}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border border-dashed border-border bg-card px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
            title="Upload a file"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Upload className="h-3 w-3" />
            )}
            Upload
          </button>
          {isImage && (
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={busy || disabled}
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-dashed border-border bg-card px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
              title="Take a photo with the camera"
            >
              <Camera className="h-3 w-3" />
              Camera
            </button>
          )}
        </div>
      )}

      {/* Upload picker */}
      <input
        ref={uploadRef}
        type="file"
        accept={FIELD_ACCEPT[field]}
        className="hidden"
        onChange={(e) => void pick(e)}
      />
      {/* Camera capture (mobile opens the rear camera; desktop falls back to a
          file picker). Images only. */}
      {isImage && (
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void pick(e)}
        />
      )}
    </div>
  );
}
