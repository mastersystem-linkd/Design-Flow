import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  Image as ImageIcon,
  ExternalLink,
  CheckCircle2,
  Loader2,
  X,
  AlertCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompression";
import { useAuth } from "@/hooks/useAuth";
import {
  initiateKitting,
  getKittingByTask,
} from "@/lib/kittingQueries";
import { sendNotificationToRole } from "@/lib/notifications";
import { kittingDetailPath, ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { TaskWithRelations } from "@/types/database";

// ============================================================================
// KittingStageADialog — coordinator's Stage A: upload the form photo
// ============================================================================
//
// Per the workflow spec, the coordinator's job is to capture a photo of the
// physical FULL KITTING FORM and hand it off to the DEO. This dialog:
//
//   1. Loads any existing kitting record for the task.
//   2. If none exists:
//        - Shows an image upload zone.
//        - On upload, calls initiateKitting() which creates the row with
//          data_entry_status = 'pending_deo' and surfaces it in the DEO queue.
//   3. If a record exists:
//        - Shows the current status, the uploaded photo (signed URL), and
//          a CTA to open the digital form.
//        - Coordinator can replace the photo (new upload overwrites).
// ============================================================================

const BUCKET = "sample-files";
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB matches the bucket policy

type ExistingRecord = {
  id: string;
  image_url: string | null;
  data_entry_status:
    | "pending_image"
    | "pending_deo"
    | "in_progress"
    | "completed";
  party_name: string | null;
};

const STATUS_LABEL: Record<ExistingRecord["data_entry_status"], string> = {
  pending_image: "Awaiting image",
  pending_deo: "Pending DEO",
  in_progress: "In progress",
  completed: "Completed",
};

const STATUS_TONE: Record<ExistingRecord["data_entry_status"], string> = {
  pending_image: "bg-muted/30 text-muted-foreground border-border",
  pending_deo: "bg-warning/10 text-warning border-warning/30",
  in_progress: "bg-primary/10 text-primary border-primary/30",
  completed: "bg-success/10 text-success border-success/30",
};

export interface KittingStageADialogProps {
  task: TaskWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires after a successful upload or status change so the parent can
   *  re-fetch task rows + show the updated kitting status in the table. */
  onChange?: () => void;
}

export function KittingStageADialog({
  task,
  open,
  onOpenChange,
  onChange,
}: KittingStageADialogProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [existing, setExisting] = useState<ExistingRecord | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ── Load the existing kitting record (if any) when the dialog opens ─────
  useEffect(() => {
    if (!open || !task) {
      setExisting(null);
      setThumbUrl(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data, error: err } = await getKittingByTask(task.id);
      if (cancelled) return;
      setLoading(false);
      if (err) {
        setError(err);
        return;
      }
      if (data) {
        const row: ExistingRecord = {
          id: data.id,
          image_url: data.image_url,
          data_entry_status: data.data_entry_status,
          party_name: data.party_name,
        };
        setExisting(row);
      } else {
        setExisting(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, task?.id]);

  // ── Resolve a signed URL for the existing image (preview) ───────────────
  useEffect(() => {
    let cancelled = false;
    if (!existing?.image_url) {
      setThumbUrl(null);
      return;
    }
    void (async () => {
      const { data } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(existing.image_url!, 3600);
      if (cancelled) return;
      setThumbUrl(data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [existing?.image_url]);

  // ── Upload handler ─────────────────────────────────────────────────────
  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file || !task || !user) return;
    if (file.size > MAX_BYTES) {
      setError("File is over 100 MB.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const processed = await compressImage(file);
      const safe = processed.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/kitting/${task.id}-${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, processed, {
          contentType: processed.type || "application/octet-stream",
          upsert: false,
        });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }

      if (existing) {
        // Already have a record — just swap the image URL and (if we were
        // still in 'pending_image') flip status forward so the DEO picks it.
        const { data, error: updErr } = await supabase
          .from("full_kitting_details")
          .update({
            image_url: path,
            data_entry_status:
              existing.data_entry_status === "pending_image"
                ? "pending_deo"
                : existing.data_entry_status,
          })
          .eq("id", existing.id)
          .select("id, image_url, data_entry_status, party_name")
          .maybeSingle();

        if (updErr || !data) {
          setError(updErr?.message ?? "Couldn't update the record");
          return;
        }
        setExisting(data as ExistingRecord);
        toast.success("Form photo updated");
      } else {
        // No record yet — create one.
        const { data, error: insErr } = await initiateKitting({
          taskId: task.id,
          submittedBy: user.id,
          imageUrl: path,
        });
        if (insErr || !data) {
          setError(insErr ?? "Couldn't create the knitting record");
          return;
        }
        setExisting({
          id: data.id,
          image_url: data.image_url,
          data_entry_status: data.data_entry_status,
          party_name: data.party_name,
        });

        // Keep tasks.requires_full_kitting in sync — uploading a photo is
        // an implicit "yes, this needs kitting". Best-effort: don't block
        // the success toast if the flag update fails (it's secondary signal).
        void supabase
          .from("tasks")
          .update({ requires_full_kitting: true })
          .eq("id", task.id);

        // Ping the DEOs that there's new work in the queue.
        void sendNotificationToRole(
          ["deo"],
          "New knitting form",
          `${task.task_code} · ${task.concept ?? "task"} — form photo uploaded, ready to digitize.`,
          "info",
          ROUTES.kitting
        );

        toast.success("Sent to DEO queue");
      }
      onChange?.();
    } finally {
      setUploading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  const recordHasImage = !!existing?.image_url;
  const statusBadge = useMemo(() => {
    if (!existing) return null;
    return (
      <Badge
        variant="outline"
        className={cn("border text-[11px]", STATUS_TONE[existing.data_entry_status])}
      >
        {STATUS_LABEL[existing.data_entry_status]}
      </Badge>
    );
  }, [existing]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>Full Knitting Form</DialogTitle>
            {statusBadge}
          </div>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          {/* Task context */}
          {task && (
            <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs">
              <p className="font-mono text-[10px] text-primary">{task.task_code}</p>
              <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                {task.concept ?? "—"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {task.client?.party_name ?? "—"}
              </p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Existing image preview */}
              {recordHasImage ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Uploaded form photo
                  </p>
                  <div className="overflow-hidden rounded-lg border border-border bg-secondary/30">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt="Uploaded knitting form"
                        className="block max-h-56 w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-32 items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                  className={cn(
                    "flex h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card transition-colors hover:border-primary hover:bg-secondary/30",
                    uploading && "opacity-50"
                  )}
                >
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : (
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium text-foreground">
                    {uploading
                      ? "Uploading…"
                      : "Upload form photo"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    JPEG / PNG / PDF · max 100 MB
                  </span>
                </button>
              )}

              <input
                ref={inputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handlePick}
              />

              {/* Hint about what happens next */}
              {!existing && (
                <p className="rounded-md border border-primary/20 bg-primary/[0.04] px-3 py-2 text-[11px] text-muted-foreground">
                  Uploading the photo creates a knitting task for the DEO. They'll
                  digitize the form and the data will sync back to this brief.
                </p>
              )}

              {error && (
                <p className="flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          {recordHasImage && (
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" />
              Replace photo
            </Button>
          )}
          {existing && (
            <LoadingButton
              type="button"
              onClick={() => {
                navigate(kittingDetailPath(existing.id));
                onOpenChange(false);
              }}
              loading={false}
              className="gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open digital form
            </LoadingButton>
          )}
          {!existing && !uploading && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="ml-auto"
            >
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
