import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
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
  FilterX,
  Filter as FilterIcon,
  Info,
  X,
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

type BucketFilter = "all" | BucketName | "concepts" | "salvedge" | "full_knitting";

const BUCKET_FILTERS: { value: BucketFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "design-files", label: "Briefs" },
  { value: "concepts", label: "Concepts" },
  { value: "salvedge", label: "Salvedge" },
  { value: "sample-files", label: "Samples" },
  { value: "full_knitting", label: "Full Knitting" },
];

const BUCKET_BADGE_CLASS: Record<BucketName, string> = {
  "design-files": "bg-primary/10 text-primary ring-primary/20",
  "sample-files": "bg-success/10 text-success ring-success/20",
  "task-files": "bg-warning/10 text-warning ring-warning/20",
};

// FK detection is set-based — populated from full_kitting_details.image_url
// at load time, then checked by badge/filter functions via closure.
let _fkPaths: Set<string> = new Set();
function isFkFile(f: StorageFile): boolean {
  return f.bucket === "sample-files" && _fkPaths.has(f.path);
}

function bucketBadgeLabel(file: StorageFile): string {
  if (file.bucket === "sample-files" && file.path.includes("/concepts/"))
    return "Concept";
  if (isFkFile(file))
    return "FK Image";
  if (file.bucket === "design-files" && file.path.includes("/salvedge/"))
    return "Salvedge";
  if (file.bucket === "design-files")
    return "Brief";
  if (file.bucket === "sample-files")
    return "Sample";
  return BUCKET_LABELS[file.bucket].split(" ")[0];
}

