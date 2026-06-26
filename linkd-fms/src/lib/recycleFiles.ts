// ============================================================================
// recycleFiles — client-side storage "trash" helpers (Recycle Bin)
// ============================================================================
//
// Storage blobs can't be snapshotted by the DB BEFORE DELETE trigger (migration
// 0087), so deleting a file is a two-phase affair:
//   1. trashFiles()  — record the file in `deleted_records` (table_name
//      '__storage__'). The blob is NOT removed yet, so it stays recoverable.
//   2. The Files browser hides trashed files via fetchBinnedPaths().
//   3. Restore (un-bin) makes it reappear; Purge (super-admin, server-side)
//      actually removes the blob.
//
// Both helpers go through SECURITY DEFINER RPCs so any authenticated deleter
// works (direct writes to deleted_records are super-admin only).
// ============================================================================

import { supabase } from "@/lib/supabase";

/**
 * Fired on `window` after a Recycle Bin restore. Hooks that hold their own
 * state (not React Query) — useFiles, useSalvedge, useCoordinatorTasks,
 * useNotifications — listen for this and refetch so restored rows reappear
 * without a manual refresh. React Query hooks are handled via invalidation.
 */
export const DATA_RESTORED_EVENT = "linkd:data-restored";

export interface TrashFileInput {
  bucket: string;
  path: string;
  name?: string;
  size?: number;
}

/**
 * Move files to the Recycle Bin (record only — blob is kept until purge).
 * Returns how many were recorded plus the first error (never throws).
 */
export async function trashFiles(
  files: TrashFileInput[]
): Promise<{ trashed: number; error: string | null }> {
  if (files.length === 0) return { trashed: 0, error: null };
  const payload = files.map((f) => ({
    bucket: f.bucket,
    path: f.path,
    name: f.name ?? f.path.split("/").pop() ?? f.path,
    size: f.size ?? 0,
  }));
  // These RPCs aren't in the generated Supabase types yet (migrations 0087/0088)
  // — cast the args/result so the typed client doesn't reject the names. MUST be
  // called as `supabase.rpc(...)` (not via a detached variable) or the method
  // loses its `this` binding → "Cannot read properties of undefined (reading 'rest')".
  const { data, error } = (await supabase.rpc(
    "fn_bin_storage_files" as never,
    { p_files: payload } as never
  )) as unknown as { data: unknown; error: { message: string } | null };
  if (error) return { trashed: 0, error: error.message };
  return { trashed: typeof data === "number" ? data : files.length, error: null };
}

/**
 * The set of currently-binned storage files, keyed `${bucket}::${path}`, so the
 * Files browser can exclude them. Returns `{ paths, error }` — callers should
 * distinguish "no binned files" from "lookup failed": on error, keep the
 * PREVIOUS set rather than treating it as "nothing binned" (which would un-hide
 * every just-deleted file). Retries once before giving up.
 */
export async function fetchBinnedPaths(): Promise<{
  paths: Set<string>;
  error: string | null;
}> {
  let lastErr: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    // Call directly on `supabase` (not a detached variable) to keep `this`.
    const { data, error } = (await supabase.rpc(
      "fn_binned_storage_paths" as never
    )) as unknown as { data: unknown; error: { message: string } | null };
    if (!error) {
      const rows = (data as { bucket: string; path: string }[]) ?? [];
      return { paths: new Set(rows.map((r) => `${r.bucket}::${r.path}`)), error: null };
    }
    lastErr = error.message;
  }
  return { paths: new Set(), error: lastErr };
}
