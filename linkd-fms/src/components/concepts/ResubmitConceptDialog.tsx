/**
 * ResubmitConceptDialog — designer's surface for delivering a revised
 * concept after MD asked for changes (md_status='revision_requested').
 *
 * The flow:
 *   1. Designer reads Ma'am's feedback in the drawer (already shown there)
 *   2. Clicks "Re-submit for review" → this dialog opens
 *   3. Uploads the revised file(s) — required, since the point of revision
 *      is delivering an updated version
 *   4. Optionally types "what I changed" — preserved in the activity log
 *   5. Clicks Re-submit
 *      → files uploaded to sample-files bucket under user's folder
 *      → resubmitForReview mutation:
 *          • appends new file paths to concept.files
 *          • updates image_url to the latest hero
 *          • flips md_status='pending', clears md_notes (preserved in history)
 *          • notifies admin/coordinator
 *
 * Versioning model: APPEND, not REPLACE. Every revision's files survive
 * in the concept.files JSONB array so the audit trail is complete. The
 * hero (image_url) shifts to the most recent file so the drawer + table
 * preview reflect the current version.
 */

import { useRef, useState } from "react";
import { Upload, X, RotateCcw, AlertCircle, FileText, Paperclip, MessageSquare, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompression";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type { ConceptWithRelations } from "@/types/database";
import type { MutationResult } from "@/hooks/useConcepts";
import type { Concept } from "@/types/database";

const BUCKET = "sample-files";
const MAX_SIZE_MB = 100;

export function ResubmitConceptDialog({
  concept,
  open,
  onOpenChange,
  onResubmit,
}: {
  /** The concept being revised. Null is a no-op (dialog must be controlled). */
  concept: ConceptWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Calls into resubmitForReview after files are uploaded. */
  onResubmit: (
    conceptId: string,
    options?: { newFiles?: string[]; notes?: string }
  ) => Promise<MutationResult<Concept>>;
}) {
  const { user } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function reset() {
    setFiles([]);
    setNotes("");
    setUploading(false);
    setProgress(0);
    setDragActive(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    addFiles(picked);
  }

  function addFiles(picked: File[]) {
    const valid: File[] = [];
    for (const f of picked) {
      if (f.size > MAX_SIZE_MB * 1024 * 1024) {
        toast.error(`${f.name} exceeds ${MAX_SIZE_MB} MB limit`);
        continue;
      }
      valid.push(f);
    }
    setFiles((prev) => [...prev, ...valid]);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    if (!user || !concept) return;
    if (files.length === 0) {
      toast.error("Please upload at least one revised file");
      return;
    }
    setUploading(true);
    setProgress(2);

    // Sequential upload — same pattern as SubmitConceptDialog, rolls back
    // any partial uploads on failure so we don't leave orphan files in the
    // bucket. Progress bar shares 95% across the files (2% boot, 3% tail).
    const uploadedPaths: string[] = [];
    const perFileShare = 95 / files.length;

    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      const startPct = 2 + i * perFileShare;
      setProgress(startPct);

      try {
        const processed = await compressImage(f);
        const ext = processed.name.split(".").pop() || "bin";
        const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${user.id}/concepts/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}.${safeExt}`;

        const { error: uploadErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, processed, {
            upsert: false,
            contentType: processed.type || "application/octet-stream",
          });

        if (uploadErr) {
          if (uploadedPaths.length > 0) {
            void supabase.storage.from(BUCKET).remove(uploadedPaths);
          }
          setUploading(false);
          setProgress(0);
          toast.error(`Upload failed for ${f.name}: ${uploadErr.message}`);
          return;
        }
        uploadedPaths.push(path);
      } catch (err) {
        if (uploadedPaths.length > 0) {
          void supabase.storage.from(BUCKET).remove(uploadedPaths);
        }
        setUploading(false);
        setProgress(0);
        toast.error(
          `Upload failed for ${f.name}: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
        return;
      }
      setProgress(startPct + perFileShare);
    }

    // All files up — now fire the resubmit mutation with the new paths.
    const { error } = await onResubmit(concept.id, {
      newFiles: uploadedPaths,
      notes: notes.trim() || undefined,
    });

    if (error) {
      // Roll back uploaded files so we don't leave orphans linked to an
      // un-updated row. Best-effort: bucket cleanup errors don't block the
      // user-facing toast.
      if (uploadedPaths.length > 0) {
        void supabase.storage.from(BUCKET).remove(uploadedPaths);
      }
      setUploading(false);
      setProgress(0);
      toast.error(error);
      return;
    }

    setProgress(100);
    toast.success("Re-submitted — Ma'am will see the revised version");
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !uploading) {
          reset();
          onOpenChange(false);
        } else if (o) {
          onOpenChange(true);
        }
      }}
    >
      <DialogContent
        className="max-w-[620px] max-h-[90vh] overflow-y-auto p-0"
        srTitle="Re-submit revised concept"
        onPointerDownOutside={(e) => uploading && e.preventDefault()}
        onInteractOutside={(e) => uploading && e.preventDefault()}
        onEscapeKeyDown={(e) => uploading && e.preventDefault()}
      >
        {/* Header */}
        <div className="relative overflow-hidden border-b border-primary/15 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-card px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm shadow-primary/20">
              <RotateCcw className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-tight text-foreground sm:text-base">Re-submit Revised Concept</h2>
              <p className="text-[10px] text-muted-foreground">Upload revised files — originals stay in the audit trail.</p>
            </div>
          </div>
        </div>

        <div className="space-y-2 px-4 py-3 sm:px-5">
          {/* Ma'am's feedback */}
          {concept?.md_notes && (
            <section className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
              <div className="mb-1 flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-warning/15 text-warning">
                  <AlertCircle className="h-3 w-3" />
                </span>
                <h3 className="text-[13px] font-semibold tracking-tight text-warning">Ma'am's Feedback</h3>
              </div>
              <p className="text-xs italic leading-relaxed text-foreground">"{concept.md_notes}"</p>
            </section>
          )}

          {/* Revised files */}
          <section className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors hover:border-primary/30">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Paperclip className="h-3 w-3" />
                </span>
                <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
                  Revised Files <span className="text-destructive">*</span>
                  {files.length > 0 && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{files.length} attached</span>}
                </h3>
              </div>
              {files.length > 0 && (
                <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-50">
                  <Upload className="h-3 w-3" /> Add more
                </button>
              )}
            </div>
            <input ref={inputRef} id="resubmit-files" type="file" multiple onChange={handlePick} className="hidden" disabled={uploading} />

            {files.length > 0 ? (
              <div className="space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-2 py-1">
                    <FileText className="h-3 w-3 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">{f.name}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                    {!uploading && (
                      <button type="button" onClick={() => removeFile(i)} className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive" aria-label={`Remove ${f.name}`}>
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div
                onDrop={(e) => { e.preventDefault(); setDragActive(false); addFiles(Array.from(e.dataTransfer.files)); }}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "flex h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed transition-colors",
                  dragActive ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40 hover:bg-secondary/30"
                )}
              >
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">Drag & drop or click to upload</span>
                <span className="text-[10px] text-muted-foreground">Up to {MAX_SIZE_MB} MB each · any file type</span>
              </div>
            )}

            {uploading && (
              <div className="mt-1.5 space-y-0.5">
                <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full bg-primary transition-[width] duration-200 ease-out" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground">Uploading… {Math.round(progress)}%</p>
              </div>
            )}
          </section>

          {/* Notes */}
          <section className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors hover:border-primary/30">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <MessageSquare className="h-3 w-3" />
              </span>
              <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
                What did you change? <span className="text-[10px] font-normal text-muted-foreground">(optional)</span>
              </h3>
            </div>
            <textarea
              id="resubmit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Darkened the blues, replaced the floral motif…"
              rows={2}
              maxLength={500}
              disabled={uploading}
              className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
            <p className="mt-0.5 text-right text-[10px] text-muted-foreground">{notes.length} / 500</p>
          </section>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
            <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }} disabled={uploading}>Cancel</Button>
            <LoadingButton
              loading={uploading}
              loadingText="Re-submitting…"
              onClick={handleSubmit}
              disabled={files.length === 0 || uploading}
              className="gap-1.5 px-6 shadow-sm shadow-primary/20"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Re-submit for Review
            </LoadingButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
