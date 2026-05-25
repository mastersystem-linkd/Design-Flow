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
import { Upload, X, RotateCcw, AlertCircle, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
        className="sm:max-w-lg"
        onPointerDownOutside={(e) => uploading && e.preventDefault()}
        onInteractOutside={(e) => uploading && e.preventDefault()}
        onEscapeKeyDown={(e) => uploading && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Re-submit revised concept</DialogTitle>
          <DialogDescription>
            Upload your revised file(s). The original files stay in the
            audit trail; the new version becomes the hero preview for
            Ma'am's review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Show the MD feedback so designer can reference it while picking
              files. Same info shown in the drawer, just re-affirmed here. */}
          {concept?.md_notes && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
                <AlertCircle className="h-3 w-3" />
                Ma'am's feedback
              </p>
              <p className="text-xs italic text-foreground">
                "{concept.md_notes}"
              </p>
            </div>
          )}

          {/* Drag-and-drop file picker */}
          <div className="space-y-1.5">
            <Label htmlFor="resubmit-files">
              Revised file(s) <span className="text-destructive">*</span>
            </Label>
            <div
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                addFiles(Array.from(e.dataTransfer.files));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              className={cn(
                "rounded-md border-2 border-dashed p-6 text-center transition-colors",
                dragActive
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card"
              )}
            >
              <div className="flex flex-col items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-foreground">
                  Drag &amp; drop or click to add files
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Up to {MAX_SIZE_MB} MB each · JPG / PNG / PSD / PDF / MP4
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                  className="mt-1"
                >
                  Choose files
                </Button>
              </div>
              <input
                ref={inputRef}
                id="resubmit-files"
                type="file"
                multiple
                onChange={handlePick}
                className="hidden"
                disabled={uploading}
              />
            </div>
          </div>

          {/* Picked-file list */}
          {files.length > 0 && (
            <ul className="max-h-32 space-y-1.5 overflow-y-auto">
              {files.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-2.5 py-1.5"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-xs text-foreground">
                    {f.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {(f.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                  {!uploading && (
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="ml-auto text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Optional changes notes */}
          <div className="space-y-1.5">
            <Label htmlFor="resubmit-notes">
              What did you change?{" "}
              <span className="text-[10px] font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <textarea
              id="resubmit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Darkened the blues, replaced the floral motif, tightened the layout…"
              rows={3}
              maxLength={500}
              disabled={uploading}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
            <p className="text-right text-[10px] text-muted-foreground">
              {notes.length} / 500
            </p>
          </div>

          {/* Upload progress */}
          {uploading && (
            <div className="space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width] duration-200 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Uploading… {Math.round(progress)}%
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            disabled={uploading}
          >
            Cancel
          </Button>
          <LoadingButton
            size="sm"
            loading={uploading}
            loadingText="Re-submitting…"
            onClick={handleSubmit}
            disabled={files.length === 0 || uploading}
            className="gap-1.5 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:cursor-not-allowed"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Re-submit for review
          </LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
