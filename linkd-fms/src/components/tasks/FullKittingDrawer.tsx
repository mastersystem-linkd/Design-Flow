/**
 * Full Kitting form drawer — mobile-friendly Sheet that opens from the right.
 * Shows task context (UID, Designer, Concept, Description) read-only + file
 * upload (100 MB) + structured kitting fields. Used by coordinators/admins
 * from the task table action button.
 */
import { useEffect, useRef, useState } from "react";
import { FileIcon, Loader2, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useFullKitting, type KittingFormData } from "@/hooks/useFullKitting";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { toast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";
import type { TaskWithRelations, PackingType } from "@/types/database";

const FK_BUCKET = "sample-files";
const MAX_FILE_BYTES = 100 * 1024 * 1024;

interface Props {
  task: TaskWithRelations | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}

export function FullKittingDrawer({ task, open, onOpenChange, onSaved }: Props) {
  const { user } = useAuth();
  const { submitKitting, isPending } = useFullKitting();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Form state ──
  const [fabricDetails, setFabricDetails] = useState("");
  const [colors, setColors] = useState("");
  const [quantity, setQuantity] = useState("");
  const [accessories, setAccessories] = useState("");
  const [packingType, setPackingType] = useState<PackingType>("standard");
  const [specialInstructions, setSpecialInstructions] = useState("");

  // ── File state ──
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const saving = isPending("submit", task?.id);

  // Reset form when a different task opens
  useEffect(() => {
    if (!open) return;
    setFabricDetails("");
    setColors("");
    setQuantity("");
    setAccessories("");
    setPackingType("standard");
    setSpecialInstructions("");
    setUploadedPath(null);
    setUploadedName(null);
    setError(null);
  }, [task?.id, open]);

  // ── File upload ──
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user || !task) return;

    if (file.size > MAX_FILE_BYTES) {
      setError("File too large — max 100 MB");
      return;
    }

    setUploading(true);
    setUploadProgress(8);
    setError(null);

    const timer = window.setInterval(() => {
      setUploadProgress((p) => (p >= 90 ? p : p + Math.random() * 12));
    }, 180);

    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.id}/tasks/${task.id}/full-kitting-${Date.now()}-${safe}`;

    const { error: upErr } = await supabase.storage
      .from(FK_BUCKET)
      .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });

    window.clearInterval(timer);

    if (upErr) {
      setUploading(false);
      setUploadProgress(0);
      setError(upErr.message);
      return;
    }

    // Also update the task's full_kitting_image_url
    await supabase.from("tasks").update({
      full_kitting_image_url: path,
      full_kitting_submitted_at: new Date().toISOString(),
      full_kitting_submitted_by: user.id,
    }).eq("id", task.id);

    setUploadedPath(path);
    setUploadedName(file.name);
    setUploadProgress(100);
    setTimeout(() => { setUploading(false); setUploadProgress(0); }, 250);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile() {
    if (uploadedPath) {
      void supabase.storage.from(FK_BUCKET).remove([uploadedPath]);
    }
    setUploadedPath(null);
    setUploadedName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Submit ──
  async function handleSubmit() {
    if (!task) return;

    const formData: KittingFormData = {
      fabric_details: fabricDetails.trim() || null,
      colors: colors.trim() || null,
      quantity: quantity ? Number(quantity) : null,
      accessories: accessories.trim() || null,
      packing_type: packingType,
      special_instructions: specialInstructions.trim() || null,
    };

    const { error: e } = await submitKitting(task.id, formData);
    if (e) {
      setError(e);
      return;
    }

    toast.success("Full kitting details saved & task completed!");
    onOpenChange(false);
    onSaved();
  }

  if (!task) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-0 overflow-hidden p-0 w-full sm:max-w-[440px]">
        {/* Header */}
        <div className="shrink-0 border-b border-border bg-card/80 px-4 pt-5 pb-4 sm:px-5">
          <div className="flex items-center gap-2">
            <Badge className="bg-primary/10 text-primary border border-primary/20 text-[10px]">
              Full Kitting
            </Badge>
          </div>
          <h2 className="mt-2 text-lg font-semibold text-foreground">
            Add Kitting Details
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Fill in kitting information for this task
          </p>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5">
          {/* Task context (read-only) */}
          <div className="grid grid-cols-2 gap-2.5 rounded-lg border border-border bg-card p-3 text-[12px]">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">UID</p>
              <p className="mt-0.5 font-mono text-[11px] text-primary">{task.task_code}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Designer</p>
              <p className="mt-0.5 text-foreground">{task.assignee?.full_name ?? "Unassigned"}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Concept</p>
              <p className="mt-0.5 text-foreground">{task.concept || "—"}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Description</p>
              <p className="mt-0.5 whitespace-pre-wrap text-foreground">{task.description || "—"}</p>
            </div>
          </div>

          {/* File upload */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Full Kitting File <span className="normal-case text-muted-foreground">(up to 100 MB)</span>
            </Label>

            {uploadedPath ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
                <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{uploadedName}</span>
                <button type="button" onClick={removeFile} className="shrink-0 text-muted-foreground hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || saving}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card py-6 text-sm transition-colors hover:border-primary",
                  (uploading || saving) && "opacity-50 pointer-events-none"
                )}
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <Upload className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="text-muted-foreground">
                  {uploading ? "Uploading…" : "Tap to upload file"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  JPG / PNG / PSD / GIF / MP4 / PDF · up to 100 MB
                </span>
              </button>
            )}

            {uploading && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width] duration-200 ease-out"
                  style={{ width: `${Math.min(100, uploadProgress)}%` }}
                />
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFile}
            />
          </div>

          {/* Kitting form fields */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Fabric Details
              </Label>
              <textarea
                value={fabricDetails}
                onChange={(e) => setFabricDetails(e.target.value)}
                rows={2}
                disabled={saving}
                placeholder="Fabric composition, weight, finish…"
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Colors
                </Label>
                <Input
                  value={colors}
                  onChange={(e) => setColors(e.target.value)}
                  placeholder="Navy, White, Gold"
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Quantity
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Pieces"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Accessories
              </Label>
              <textarea
                value={accessories}
                onChange={(e) => setAccessories(e.target.value)}
                rows={2}
                disabled={saving}
                placeholder="Buttons, zippers, labels…"
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Packing Type <span className="text-destructive">*</span>
              </Label>
              <select
                value={packingType}
                onChange={(e) => setPackingType(e.target.value as PackingType)}
                disabled={saving}
                className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
                <option value="bulk">Bulk</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Special Instructions
              </Label>
              <textarea
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                rows={2}
                disabled={saving}
                placeholder="Handling, labeling, packaging notes…"
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-4 py-4 sm:px-5">
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <LoadingButton
              className="flex-1"
              loading={saving}
              loadingText="Saving…"
              onClick={() => void handleSubmit()}
            >
              Save & Complete
            </LoadingButton>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
