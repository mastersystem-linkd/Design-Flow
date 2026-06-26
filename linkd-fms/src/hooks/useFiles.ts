import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  trashFiles,
  fetchBinnedPaths,
  DATA_RESTORED_EVENT,
} from "@/lib/recycleFiles";

// ============================================================================
// Types
// ============================================================================

export type BucketName = "design-files" | "sample-files" | "task-files";

export interface StorageFile {
  id: string;
  name: string;
  bucket: BucketName;
  /** Full path inside the bucket (folder/filename). */
  path: string;
  created_at: string;
  updated_at: string;
  size: number;
  mimetype: string;
  /**
   * UUID extracted from the leading path segment. Storage paths are written
   * by the upload code as `{user_id}/...`, so the first folder is always the
   * uploader's profile id. Null if the path doesn't start with a uuid (e.g.
   * legacy uploads or seed data).
   */
  uploaderId: string | null;
}

const BUCKETS: BucketName[] = ["design-files", "sample-files", "task-files"];

const BUCKET_LABELS: Record<BucketName, string> = {
  "design-files": "Design Files",
  "sample-files": "Sample Files",
  "task-files": "Task Files",
};

export { BUCKET_LABELS };

// ============================================================================
// Helpers
// ============================================================================

function isImageMime(mime: string): boolean {
  return /^image\/(jpe?g|png|gif|webp|svg)/.test(mime);
}

export { isImageMime };

/**
 * Recursively list all files inside a bucket (up to ~500).
 * Supabase storage .list() returns items in the given folder,
 * including sub-folders. We traverse one level deep (user-id folders).
 */
