import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2, Upload, X, ExternalLink } from "lucide-react";
import { toast } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompression";
import { useAuth } from "@/hooks/useAuth";
import { useClients } from "@/hooks/useClients";
import { useFabrics } from "@/hooks/useFabrics";
import { ASSIGNED_BY_OPTIONS } from "@/lib/constants";
import { initiateKitting, getKittingBySample } from "@/lib/kittingQueries";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[600px]"
        srTitle={isEdit ? "Sample Details" : "Add Sample"}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-border bg-card/80 px-5 pt-5 pb-4">
          <h2 className="text-lg font-semibold text-foreground">
            {isEdit ? "Sample Details" : "Add Sample"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isEdit
              ? "View or update this sampling record."
              : "Log a new sampling entry."}
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <Field label="Party Name" required>
            <select
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              disabled={saving}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              <option value="">— Choose party —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.party_name}>
                  {c.party_name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Quality">
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              disabled={saving}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              <option value="">— Choose fabric —</option>
              {fabrics.map((f) => (
                <option key={f.id} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Total Fabrics Received">
              <Input
                type="number"
                min={0}
                value={totalFabrics}
                onChange={(e) => setTotalFabrics(e.target.value)}
                disabled={saving}
              />
            </Field>
            <Field label="Pending (computed)">
              <Input value={pending} disabled readOnly />
            </Field>
          </div>

          <Field label="Requirement">
            <textarea
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
              rows={2}
              disabled={saving}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Assigned By">
              <select
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
            </Field>

            <Field label="Sampling Done By">
              <Input
                value={samplingDoneBy}
                onChange={(e) => setSamplingDoneBy(e.target.value)}
                disabled={saving}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Printed Mtr">
              <Input
                type="number"
                min={0}
                step={0.5}
                value={printedMtr}
                onChange={(e) => setPrintedMtr(e.target.value)}
                disabled={saving}
              />
            </Field>

            <Field label="SR NO">
              <Input
                type="number"
                value={srNo}
                onChange={(e) => setSrNo(e.target.value)}
                placeholder="e.g. 101"
                disabled={saving}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Order / Sample">
              <select
                value={orderOrSample}
                onChange={(e) =>
                  setOrderOrSample(e.target.value as "order" | "sample" | "")
                }
                disabled={saving}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">—</option>
                <option value="order">Order</option>
                <option value="sample">Sample</option>
              </select>
            </Field>

            <Field label="Fusing Operator">
              <Input
                value={fusingOperator}
                onChange={(e) => setFusingOperator(e.target.value)}
                disabled={saving}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <ToggleRow
              label="Completed"
              checked={isCompleted}
              onChange={setIsCompleted}
              disabled={saving}
            />
            <ToggleRow
              label="Neatly Prepared"
              checked={neatlyPrepared}
              onChange={setNeatlyPrepared}
              disabled={saving}
            />
          </div>

          <Field label="Comments">
            <textarea
              value={additionalComments}
              onChange={(e) => setAdditionalComments(e.target.value)}
              rows={2}
              disabled={saving}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
          </Field>

          <div className="space-y-3 rounded-lg border border-border bg-card/30 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Attachments
            </p>
            <FileSlot
              field="photo_url"
              value={photoUrl}
              onChange={setPhotoUrl}
              userId={user?.id ?? null}
              disabled={saving}
            />
            <FileSlot
              field="video_url"
              value={videoUrl}
              onChange={setVideoUrl}
              userId={user?.id ?? null}
              disabled={saving}
            />
            <FileSlot
              field="signature_url"
              value={signatureUrl}
              onChange={setSignatureUrl}
              userId={user?.id ?? null}
              disabled={saving}
            />
          </div>

          <ToggleRow
            label="Requires Full Knitting?"
            checked={requiresFullKitting}
            onChange={setRequiresFullKitting}
            disabled={saving}
          />
          {requiresFullKitting && (
            <div className="rounded-lg border border-border bg-card/30 p-3">
              <FileSlot
                field="full_kitting_image_url"
                value={fkImageUrl}
                onChange={setFkImageUrl}
                userId={user?.id ?? null}
                disabled={saving}
              />
            </div>
          )}

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-5 py-4">
          <div className="flex items-center gap-2">
            {isEdit && onDelete && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmingDelete(true)}
                disabled={saving || deleting}
                className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            )}
            <div className="flex-1" />
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {isEdit ? "Cancel" : "Close"}
            </Button>
            <LoadingButton
              loading={saving}
              loadingText="Saving…"
              onClick={() => void handleSubmit()}
            >
              {isEdit ? "Save" : "Add Sample"}
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
    <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
      <Label className="text-[12px] font-medium text-foreground">{label}</Label>
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="flex items-center gap-2">
      <span className="w-[110px] text-[11px] font-medium text-muted-foreground">
        {FIELD_LABEL[field]}
      </span>
      {value ? (
        <div className="flex flex-1 items-center gap-1.5 rounded-md border border-success/30 bg-success/5 px-2 py-1.5 text-[11px]">
          <button
            type="button"
            onClick={() => void openSigned()}
            className="flex flex-1 items-center gap-1 truncate text-success hover:underline"
            title="Open file"
          >
            <ExternalLink className="h-3 w-3" />
            View
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="text-muted-foreground hover:text-destructive"
            title="Remove"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || disabled}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-card px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
          Upload
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={FIELD_ACCEPT[field]}
        className="hidden"
        onChange={(e) => void pick(e)}
      />
    </div>
  );
}
