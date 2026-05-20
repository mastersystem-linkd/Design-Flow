import { useMemo, useState, useCallback } from "react";
import {
  FolderOpen,
  RefreshCw,
  Grid3X3,
  List,
  Download,
  Trash2,
  FileImage,
  FileText,
  FileVideo,
  File,
  Search,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useFiles, BUCKET_LABELS, isImageMime } from "@/hooks/useFiles";
import type { StorageFile, BucketName } from "@/hooks/useFiles";
import { useAuth } from "@/hooks/useAuth";
import { isAdmin as checkIsAdmin } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import {
  SearchInput,
  EmptyState,
  ConfirmDialog,
  toast,
  Badge,
} from "@/components/ui";
import { cn } from "@/lib/utils";

// ============================================================================
// Constants
// ============================================================================

type BucketFilter = "all" | BucketName;

const BUCKET_FILTERS: { value: BucketFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "design-files", label: "Design" },
  { value: "sample-files", label: "Samples" },
  { value: "task-files", label: "Tasks" },
];

const BUCKET_BADGE_CLASS: Record<BucketName, string> = {
  "design-files": "bg-primary/10 text-primary ring-primary/20",
  "sample-files": "bg-success/10 text-success ring-success/20",
  "task-files": "bg-warning/10 text-warning ring-warning/20",
};

// ============================================================================
// Helpers
// ============================================================================

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeIcon(mimetype: string) {
  if (isImageMime(mimetype)) return FileImage;
  if (/video/.test(mimetype)) return FileVideo;
  if (/pdf|text|document/.test(mimetype)) return FileText;
  return File;
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toUpperCase() : "";
}

// ============================================================================
// Main view
// ============================================================================