async function listAllInBucket(bucket: BucketName): Promise<StorageFile[]> {
  const results: StorageFile[] = [];

  // List top-level (usually user-id folders)
  const { data: topLevel, error } = await supabase.storage
    .from(bucket)
    .list("", { limit: 200, sortBy: { column: "name", order: "asc" } });

  if (error || !topLevel) return results;

  for (const item of topLevel) {
    if (item.id) {
      // It's a file at root level
      results.push(toStorageFile(item, bucket, item.name));
    } else {
      // It's a folder — list its contents
      const { data: children } = await supabase.storage
        .from(bucket)
        .list(item.name, {
          limit: 200,
          sortBy: { column: "created_at", order: "desc" },
        });

      if (children) {
        for (const child of children) {
          if (child.id) {
            results.push(
              toStorageFile(child, bucket, `${item.name}/${child.name}`)
            );
          } else {
            // One more level deep (e.g. user/concepts/* or user/tasks/*)
            const gcPath = `${item.name}/${child.name}`;
            const { data: grandchildren } = await supabase.storage
              .from(bucket)
              .list(gcPath, {
                limit: 200,
                sortBy: { column: "created_at", order: "desc" },
              });
            if (grandchildren) {
              for (const gc of grandchildren) {
                if (gc.id) {
                  results.push(
                    toStorageFile(gc, bucket, `${gcPath}/${gc.name}`)
                  );
                } else {
                  // 4th level (e.g. user/tasks/{taskId}/brief-*)
                  const ggPath = `${gcPath}/${gc.name}`;
                  const { data: ggChildren } = await supabase.storage
                    .from(bucket)
                    .list(ggPath, {
                      limit: 200,
                      sortBy: { column: "created_at", order: "desc" },
                    });
                  if (ggChildren) {
                    for (const gg of ggChildren) {
                      if (gg.id) {
                        results.push(
                          toStorageFile(gg, bucket, `${ggPath}/${gg.name}`)
                        );
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return results;
}

// uuid v4 regex — leading segment of every upload path that follows the
// `{user_id}/...` convention. Used to derive the uploader from the path.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toStorageFile(
  raw: { id: string; name: string; created_at: string; updated_at: string; metadata: any },
  bucket: BucketName,
  path: string
): StorageFile {
  // First path segment is the user id when uploads follow our convention
  // (every upload site in the codebase prefixes `${user.id}/`). If it's not
  // a uuid (legacy / seeded data), fall back to null so consumers can show
  // "Unknown".
  const firstSeg = path.split("/")[0];
  const uploaderId = UUID_RE.test(firstSeg) ? firstSeg : null;
  return {
    id: raw.id,
    name: raw.name,
    bucket,
    path,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    size: raw.metadata?.size ?? 0,
    mimetype: raw.metadata?.mimetype ?? "application/octet-stream",
    uploaderId,
  };
}

// ============================================================================
// Hook
// ============================================================================

export interface UseFiles {
  files: StorageFile[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  getSignedUrl: (file: StorageFile) => Promise<string | null>;
  deleteFile: (file: StorageFile) => Promise<{ error: string | null }>;
  /**
   * Bulk-remove many files at once (e.g. "Delete all" over the filtered set).
   * Batches by bucket and chunks the path list so a large selection still
   * goes through Storage's array `.remove()` efficiently. Returns how many
   * were actually removed plus the first error encountered (if any).
   */
  deleteFiles: (
    files: StorageFile[]
  ) => Promise<{ deleted: number; error: string | null }>;
}

export function useFiles(): UseFiles {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Last known binned-path set — reused if the lookup transiently fails, so a
  // hiccup never un-hides freshly-trashed files.
  const lastBinned = useRef<Set<string>>(new Set());

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [allResults, binnedResult] = await Promise.all([
        Promise.all(BUCKETS.map((b) => listAllInBucket(b))),
        fetchBinnedPaths(),
      ]);
      const binned = binnedResult.error ? lastBinned.current : binnedResult.paths;
      if (!binnedResult.error) lastBinned.current = binnedResult.paths;
      const merged = allResults
        .flat()
        // Hide files that are sitting in the Recycle Bin (blob still exists
        // until purged, but it reads as deleted everywhere in the UI).
        .filter((f) => !binned.has(`${f.bucket}::${f.path}`))
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      setFiles(merged);
    } catch (e: any) {
      console.error("[useFiles] error:", e);
      setError(e.message ?? "Failed to load files");
      setFiles([]);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Refetch when something is restored from the Recycle Bin (un-binned files
  // should reappear without a manual refresh).
  useEffect(() => {
    const h = () => void refetch();
    window.addEventListener(DATA_RESTORED_EVENT, h);
    return () => window.removeEventListener(DATA_RESTORED_EVENT, h);
  }, [refetch]);

  const getSignedUrl = useCallback(
    async (file: StorageFile): Promise<string | null> => {
      const { data, error: err } = await supabase.storage
        .from(file.bucket)
        .createSignedUrl(file.path, 3600);
      if (err) {
        console.error("[useFiles] signedUrl error:", err);
        return null;
      }
      return data.signedUrl;
    },
    []
  );

  // Deleting a file moves it to the Recycle Bin (the blob is kept until a
  // super-admin purges it) so accidental deletes are recoverable. See
  // lib/recycleFiles.ts.
  const deleteFile = useCallback(
    async (file: StorageFile): Promise<{ error: string | null }> => {
      const { error } = await trashFiles([
        { bucket: file.bucket, path: file.path, name: file.name, size: file.size },
      ]);
      if (error) return { error };
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      return { error: null };
    },
    []
  );

  const deleteFiles = useCallback(
    async (
      toDelete: StorageFile[]
    ): Promise<{ deleted: number; error: string | null }> => {
      if (toDelete.length === 0) return { deleted: 0, error: null };
      const { trashed, error } = await trashFiles(
        toDelete.map((f) => ({
          bucket: f.bucket,
          path: f.path,
          name: f.name,
          size: f.size,
        }))
      );
      if (error) return { deleted: 0, error };
      const removedIds = new Set(toDelete.map((f) => f.id));
      setFiles((prev) => prev.filter((f) => !removedIds.has(f.id)));
      return { deleted: trashed || toDelete.length, error: null };
    },
    []
  );

  return {
    files,
    isLoading,
    error,
    refetch,
    getSignedUrl,
    deleteFile,
    deleteFiles,
  };
}
