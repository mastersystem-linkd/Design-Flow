import { useRef, useState } from "react";
import { Loader2, Upload, X, FileIcon } from "lucide-react";
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
import type { SampleInsert } from "@/types/database";

// ============================================================================
// Constants
// ============================================================================

const MAX_FILES = 5;
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
const FK_BUCKET = "sample-files";

// ============================================================================
// Types
// ============================================================================

interface UploadedFile {
  name: string;
  size: number;
  path: string; // storage path
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (input: SampleInsert) => Promise<{ data: unknown; error: string | null }>;
}

// ============================================================================
// Component
// ============================================================================

export function SamplingFormDialog({ open, onOpenChange, onSubmit }: Props) {
  const { user } = useAuth();
  const { clients } = useClients();
  const { profiles: designers } = useProfiles({ roles: ["designer"] });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Form state ──────────────────────────────────────────────────────
  const [partyName, setPartyName] = useState("");
  const [quality, setQuality] = useState("");
  const [totalFabricsReceived, setTotalFabricsReceived] = useState("");
  const [requirement, setRequirement] = useState("");
  const [assignedBy, setAssignedBy] = useState("");
  const [samplingDoneBy, setSamplingDoneBy] = useState("");
  const [printedMtr, setPrintedMtr] = useState("");
  const [uid, setUid] = useState("");

  // ── File state ──────────────────────────────────────────────────────
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // ── UI state ────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setPartyName("");
    setQuality("");
    setTotalFabricsReceived("");
    setRequirement("");
    setAssignedBy("");
    setSamplingDoneBy("");
    setPrintedMtr("");
    setUid("");
    setFiles([]);
    setError(null);
    setSubmitting(false);
    setUploading(false);
    setUploadProgress(0);
  }

  // ── File upload ─────────────────────────────────────────────────────

  function sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files;
    if (!picked || picked.length === 0) return;
    if (!user) return;

    const remaining = MAX_FILES - files.length;
    if (remaining <= 0) {
      setError(`Maximum ${MAX_FILES} files allowed.`);
      return;
    }

    const toUpload = Array.from(picked).slice(0, remaining);

    // Validate sizes
    for (const f of toUpload) {
      if (f.size > MAX_FILE_BYTES) {
        setError(`${f.name} is too large. Max 100 MB per file.`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }

    setUploading(true);
    setUploadProgress(10);
    setError(null);

    const timer = window.setInterval(() => {
      setUploadProgress((p) => (p >= 90 ? p : p + Math.random() * 8));
    }, 200);

    const uploaded: UploadedFile[] = [];

    for (const f of toUpload) {
      const safe = sanitizeName(f.name);
      const path = `${user.id}/samples/${Date.now()}-${safe}`;

      const { error: upErr } = await supabase.storage
        .from(FK_BUCKET)
        .upload(path, f, {
          contentType: f.type || "application/octet-stream",
          upsert: false,
        });

      if (upErr) {
        window.clearInterval(timer);
        setUploading(false);
        setUploadProgress(0);
        setError(`Upload failed for ${f.name}: ${upErr.message}`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      uploaded.push({ name: f.name, size: f.size, path });
    }

    window.clearInterval(timer);
    setFiles((prev) => [...prev, ...uploaded]);
    setUploadProgress(100);
    setTimeout(() => {
      setUploading(false);
      setUploadProgress(0);
    }, 250);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function removeFile(idx: number) {
    const f = files[idx];
    // Best-effort remove from storage
    void supabase.storage.from(FK_BUCKET).remove([f.path]);
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── Submit ──────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!partyName.trim()) {
      setError("Party name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const totalNum = totalFabricsReceived
      ? Number(totalFabricsReceived)
      : null;
    const mtrNum = printedMtr ? Number(printedMtr) : 0;

    // Store the first file path as signature_url (primary), and the rest
    // in photo_url + video_url as comma-separated (all paths for retrieval).
    const allPaths = files.map((f) => f.path);
    const signatureUrl = allPaths[0] ?? null;
    const photoUrl = allPaths.length > 1 ? allPaths.slice(1).join(",") : null;

    const row: SampleInsert = {
      party_name: partyName.trim(),
      quality: quality.trim() || null,
      total_fabrics_received:
        totalNum != null && Number.isFinite(totalNum) ? totalNum : null,
      requirement: requirement.trim() || null,
      assigned_by: assignedBy || null,
      sampling_done_by: samplingDoneBy || null,
      printed_mtr: Number.isFinite(mtrNum) ? mtrNum : 0,
      uid: uid.trim() || null,
      signature_url: signatureUrl,
      photo_url: photoUrl,
    };

    const { error: submitErr } = await onSubmit(row);
    setSubmitting(false);

    if (submitErr) {
      setError(submitErr);
      return;
    }

    toast.success("Sample record added");
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
          <DialogTitle>New Sample Record</DialogTitle>
          <DialogDescription>
            Log a sampling entry. All fields except Party Name are optional.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
            {/* Party Name */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="sample-party">
                Party Name <span className="text-destructive">*</span>
              </Label>
              <select
                id="sample-party"
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
                disabled={submitting}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Choose a party —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.party_name}>
                    {c.party_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Quality */}
            <div className="space-y-1.5">
              <Label htmlFor="sample-quality">Quality</Label>
              <Input
                id="sample-quality"
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                placeholder='e.g. Georgette 60"'
                disabled={submitting}
              />
            </div>

            {/* Total Fabrics Received */}
            <div className="space-y-1.5">
              <Label htmlFor="sample-total">Total Fabrics Received</Label>
              <Input
                id="sample-total"
                type="number"
                min={0}
                step={1}
                value={totalFabricsReceived}
                onChange={(e) => setTotalFabricsReceived(e.target.value)}
                placeholder="e.g. 100"
                disabled={submitting}
              />
            </div>

            {/* Requirement */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="sample-requirement">Requirement</Label>
              <textarea
                id="sample-requirement"
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
                rows={3}
                placeholder="Specific requirements for this sample..."
                disabled={submitting}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            </div>

            {/* Assigned By */}
            <div className="space-y-1.5">
              <Label htmlFor="sample-assigned-by">Assigned By</Label>
              <select
                id="sample-assigned-by"
                value={assignedBy}
                onChange={(e) => setAssignedBy(e.target.value)}
                disabled={submitting}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Select —</option>
                {ASSIGNED_BY_OPTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* Sampling Done By */}
            <div className="space-y-1.5">
              <Label htmlFor="sample-done-by">Sampling Done By</Label>
              <select
                id="sample-done-by"
                value={samplingDoneBy}
                onChange={(e) => setSamplingDoneBy(e.target.value)}
                disabled={submitting}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Select designer —</option>
                {designers.map((d) => (
                  <option key={d.id} value={d.full_name}>
                    {d.full_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Printed Mtr */}
            <div className="space-y-1.5">
              <Label htmlFor="sample-mtr">Printed Mtr</Label>
              <Input
                id="sample-mtr"
                type="number"
                min={0}
                step={0.5}
                value={printedMtr}
                onChange={(e) => setPrintedMtr(e.target.value)}
                placeholder="e.g. 30"
                disabled={submitting}
              />
            </div>

            {/* UID */}
            <div className="space-y-1.5">
              <Label htmlFor="sample-uid">UID</Label>
              <Input
                id="sample-uid"
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                placeholder="e.g. SM-042"
                disabled={submitting}
              />
            </div>

            {/* ── File upload (up to 5 files, 100 MB each) ─────────── */}
            <div className="sm:col-span-2 space-y-2">
              <Label>
                Signature of Receiver{" "}
                <span className="text-muted-foreground font-normal">
                  (up to {MAX_FILES} files, 100 MB each)
                </span>
              </Label>

              {/* Uploaded files list */}
              {files.length > 0 && (
                <ul className="space-y-1.5">
                  {files.map((f, i) => (
                    <li
                      key={f.path}
                      className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
                    >
                      <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {f.name}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {(f.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        disabled={submitting}
                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive disabled:opacity-50"
                        aria-label="Remove file"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Progress bar */}
              {uploading && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-[width] duration-200 ease-out"
                    style={{
                      width: `${Math.min(100, Math.max(0, uploadProgress))}%`,
                    }}
                  />
                </div>
              )}

              {/* Upload button */}
              {files.length < MAX_FILES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || submitting}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card py-4 text-sm transition-colors hover:border-primary hover:bg-secondary/30",
                    (uploading || submitting) && "opacity-50 pointer-events-none"
                  )}
                >
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {files.length === 0
                      ? "Click to upload files"
                      : `Add more (${files.length}/${MAX_FILES})`}
                  </span>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFilePick}
                disabled={uploading || submitting}
              />
            </div>

            {/* Error */}
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
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || uploading} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Saving…" : "Add Sample"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
