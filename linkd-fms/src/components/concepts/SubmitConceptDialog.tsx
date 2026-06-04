import { useEffect, useMemo, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Loader2,
  Upload,
  X,
  RotateCcw,
  Sparkles,
  Building2,
  CalendarDays,
  Paperclip,
} from "lucide-react";
import { toast } from "@/components/ui";
import { Combobox } from "@/components/ui/Combobox";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompression";
import { useAuth } from "@/hooks/useAuth";
import { useClients } from "@/hooks/useClients";
import { useFormDraft } from "@/hooks/useFormDraft";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAssignedByOptions } from "@/hooks/useAssignedByOptions";
import { cn } from "@/lib/utils";
import type { SubmitConceptInput } from "@/hooks/useConcepts";

const DEFAULT_PARTY_NAME = "LD SILK MILLS";

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB, matches sample-files bucket
const FK_BUCKET = "sample-files";
const ACCEPT = "*/*";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (input: SubmitConceptInput) => Promise<{ error: string | null }>;
  /** When set, the dialog opens in edit mode with pre-filled values. */
  editConcept?: {
    id: string;
    title: string;
    description?: string | null;
    start_date?: string | null;
    client_id?: string | null;
    assigned_by?: string | null;
    designs_count?: number | null;
    image_url?: string | null;
    files?: string[] | null;
  } | null;
  onEdit?: (conceptId: string, input: Partial<SubmitConceptInput>) => Promise<{ error: string | null }>;
}

