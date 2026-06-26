import { useCallback, useState } from "react";
import {
  ArchiveRestore,
  Trash2,
  RotateCcw,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Clock,
  FileX2,
} from "lucide-react";
import {
  Card,
  CardContent,
  Badge,
  Button,
  Input,
  Label,
  EmptyState,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  toast,
} from "@/components/ui";
import {
  useRecycleBin,
  type RecycleBatch,
  type RecycleRecord,
} from "@/hooks/useRecycleBin";
import { cn } from "@/lib/utils";

// ============================================================================
// RecycleBinTab — restore or permanently purge deleted data (super-admin).
//   Deletes anywhere in the app are snapshotted into `deleted_records` and
//   grouped into restore points (batches). Items auto-purge after 30 days.
// ============================================================================

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function daysUntil(iso: string): number {
  return Math.max(
    0,
    Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
  );
}

export function RecycleBinTab() {
  const {
    batches,
    isLoading,
    error,
    refetch,
    fetchBatch,
    restore,
    purge,
    isRestoring,
    isPurging,
  } = useRecycleBin();

  const [expanded, setExpanded] = useState<number | null>(null);
  const [records, setRecords] = useState<Record<number, RecycleRecord[]>>({});
  const [loadingRecords, setLoadingRecords] = useState<number | null>(null);

  const [confirmRestore, setConfirmRestore] = useState<RecycleBatch | null>(null);
  const [purgeStage1, setPurgeStage1] = useState<RecycleBatch | null>(null);
  const [purgeStage2, setPurgeStage2] = useState<RecycleBatch | null>(null);
  const [verifyInput, setVerifyInput] = useState("");
  const [busyBatch, setBusyBatch] = useState<number | null>(null);

  const toggleExpand = useCallback(
    async (batchId: number) => {
      if (expanded === batchId) {
        setExpanded(null);
        return;
      }
      setExpanded(batchId);
      if (!records[batchId]) {
        setLoadingRecords(batchId);
        try {
          const recs = await fetchBatch(batchId);
          setRecords((prev) => ({ ...prev, [batchId]: recs }));
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Couldn't load items");
        } finally {
          setLoadingRecords(null);
        }
      }
    },
    [expanded, records, fetchBatch]
  );

  const doRestore = useCallback(
    async (batch: RecycleBatch) => {
      setBusyBatch(batch.batch_id);
      const { data, error: err } = await restore({ batch_id: batch.batch_id });
      setBusyBatch(null);
      setConfirmRestore(null);
      if (err) {
        toast.error(err);
        return;
      }
      // Drop the now-stale drill-down cache + collapse so a re-expand refetches.
      setRecords((prev) => {
        const next = { ...prev };
        delete next[batch.batch_id];
        return next;
      });
      setExpanded((cur) => (cur === batch.batch_id ? null : cur));
      let msg = `Restored ${data?.restored ?? 0} item${
        (data?.restored ?? 0) === 1 ? "" : "s"
      }`;
      if (data?.files_restored) msg += ` + ${data.files_restored} file(s)`;
      if (data?.skipped?.length)
        msg += ` · ${data.skipped.length} couldn't be restored`;
      toast.success(msg);
    },
    [restore]
  );

  const doPurge = useCallback(
    async (batch: RecycleBatch) => {
      setBusyBatch(batch.batch_id);
      const { data, error: err } = await purge({ batch_id: batch.batch_id });
      setBusyBatch(null);
      setPurgeStage2(null);
      setVerifyInput("");
      if (err) {
        toast.error(err);
        return;
      }
      setRecords((prev) => {
        const next = { ...prev };
        delete next[batch.batch_id];
        return next;
      });
      setExpanded((cur) => (cur === batch.batch_id ? null : cur));
      toast.success(
        `Permanently deleted ${data?.purged ?? 0} item${
          (data?.purged ?? 0) === 1 ? "" : "s"
        }`
      );
    },
    [purge]
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <ArchiveRestore className="h-[18px] w-[18px] text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Recycle Bin</h2>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Anything deleted in the app is kept here for{" "}
              <span className="font-medium text-foreground">30 days</span>, then
              permanently removed. Restore an item or delete it for good.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          <span className="ml-1.5 hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {error && (
        <Card>
          <CardContent className="flex items-center gap-2 py-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the bin…
        </div>
      ) : batches.length === 0 ? (
        <EmptyState
          icon={<Trash2 className="h-5 w-5" />}
          title="Recycle Bin is empty"
          description="Deleted tasks, samples, concepts, files and more appear here for 30 days so you can recover them."
        />
      ) : (
        <div className="space-y-2.5">
          {batches.map((batch) => {
            const isOpen = expanded === batch.batch_id;
            const busy = busyBatch === batch.batch_id;
            const expiresIn = daysUntil(batch.expires_at);
            return (
              <div
                key={batch.batch_id}
                className="overflow-hidden rounded-xl border border-border bg-card shadow-card"
              >
                {/* Summary row */}
                <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => void toggleExpand(batch.batch_id)}
                    className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                  >
                    {isOpen ? (
                      <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {Object.entries(batch.breakdown).map(([label, n]) => (
                          <Badge
                            key={label}
                            variant="secondary"
                            className="text-[10px] tabular-nums"
                          >
                            {n} {label}
                          </Badge>
                        ))}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>Deleted {timeAgo(batch.deleted_at)}</span>
                        <span aria-hidden>·</span>
                        <span>
                          by{" "}
                          {batch.deleted_by_name ?? (
                            <span className="italic">System (Danger Zone)</span>
                          )}
                        </span>
                        <span aria-hidden>·</span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1",
                            expiresIn <= 3 && "text-warning"
                          )}
                        >
                          <Clock className="h-3 w-3" />
                          {expiresIn === 0
                            ? "expires today"
                            : `expires in ${expiresIn}d`}
                        </span>
                      </p>
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-2 pl-6 sm:pl-0">
                    <Button
                      size="sm"
                      onClick={() => setConfirmRestore(batch)}
                      disabled={busy || isRestoring}
                    >
                      {busy && isRestoring ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      <span className="ml-1.5">Restore</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPurgeStage1(batch)}
                      disabled={busy || isPurging}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="ml-1.5 hidden sm:inline">Delete forever</span>
                    </Button>
                  </div>
                </div>

                {/* Drill-down */}
                {isOpen && (
                  <div className="border-t border-border bg-secondary/20 px-3 py-2">
                    {loadingRecords === batch.batch_id ? (
                      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading items…
                      </div>
                    ) : (records[batch.batch_id]?.length ?? 0) === 0 ? (
                      <p className="py-3 text-xs text-muted-foreground">
                        No items to show.
                      </p>
                    ) : (
                      <ul className="max-h-72 space-y-0.5 overflow-y-auto py-1">
                        {records[batch.batch_id].map((r) => (
                          <li
                            key={r.id}
                            className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-card"
                          >
                            <Badge
                              variant="outline"
                              className="shrink-0 text-[9px] uppercase tracking-wide"
                            >
                              {r.table_label}
                            </Badge>
                            <span className="truncate text-foreground" title={r.label}>
                              {r.label}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Restore confirm */}
      <ConfirmDialog
        open={!!confirmRestore}
        title="Restore these items?"
        description={
          confirmRestore
            ? `This re-creates ${confirmRestore.total} item${
                confirmRestore.total === 1 ? "" : "s"
              } and puts them back where they were.`
            : undefined
        }
        confirmLabel="Restore"
        cancelLabel="Cancel"
        variant="default"
        onConfirm={() => {
          if (confirmRestore) void doRestore(confirmRestore);
        }}
        onCancel={() => setConfirmRestore(null)}
      />

      {/* Purge — stage 1 */}
      <ConfirmDialog
        open={!!purgeStage1}
        title="Permanently delete these items?"
        description={
          purgeStage1
            ? `This will permanently remove ${purgeStage1.total} item${
                purgeStage1.total === 1 ? "" : "s"
              }${
                purgeStage1.file_count
                  ? ` (including ${purgeStage1.file_count} file${
                      purgeStage1.file_count === 1 ? "" : "s"
                    })`
                  : ""
              }. This cannot be undone.`
            : undefined
        }
        confirmLabel="I understand, continue"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          setPurgeStage2(purgeStage1);
          setPurgeStage1(null);
          setVerifyInput("");
        }}
        onCancel={() => setPurgeStage1(null)}
      />

      {/* Purge — stage 2 (type DELETE) */}
      <Dialog
        open={!!purgeStage2}
        onOpenChange={(o) => {
          if (!o) {
            setPurgeStage2(null);
            setVerifyInput("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <FileX2 className="h-5 w-5" /> Final confirmation
            </DialogTitle>
            <DialogDescription>
              Type <span className="font-mono font-semibold">DELETE</span> to
              permanently remove{" "}
              {purgeStage2 ? purgeStage2.total : 0} item
              {purgeStage2 && purgeStage2.total === 1 ? "" : "s"}. This is
              irreversible.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rb-verify">Confirmation</Label>
            <Input
              id="rb-verify"
              value={verifyInput}
              autoFocus
              placeholder="DELETE"
              className="font-mono"
              onChange={(e) => setVerifyInput(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  verifyInput.trim().toUpperCase() === "DELETE" &&
                  purgeStage2
                ) {
                  void doPurge(purgeStage2);
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setPurgeStage2(null);
                setVerifyInput("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                verifyInput.trim().toUpperCase() !== "DELETE" || isPurging
              }
              onClick={() => purgeStage2 && doPurge(purgeStage2)}
            >
              {isPurging ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              <span className="ml-1.5">Delete forever</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