export function FilesView() {
  const { profile } = useAuth();
  const { files, isLoading, error, refetch, getSignedUrl, deleteFile } =
    useFiles();

  const role = profile?.role ?? "designer";
  const isAdminUser = checkIsAdmin(role);

  const [search, setSearch] = useState("");
  const [bucket, setBucket] = useState<BucketFilter>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [deleting, setDeleting] = useState<StorageFile | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // ── Filter ──
  const filtered = useMemo(() => {
    let result = files;
    if (bucket !== "all") result = result.filter((f) => f.bucket === bucket);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((f) => f.name.toLowerCase().includes(q));
    }
    return result;
  }, [files, bucket, search]);

  // ── Bucket counts ──
  const bucketCounts = useMemo(() => {
    const counts: Record<BucketFilter, number> = {
      all: files.length,
      "design-files": 0,
      "sample-files": 0,
      "task-files": 0,
    };
    for (const f of files) counts[f.bucket]++;
    return counts;
  }, [files]);

  // ── Download ──
  const handleDownload = useCallback(
    async (file: StorageFile) => {
      const url = await getSignedUrl(file);
      if (url) window.open(url, "_blank");
      else toast.error("Failed to generate download link");
    },
    [getSignedUrl]
  );

  // ── Delete ──
  const handleDelete = useCallback(async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    const { error: err } = await deleteFile(deleting);
    setDeleteBusy(false);
    setDeleting(null);
    if (err) toast.error(err);
    else toast.success(`Deleted ${deleting.name}`);
  }, [deleting, deleteFile]);

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <FolderOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Files</h1>
            <p className="text-xs text-muted-foreground">
              {files.length} file{files.length !== 1 ? "s" : ""} across all
              buckets
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isLoading}
            className="gap-1.5"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
            />
            Refresh
          </Button>
          {/* View toggle */}
          <div className="flex rounded-lg border border-border p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                viewMode === "grid"
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                viewMode === "list"
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Search + filter ── */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search files…"
          className="w-full sm:w-64"
        />
        <div className="flex flex-wrap gap-1.5">
          {BUCKET_FILTERS.map((bf) => (
            <button
              key={bf.value}
              type="button"
              onClick={() => setBucket(bf.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                bucket === bf.value
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {bf.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                  bucket === bf.value
                    ? "bg-white/20 text-white"
                    : "bg-secondary text-foreground"
                )}
              >
                {bucketCounts[bf.value]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Content ── */}
      {isLoading && files.length === 0 ? (
        <LoadingSkeleton viewMode={viewMode} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-10 w-10 text-primary/40" />}
          title={search ? "No files match your search" : "No files uploaded yet"}
          description={
            search
              ? "Try a different search term or clear filters."
              : "Files uploaded through tasks, concepts, and sampling will appear here."
          }
        />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((f) => (
            <FileCard
              key={f.id}
              file={f}
              isAdmin={isAdminUser}
              onDownload={() => handleDownload(f)}
              onDelete={() => setDeleting(f)}
            />
          ))}
        </div>
      ) : (
        <FileTable
          files={filtered}
          isAdmin={isAdminUser}
          onDownload={handleDownload}
          onDelete={setDeleting}
        />
      )}

      {/* ── Delete confirm ── */}
      <ConfirmDialog
        open={!!deleting}
        onCancel={() => setDeleting(null)}
        title="Delete file"
        description={`Permanently delete "${deleting?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ============================================================================
// File card (grid view)
// ============================================================================

function FileCard({
  file,
  isAdmin,
  onDownload,
  onDelete,
}: {
  file: StorageFile;
  isAdmin: boolean;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [thumbLoading, setThumbLoading] = useState(false);
  const isImage = isImageMime(file.mimetype);
  const Icon = fileTypeIcon(file.mimetype);
  const ext = fileExtension(file.name);

  // Load thumbnail for images on mount
  const loadThumb = useCallback(async () => {
    if (!isImage || thumbUrl || thumbLoading) return;
    setThumbLoading(true);
    const { data } = await (await import("@/lib/supabase")).supabase.storage
      .from(file.bucket)
      .createSignedUrl(file.path, 3600);
    setThumbUrl(data?.signedUrl ?? null);
    setThumbLoading(false);
  }, [isImage, thumbUrl, thumbLoading, file.bucket, file.path]);

  return (
    <div
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:shadow-md"
      onMouseEnter={loadThumb}
    >
      {/* Thumbnail / Icon area */}
      <div className="relative flex h-32 items-center justify-center bg-secondary/40">
        {isImage && thumbUrl ? (
          <img
            src={thumbUrl}
            alt={file.name}
            className="h-full w-full object-cover"
          />
        ) : isImage && thumbLoading ? (
          <div className="h-8 w-8 animate-pulse rounded bg-border" />
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Icon className="h-8 w-8 text-muted-foreground/50" />
            {ext && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">
                {ext}
              </span>
            )}
          </div>
        )}

        {/* Hover actions */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={onDownload}
            className="rounded-lg bg-white/90 p-2 text-foreground transition-colors hover:bg-white"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg bg-destructive/90 p-2 text-white transition-colors hover:bg-destructive"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="truncate text-xs font-medium text-foreground" title={file.name}>
          {file.name}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {formatSize(file.size)}
          </span>
          <span
            className={cn(
              "inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset",
              BUCKET_BADGE_CLASS[file.bucket]
            )}
          >
            {BUCKET_LABELS[file.bucket].split(" ")[0]}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {formatDistanceToNow(new Date(file.created_at), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// File table (list view)
// ============================================================================

function FileTable({
  files,
  isAdmin,
  onDownload,
  onDelete,
}: {
  files: StorageFile[];
  isAdmin: boolean;
  onDownload: (f: StorageFile) => void;
  onDelete: (f: StorageFile) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-secondary/40">
            <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
              Name
            </th>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
              Type
            </th>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
              Size
            </th>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
              Bucket
            </th>
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
              Uploaded
            </th>
            <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-card">
          {files.map((f) => {
            const Icon = fileTypeIcon(f.mimetype);
            const ext = fileExtension(f.name);
            return (
              <tr
                key={f.id}
                className="border-b border-border/40 transition-colors hover:bg-secondary/30"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span
                      className="truncate text-xs font-medium text-foreground max-w-[240px]"
                      title={f.name}
                    >
                      {f.name}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className="text-xs text-muted-foreground uppercase">
                    {ext || "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatSize(f.size)}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                      BUCKET_BADGE_CLASS[f.bucket]
                    )}
                  >
                    {BUCKET_LABELS[f.bucket].split(" ")[0]}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(f.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onDownload(f)}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      title="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => onDelete(f)}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Loading skeleton
// ============================================================================

function LoadingSkeleton({ viewMode }: { viewMode: "grid" | "list" }) {
  if (viewMode === "list") {
    return (
      <div className="overflow-hidden rounded-xl border border-border shadow-sm">
        <div className="h-10 bg-secondary/40 border-b border-border" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex h-12 items-center gap-4 border-b border-border/40 bg-card px-4"
          >
            <div className="h-4 w-4 animate-pulse rounded bg-secondary" />
            <div className="h-3 w-40 animate-pulse rounded bg-secondary" />
            <div className="h-3 w-12 animate-pulse rounded bg-secondary" />
            <div className="h-3 w-16 animate-pulse rounded bg-secondary" />
            <div className="h-5 w-14 animate-pulse rounded-full bg-secondary" />
            <div className="h-3 w-20 animate-pulse rounded bg-secondary" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-xl border border-border bg-card"
        >
          <div className="h-32 animate-pulse bg-secondary/40" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-3/4 animate-pulse rounded bg-secondary" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-secondary" />
          </div>
        </div>
      ))}
    </div>
  );
}
