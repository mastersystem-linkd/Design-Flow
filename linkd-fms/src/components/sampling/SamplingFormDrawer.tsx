import { useRef, useState } from "react";
import { Loader2, Plus, Upload, X, FileIcon } from "lucide-react";
import { toast } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useClients } from "@/hooks/useClients";
import { useFabrics } from "@/hooks/useFabrics";
import { ASSIGNED_BY_OPTIONS } from "@/lib/constants";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
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

export function SamplingFormDrawer({
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
  const [printedMtr, setPrintedMtr] = useState(
    editSample?.printed_mtr != null ? String(editSample.printed_mtr) : "0"
  );
  const [uid, setUid] = useState(editSample?.uid ?? "");
  const [requirement, setRequirement] = useState(editSample?.requirement ?? "");
  const [assignedBy, setAssignedBy] = useState(editSample?.assigned_by ?? "");
  const [samplingDoneBy, setSamplingDoneBy] = useState(editSample?.sampling_done_by ?? "");
  const [orderOrSample, setOrderOrSample] = useState<"order" | "sample" | "">(
    editSample?.order_or_sample ?? ""
  );
  const [notes, setNotes] = useState(editSample?.additional_comments ?? "");
  const [quickMode, setQuickMode] = useState(!isEdit);

  // File uploads
  const [uploadedPaths, setUploadedPaths] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Computed pending
  const totalNum = Number(totalFabrics) || 0;
  const printedNum = Number(printedMtr) || 0;
  const pending = Math.max(0, totalNum - printedNum);

  function resetForAnother() {
    // Keep party_name for batch entry, clear the rest
    setQuality("");
    setTotalFabrics("");
    setPrintedMtr("0");
    setUid("");
    setRequirement("");
    setNotes("");
    setOrderOrSample("");
    setUploadedPaths([]);
    setError(null);
  }

  function resetAll() {
    setPartyName("");
    resetForAnother();
    setAssignedBy("");
    setSamplingDoneBy("");
    setQuickMode(true);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !user) return;

    const remaining = 5 - uploadedPaths.length;
    if (remaining <= 0) {
      setError("Max 5 files.");
      return;
    }

    setUploading(true);
    setError(null);

    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const f = files[i];
      if (f.size > MAX_FILE_BYTES) {
        setError(`${f.name} too large. Max 100 MB.`);
        break;
      }
      const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/samples/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from(FK_BUCKET)
        .upload(path, f, { contentType: f.type, upsert: false });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        break;
      }
      setUploadedPaths((prev) => [...prev, path]);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(idx: number) {
    const path = uploadedPaths[idx];
    void supabase.storage.from(FK_BUCKET).remove([path]);
    setUploadedPaths((prev) => prev.filter((_, i) => i !== idx));
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
      requirement: requirement.trim() || null,
      assigned_by: assignedBy.trim() || null,
      sampling_done_by: samplingDoneBy.trim() || null,
      order_or_sample: orderOrSample,
      additional_comments: notes.trim() || null,
      signature_url: uploadedPaths[0] ?? null,
      photo_url: uploadedPaths.length > 1 ? uploadedPaths.slice(1).join(",") : null,
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
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) resetAll();
        onOpenChange(o);
      }}
    >
      <SheetContent className="flex flex-col gap-0 overflow-hidden p-0 sm:w-[420px]">
        {/* Header */}
        <div className="shrink-0 border-b border-border bg-card/80 px-5 pt-5 pb-4">
          <h2 className="text-lg font-semibold text-foreground">
            {isEdit ? "Edit Sample" : "Add Sample"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isEdit ? "Update this sampling record." : "Log a new sampling entry."}
          </p>
          {!isEdit && (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuickMode(true)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  quickMode
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:bg-secondary"
                )}
              >
                Quick Add
              </button>
              <button
                type="button"
                onClick={() => setQuickMode(false)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  !quickMode
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:bg-secondary"
                )}
              >
                Full Form
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {/* Party Name */}
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

          {/* Total Fabrics + Printed Mtr (always visible) */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Fabrics Received
              </Label>
              <Input
                type="number"
                min={0}
                value={totalFabrics}
                onChange={(e) => setTotalFabrics(e.target.value)}
                disabled={saving}
              />
            </div>
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
          </div>

          {/* Pending (computed, read-only) */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
            <span className="text-xs text-muted-foreground">Pending Qty</span>
            <span
              className={cn(
                "text-sm font-bold tabular-nums",
                pending > 0 ? "text-warning" : "text-success"
              )}
            >
              {pending}
            </span>
          </div>

          {/* UID */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              UID
            </Label>
            <Input
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              placeholder="e.g. SM-042"
              disabled={saving}
            />
          </div>

          {/* ── Extended fields (hidden in quick mode) ── */}
          {!quickMode && (
            <>
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

              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Type
                </Label>
                <select
                  value={orderOrSample}
                  onChange={(e) =>
                    setOrderOrSample(e.target.value as "order" | "sample" | "")
                  }
                  disabled={saving}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                >
                  <option value="">— None —</option>
                  <option value="order">Order</option>
                  <option value="sample">Sample</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Notes
                </Label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  disabled={saving}
                  className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                />
              </div>

              {/* File uploads */}
              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Files (up to 5, 100 MB each)
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
                      onClick={() => removeFile(i)}
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
                    Upload files
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
            </>
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
          {!isEdit && (
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              After saving, party name stays filled for batch entry.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
