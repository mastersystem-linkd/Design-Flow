import { useRef, useState } from "react";
import { CheckCircle2, Package, ChevronRight, Upload, X, Paperclip } from "lucide-react";
import confetti from "canvas-confetti";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompression";
import { useAuth } from "@/hooks/useAuth";
import { useFullKitting, type KittingFormData } from "@/hooks/useFullKitting";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";
import type { TaskWithRelations, PackingType } from "@/types/database";

// ============================================================================
// Kitting form field definitions — easy to extend
// ============================================================================

interface KittingField {
  key: keyof KittingFormData;
  label: string;
  type: "text" | "textarea" | "number" | "select";
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
}

const KITTING_FIELDS: KittingField[] = [
  {
    key: "fabric_details",
    label: "Fabric Details",
    type: "textarea",
    placeholder: "Fabric composition, weight, finish, etc.",
  },
  {
    key: "colors",
    label: "Colors",
    type: "text",
    placeholder: "e.g. Navy Blue, Off White, Gold",
  },
  {
    key: "quantity",
    label: "Quantity",
    type: "number",
    placeholder: "Number of pieces",
  },
  {
    key: "accessories",
    label: "Accessories",
    type: "textarea",
    placeholder: "Buttons, zippers, labels, tags, etc.",
  },
  {
    key: "packing_type",
    label: "Packing Type",
    type: "select",
    required: true,
    options: [
      { value: "standard", label: "Standard" },
      { value: "premium", label: "Premium" },
      { value: "bulk", label: "Bulk" },
      { value: "custom", label: "Custom" },
    ],
  },
  {
    key: "special_instructions",
    label: "Special Instructions",
    type: "textarea",
    placeholder: "Any special handling, labeling, or packaging notes…",
  },
];

// ============================================================================
// Component
// ============================================================================

interface Props {
  task: TaskWithRelations;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onComplete: () => void; // called after either path (yes/no kitting) succeeds
}

