import { useCallback, useEffect, useState } from "react";
import { HardDrive, Folder, FileIcon, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  Badge,
  Button,
  SkeletonCard,
} from "@/components/ui";
import { cn } from "@/lib/utils";

// ============================================================================
// Storage Tab
// ============================================================================
//
// Supabase JS doesn't expose a "size of bucket" call — we have to walk the
// list and sum metadata.size for each file. That's expensive for big buckets,
// so by default we only show file counts and let the user kick off the size
// scan on demand (per bucket OR all at once).
//
// We list with limit=100 and page until we get a short page; the loop is
// bounded by `MAX_PAGES` to avoid runaway calls on a degenerate response.
// ============================================================================

const MAX_PAGES = 200; // hard ceiling — 100 × 200 = 20k files per bucket

interface BucketMeta {
  name: string;
  maxFileMB: number;
  description: string;
}

const BUCKETS: BucketMeta[] = [
  {
    name: "design-files",
    maxFileMB: 50,
    description: "Concept images + task attachments",
  },
  {
    name: "sample-files",
    maxFileMB: 100,
    description: "Sampling records + kitting uploads",
  },
  {
    name: "task-files",
    maxFileMB: 50,
    description: "General task attachments",
  },
  {
    name: "proof-photos",
    maxFileMB: 10,
    description: "Admin-only proof uploads",
  },
  {
    name: "avatars",
    maxFileMB: 5,
    description: "User profile pictures",
  },
];

interface BucketStat {
  /** File count from the most recent list scan. -1 means "not loaded yet". */
  count: number;
  /** Total bytes — null until the user clicks "Calculate". */
  bytes: number | null;
  loadingCount: boolean;
  loadingSize: boolean;
  error: string | null;
}

const INITIAL: BucketStat = {
  count: -1,
  bytes: null,
  loadingCount: true,
  loadingSize: false,
  error: null,
};

export function StorageTab() {
  // One entry per bucket name — keyed lookup keeps the render simple.
  const [stats, setStats] = useState<Record<string, BucketStat>>(() => {
    const init: Record<string, BucketStat> = {};
    for (const b of BUCKETS) init[b.name] = { ...INITIAL };
    return init;
  });

  // List the first page of each bucket to get a quick row count. Cheap —
  // one paginated call per bucket. Sizes are computed on demand.
  const loadCounts = useCallback(async () => {
    setStats((prev) => {
      const next = { ...prev };
      for (const b of BUCKETS) next[b.name] = { ...next[b.name], loadingCount: true, error: null };
      return next;
    });
    for (const b of BUCKETS) {
      const result = await listBucket(b.name, /* withSize */ false);
      setStats((prev) => ({
        ...prev,
        [b.name]: {
          ...prev[b.name],
          count: result.count,
          loadingCount: false,
          error: result.error,
        },
      }));
    }
  }, []);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  async function calculateBucketSize(bucket: string) {
    setStats((prev) => ({
      ...prev,
      [bucket]: { ...prev[bucket], loadingSize: true, error: null },
    }));
    const result = await listBucket(bucket, true);
    setStats((prev) => ({
      ...prev,
      [bucket]: {
        ...prev[bucket],
        count: result.count,
        bytes: result.bytes,
        loadingSize: false,
        error: result.error,
      },
    }));
  }

  async function calculateAll() {
    for (const b of BUCKETS) {
      // Sequential — running all 5 in parallel would hammer the Storage API
      // and most users don't need it instant.
      await calculateBucketSize(b.name);
    }
  }

  const anyCalculating = Object.values(stats).some((s) => s.loadingSize);

  return (
    <div className="space-y-4">
      {/* Header + actions */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold text-foreground">Storage</h3>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Supabase Storage bucket usage. Size calculation walks each bucket
              and may take a few seconds for buckets with many files.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void loadCounts()}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh counts
            </Button>
            <Button
              size="sm"
              onClick={() => void calculateAll()}
              disabled={anyCalculating}
              className="gap-1.5"
            >
              {anyCalculating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <HardDrive className="h-3.5 w-3.5" />
              )}
              Calculate all sizes
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bucket grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BUCKETS.map((b) => {
          const s = stats[b.name];
          return (
            <BucketCard
              key={b.name}
              meta={b}
              stat={s}
              onCalculate={() => void calculateBucketSize(b.name)}
            />
          );
        })}
      </div>

      {/* Tips */}
      <Card className="border-primary/20 bg-primary/[0.04]">
        <CardContent className="p-4 text-xs text-muted-foreground">
          <p>
            All buckets are private. Reads use short-lived signed URLs
            (1-hour TTL) generated per request. Per-file size limits are
            enforced by Supabase Storage policies — uploads above the cap
            fail at the client before reaching the server.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Single bucket card
