import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Upload, X, FileIcon } from "lucide-react";
import { toast } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompression";
import { useAuth } from "@/hooks/useAuth";
import { useClients } from "@/hooks/useClients";
import { useFabrics } from "@/hooks/useFabrics";
import { ASSIGNED_BY_OPTIONS } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { cn } from "@/lib/utils";
import type { Sample, SampleInsert, SampleUpdate } from "@/types/database";

const FK_BUCKET = "sample-files";
const MAX_FILE_BYTES = 100 * 1024 * 1024;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** If set, we're editing. Otherwise creating. */
  editSample?: Sample | null;
  onCreate: (data: SampleInsert) => Promise<{ data: unknown; error: string | null }>;
  onUpdate: (id: string, data: SampleUpdate) => Promise<{ data: unknown; error: string | null }>;
}

export function SamplingFormDialog({
  open,
  onOpenChange,
  editSample,
  onCreate,
  onUpdate,
}: Props) {
  const { user } = useAuth();
  const { clients } = useClients();
  const { fabrics } = useFabrics();
  const isEdit = !!editSample;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Form state ──
  const [partyName, setPartyName] = useState(editSample?.party_name ?? "");
  const [quality, setQuality] = useState(editSample?.quality ?? "");
  const [totalFabrics, setTotalFabrics] = useState(
    editSample?.total_fabrics_received != null ? String(editSample.total_fabrics_received) : ""
  );
  const [requirement, setRequirement] = useState(editSample?.requirement ?? "");
  const [assignedBy, setAssignedBy] = useState(editSample?.assigned_by ?? "");
  const [samplingDoneBy, setSamplingDoneBy] = useState(editSample?.sampling_done_by ?? "");
  const [printedMtr, setPrintedMtr] = useState(
    editSample?.printed_mtr != null ? String(editSample.printed_mtr) : "0"
  );
  const [srNo, setSrNo] = useState(editSample?.sr_no != null ? String(editSample.sr_no) : "");

  // Fields that were removed from the user list but might still be required by DB schema:
  const orderOrSample = "";
  const notes = "";
  const uid = editSample?.uid ?? "";

  // File uploads
  const [uploadedPaths, setUploadedPaths] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // Full Knitting
  const [requiresFullKitting, setRequiresFullKitting] = useState(editSample?.requires_full_kitting ?? false);
  const [fkPaths, setFkPaths] = useState<string[]>(
    editSample?.full_kitting_image_url ? editSample.full_kitting_image_url.split(",") : []
  );
  const [fkUploading, setFkUploading] = useState(false);
  const [fkPopupOpen, setFkPopupOpen] = useState(false);
  const fkInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Computed pending
  const totalNum = Number(totalFabrics) || 0;
  const printedNum = Number(printedMtr) || 0;
  const srNum = srNo.trim() !== "" ? Number(srNo) : null;
  const pending = Math.max(0, totalNum - printedNum);

  function resetForAnother() {
    // Keep party_name for batch entry, clear the rest.
    setQuality("");
    setTotalFabrics("");
    setRequirement("");
    setAssignedBy("");
    setSamplingDoneBy("");
    setPrintedMtr("0");
    setSrNo("");
    setUploadedPaths([]);
    setRequiresFullKitting(false);
    setFkPaths([]);
    setError(null);
  }

  function resetAll() {
    setPartyName("");
    resetForAnother();
    setAssignedBy("");
    setSamplingDoneBy("");
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, isFk: boolean = false) {
    const files = e.target.files;
    if (!files || !user) return;

    const currentPaths = isFk ? fkPaths : uploadedPaths;
    const remaining = 5 - currentPaths.length;
    if (remaining <= 0) {
      setError("Max 5 files.");
      return;
    }

    if (isFk) setFkUploading(true);
    else setUploading(true);
    setError(null);

    const newPaths: string[] = [];

    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const f = files[i];
      if (f.size > MAX_FILE_BYTES) {
        setError(`${f.name} too large. Max 100 MB.`);
        break;
      }
      const processed = await compressImage(f);
      const safe = processed.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/samples/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from(FK_BUCKET)
        .upload(path, processed, { contentType: processed.type, upsert: false });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        break;
      }
      newPaths.push(path);
    }
    
    if (isFk) {
      setFkPaths((prev) => [...prev, ...newPaths]);
      setFkUploading(false);
      if (fkInputRef.current) fkInputRef.current.value = "";
    } else {
      setUploadedPaths((prev) => [...prev, ...newPaths]);
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeFile(idx: number, isFk: boolean = false) {
    const currentPaths = isFk ? fkPaths : uploadedPaths;
    const path = currentPaths[idx];
    void supabase.storage.from(FK_BUCKET).remove([path]);
    
    if (isFk) {
      setFkPaths((prev) => prev.filter((_, i) => i !== idx));
    } else {
      setUploadedPaths((prev) => prev.filter((_, i) => i !== idx));
    }
  }

  async function handleSubmit() {
    if (!partyName.trim()) {
      setError("Party name is required.");
      return;
    }
    setSaving(true);
    setError(null);

    const base: SampleInsert = {
      party_name: partyName.trim(),
      quality: quality.trim() || null,
      total_fabrics_received: totalNum || null,
      printed_mtr: printedNum,
      uid: uid.trim() || null,
      task_id: null,
      requirement: requirement.trim() || null,
      assigned_by: assignedBy.trim() || null,
      sampling_done_by: samplingDoneBy.trim() || null,
      order_or_sample: orderOrSample === "" ? undefined : orderOrSample,
      additional_comments: notes.trim() || null,
      signature_url: uploadedPaths.length > 0 ? uploadedPaths.join(",") : null,
      photo_url: null, // As requested we mapped all 5 to signature_url logic for simplicity or just keep it there
      requires_full_kitting: requiresFullKitting,
      full_kitting_image_url: fkPaths.length > 0 ? fkPaths.join(",") : null,
    };

    if (isEdit && editSample) {
      const { error: e } = await onUpdate(editSample.id, base as SampleUpdate);
      setSaving(false);
      if (e) { setError(e); return; }
      toast.success("Sample updated");
      onOpenChange(false);
    } else {
      const { error: e } = await onCreate(base);
      setSaving(false);
      if (e) { setError(e); return; }
      toast.success("Sample added");
      resetForAnother();
      onOpenChange(false);
    }
  }

  // Effect to sync editSample into state on open
  useEffect(() => {
    if (open) {
      setPartyName(editSample?.party_name ?? "");
      setQuality(editSample?.quality ?? "");
      setTotalFabrics(
        editSample?.total_fabrics_received != null ? String(editSample.total_fabrics_received) : ""
      );
      setRequirement(editSample?.requirement ?? "");
      setAssignedBy(editSample?.assigned_by ?? "");
      setSamplingDoneBy(editSample?.sampling_done_by ?? "");
      setPrintedMtr(
        editSample?.printed_mtr != null ? String(editSample.printed_mtr) : "0"
      );
      setSrNo(editSample?.sr_no != null ? String(editSample.sr_no) : "");
      setRequiresFullKitting(editSample?.requires_full_kitting ?? false);
      setFkPaths(editSample?.full_kitting_image_url ? editSample.full_kitting_image_url.split(",") : []);
      
      const sigs = editSample?.signature_url ? editSample.signature_url.split(",") : [];
      setUploadedPaths(sigs);
      setError(null);
    }
  }, [open, editSample]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetAll();
        onOpenChange(o);
      }}
    >
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[550px]">
        {/* Header */}
        <div className="shrink-0 border-b border-border bg-card/80 px-5 pt-5 pb-4">
          <h2 className="text-lg font-semibold text-foreground">
            {isEdit ? "Edit Sample" : "Add Sample"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isEdit ? "Update this sampling record." : "Log a new sampling entry."}
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {/* 1. Party Name */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Party Name <span className="text-destructive">*</span>
            </Label>
            <select
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              disabled={saving}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              <option value="">— Choose party —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.party_name}>{c.party_name}</option>
              ))}
            </select>
          </div>

          {/* 2. Quality */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Quality
            </Label>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              disabled={saving}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              <option value="">— Choose fabric —</option>
              {fabrics.map((f) => (
                <option key={f.id} value={f.name}>{f.name}</option>
              ))}
            </select>
          </div>

          {/* 3. Total Fabrics Received */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Total Fabrics Received
            </Label>
            <Input
              type="number"
              min={0}
              value={totalFabrics}
              onChange={(e) => setTotalFabrics(e.target.value)}
              disabled={saving}
            />
          </div>

          {/* 4. Requirement */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Requirement
            </Label>
            <textarea
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
              rows={2}
              disabled={saving}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {/* 5. Assigned By */}
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Assigned By
              </Label>
              <select
                value={assignedBy}
                onChange={(e) => setAssignedBy(e.target.value)}
                disabled={saving}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">— Select —</option>
                {ASSIGNED_BY_OPTIONS.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            
            {/* 6. Sampling Done By */}
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Sampling Done By
              </Label>
              <Input
                value={samplingDoneBy}
                onChange={(e) => setSamplingDoneBy(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {/* 7. Printed Mtr */}
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Printed Mtr
              </Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={printedMtr}
                onChange={(e) => setPrintedMtr(e.target.value)}
                disabled={saving}
              />
            </div>

            {/* 8. SRNO */}
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                SRNO
              </Label>
              <Input
                type="number"
                value={srNo}
                onChange={(e) => setSrNo(e.target.value)}
                placeholder="e.g. 101"
                disabled={saving}
              />
            </div>
          </div>

          {/* 9. Signature of Receiver (File uploads) */}
          <div className="space-y-2 pt-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Signature of Receiver (Upload up to 5 files, max 100 MB each)
            </Label>
            {uploadedPaths.map((p, i) => (
              <div
                key={p}
                className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs"
              >
                <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 truncate text-foreground">
                  {p.split("/").pop()}
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i, false)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {uploadedPaths.length < 5 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card py-3 text-xs text-muted-foreground transition-colors hover:border-primary disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Upload Signature Files
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e, false)}
            />
          </div>

          {/* 10. Full Knitting Option */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
            <div className="space-y-0.5">
              <Label className="text-[12px] font-medium text-foreground">
                Requires Full Knitting?
              </Label>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={requiresFullKitting}
              disabled={saving}
              onClick={() => setRequiresFullKitting(!requiresFullKitting)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                requiresFullKitting ? "bg-primary" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                  requiresFullKitting ? "translate-x-4" : "translate-x-1"
                )}
              />
            </button>
          </div>

          {requiresFullKitting && (
            <div className="space-y-2 mt-2">
              <Button 
                type="button" 
                variant="outline" 
                className="w-full gap-2 border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
                onClick={() => setFkPopupOpen(true)}
              >
                <Upload className="h-4 w-4" />
                Open Full Knitting Upload Form ({fkPaths.length}/5 files)
              </Button>
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-5 py-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {isEdit ? "Cancel" : "Close"}
            </Button>
            <LoadingButton
              className="flex-1"
              loading={saving}
              loadingText="Saving…"
              onClick={() => void handleSubmit()}
            >
              {isEdit ? "Save" : "Add Sample"}
            </LoadingButton>
          </div>
        </div>
      </DialogContent>

      {/* Nested Full Knitting Popup */}
      <Dialog open={fkPopupOpen} onOpenChange={setFkPopupOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <div className="space-y-4 pt-4">
            <h3 className="text-lg font-semibold">Full Knitting Files</h3>
            <p className="text-sm text-muted-foreground">Upload up to 5 files, max 100 MB each.</p>
            
            <div className="space-y-2">
              {fkPaths.map((p, i) => (
                <div
                  key={p}
                  className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs"
                >
                  <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate text-foreground">
                    {p.split("/").pop()}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(i, true)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {fkPaths.length < 5 && (
                <button
                  type="button"
                  onClick={() => fkInputRef.current?.click()}
                  disabled={fkUploading || saving}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card py-6 text-sm text-muted-foreground transition-colors hover:border-primary disabled:opacity-50"
                >
                  {fkUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload Full Knitting Files
                </button>
              )}
              <input
                ref={fkInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileUpload(e, true)}
              />
            </div>
            
            <Button className="w-full mt-4" onClick={() => setFkPopupOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
