import { useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Upload, X } from "lucide-react";
import { toast } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useClients } from "@/hooks/useClients";
import { useProfiles } from "@/hooks/useProfiles";
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
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { clients } = useClients();
  const { profiles: designers } = useProfiles({ roles: ["designer"] });

  // ---------- form state ----------
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [designerId, setDesignerId] = useState("");
  const [clientId, setClientId] = useState("");
  const [assignedBy, setAssignedBy] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const isImage = useMemo(
    () => (file ? file.type.startsWith("image/") : false),
    [file]
  );

  function resetForm() {
    setTitle("");
    setDescription("");
    setStartDate("");
    setDesignerId("");
    setClientId("");
    setAssignedBy("");
    setPriority("normal");
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setError(null);
    setUploading(false);
    setProgress(0);
  }

  function pickFile() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setError(
        `File too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max 100 MB.`
      );
      return;
    }
    setError(null);
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
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
    if (!file) {
      setError("Please upload a file");
      return;
    }
    setUploading(true);
    setProgress(8);
    setError(null);

    const timer = window.setInterval(() => {
      setProgress((p) => (p >= 90 ? p : p + Math.random() * 12));
    }, 180);

    const ext = file.name.split(".").pop() || "bin";
    const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${user.id}/concepts/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${safeExt}`;

    const { error: uploadErr } = await supabase.storage
      .from(FK_BUCKET)
      .upload(path, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });

    window.clearInterval(timer);

    if (uploadErr) {
      setUploading(false);
      setProgress(0);
      setError(`Upload failed: ${uploadErr.message}`);
      return;
    }

    const { error: submitErr } = await onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      image_url: path,
      file_url: path,
      start_date: startDate || null,
      designer_id: designerId || null,
      client_id: clientId || null,
      assigned_by: assignedBy || null,
      priority,
    });

    setProgress(100);

    if (submitErr) {
      setUploading(false);
      setError(submitErr);
      // Best-effort orphan cleanup
      void supabase.storage.from(FK_BUCKET).remove([path]);
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
        if (!o) resetForm();
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
                onChange={(e) => setTitle(e.target.value)}
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
                onChange={(e) => setDescription(e.target.value)}
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
                onChange={(e) => setStartDate(e.target.value)}
                disabled={uploading}
              />
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <Label htmlFor="concept-priority">Priority</Label>
              <select
                id="concept-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                disabled={uploading}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            {/* Designer */}
            <div className="space-y-1.5">
              <Label htmlFor="concept-designer">Designer</Label>
              <select
                id="concept-designer"
                value={designerId}
                onChange={(e) => setDesignerId(e.target.value)}
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

            {/* Party Name (Client) */}
            <div className="space-y-1.5">
              <Label htmlFor="concept-client">Party name</Label>
              <select
                id="concept-client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
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
                onChange={(e) => setAssignedBy(e.target.value)}
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

            {/* File upload */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label>
                File <span className="text-destructive">*</span>
              </Label>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                onChange={handleFileChange}
                className="hidden"
              />

              {file ? (
                <div className="relative overflow-hidden rounded-md border border-border bg-card">
                  {isImage && preview ? (
                    <img
                      src={preview}
                      alt="Preview"
                      className="block max-h-56 w-full object-contain"
                    />
                  ) : (
                    <div className="flex items-center gap-3 p-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-card">
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {file.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {(file.size / 1024 / 1024).toFixed(2)} MB · {file.type || "—"}
                        </div>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (preview) URL.revokeObjectURL(preview);
                      setFile(null);
                      setPreview(null);
                    }}
                    className="absolute right-2 top-2 rounded-full bg-black/80 p-1 text-white hover:bg-primary"
                    aria-label="Remove file"
                    disabled={uploading}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  {uploading && (
                    <div className="h-1.5 w-full bg-muted">
                      <div
                        className="h-full bg-primary transition-[width] duration-200 ease-out"
                        style={{
                          width: `${Math.min(100, Math.max(0, progress))}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
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
                    Click to upload
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    All file types · max 100 MB
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
      </DialogContent>
    </Dialog>
  );
}
