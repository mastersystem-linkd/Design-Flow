import { useRef, useState } from "react";
import { Upload, X, CheckCircle2, FileText, Paperclip, MessageSquare } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/LoadingButton";
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
const MAX_FILES = 10;

export function MarkDoneDialog({
  concept,
  open,
  onOpenChange,
  onMarkDone,
}: {
  concept: ConceptWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMarkDone: (
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

  function addFiles(picked: File[]) {
    const valid: File[] = [];
    for (const f of picked) {
      if (f.size > MAX_SIZE_MB * 1024 * 1024) {
        toast.error(`${f.name} exceeds ${MAX_SIZE_MB} MB limit`);
        continue;
      }
      valid.push(f);
    }
    setFiles((prev) => {
      const combined = [...prev, ...valid];
      if (combined.length > MAX_FILES) {
        toast.error(`Maximum ${MAX_FILES} files allowed`);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files ?? []));
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    if (!user || !concept) return;
    setUploading(true);
    setProgress(2);

    const uploadedPaths: string[] = [];
    const perFileShare = files.length > 0 ? 95 / files.length : 95;

    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      setProgress(2 + i * perFileShare);
      try {
        const processed = await compressImage(f);
        const ext = processed.name.split(".").pop() || "bin";
        const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${user.id}/concepts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
        const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, processed, {
          upsert: false,
          contentType: processed.type || "application/octet-stream",
        });
        if (uploadErr) {
          if (uploadedPaths.length > 0) void supabase.storage.from(BUCKET).remove(uploadedPaths);
          setUploading(false);
          setProgress(0);
          toast.error(`Upload failed for ${f.name}: ${uploadErr.message}`);
          return;
        }
        uploadedPaths.push(path);
      } catch (err) {
        if (uploadedPaths.length > 0) void supabase.storage.from(BUCKET).remove(uploadedPaths);
        setUploading(false);
        setProgress(0);
        toast.error(`Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
        return;
      }
      setProgress(2 + (i + 1) * perFileShare);
    }

    const { error } = await onMarkDone(concept.id, {
      newFiles: uploadedPaths,
      notes: notes.trim() || undefined,
    });

    if (error) {
      if (uploadedPaths.length > 0) void supabase.storage.from(BUCKET).remove(uploadedPaths);
      setUploading(false);
      setProgress(0);
      toast.error(error);
      return;
    }

    setProgress(100);
    toast.success("Marked done — design files sent to Ma'am for review");
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !uploading) { reset(); onOpenChange(false); }
        else if (o) onOpenChange(true);
      }}
    >
      <DialogContent
        className="max-w-[620px] max-h-[90vh] overflow-y-auto p-0"
        srTitle="Mark concept as done"
        onPointerDownOutside={(e) => uploading && e.preventDefault()}
        onInteractOutside={(e) => uploading && e.preventDefault()}
        onEscapeKeyDown={(e) => uploading && e.preventDefault()}
      >
        {/* Header */}
        <div className="relative overflow-hidden border-b border-success/20 bg-gradient-to-br from-success/10 via-success/[0.04] to-card px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-success text-white shadow-sm shadow-success/20">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-tight text-foreground sm:text-base">Mark as Done</h2>
              <p className="text-[10px] text-muted-foreground">Upload your finished designs for Ma'am's final review.</p>
            </div>
          </div>
        </div>

        <div className="space-y-2 px-4 py-3 sm:px-5">
          {/* Design files */}
          <section className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors hover:border-success/30">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-success/10 text-success">
                  <Paperclip className="h-3 w-3" />
                </span>
                <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
                  Design Files <span className="text-[10px] font-normal text-muted-foreground">(optional)</span>
                  {files.length > 0 && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{files.length}/{MAX_FILES}</span>}
                </h3>
              </div>
              {files.length > 0 && files.length < MAX_FILES && (
                <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-success hover:underline disabled:opacity-50">
                  <Upload className="h-3 w-3" /> Add more
                </button>
              )}
            </div>
            <input ref={inputRef} type="file" multiple accept="*/*" onChange={handlePick} className="hidden" disabled={uploading} />

            {files.length > 0 ? (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {files.map((f, i) => {
                  const isImg = f.type.startsWith("image/");
                  return (
                    <div key={`${f.name}-${i}`} className="group/file flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 px-2 py-1.5 transition-colors hover:border-success/40">
                      {isImg ? (
                        <img src={URL.createObjectURL(f)} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-success/10">
                          <FileText className="h-4 w-4 text-success" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium text-foreground">{f.name}</p>
                        <p className="text-[9px] text-muted-foreground">{(f.size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                      {!uploading && (
                        <button type="button" onClick={() => removeFile(i)} className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/file:opacity-100 hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                onDrop={(e) => { e.preventDefault(); setDragActive(false); addFiles(Array.from(e.dataTransfer.files)); }}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "relative flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border-2 border-dashed px-4 py-6 transition-all",
                  dragActive ? "border-success bg-success/10 scale-[1.01]" : "border-border bg-gradient-to-b from-success/[0.03] to-transparent hover:border-success/40 hover:from-success/[0.06]"
                )}
              >
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-full transition-colors", dragActive ? "bg-success/20" : "bg-success/10")}>
                  <Upload className={cn("h-5 w-5 transition-colors", dragActive ? "text-success" : "text-success/60")} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Drop your design files here</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">or click to browse · up to {MAX_FILES} files · {MAX_SIZE_MB} MB each</p>
                </div>
              </div>
            )}

            {uploading && (
              <div className="mt-2 space-y-1 rounded-md border border-success/20 bg-success/5 px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium text-success">Uploading {files.length} file{files.length > 1 ? "s" : ""}…</p>
                  <span className="text-[10px] font-semibold tabular-nums text-success">{Math.round(progress)}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-success/20">
                  <div className="h-full rounded-full bg-success transition-[width] duration-300 ease-out" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
                </div>
              </div>
            )}
          </section>

          {/* Notes */}
          <section className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors hover:border-success/30">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-success/10 text-success">
                  <MessageSquare className="h-3 w-3" />
                </span>
                <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
                  Notes <span className="text-[10px] font-normal text-muted-foreground">(optional)</span>
                </h3>
              </div>
              {notes.length > 0 && (
                <span className="text-[9px] tabular-nums text-muted-foreground">{notes.length}/500</span>
              )}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What did you complete? Any changes from the brief? Highlight key decisions…"
              rows={2}
              maxLength={500}
              disabled={uploading}
              className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
          </section>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
            <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }} disabled={uploading}>Cancel</Button>
            <LoadingButton
              loading={uploading}
              loadingText="Submitting…"
              onClick={handleSubmit}
              disabled={uploading}
              className="gap-1.5 bg-success px-6 text-white shadow-sm shadow-success/20 hover:bg-success/90"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark as Done
            </LoadingButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