function bucketBadgeClass(file: StorageFile): string {
  if (file.bucket === "sample-files" && file.path.includes("/concepts/"))
    return "bg-violet-500/10 text-violet-400 ring-violet-500/20";
  if (isFkFile(file))
    return "bg-orange-500/10 text-orange-500 ring-orange-500/20";
  if (file.bucket === "design-files" && file.path.includes("/salvedge/"))
    return "bg-warning/10 text-warning ring-warning/20";
  return BUCKET_BADGE_CLASS[file.bucket];
}

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
  const { files, isLoading, error, refetch, getSignedUrl, deleteFile, deleteFiles } =
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
  // ── Bulk selection (admin only — delete is admin-gated) ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  // ── "Linked To" lookup — maps storage paths to structured source info ──
  interface LinkedInfo {
    label: string;
    details?: { key: string; value: string }[];
  }
  const [linkedToMap, setLinkedToMap] = useState<Map<string, LinkedInfo>>(new Map());
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = new Map<string, LinkedInfo>();
      const designerMap = new Map<string, string>();
      // 1. Task reference files — files table has storage_url + task_id
      const { data: dbFiles } = await supabase
        .from("files")
        .select("storage_url, file_name, task_id, tasks:task_id ( task_code, concept, description, fabric, whatsapp_group, brief_type, created_at, assigned_to, clients:client_id ( party_name ) )");
      if (!cancelled && dbFiles) {
        const assigneeIds = Array.from(new Set(
          dbFiles.map((f) => (f as unknown as { tasks?: { assigned_to?: string | null } | null }).tasks?.assigned_to).filter(Boolean)
        )) as string[];
        if (assigneeIds.length > 0) {
          const { data: dProfiles } = await supabase.from("profiles").select("id, full_name").in("id", assigneeIds);
          for (const p of dProfiles ?? []) designerMap.set(p.id, p.full_name);
        }
        for (const f of dbFiles) {
          if (!f.storage_url) continue;
          const t = (f as unknown as { tasks?: {
            task_code?: string; concept?: string; description?: string | null;
            fabric?: string | null; whatsapp_group?: string | null;
            brief_type?: string | null; created_at?: string;
            assigned_to?: string | null;
            clients?: { party_name?: string | null } | null;
          } | null }).tasks;
          if (!t) {
            next.set(f.storage_url, { label: f.file_name ?? "File" });
            continue;
          }
          const partyName = t.clients?.party_name ?? (t.brief_type === "ld" ? "LD Silk Mills" : "");
          const designer = t.assigned_to ? designerMap.get(t.assigned_to) ?? "" : "";
          const date = t.created_at ? new Date(t.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "";
          const details: { key: string; value: string }[] = [];
          if (date) details.push({ key: "Date", value: date });
          if (designer) details.push({ key: "Designer", value: designer });
          if (t.concept) details.push({ key: "Concept", value: t.concept });
          if (t.description) details.push({ key: "Desc", value: t.description.length > 40 ? t.description.slice(0, 40) + "…" : t.description });
          if (partyName) details.push({ key: "Party", value: partyName });
          if (t.fabric) details.push({ key: "Fabric", value: t.fabric });
          if (t.whatsapp_group) details.push({ key: "Group", value: t.whatsapp_group });
          details.unshift({ key: "Type", value: "Reference" });
          next.set(f.storage_url, { label: t.task_code ?? "Task", details });
        }
      }
      // 2. Full Knitting images — full_kitting_details.image_url → task
      const { data: fkRows } = await supabase
        .from("full_kitting_details")
        .select("image_url, task_id, tasks:task_id ( task_code, concept, description, brief_type, created_at, assigned_to, clients:client_id ( party_name ) )")
        .not("image_url", "is", null);
      if (!cancelled && fkRows) {
        const fkAssigneeIds = Array.from(new Set(
          fkRows.map((r) => (r as unknown as { tasks?: { assigned_to?: string | null } | null }).tasks?.assigned_to).filter(Boolean)
        )) as string[];
        if (fkAssigneeIds.length > 0) {
          const { data: fkProfiles } = await supabase.from("profiles").select("id, full_name").in("id", fkAssigneeIds);
          for (const p of fkProfiles ?? []) designerMap.set(p.id, p.full_name);
        }
        for (const r of fkRows) {
          if (!r.image_url) continue;
          const t = (r as unknown as { tasks?: {
            task_code?: string; concept?: string; description?: string | null;
            brief_type?: string | null; created_at?: string;
            assigned_to?: string | null;
            clients?: { party_name?: string | null } | null;
          } | null }).tasks;
          if (!t) continue;
          const partyName = t.clients?.party_name ?? (t.brief_type === "ld" ? "LD Silk Mills" : "");
          const designer = t.assigned_to ? designerMap.get(t.assigned_to) ?? "" : "";
          const date = t.created_at ? new Date(t.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "";
          const details: { key: string; value: string }[] = [{ key: "Type", value: "FK Image" }];
          if (date) details.push({ key: "Date", value: date });
          if (designer) details.push({ key: "Designer", value: designer });
          if (t.concept) details.push({ key: "Concept", value: t.concept });
          if (partyName) details.push({ key: "Party", value: partyName });
          next.set(r.image_url, { label: t.task_code ?? "Task", details });
        }
      }
      // Build FK path set for isFkFile() — includes both full_kitting_details
      // and tasks.full_kitting_image_url paths
      const fkPathSet = new Set<string>();
      if (fkRows) {
        for (const r of fkRows) { if (r.image_url) fkPathSet.add(r.image_url); }
      }
      const { data: taskFkRows } = await supabase
        .from("tasks")
        .select("full_kitting_image_url")
        .not("full_kitting_image_url", "is", null);
      if (taskFkRows) {
        for (const r of taskFkRows) { if (r.full_kitting_image_url) fkPathSet.add(r.full_kitting_image_url); }
      }
      _fkPaths = fkPathSet;

      // 3. Salvedge attachments — salvedge_records.attachment_url
      const { data: salvRows } = await supabase
        .from("salvedge_records")
        .select("attachment_url, party_name, challan_no, qty, created_at, designer_id")
        .not("attachment_url", "is", null);
      if (!cancelled && salvRows) {
        const dIds = Array.from(new Set(salvRows.map((r) => r.designer_id).filter(Boolean))) as string[];
        const dMap = new Map<string, string>();
        if (dIds.length > 0) {
          const { data: dProfiles } = await supabase.from("profiles").select("id, full_name").in("id", dIds);
          for (const p of dProfiles ?? []) dMap.set(p.id, p.full_name);
        }
        for (const r of salvRows) {
          if (!r.attachment_url) continue;
          const date = r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "";
          const designer = r.designer_id ? dMap.get(r.designer_id) ?? "" : "";
          next.set(r.attachment_url, {
            label: r.party_name,
            details: [
              { key: "Party", value: r.party_name },
              { key: "Challan", value: r.challan_no },
              ...(designer ? [{ key: "Designer", value: designer }] : []),
              { key: "Qty", value: String(r.qty) },
              { key: "Date", value: date },
            ],
          });
        }
      }
      // 4. Sampling files — samples.photo_url / video_url / signature_url
      const { data: sampleRows } = await supabase
        .from("samples")
        .select("photo_url, video_url, signature_url, party_name, quality, requirement, assigned_by, sampling_done_by, fusing_operator");
      if (!cancelled && sampleRows) {
        for (const s of sampleRows) {
          const urls = [s.photo_url, s.video_url, s.signature_url].filter(Boolean) as string[];
          if (urls.length === 0) continue;
          const details: { key: string; value: string }[] = [];
          if (s.party_name) details.push({ key: "Party", value: s.party_name });
          if (s.quality) details.push({ key: "Quality", value: s.quality });
          if (s.requirement) details.push({ key: "Requirement", value: s.requirement });
          if (s.assigned_by) details.push({ key: "Assigned By", value: s.assigned_by });
          if (s.sampling_done_by) details.push({ key: "Done By", value: s.sampling_done_by });
          if (s.fusing_operator) details.push({ key: "Fusing", value: s.fusing_operator });
          const info: LinkedInfo = { label: s.party_name ?? "Sample", details };
          for (const url of urls) {
            if (!next.has(url)) next.set(url, info);
          }
        }
      }

      if (!cancelled) setLinkedToMap(next);
    })();
    return () => { cancelled = true; };
  }, [files]);

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
    if (bucket === "concepts")
      result = result.filter(
        (f) => f.bucket === "sample-files" && f.path.includes("/concepts/")
      );
    else if (bucket === "salvedge")
      result = result.filter(
        (f) => f.bucket === "design-files" && f.path.includes("/salvedge/")
      );
    else if (bucket === "full_knitting")
      result = result.filter((f) => isFkFile(f));
    else if (bucket === "sample-files")
      result = result.filter(
        (f) => f.bucket === "sample-files" && !f.path.includes("/concepts/") && !isFkFile(f)
      );
    else if (bucket === "design-files")
      result = result.filter(
        (f) => f.bucket === "design-files" && !f.path.includes("/salvedge/")
      );
    else if (bucket !== "all") result = result.filter((f) => f.bucket === bucket);
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
      result = result.filter((f) => {
        if (f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)) return true;
        const info = linkedToMap.get(f.path);
        if (!info) return false;
        if (info.label.toLowerCase().includes(q)) return true;
        return info.details?.some((d) => d.value.toLowerCase().includes(q)) ?? false;
      });
    }
    return result;
  }, [files, bucket, typeFilter, uploaderFilter, fromDate, toDate, search, linkedToMap]);

  // ── Selection derived state ──
  // Resolve selected ids → StorageFile from the FULL set so a delete removes
  // exactly what's checked even if the active filter hides some of them.
  const filesById = useMemo(() => {
    const m = new Map<string, StorageFile>();
    for (const f of files) m.set(f.id, f);
    return m;
  }, [files]);
  const selectedFiles = useMemo(
    () =>
      Array.from(selectedIds)
        .map((id) => filesById.get(id))
        .filter((f): f is StorageFile => !!f),
    [selectedIds, filesById]
  );
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((f) => selectedIds.has(f.id));
  const someFilteredSelected = filtered.some((f) => selectedIds.has(f.id));

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleSelectAllFiltered = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const all = filtered.length > 0 && filtered.every((f) => next.has(f.id));
      if (all) for (const f of filtered) next.delete(f.id);
      else for (const f of filtered) next.add(f.id);
      return next;
    });
  }, [filtered]);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedFiles.length === 0) return;
    setBulkBusy(true);
    const { deleted, error: err } = await deleteFiles(selectedFiles);
    setBulkBusy(false);
    setBulkConfirm(false);
    clearSelection();
    if (err)
      toast.error(
        `Deleted ${deleted} file${deleted !== 1 ? "s" : ""}, but some failed — ${err}`
      );
    else toast.success(`Deleted ${deleted} file${deleted !== 1 ? "s" : ""}`);
  }, [selectedFiles, deleteFiles, clearSelection]);

  // ── Bucket counts (always over the full file set, ignoring filters,
  //     so the user always sees how many files exist per bucket) ──
  const bucketCounts = useMemo(() => {
    const counts: Record<BucketFilter, number> = {
      all: files.length,
      "design-files": 0,
      concepts: 0,
      salvedge: 0,
      full_knitting: 0,
      "sample-files": 0,
      "task-files": 0,
    };
    for (const f of files) {
      if (f.bucket === "sample-files" && f.path.includes("/concepts/"))
        counts.concepts++;
      else if (isFkFile(f))
        counts.full_knitting++;
      else if (f.bucket === "design-files" && f.path.includes("/salvedge/"))
        counts.salvedge++;
      else if (f.bucket === "sample-files") counts["sample-files"]++;
      else if (f.bucket === "design-files") counts["design-files"]++;
      else counts[f.bucket]++;
    }
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

  // Bulk delete — operates on whatever is currently shown (`filtered`), so it
  // respects the active tab/filters (e.g. "Concepts 21" deletes just those).
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
          {/* Bulk "Delete all" was removed from the Files view — it was too easy
              to hit. The destructive all-files wipe now lives in Settings →
              Danger Zone, gated to super-admins. Per-file delete stays here. */}
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
              className="ml-auto inline-flex shrink-0 items-center gap-1 self-center rounded-md border border-border bg-card px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-all hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
            >
              <FilterX className="h-3 w-3" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Bulk action bar — appears once any file is selected (admins). ── */}
      {isAdminUser && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {selectedIds.size} selected
          </span>
          {!allFilteredSelected && (
            <button
              type="button"
              onClick={toggleSelectAllFiltered}
              className="text-xs font-medium text-primary hover:underline"
            >
              Select all {filtered.length}
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={clearSelection} className="gap-1.5">
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkConfirm(true)}
              className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete selected
            </Button>
          </div>
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
              selected={selectedIds.has(f.id)}
              onToggleSelect={() => toggleSelect(f.id)}
              onDownload={() => handleDownload(f)}
              onDelete={() => setDeleting(f)}
            />
          ))}
        </div>
      ) : (
        <FileTable
          files={filtered}
          profileMap={profileMap}
          linkedToMap={linkedToMap}
          isAdmin={isAdminUser}
          selectedIds={selectedIds}
          allSelected={allFilteredSelected}
          someSelected={someFilteredSelected}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleSelectAllFiltered}
          onDownload={handleDownload}
          onDelete={setDeleting}
        />
      )}

      {/* ── Delete confirm (single) ── */}
      <ConfirmDialog
        open={!!deleting}
        onCancel={() => setDeleting(null)}
        title="Delete file"
        description={`Permanently delete "${deleting?.name}"? This cannot be undone.`}
        confirmLabel={deleteBusy ? "Deleting…" : "Delete"}
        variant="danger"
        onConfirm={handleDelete}
      />

      {/* ── Delete confirm (bulk) ── */}
      <ConfirmDialog
        open={bulkConfirm}
        onCancel={() => setBulkConfirm(false)}
        title={`Delete ${selectedFiles.length} file${selectedFiles.length !== 1 ? "s" : ""}?`}
        description={`Permanently delete the ${selectedFiles.length} selected file${selectedFiles.length !== 1 ? "s" : ""} from storage. This cannot be undone.`}
        confirmLabel={bulkBusy ? "Deleting…" : `Delete ${selectedFiles.length}`}
        variant="danger"
        onConfirm={handleBulkDelete}
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