// ----------------------------------------------------------------------------

function BucketCard({
  meta,
  stat,
  onCalculate,
}: {
  meta: BucketMeta;
  stat: BucketStat;
  onCalculate: () => void;
}) {
  if (stat.loadingCount && stat.count === -1) {
    return <SkeletonCard />;
  }

  const mbUsed = stat.bytes != null ? stat.bytes / 1024 / 1024 : null;
  // No real quota from the platform — we use file_count × maxFileMB as the
  // *worst-case* ceiling for the bar fill. Useful as an upper bound, not a
  // policy limit. Capped at 100% for the visual.
  const ceilingMB = stat.count > 0 ? stat.count * meta.maxFileMB : meta.maxFileMB;
  const pct =
    mbUsed != null && ceilingMB > 0
      ? Math.min(100, (mbUsed / ceilingMB) * 100)
      : null;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Folder className="h-3.5 w-3.5 text-primary" />
              <p className="truncate font-mono text-sm font-semibold text-foreground">
                {meta.name}
              </p>
            </div>
            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
              {meta.description}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 text-[9px]">
            {meta.maxFileMB} MB max
          </Badge>
        </div>

        <div className="flex items-baseline gap-1">
          <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xl font-bold tabular-nums text-foreground">
            {stat.count >= 0 ? stat.count.toLocaleString() : "—"}
          </span>
          <span className="text-xs text-muted-foreground">
            file{stat.count === 1 ? "" : "s"}
          </span>
        </div>

        {stat.error ? (
          <p className="rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            {stat.error}
          </p>
        ) : mbUsed != null ? (
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total size
              </span>
              <span className="text-xs font-semibold tabular-nums text-foreground">
                {formatMB(mbUsed)}
              </span>
            </div>
            {pct != null && (
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-700",
                    pct > 80 ? "bg-warning" : "bg-primary"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={onCalculate}
            disabled={stat.loadingSize || stat.count === 0}
            className="w-full gap-1.5"
          >
            {stat.loadingSize ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Walking…
              </>
            ) : stat.count === 0 ? (
              "Empty"
            ) : (
              "Calculate size"
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Bucket walker — paginated list, optional size sum
// ----------------------------------------------------------------------------

interface ListResult {
  count: number;
  bytes: number | null;
  error: string | null;
}

async function listBucket(
  bucket: string,
  withSize: boolean
): Promise<ListResult> {
  // Recursive walk — Storage `.list("")` only returns top-level entries.
  // We walk one folder at a time, breadth-first, collecting files and
  // queueing any "folder" entries (files without a `metadata`).
  const queue: string[] = [""];
  let count = 0;
  let bytes = 0;
  let pages = 0;

  try {
    while (queue.length > 0) {
      const path = queue.shift()!;
      let offset = 0;
      // Each prefix can have its own pagination.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (pages++ > MAX_PAGES) {
          return {
            count,
            bytes: withSize ? bytes : null,
            error: "Hit the 20k-file safety cap. Counts may be partial.",
          };
        }
        const { data, error } = await supabase.storage
          .from(bucket)
          .list(path, { limit: 100, offset });
        if (error) {
          return {
            count,
            bytes: withSize ? bytes : null,
            error: error.message,
          };
        }
        if (!data || data.length === 0) break;

        for (const entry of data) {
          // Storage entries with `metadata.size` are files. Entries without
          // are folders — we need to descend into them.
          if (entry.metadata && typeof entry.metadata.size === "number") {
            count++;
            if (withSize) bytes += entry.metadata.size;
          } else {
            queue.push(path ? `${path}/${entry.name}` : entry.name);
          }
        }
        if (data.length < 100) break;
        offset += 100;
      }
    }
  } catch (e) {
    return {
      count,
      bytes: withSize ? bytes : null,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }

  return { count, bytes: withSize ? bytes : null, error: null };
}

function formatMB(mb: number): string {
  if (mb < 1) return `${Math.round(mb * 1024)} KB`;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