export function FullKittingModal({
  task,
  open,
  onOpenChange,
  onComplete,
}: Props) {
  const { user } = useAuth();
  const { submitKitting, isPending } = useFullKitting();

  const [step, setStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState<KittingFormData>({
    packing_type: "standard",
  });
  const [confirmClose, setConfirmClose] = useState(false);
  const [completing, setCompleting] = useState(false);

  // File upload state — multi-file. Files are kept in memory (not uploaded
  // yet) and pushed to storage during submit. Per-file size guard runs at
  // pick time so we don't bother uploading anything too large.
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetState() {
    setStep(1);
    setFormData({ packing_type: "standard" });
    setFiles([]);
    setConfirmClose(false);
    setCompleting(false);
  }

  function fireConfetti() {
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.7 },
      colors: ["#4F6EF7", "#3CC97A", "#F5A623", "#F26C6C", "#FFFFFF"],
    });
  }

  // "No" path — task is already 'done' (markTaskDone was called before opening modal)
  async function handleNoKitting() {
    setCompleting(true);
    fireConfetti();
    toast.success("Task completed!");
    setTimeout(() => {
      resetState();
      onOpenChange(false);
      onComplete();
    }, 600);
  }

  // "Yes" path — upload file (if any) then submit kitting form
  async function handleSubmitKitting() {
    if (!formData.packing_type) {
      toast.error("Packing type is required.");
      return;
    }
    if (!user) {
      toast.error("Not signed in");
      return;
    }

    // Upload every selected file in order. First successful path becomes
    // `file_url` (legacy single-file readers). Failure of any one file
    // aborts the whole submit — partial uploads would leave orphaned
    // objects in storage with no DB pointer.
    const uploadedPaths: string[] = [];
    if (files.length > 0) {
      setUploading(true);
      try {
        for (const f of files) {
          const processed = await compressImage(f);
          const safeName = processed.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${user.id}/kitting/${task.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
          const { error: uploadErr } = await supabase.storage
            .from("sample-files")
            .upload(path, processed, {
              contentType: processed.type || "application/octet-stream",
            });
          if (uploadErr) {
            setUploading(false);
            toast.error(`File upload failed for "${f.name}": ${uploadErr.message}`);
            return;
          }
          uploadedPaths.push(path);
        }
      } finally {
        setUploading(false);
      }
    }

    const { error } = await submitKitting(task.id, {
      ...formData,
      files: uploadedPaths,
      file_url: uploadedPaths[0] ?? null,
    });
    if (error) {
      toast.error(error);
      return;
    }

    fireConfetti();
    toast.success("Task completed with full knitting!");
    setTimeout(() => {
      resetState();
      onOpenChange(false);
      onComplete();
    }, 600);
  }

  function handleCloseAttempt(nextOpen: boolean) {
    if (!nextOpen && step === 2) {
      // Warn about unsaved kitting data
      setConfirmClose(true);
      return;
    }
    if (!nextOpen) {
      resetState();
      onOpenChange(false);
    }
  }

  function updateField<K extends keyof KittingFormData>(
    key: K,
    value: KittingFormData[K]
  ) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  const kittingPending = isPending("submit", task.id);

  return (
    <>
      <Dialog open={open} onOpenChange={handleCloseAttempt}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle className="flex-1">
                {step === 1 ? "Complete Task" : "Full Knitting Details"}
              </DialogTitle>
              <Badge className="bg-secondary text-muted-foreground border border-border text-[10px]">
                Step {step} of 2
              </Badge>
            </div>
          </DialogHeader>

          {step === 1 ? (
            <StepDecision
              task={task}
              completing={completing}
              onYes={() => setStep(2)}
              onNo={handleNoKitting}
            />
          ) : (
            <StepKittingForm
              fields={KITTING_FIELDS}
              formData={formData}
              updateField={updateField}
              files={files}
              onFilesChange={setFiles}
              fileInputRef={fileInputRef}
              uploading={uploading}
              onSubmit={handleSubmitKitting}
              onBack={() => setStep(1)}
              isPending={kittingPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmClose}
        title="Discard knitting data?"
        description="You've started filling in the knitting form. Closing will lose your unsaved changes."
        variant="warning"
        confirmLabel="Discard"
        onConfirm={() => {
          setConfirmClose(false);
          resetState();
          onOpenChange(false);
        }}
        onCancel={() => setConfirmClose(false)}
      />
    </>
  );
}

// ============================================================================
// Step 1 — Decision
// ============================================================================

function StepDecision({
  task,
  completing,
  onYes,
  onNo,
}: {
  task: TaskWithRelations;
  completing: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="space-y-5 px-6 pb-6">
      {/* Task summary */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Task Code
            </p>
            <p className="mt-0.5 font-mono text-xs text-primary">
              {task.task_code}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Concept
            </p>
            <p className="mt-0.5 text-foreground">{task.concept}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Client
            </p>
            <p className="mt-0.5 text-foreground">
              {task.client?.party_name ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Fabric
            </p>
            <p className="mt-0.5 text-foreground">{task.fabric}</p>
          </div>
        </div>
      </div>

      {/* Question */}
      <div className="text-center">
        <Package className="mx-auto h-10 w-10 text-primary/60" />
        <h3 className="mt-3 text-base font-semibold text-foreground">
          Is Full Knitting Required?
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          If yes, you&apos;ll fill in fabric, color, accessory, and packing
          details. Otherwise, the task is marked complete right away.
        </p>
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        <Button
          className="flex-1 gap-2"
          onClick={onYes}
          disabled={completing}
        >
          Yes, Fill Details
          <ChevronRight className="h-4 w-4" />
        </Button>
        <LoadingButton
          variant="outline"
          className="flex-1"
          loading={completing}
          loadingText="Completing…"
          onClick={onNo}
        >
          <CheckCircle2 className="mr-1.5 h-4 w-4" />
          No, Complete Task
        </LoadingButton>
      </div>
    </div>
  );
}

// ============================================================================
// Step 2 — Kitting form
// ============================================================================

function StepKittingForm({
  fields,
  formData,
  updateField,
  files,
  onFilesChange,
  fileInputRef,
  uploading,
  onSubmit,
  onBack,
  isPending,
}: {
  fields: KittingField[];
  formData: KittingFormData;
  updateField: <K extends keyof KittingFormData>(
    key: K,
    value: KittingFormData[K]
  ) => void;
  files: File[];
  onFilesChange: (files: File[]) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  uploading: boolean;
  onSubmit: () => void;
  onBack: () => void;
  isPending: boolean;
}) {
  const busy = isPending || uploading;

  return (
    <div className="space-y-4 px-6 pb-6">
      {fields.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <Label htmlFor={`kit-${f.key}`}>
            {f.label}
            {f.required && <span className="ml-0.5 text-destructive">*</span>}
          </Label>

          {f.type === "textarea" ? (
            <textarea
              id={`kit-${f.key}`}
              value={(formData[f.key] as string) ?? ""}
              onChange={(e) => updateField(f.key, e.target.value)}
              placeholder={f.placeholder}
              rows={3}
              disabled={busy}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
          ) : f.type === "select" ? (
            <select
              id={`kit-${f.key}`}
              value={(formData[f.key] as string) ?? ""}
              onChange={(e) =>
                updateField(f.key, e.target.value as PackingType)
              }
              disabled={busy}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.type === "number" ? (
            <Input
              id={`kit-${f.key}`}
              type="number"
              min={0}
              value={(formData[f.key] as number) ?? ""}
              onChange={(e) =>
                updateField(
                  f.key,
                  e.target.value === "" ? null : Number(e.target.value)
                )
              }
              placeholder={f.placeholder}
              disabled={busy}
            />
          ) : (
            <Input
              id={`kit-${f.key}`}
              value={(formData[f.key] as string) ?? ""}
              onChange={(e) => updateField(f.key, e.target.value)}
              placeholder={f.placeholder}
              disabled={busy}
            />
          )}
        </div>
      ))}

      {/* ── File / Image upload — multi-file. Picked files queue in memory
          and upload on submit. Per-file 100 MB cap. */}
      <div className="space-y-1.5">
        <Label>Attachments (optional)</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept="*/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            if (picked.length === 0) return;
            const tooBig = picked.find((f) => f.size > 100 * 1024 * 1024);
            if (tooBig) {
              toast.error(
                `"${tooBig.name}" is over 100 MB — each file must be 100 MB or less.`
              );
              if (e.target) e.target.value = "";
              return;
            }
            onFilesChange([...files, ...picked]);
            if (e.target) e.target.value = "";
          }}
        />

        {files.length > 0 && (
          <ul className="space-y-1.5">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
              >
                <Paperclip className="h-4 w-4 shrink-0 text-primary" />
                <span
                  className="min-w-0 flex-1 truncate text-sm text-foreground"
                  title={f.name}
                >
                  {f.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {(f.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onFilesChange(files.filter((_, idx) => idx !== i))
                  }
                  disabled={busy}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card py-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          {files.length > 0
            ? `Add more files · max 100 MB each`
            : `Choose files · max 100 MB each`}
        </button>
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onBack}
          disabled={busy}
        >
          Back
        </Button>
        <LoadingButton
          className="flex-1"
          loading={busy}
          loadingText={uploading ? "Uploading…" : "Submitting…"}
          onClick={onSubmit}
        >
          <Package className="mr-1.5 h-4 w-4" />
          Submit Kitting
        </LoadingButton>
      </div>
    </div>
  );
}
