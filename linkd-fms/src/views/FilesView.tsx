import { useCallback, useMemo, useState } from "react";
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
  File as FileIcon,
  Calendar,
  X,
  Filter as FilterIcon,
} from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { useFiles, BUCKET_LABELS, isImageMime } from "@/hooks/useFiles";
import type { StorageFile, BucketName } from "@/hooks/useFiles";
import { useAuth } from "@/hooks/useAuth";
import { useProfiles } from "@/hooks/useProfiles";
import { isAdmin as checkIsAdmin } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { LazyImage } from "@/components/ui/LazyImage";
import {
  SearchInput,
  EmptyState,
  ConfirmDialog,
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
  toast,
} from "@/components/ui";
import { ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { TABLE_HEAD, TABLE_TH } from "@/lib/tableStyles";

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

// Coarse file-type buckets the filter dropdown exposes. Each maps to a
// predicate over (extension, mimetype) so we can match either signal.
type FileTypeFilter =
  | "all"
  | "image"
  | "video"
  | "pdf"
  | "doc"
  | "sheet"
  | "psd"
  | "other";

const FILE_TYPE_OPTIONS: { value: FileTypeFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "image", label: "Images (JPG / PNG / GIF / WEBP)" },
  { value: "video", label: "Videos (MP4 / MOV)" },
  { value: "pdf", label: "PDFs" },
  { value: "doc", label: "Documents (DOC / DOCX / TXT)" },
  { value: "sheet", label: "Spreadsheets (CSV / XLSX)" },
  { value: "psd", label: "PSDs" },
  { value: "other", label: "Other" },
];

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
  return FileIcon;
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toUpperCase() : "";
}

/**
 * Match a file against a coarse type filter. Looks at the lowercased
 * extension first (cheap, reliable) and falls back to mimetype when the
 * file has no extension.
 */
function matchesType(file: StorageFile, kind: FileTypeFilter): boolean {
  if (kind === "all") return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = file.mimetype.toLowerCase();

  switch (kind) {
    case "image":
      return (
        /^(jpe?g|png|gif|webp|svg|bmp|heic)$/.test(ext) || mime.startsWith("image/")
      );
    case "video":
      return /^(mp4|mov|webm|m4v|mkv|avi)$/.test(ext) || mime.startsWith("video/");
    case "pdf":
      return ext === "pdf" || mime === "application/pdf";
    case "doc":
      return (
        /^(doc|docx|txt|rtf|md)$/.test(ext) ||
        mime.includes("msword") ||
        mime.includes("wordprocessingml") ||
        mime === "text/plain"
      );
    case "sheet":
      return (
        /^(csv|xls|xlsx|tsv)$/.test(ext) ||
        mime.includes("excel") ||
        mime.includes("spreadsheetml") ||
        mime === "text/csv"
      );
    case "psd":
      return ext === "psd" || mime === "image/vnd.adobe.photoshop";
    case "other":
      return !(
        matchesType(file, "image") ||
        matchesType(file, "video") ||
        matchesType(file, "pdf") ||
        matchesType(file, "doc") ||
        matchesType(file, "sheet") ||
        matchesType(file, "psd")
      );
  }
}

// ============================================================================
// Main view
// ============================================================================

