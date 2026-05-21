import { useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Loader2,
  Upload,
  X,
  RotateCcw,
} from "lucide-react";
import { toast } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompression";
import { useAuth } from "@/hooks/useAuth";
import { useClients } from "@/hooks/useClients";
import { useProfiles } from "@/hooks/useProfiles";
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
import { ASSIGNED_BY_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { SubmitConceptInput } from "@/hooks/useConcepts";
import type { TaskPriority } from "@/types/database";

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB, matches sample-files bucket
const FK_BUCKET = "sample-files";
const ACCEPT = "*/*";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (input: SubmitConceptInput) => Promise<{ error: string | null }>;
}

export function SubmitConceptDialog({ open, onOpenChange, onSubmit }: Props) {
  const { user, profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The Designer dropdown is an *assignment* control — useful when an admin
  // or coordinator submits a concept on someone else's behalf. A designer
  // submitting their own concept is always the designer, so we don't show
  // the picker for them and just pass their own id at submit time.
  const isDesigner = profile?.role === "designer";

  const { clients } = useClients();
  const { profiles: designers } = useProfiles({ roles: ["designer"] });

  // ---------- form state ----------
  // Text fields live in a single draft object so we can persist the whole
  // bundle to localStorage (per-user key) and rehydrate on reopen. Files
  // can't be serialized — they stay in their own state and are NOT restored.
  type Draft = {
    title: string;
    description: string;
    startDate: string;
    designerId: string;
    clientId: string;
    assignedBy: string;
    priority: TaskPriority;
  };
  const DEFAULT_DRAFT: Draft = {
    title: "",
    description: "",
    startDate: "",
    designerId: "",
    clientId: "",
    assignedBy: "",
    priority: "normal",
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
    designerId,
    clientId,
    assignedBy,
    priority,
  } = draft;

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
    if (description.trim().length < 30) {
      setError("Description must be at least 30 characters.");
      return;
    }
    if (pending.length === 0) {
      setError("Please attach at least one file");
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

    // First uploaded file becomes the "primary" reference (image_url + file_url)
    // so the detail-drawer hero preview keeps working. Every path lands in
    // `files` so admins can grab the rest from the concept record.
    const primary = uploadedPaths[0]!;
    // Designer submitting → ignore the picker (it isn't even rendered) and
    // always assign the concept to themselves. Admin/coordinator → use whatever
    // they selected from the dropdown (or null if unassigned).
    const finalDesignerId = isDesigner ? user.id : designerId || null;
    const { error: submitErr } = await onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      image_url: primary,
      file_url: primary,
      files: uploadedPaths,
      start_date: startDate || null,
      designer_id: finalDesignerId,
      client_id: clientId || null,
      assigned_by: assignedBy || null,
      priority,
    });

    setProgress(100);

    if (submitErr) {
      setUploading(false);
      setError(submitErr);
      // Best-effort orphan cleanup — wipe every file we just uploaded.
      void supabase.storage.from(FK_BUCKET).remove(uploadedPaths);
      return;
    }

    window.setTimeout(() => {
      setUploading(false);
      setProgress(0);
    }, 250);
    toast.success("Concept submitted");
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Submit a concept</DialogTitle>
          <DialogDescription>
            Same shape as a brief — captures who started it, for which party,
            and the supporting file.
          </DialogDescription>
        </DialogHeader>

        {/*
          Resume-draft chooser. Renders INSTEAD of the form when we restored
          a draft from localStorage and the user hasn't decided whether to
          keep it. Once they pick a path, `draftDecided` flips and the form
          appears below.
        */}
        {showResumePrompt ? (
          <div className="px-6 py-6">
            <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-5">
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
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
            {/* Concept name (title) */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="concept-title">
                Concept <span className="text-destructive">*</span>
              </Label>
              <Input
                id="concept-title"
                value={title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="e.g. Botanical chintz SS24"
                required
                disabled={uploading}
              />
            </div>

            {/* Description */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="concept-description">
                Description <span className="text-destructive">*</span>
              </Label>
              <textarea
                id="concept-description"
                value={description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="Mood, palette, references… (min 30 characters)"
                rows={3}
                disabled={uploading}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
              <p className={cn(
                "text-right text-[11px]",
                description.trim().length < 30
                  ? "text-destructive"
                  : "text-muted-foreground"
              )}>
                {description.trim().length} / 30 min
              </p>
            </div>

            {/* Start Date */}
            <div className="space-y-1.5">
              <Label htmlFor="concept-start-date">Start date</Label>
              <Input
                id="concept-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setField("startDate", e.target.value)}
                disabled={uploading}
              />
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <Label htmlFor="concept-priority">Priority</Label>
              <select
                id="concept-priority"
                value={priority}
                onChange={(e) =>
                  setField("priority", e.target.value as TaskPriority)
                }
                disabled={uploading}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            {/* Designer — assignment control. Hidden for designers
                submitting their own concept (auto-assigned to themselves
                at submit time). Admin / coordinator can pick anyone. */}
            {!isDesigner && (
              <div className="space-y-1.5">
                <Label htmlFor="concept-designer">Designer</Label>
                <select
                  id="concept-designer"
                  value={designerId}
                  onChange={(e) => setField("designerId", e.target.value)}
                  disabled={uploading}
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
            )}

            {/* Party Name (Client) */}
            <div className="space-y-1.5">
              <Label htmlFor="concept-client">Party name</Label>
              <select
                id="concept-client"
                value={clientId}
                onChange={(e) => setField("clientId", e.target.value)}
                disabled={uploading}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Choose a party —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.party_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Assigned By */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="concept-assigned-by">Assigned by</Label>
              <select
                id="concept-assigned-by"
                value={assignedBy}
                onChange={(e) => setField("assignedBy", e.target.value)}
                disabled={uploading}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Select assignee —</option>
                {ASSIGNED_BY_OPTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* File upload — supports multiple files; each ≤ 100 MB */}
            <div className="sm:col-span-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>
                  Files <span className="text-destructive">*</span>
                  {pending.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {pending.length} attached
                    </span>
                  )}
                </Label>
                {pending.length > 0 && (
                  <button
                    type="button"
                    onClick={pickFile}
                    disabled={uploading}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    <Upload className="h-3 w-3" />
                    Add more
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                multiple
                onChange={handleFileChange}
                className="hidden"
              />

              {pending.length > 0 ? (
                <>
                  <ul className="space-y-2">
                    {pending.map((p, i) => {
                      const isImg = p.file.type.startsWith("image/");
                      return (
                        <li
                          key={`${p.file.name}-${i}`}
                          className="flex items-center gap-3 overflow-hidden rounded-md border border-border bg-card p-2"
                        >
                          {isImg && p.objectUrl ? (
                            <img
                              src={p.objectUrl}
                              alt={`Preview of ${p.file.name}`}
                              className="h-12 w-12 shrink-0 rounded object-cover"
                            />
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-card">
                              <ImageIcon className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-foreground">
                              {p.file.name}
                              {i === 0 && (
                                <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                  Primary
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {(p.file.size / 1024 / 1024).toFixed(2)} MB
                              {p.file.type && <> · {p.file.type}</>}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removePending(i)}
                            disabled={uploading}
                            className="rounded-full bg-black/80 p-1 text-white transition-colors hover:bg-destructive disabled:opacity-50"
                            aria-label={`Remove ${p.file.name}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {uploading && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-[width] duration-200 ease-out"
                        style={{
                          width: `${Math.min(100, Math.max(0, progress))}%`,
                        }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={pickFile}
                  disabled={uploading}
                  className={cn(
                    "flex h-32 w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-card transition-colors hover:border-primary hover:bg-secondary/30",
                    uploading && "opacity-50"
                  )}
                >
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    Click to upload one or more files
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    All file types · max 100 MB each
                  </span>
                </button>
              )}
            </div>

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
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={uploading} className="gap-2">
              {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
              {uploading ? "Submitting…" : "Submit concept"}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