function LinkedToCell({ info }: { info?: { label: string; details?: { key: string; value: string }[] } }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Position the portal popover above the trigger so it doesn't clip
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popH = 120;
    const fitsBelow = rect.bottom + popH + 8 < window.innerHeight;
    setPos({
      top: fitsBelow ? rect.bottom + 4 : rect.top - popH - 4,
      left: Math.min(rect.left, window.innerWidth - 272),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!info) return <span className="text-[11px] text-muted-foreground">—</span>;
  if (!info.details || info.details.length === 0) {
    return <span className="text-xs font-medium text-foreground">{info.label}</span>;
  }

  const typeDetail = info.details.find((d) => d.key === "Type");
  const mainDetails = info.details.filter((d) => d.key !== "Type");
  const preview = mainDetails.slice(0, 2).map((d) => d.value).join(" · ");

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="flex items-center gap-1.5 text-left"
      >
        {typeDetail && (
          <span className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase",
            typeDetail.value === "FK Image"
              ? "bg-orange-500/10 text-orange-500"
              : typeDetail.value === "Reference"
                ? "bg-primary/10 text-primary"
                : "bg-secondary text-muted-foreground"
          )}>
            {typeDetail.value}
          </span>
        )}
        <span className="max-w-[180px] truncate text-xs font-medium text-foreground">{preview}</span>
        <Info className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>

      {open && pos && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] w-64 rounded-lg border border-border bg-card p-3 shadow-xl animate-fade-in"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="grid gap-1.5">
            {mainDetails.map((d) => (
              <div key={d.key} className="flex items-baseline gap-2">
                <span className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{d.key}</span>
                <span className="min-w-0 text-xs font-medium text-foreground break-words">{d.value}</span>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

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
    uploader.role === "admin" || uploader.role === "super_admin" || uploader.role === "design_coordinator";
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
// Select checkbox — native checkbox with indeterminate support (for "some
// selected" in the table header). Stops click propagation so toggling never
// triggers a row click.
// ============================================================================

function SelectCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
    />
  );
}

// ============================================================================
// File card (grid view)
// ============================================================================

function FileCard({
  file,
  uploader,
  isAdmin,
  selected,
  onToggleSelect,
  onDownload,
  onDelete,
}: {
  file: StorageFile;
  uploader: { full_name: string; role: string; avatar_url: string | null } | null;
  isAdmin: boolean;
  selected: boolean;
  onToggleSelect: () => void;
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
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:shadow-md",
        selected ? "border-primary ring-2 ring-primary/40" : "border-border"
      )}
      onMouseEnter={loadThumb}
    >
      <div className="relative flex h-32 items-center justify-center bg-secondary/40">
        {/* Selection checkbox (admins) — top-left, always visible once any is
            selected, otherwise reveal on hover. */}
        {isAdmin && (
          <div
            className={cn(
              "absolute left-2 top-2 z-10 rounded bg-card/90 p-0.5 shadow-sm transition-opacity",
              selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
          >
            <SelectCheckbox
              checked={selected}
              onChange={onToggleSelect}
              label={`Select ${file.name}`}
            />
          </div>
        )}
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
              bucketBadgeClass(file)
            )}
          >
            {bucketBadgeLabel(file)}
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
  linkedToMap,
  isAdmin,
  selectedIds,
  allSelected,
  someSelected,
  onToggleSelect,
  onToggleAll,
  onDownload,
  onDelete,
}: {
  files: StorageFile[];
  profileMap: Map<
    string,
    { full_name: string; role: string; avatar_url: string | null }
  >;
  linkedToMap: Map<string, { label: string; details?: { key: string; value: string }[] }>;
  isAdmin: boolean;
  selectedIds: Set<string>;
  allSelected: boolean;
  someSelected: boolean;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  onDownload: (f: StorageFile) => void;
  onDelete: (f: StorageFile) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
      <table className="w-full border-collapse text-[13px]">
        <thead className={TABLE_HEAD}>
          <tr className="[&>th]:border-r [&>th]:border-border/30 [&>th:last-child]:border-r-0">
            {isAdmin && (
              <th className={cn(TABLE_TH, "w-10 text-center")}>
                <SelectCheckbox
                  checked={allSelected}
                  indeterminate={someSelected && !allSelected}
                  onChange={onToggleAll}
                  label="Select all files"
                />
              </th>
            )}
            <th className={TABLE_TH}>Name</th>
            <th className={TABLE_TH}>Type</th>
            <th className={TABLE_TH}>Size</th>
            <th className={TABLE_TH}>Bucket</th>
            <th className={TABLE_TH}>Linked To</th>
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
            const isSelected = selectedIds.has(f.id);
            return (
              <tr
                key={f.id}
                className={cn(
                  "border-b border-border/40 transition-colors hover:bg-primary/[0.04] [&>td]:border-r [&>td]:border-border/20 [&>td:last-child]:border-r-0",
                  isSelected ? "bg-primary/[0.06]" : "even:bg-background/40"
                )}
              >
                {isAdmin && (
                  <td className="px-4 py-2.5 text-center align-middle">
                    <SelectCheckbox
                      checked={isSelected}
                      onChange={() => onToggleSelect(f.id)}
                      label={`Select ${f.name}`}
                    />
                  </td>
                )}
                <td className="px-4 py-2.5 align-middle">
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
                <td className="px-4 py-2.5 align-middle">
                  <span className="text-xs uppercase text-muted-foreground">
                    {ext || "—"}
                  </span>
                </td>
                <td className="px-4 py-2.5 align-middle">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatSize(f.size)}
                  </span>
                </td>
                <td className="px-4 py-2.5 align-middle">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                      bucketBadgeClass(f)
                    )}
                  >
                    {bucketBadgeLabel(f)}
                  </span>
                </td>
                <td className="px-4 py-2.5 align-middle">
                  <LinkedToCell info={linkedToMap.get(f.path)} />
                </td>
                <td className="px-4 py-2.5 align-middle">
                  <UploaderCell uploader={uploader} />
                </td>
                <td className="px-4 py-2.5 align-middle">
                  <span
                    className="text-xs text-muted-foreground"
                    title={format(parseISO(f.created_at), "PP p")}
                  >
                    {formatDistanceToNow(parseISO(f.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </td>
                <td className="px-4 py-2.5 align-middle">
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