export function FilesView() {
  const { profile } = useAuth();
  const { files, isLoading, error, refetch, getSignedUrl, deleteFile } =
    useFiles();
  // Single profile fetch — used to resolve uploader_id → name + role badge.
  // No `roles` filter so the result includes admins, coordinators, and
  // designers (all three can upload). Cached by React Query.
  const { profiles } = useProfiles();

  const role = profile?.role ?? "designer";
  const isAdminUser = checkIsAdmin(role);

  // ── Filter state ──
  const [search, setSearch] = useState("");
  const [bucket, setBucket] = useState<BucketFilter>("all");
  const [typeFilter, setTypeFilter] = useState<FileTypeFilter>("all");
  const [uploaderFilter, setUploaderFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>(""); // yyyy-mm-dd
  const [toDate, setToDate] = useState<string>("");
  // Default to list per request; user can flip to grid via the toggle.
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [deleting, setDeleting] = useState<StorageFile | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // ── Profile lookup map ──
  // `profile_id → {name, role, avatar}` for O(1) row lookup. Built once
  // per profile-list refresh.
  const profileMap = useMemo(() => {
    const m = new Map<
      string,
      { full_name: string; role: string; avatar_url: string | null }
    >();
    for (const p of profiles ?? []) {
      m.set(p.id, {
        full_name: p.full_name,
        role: p.role,
        avatar_url: p.avatar_url,
      });
    }
    return m;
  }, [profiles]);

  // ── Filter pipeline ──
  // Order intentionally cheap-first so big-N lists short-circuit early:
  //   bucket → type → uploader → date range → text search
  const filtered = useMemo(() => {
    let result = files;
    if (bucket !== "all") result = result.filter((f) => f.bucket === bucket);
    if (typeFilter !== "all")
      result = result.filter((f) => matchesType(f, typeFilter));
    if (uploaderFilter !== "all")
      result = result.filter((f) => f.uploaderId === uploaderFilter);
    if (fromDate || toDate) {
      // Inclusive on both ends. Empty fromDate → -Infinity, empty toDate →
      // +Infinity, so the user can leave either side open.
      const fromMs = fromDate ? new Date(fromDate + "T00:00:00").getTime() : -Infinity;
      const toMs = toDate ? new Date(toDate + "T23:59:59.999").getTime() : Infinity;
      result = result.filter((f) => {
        const t = new Date(f.created_at).getTime();
        return t >= fromMs && t <= toMs;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((f) => f.name.toLowerCase().includes(q));
    }
    return result;
  }, [files, bucket, typeFilter, uploaderFilter, fromDate, toDate, search]);

  // ── Bucket counts (always over the full file set, ignoring filters,
  //     so the user always sees how many files exist per bucket) ──
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

  // ── Uploaders for the dropdown ──
  // Only show uploaders who actually have at least one file in the
  // current view's underlying data — keeps the dropdown short and
  // avoids "ghost" names for users who never uploaded.
  const uploaderOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const f of files) if (f.uploaderId) ids.add(f.uploaderId);
    const list = Array.from(ids).map((id) => {
      const prof = profileMap.get(id);
      return {
        id,
        name: prof?.full_name ?? "Unknown user",
        role: prof?.role ?? "designer",
      };
    });
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [files, profileMap]);

  // ── Mutations ──
  const handleDownload = useCallback(
    async (file: StorageFile) => {
      const url = await getSignedUrl(file);
      if (url) window.open(url, "_blank");
      else toast.error("Failed to generate download link");
    },
    [getSignedUrl]
  );

  const handleDelete = useCallback(async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    const { error: err } = await deleteFile(deleting);
    setDeleteBusy(false);
    setDeleting(null);
    if (err) toast.error(err);
    else toast.success(`Deleted ${deleting.name}`);
  }, [deleting, deleteFile]);

  // ── "Clear filters" — only meaningful when at least one is active ──
  const filterActive =
    bucket !== "all" ||
    typeFilter !== "all" ||
    uploaderFilter !== "all" ||
    fromDate !== "" ||
    toDate !== "" ||
    search.trim() !== "";

  function clearFilters() {
    setBucket("all");
    setTypeFilter("all");
    setUploaderFilter("all");
    setFromDate("");
    setToDate("");
    setSearch("");
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <FolderOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Files</h1>
            <p className="text-xs text-muted-foreground">
              {filterActive
                ? `${filtered.length} of ${files.length} file${files.length !== 1 ? "s" : ""} match`
                : `${files.length} file${files.length !== 1 ? "s" : ""} across all buckets`}
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
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {/* View toggle — list is default */}
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
              title="Grid view"
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
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Filter rail ──
          Forced single row at all viewport widths. Overflow-x-auto kicks in
          on narrow screens so nothing wraps; tightened control widths keep
          the scroll bar from appearing on typical desktops. */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card p-3">
        <div className="flex flex-nowrap items-end gap-x-2 gap-y-2">
          {/* Search — narrower than before so we have budget for the rest */}
          <div className="shrink-0">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search files…"
              className="w-44"
            />
          </div>

          {/* Bucket pills — compact padding so the whole cluster stays tight */}
          <div className="flex shrink-0 flex-nowrap items-center gap-1">
            {BUCKET_FILTERS.map((bf) => (
              <button
                key={bf.value}
                type="button"
                onClick={() => setBucket(bf.value)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
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

          <div className="hidden h-8 w-px shrink-0 self-center bg-border md:block" aria-hidden />
          <FilterIcon className="hidden h-3.5 w-3.5 shrink-0 self-center text-muted-foreground sm:inline" />

          {/* File type */}
          <FilterField label="Type">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as FileTypeFilter)}
              className="h-8 w-36 rounded-md border border-input bg-card px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {FILE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FilterField>

          {/* Uploader */}
          <FilterField label="Uploaded by">
            <select
              value={uploaderFilter}
              onChange={(e) => setUploaderFilter(e.target.value)}
              className="h-8 w-36 rounded-md border border-input bg-card px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">Anyone</option>
              {uploaderOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </FilterField>

          {/* Date range — pinned width so they don't grow */}
          <FilterField label="From">
            <div className="relative shrink-0">
              <Calendar className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                max={toDate || undefined}
                className="h-8 w-[140px] rounded-md border border-input bg-card pl-7 pr-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </FilterField>
          <FilterField label="To">
            <div className="relative shrink-0">
              <Calendar className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                min={fromDate || undefined}
                className="h-8 w-[140px] rounded-md border border-input bg-card pl-7 pr-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </FilterField>

          {filterActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto inline-flex shrink-0 items-center gap-1 self-center rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Clear filters
            </button>
          )}
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
          title={
            filterActive ? "No files match the current filters" : "No files uploaded yet"
          }
          description={
            filterActive
              ? "Try widening the date range, switching buckets, or clearing the filters."
              : "Files uploaded through tasks, concepts, and sampling will appear here."
          }
        />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((f) => (
            <FileCard
              key={f.id}
              file={f}
              uploader={f.uploaderId ? profileMap.get(f.uploaderId) ?? null : null}
              isAdmin={isAdminUser}
              onDownload={() => handleDownload(f)}
              onDelete={() => setDeleting(f)}
            />
          ))}
        </div>
      ) : (
        <FileTable
          files={filtered}
          profileMap={profileMap}
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
        confirmLabel={deleteBusy ? "Deleting…" : "Delete"}
        variant="danger"
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ============================================================================
// FilterField — label above each control, lined up in a single row
// ============================================================================

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

// ============================================================================
// Uploader cell — avatar + name + role badge (compact)
// ============================================================================

function UploaderCell({
  uploader,
}: {
  uploader: { full_name: string; role: string; avatar_url: string | null } | null;
}) {
  if (!uploader) {
    return <span className="text-xs italic text-muted-foreground">Unknown</span>;
  }
  const roleLabel =
    ROLE_LABELS[uploader.role as keyof typeof ROLE_LABELS] ?? uploader.role;
  const isElevated =
    uploader.role === "admin" || uploader.role === "design_coordinator";
  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-6 w-6">
        {uploader.avatar_url ? <AvatarImage src={uploader.avatar_url} /> : null}
        <AvatarFallback className="text-[9px]">
          {getInitials(uploader.full_name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p
          className="truncate text-xs font-medium text-foreground"
          title={uploader.full_name}
        >
          {uploader.full_name}
        </p>
        <p
          className={cn(
            "text-[9px] uppercase tracking-wider",
            isElevated ? "text-primary" : "text-muted-foreground"
          )}
        >
          {roleLabel}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// File card (grid view)
// ============================================================================

function FileCard({
  file,
  uploader,
  isAdmin,
  onDownload,
  onDelete,
}: {
  file: StorageFile;
  uploader: { full_name: string; role: string; avatar_url: string | null } | null;
  isAdmin: boolean;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [thumbLoading, setThumbLoading] = useState(false);
  const isImage = isImageMime(file.mimetype);
  const Icon = fileTypeIcon(file.mimetype);
  const ext = fileExtension(file.name);

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
      <div className="relative flex h-32 items-center justify-center bg-secondary/40">
        {isImage && thumbUrl ? (
          <LazyImage src={thumbUrl} alt={file.name} className="h-full w-full" />
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
        {/* Compact uploader strip — single line so the grid card stays short. */}
        {uploader && (
          <p
            className="truncate text-[10px] text-muted-foreground"
            title={`Uploaded by ${uploader.full_name}`}
          >
            by {uploader.full_name}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground">
          {formatDistanceToNow(parseISO(file.created_at), { addSuffix: true })}
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
  profileMap,
  isAdmin,
  onDownload,
  onDelete,
}: {
  files: StorageFile[];
  profileMap: Map<
    string,
    { full_name: string; role: string; avatar_url: string | null }
  >;
  isAdmin: boolean;
  onDownload: (f: StorageFile) => void;
  onDelete: (f: StorageFile) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
      <table className="w-full border-collapse text-[13px]">
        <thead className={TABLE_HEAD}>
          <tr>
            <th className={TABLE_TH}>Name</th>
            <th className={TABLE_TH}>Type</th>
            <th className={TABLE_TH}>Size</th>
            <th className={TABLE_TH}>Bucket</th>
            <th className={TABLE_TH}>Uploaded by</th>
            <th className={TABLE_TH}>Uploaded</th>
            <th className={cn(TABLE_TH, "text-right")}>Actions</th>
          </tr>
        </thead>
        <tbody className="bg-card">
          {files.map((f) => {
            const Icon = fileTypeIcon(f.mimetype);
            const ext = fileExtension(f.name);
            const uploader = f.uploaderId ? profileMap.get(f.uploaderId) ?? null : null;
            return (
              <tr
                key={f.id}
                className="border-b border-border/40 transition-colors hover:bg-secondary/30"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span
                      className="max-w-[240px] truncate text-xs font-medium text-foreground"
                      title={f.name}
                    >
                      {f.name}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className="text-xs uppercase text-muted-foreground">
                    {ext || "—"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="text-xs tabular-nums text-muted-foreground">
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
                  <UploaderCell uploader={uploader} />
                </td>
                <td className="px-3 py-3">
                  <span
                    className="text-xs text-muted-foreground"
                    title={format(parseISO(f.created_at), "PP p")}
                  >
                    {formatDistanceToNow(parseISO(f.created_at), {
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
        <div className="h-10 border-b border-border bg-secondary/40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex h-14 items-center gap-4 border-b border-border/40 bg-card px-4"
          >
            <div className="h-4 w-4 animate-pulse rounded bg-secondary" />
            <div className="h-3 w-40 animate-pulse rounded bg-secondary" />
            <div className="h-3 w-12 animate-pulse rounded bg-secondary" />
            <div className="h-3 w-16 animate-pulse rounded bg-secondary" />
            <div className="h-5 w-14 animate-pulse rounded-full bg-secondary" />
            <div className="h-6 w-32 animate-pulse rounded bg-secondary" />
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