export function SubmitConceptDialog({ open, onOpenChange, onSubmit, editConcept: editData, onEdit }: Props) {
  const { user, profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The Designer picker was removed — every concept is owned by the
  // submitter (whether designer or coordinator). The `profile` lookup
  // stays for any future role-conditional UI.
  void profile;

  const { jobWorkClients } = useClients();
  const { names: assignedByNames } = useAssignedByOptions();

  // ---------- form state ----------
  // Text fields live in a single draft object so we can persist the whole
  // bundle to localStorage (per-user key) and rehydrate on reopen. Files
  // can't be serialized — they stay in their own state and are NOT restored.
  type Draft = {
    title: string;
    description: string;
    startDate: string;
    clientId: string;
    assignedBy: string;
    /** Number of designs this concept contains. Required at submit; MD
     *  compares against `approved_designs_count` at final approval. */
    designsCount: string;
  };
  const DEFAULT_DRAFT: Draft = {
    title: "",
    description: "",
    startDate: todayISO(),
    clientId: "",
    // The concept's designer is always the submitter, so "SELF" is the
    // natural default for the credit line at the bottom of the brief.
    // Admin/coordinator can change it after open if they're capturing on
    // behalf of someone else.
    assignedBy: "SELF",
    designsCount: "",
  };
  const [draft, setDraft, clearDraft, draftRestored] = useFormDraft<Draft>(
    user ? `concept-draft:${user.id}` : null,
    DEFAULT_DRAFT
  );
  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));
  const {
    title,
    description,
    startDate,
    clientId,
    assignedBy,
    designsCount,
  } = draft;

  const isEditMode = !!(editData && onEdit);

  // Pre-fill form in edit mode
  const editSeedRef = useRef<string | null>(null);
  useEffect(() => {
    if (open && editData && editData.id !== editSeedRef.current) {
      editSeedRef.current = editData.id;
      setDraft({
        title: editData.title || "",
        description: editData.description || "",
        startDate: editData.start_date?.slice(0, 10) || todayISO(),
        clientId: editData.client_id || "ld_silk_mills",
        assignedBy: editData.assigned_by || "SELF",
        designsCount: editData.designs_count != null ? String(editData.designs_count) : "",
      });
    }
    if (!open) editSeedRef.current = null;
  }, [open, editData]);

  // One-shot defaulters — fire once per dialog open, never overwrite typed work.
  const defaultClientAppliedRef = useRef(false);
  const defaultStartAppliedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      defaultClientAppliedRef.current = false;
      defaultStartAppliedRef.current = false;
    }
  }, [open]);

  // Auto-pick LD SILK MILLS when dialog opens and nothing is set.
  // First try to match a real client row; if none exists, set the ID to
  // the sentinel "ld_silk_mills" so the Combobox displays the label and
  // submit sends client_id: null (the brief-form convention for LD).
  useEffect(() => {
    if (
      open &&
      !defaultClientAppliedRef.current &&
      !clientId &&
      jobWorkClients.length > 0
    ) {
      const match = jobWorkClients.find(
        (c) => c.party_name.trim().toUpperCase() === DEFAULT_PARTY_NAME
      );
      setField("clientId", match ? match.id : "ld_silk_mills");
      defaultClientAppliedRef.current = true;
    }
  }, [open, jobWorkClients, clientId]);

  // Restore start date to today if a draft came back empty.
  useEffect(() => {
    if (open && !defaultStartAppliedRef.current && !startDate) {
      setField("startDate", todayISO());
      defaultStartAppliedRef.current = true;
    }
  }, [open, startDate]);

  // Pin LD Silk Mills to the top; add it as a virtual entry if not in the DB.
  const clientOptions = useMemo(() => {
    const sorted = [...jobWorkClients].sort((a, b) =>
      a.party_name.localeCompare(b.party_name)
    );
    const opts = sorted.map((c) => ({ value: c.id, label: c.party_name }));
    opts.unshift({ value: "ld_silk_mills", label: "LD Silk Mills" });
    return opts;
  }, [jobWorkClients]);

  /**
   * Selected files awaiting upload. Each entry pairs the raw File with an
   * `objectUrl` preview (only set for images) so we can revoke it on remove.
   */
  type Pending = { file: File; objectUrl: string | null };
  const [pending, setPending] = useState<Pending[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // When a draft is restored from localStorage, the form is HIDDEN behind a
  // "Resume your draft?" prompt until the user decides. `draftDecided` flips
  // true the moment they choose Continue or Start fresh.
  const [draftDecided, setDraftDecided] = useState(false);
  useEffect(() => {
    // Re-prompt next time the dialog opens (don't carry the previous decision).
    if (!open) setDraftDecided(false);
  }, [open]);
  const showResumePrompt = open && draftRestored && !draftDecided;

  /**
   * Fully reset the form state AND the persisted draft. Use this after a
   * successful submit, or when the user explicitly clicks "Discard draft".
   */
  function clearPending() {
    // Revoke every blob URL so we don't leak memory.
    for (const p of pending) {
      if (p.objectUrl) URL.revokeObjectURL(p.objectUrl);
    }
    setPending([]);
  }

  function resetForm() {
    clearDraft();
    clearPending();
    setError(null);
    setUploading(false);
    setProgress(0);
  }

  /**
   * Reset only the volatile, non-draft state (file previews, upload progress,
   * inline error). Called when the dialog closes without submit — text fields
   * stay in memory + localStorage so reopening shows their typed work.
   */
  function clearVolatileState() {
    clearPending();
    setError(null);
    setUploading(false);
    setProgress(0);
  }

  function pickFile() {
    fileInputRef.current?.click();
  }

  /**
   * Add one or more files to the pending list. Validates each against the
   * 100 MB cap; rejected files surface as inline errors but the valid ones
   * are still added so a single oversize file doesn't lose the others.
   */
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list || list.length === 0) return;

    const tooLarge: string[] = [];
    const added: Pending[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_FILE_BYTES) {
        tooLarge.push(
          `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`
        );
        continue;
      }
      added.push({
        file: f,
        objectUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
      });
    }

    setPending((prev) => [...prev, ...added]);
    setError(
      tooLarge.length > 0
        ? `Too large (max 100 MB each): ${tooLarge.join(", ")}`
        : null
    );

    // Allow re-picking the same file later by clearing the native input value.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePending(index: number) {
    setPending((prev) => {
      const target = prev[index];
      if (target?.objectUrl) URL.revokeObjectURL(target.objectUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      setError("Not signed in");
      return;
    }
    if (!title.trim()) {
      setError("Concept name is required");
      return;
    }
    if (!description.trim()) {
      // Description is required — no minimum word count, just non-empty.
      setError("Description is required");
      return;
    }
    const designsCountNum = parseInt(designsCount, 10);
    if (
      !designsCount.trim() ||
      Number.isNaN(designsCountNum) ||
      designsCountNum < 1
    ) {
      setError("Enter how many designs are in this concept (minimum 1)");
      return;
    }
    setUploading(true);
    setProgress(2);
    setError(null);

    // Sequential upload: each file gets ~ (100 / total) of the progress bar.
    // We compress images before uploading; PSD/PDF/video pass through.
    const uploadedPaths: string[] = [];
    const perFileShare = pending.length > 0 ? 95 / pending.length : 95;

    for (let i = 0; i < pending.length; i++) {
      const p = pending[i]!;
      const startPct = 2 + i * perFileShare;
      setProgress(startPct);

      try {
        const processed = await compressImage(p.file);

        const ext = processed.name.split(".").pop() || "bin";
        const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${user.id}/concepts/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}.${safeExt}`;

        const { error: uploadErr } = await supabase.storage
          .from(FK_BUCKET)
          .upload(path, processed, {
            upsert: false,
            contentType: processed.type || "application/octet-stream",
          });

        if (uploadErr) {
          // Roll back any files already uploaded so we don't leave orphans.
          if (uploadedPaths.length > 0) {
            void supabase.storage.from(FK_BUCKET).remove(uploadedPaths);
          }
          setUploading(false);
          setProgress(0);
          setError(`Upload failed for ${p.file.name}: ${uploadErr.message}`);
          return;
        }
        uploadedPaths.push(path);
      } catch (err) {
        if (uploadedPaths.length > 0) {
          void supabase.storage.from(FK_BUCKET).remove(uploadedPaths);
        }
        setUploading(false);
        setProgress(0);
        setError(
          `Upload failed for ${p.file.name}: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
        return;
      }

      setProgress(startPct + perFileShare);
    }

    const primary = uploadedPaths[0] ?? (isEditMode ? editData?.image_url ?? "" : "");
    const allFiles = uploadedPaths.length > 0
      ? uploadedPaths
      : (isEditMode ? editData?.files ?? [] : []);

    let submitErr: string | null;
    if (isEditMode && editData) {
      const updates: Partial<SubmitConceptInput> = {
        title: title.trim(),
        description: description.trim() || null,
        start_date: startDate || null,
        client_id: clientId && clientId !== "ld_silk_mills" ? clientId : null,
        assigned_by: assignedBy || null,
        designs_count: designsCountNum,
      };
      if (uploadedPaths.length > 0) {
        updates.image_url = primary;
        updates.file_url = primary;
        updates.files = allFiles;
      }
      const result = await onEdit!(editData.id, updates);
      submitErr = result.error;
    } else {
      const result = await onSubmit({
        title: title.trim(),
        description: description.trim() || null,
        image_url: primary,
        file_url: primary,
        files: allFiles,
        start_date: startDate || null,
        designer_id: user.id,
        client_id: clientId && clientId !== "ld_silk_mills" ? clientId : null,
        assigned_by: assignedBy || null,
        priority: "normal",
        designs_count: designsCountNum,
      });
      submitErr = result.error;
    }

    setProgress(100);

    if (submitErr) {
      setUploading(false);
      setError(submitErr);
      if (uploadedPaths.length > 0) {
        void supabase.storage.from(FK_BUCKET).remove(uploadedPaths);
      }
      return;
    }

    window.setTimeout(() => {
      setUploading(false);
      setProgress(0);
    }, 250);
    toast.success(isEditMode ? "Concept updated" : "Concept submitted");
    resetForm();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Closing without submitting → keep draft in localStorage so the
        // user can come back and finish later. Only volatile state (file
        // preview, inline error, progress bar) is wiped here.
        if (!o) clearVolatileState();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-[700px] max-h-[92vh] overflow-y-auto p-0" srTitle="Submit a concept">
        {/* Header */}
        <div className="relative overflow-hidden border-b border-primary/15 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-card px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm shadow-primary/20">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-tight text-foreground sm:text-base">{isEditMode ? "Edit Concept" : "Submit a Concept"}</h2>
              <p className="text-[10px] text-muted-foreground">Captures who started it, for which party, and the supporting files.</p>
            </div>
          </div>
        </div>

        {/*
          Resume-draft chooser. Renders INSTEAD of the form when we restored
          a draft from localStorage and the user hasn't decided whether to
          keep it. Once they pick a path, `draftDecided` flips and the form
          appears below.
        */}
        {showResumePrompt ? (
          <div className="px-4 py-4 sm:px-5">
            <div className="rounded-lg border border-primary/30 bg-primary/[0.04] p-4">
              <h3 className="text-base font-semibold text-foreground">
                Resume your draft?
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                We saved what you typed last time. You can pick up where you
                left off, or start fresh with an empty form.
              </p>

              {/* Tiny preview of what's saved so the user knows what they'd be resuming. */}
              <div className="mt-3 space-y-1 rounded-md bg-card px-3 py-2 text-xs">
                <p>
                  <span className="font-medium text-muted-foreground">
                    Concept:
                  </span>{" "}
                  <span className="text-foreground">
                    {title || <em className="italic text-muted-foreground">empty</em>}
                  </span>
                </p>
                <p>
                  <span className="font-medium text-muted-foreground">
                    Description:
                  </span>{" "}
                  <span className="text-foreground">
                    {description
                      ? description.length > 80
                        ? description.slice(0, 80) + "…"
                        : description
                      : <em className="italic text-muted-foreground">empty</em>}
                  </span>
                </p>
                <p className="text-[10px] text-muted-foreground/70">
                  Files aren't saved — you'll need to re-attach them.
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetForm();
                    setDraftDecided(true);
                    toast.info("Started a fresh form");
                  }}
                  className="gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  Start fresh
                </Button>
                <Button
                  type="button"
                  onClick={() => setDraftDecided(true)}
                >
                  Continue draft
                </Button>
              </div>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-2 px-4 py-3 sm:px-5" noValidate>
          {/* Concept & Description */}
          <section className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors hover:border-primary/30">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Sparkles className="h-3 w-3" /></span>
              <h3 className="text-[13px] font-semibold tracking-tight text-foreground">Concept Details</h3>
            </div>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Concept <span className="text-destructive">*</span></Label>
                <Input value={title} onChange={(e) => setField("title", e.target.value)} placeholder="e.g. Botanical chintz SS24" disabled={uploading} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description <span className="text-destructive">*</span></Label>
                <textarea value={description} onChange={(e) => setField("description", e.target.value)} placeholder="Mood, palette, references…" rows={2} disabled={uploading}
                  className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" />
              </div>
            </div>
          </section>

          {/* Date, Designs Count, Party, Assigned By */}
          <section className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors hover:border-primary/30">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Building2 className="h-3 w-3" /></span>
              <h3 className="text-[13px] font-semibold tracking-tight text-foreground">Party & Assignment</h3>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Start Date</Label>
                <Input type="date" value={startDate} onChange={(e) => setField("startDate", e.target.value)} disabled={uploading} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">No. of Designs <span className="text-destructive">*</span></Label>
                <Input type="number" inputMode="numeric" min={1} step={1} value={designsCount} onChange={(e) => setField("designsCount", e.target.value)} placeholder="e.g. 10" disabled={uploading} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Party Name</Label>
                <Combobox value={clientId} onChange={(v) => setField("clientId", v)} options={clientOptions} placeholder="Search party…" clearable disabled={uploading} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Assigned By</Label>
                <Combobox value={assignedBy} onChange={(v) => setField("assignedBy", v)} options={assignedByNames.map((n) => ({ value: n, label: n }))} placeholder="Select" clearable disabled={uploading} />
              </div>
            </div>
          </section>

          {/* Files */}
          <section className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors hover:border-primary/30">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Paperclip className="h-3 w-3" /></span>
                <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
                  Files
                  {pending.length > 0 && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{pending.length} attached</span>}
                </h3>
              </div>
              {pending.length > 0 && (
                <button type="button" onClick={pickFile} disabled={uploading} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-50">
                  <Upload className="h-3 w-3" /> Add more
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept={ACCEPT} multiple onChange={handleFileChange} className="hidden" />

            {pending.length > 0 ? (
              <div className="space-y-1.5">
                {pending.map((p, i) => {
                  const isImg = p.file.type.startsWith("image/");
                  return (
                    <div key={`${p.file.name}-${i}`} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
                      {isImg && p.objectUrl ? (
                        <img src={p.objectUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-secondary/40">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">
                          {p.file.name}
                          {i === 0 && <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">Primary</span>}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{(p.file.size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                      <button type="button" onClick={() => removePending(i)} disabled={uploading} className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive disabled:opacity-50" aria-label={`Remove ${p.file.name}`}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
                {uploading && (
                  <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full bg-primary transition-[width] duration-200 ease-out" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
                  </div>
                )}
              </div>
            ) : isEditMode && editData?.files && editData.files.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium text-muted-foreground">
                  {editData.files.length} existing file{editData.files.length > 1 ? "s" : ""} — upload new files to replace
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {editData.files.map((path, i) => {
                    const name = path.split("/").pop() ?? `File ${i + 1}`;
                    const isImg = /\.(jpe?g|png|gif|webp|svg)$/i.test(path);
                    return (
                      <ExistingFileThumb key={path + i} path={path} name={name} isImage={isImg} isPrimary={path === editData.image_url} />
                    );
                  })}
                </div>
                <button type="button" onClick={pickFile} disabled={uploading}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
                  <Upload className="h-3.5 w-3.5" /> Upload new files to replace
                </button>
              </div>
            ) : (
              <button type="button" onClick={pickFile} disabled={uploading}
                className={cn("flex h-20 w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-card transition-colors hover:border-primary/40 hover:bg-secondary/30", uploading && "opacity-50")}>
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">Click to upload files</span>
                <span className="text-[10px] text-muted-foreground">All file types · max 100 MB each</span>
              </button>
            )}
          </section>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={uploading}>Cancel</Button>
            <Button type="submit" disabled={uploading} className="gap-2 px-6 shadow-sm shadow-primary/20">
              {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
              {uploading ? (isEditMode ? "Saving…" : "Submitting…") : (isEditMode ? "Save Changes" : "Submit Concept")}
            </Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExistingFileThumb({ path, name, isImage, isPrimary }: { path: string; name: string; isImage: boolean; isPrimary: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (path.startsWith("http")) { setUrl(path); return; }
      for (const bucket of ["sample-files", "design-files"] as const) {
        const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
        if (!cancelled && data?.signedUrl) { setUrl(data.signedUrl); return; }
      }
    }
    void resolve();
    return () => { cancelled = true; };
  }, [path]);

  return (
    <div className={cn("relative overflow-hidden rounded-md border border-border", isPrimary && "ring-2 ring-primary ring-offset-1")}>
      {isImage && url ? (
        <img src={url} alt={name} className="h-16 w-full object-cover" />
      ) : (
        <div className="flex h-16 w-full items-center justify-center bg-secondary/30">
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <p className="truncate px-1 py-0.5 text-[9px] text-muted-foreground">{name}</p>
      {isPrimary && (
        <span className="absolute right-0.5 top-0.5 rounded bg-primary/90 px-1 py-px text-[7px] font-bold text-white">Primary</span>
      )}
    </div>
  );
}
