import { useCallback, useMemo, useState } from "react";
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
  ClipboardList,
  Lightbulb,
  FlaskConical,
  Layers,
  Scissors,
  ListChecks,
  FolderOpen,
  Bell,
  Package,
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
import { useRecycleBin, type RecycleBatch } from "@/hooks/useRecycleBin";
import {
  TABLE_HEAD,
  TABLE_TH,
  TABLE_ROW,
  TABLE_TD,
} from "@/lib/tableStyles";
import { cn } from "@/lib/utils";

// ============================================================================
// RecycleBinTab — restore or permanently purge deleted data (super-admin).
//   Items are grouped into MODULE sections (Tasks / Concepts / Sampling / …),
//   each a table of restore points. Items auto-purge after 30 days.
// ============================================================================

// Section order + icon per module (matches MODULE_PRIORITY in the API route).
const MODULE_ORDER = [
  "Tasks",
  "Concepts",
  "Sampling",
  "Full Knitting",
  "Salvedge",
  "Coordinator Tasks",
  "Files",
  "Notifications",
  "Other",
] as const;

const MODULE_ICON: Record<string, typeof ClipboardList> = {
  Tasks: ClipboardList,
  Concepts: Lightbulb,
  Sampling: FlaskConical,
  "Full Knitting": Layers,
  Salvedge: Scissors,
  "Coordinator Tasks": ListChecks,
  Files: FolderOpen,
  Notifications: Bell,
  Other: Package,
};

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
    restore,
    purge,
    isRestoring,
    isPurging,
  } = useRecycleBin();

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [confirmRestore, setConfirmRestore] = useState<RecycleBatch | null>(null);
  const [purgeStage1, setPurgeStage1] = useState<RecycleBatch | null>(null);
  const [purgeStage2, setPurgeStage2] = useState<RecycleBatch | null>(null);
  const [verifyInput, setVerifyInput] = useState("");
  const [busyBatch, setBusyBatch] = useState<number | null>(null);

  // Group restore points into module sections (only non-empty, in order).
  const sections = useMemo(() => {
    const byModule = new Map<string, RecycleBatch[]>();
    for (const b of batches) {
      const arr = byModule.get(b.module) ?? [];
      arr.push(b);
      byModule.set(b.module, arr);
    }
    return MODULE_ORDER.filter((m) => byModule.has(m)).map((m) => {
      const list = byModule.get(m)!;
      return {
        module: m,
        batches: list,
        itemCount: list.reduce((s, b) => s + b.total, 0),
      };
    });
  }, [batches]);

  const toggleExpand = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

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
      toast.success(
        `Permanently deleted ${data?.purged ?? 0} item${
          (data?.purged ?? 0) === 1 ? "" : "s"
        }`
      );
    },
    [purge]
  );

  const totalItems = batches.reduce((s, b) => s + b.total, 0);

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
              permanently removed. Items are grouped by module — restore or delete
              for good.
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
          description="Deleted tasks, concepts, samples, files and more appear here for 30 days so you can recover them."
        />
      ) : (
        <div className="space-y-5">
          <p className="text-[11px] text-muted-foreground">
            {totalItems.toLocaleString()} item{totalItems === 1 ? "" : "s"} across{" "}
            {sections.length} module{sections.length === 1 ? "" : "s"}
          </p>
          {sections.map((section) => {
            const Icon = MODULE_ICON[section.module] ?? Package;
            return (
              <section key={section.module} className="space-y-2">
                <div className="flex items-center gap-2 px-0.5">
                  <Icon className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">
                    {section.module}
                  </h3>
                  <Badge variant="secondary" className="text-[10px] tabular-nums">
                    {section.itemCount}
                  </Badge>
                </div>

                <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead className={TABLE_HEAD}>
                        <tr>
                          <th className={cn(TABLE_TH, "w-full")}>Item</th>
                          <th className={TABLE_TH}>Deleted</th>
                          <th className={cn(TABLE_TH, "hidden sm:table-cell")}>By</th>
                          <th className={TABLE_TH}>Expires</th>
                          <th className={cn(TABLE_TH, "text-right")}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.batches.map((batch) => {
                          const isOpen = expanded.has(batch.batch_id);
                          const busy = busyBatch === batch.batch_id;
                          const expiresIn = daysUntil(batch.expires_at);
                          const primary = batch.records[0];
                          const multi = batch.total > 1;
                          return (
                            <RowGroup
                              key={batch.batch_id}
                              batch={batch}
                              isOpen={isOpen}
                              busy={busy}
                              busyRestoring={busy && isRestoring}
                              expiresIn={expiresIn}
                              primaryLabel={primary?.label ?? "—"}
                              multi={multi}
                              onToggle={() => toggleExpand(batch.batch_id)}
                              onRestore={() => setConfirmRestore(batch)}
                              onPurge={() => setPurgeStage1(batch)}
                            />
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
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
              permanently remove {purgeStage2 ? purgeStage2.total : 0} item
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

// ── One restore point = a main row + (if multi) an expandable detail row ─────
function RowGroup({
  batch,
  isOpen,
  busy,
  busyRestoring,
  expiresIn,
  primaryLabel,
  multi,
  onToggle,
  onRestore,
  onPurge,
}: {
  batch: RecycleBatch;
  isOpen: boolean;
  busy: boolean;
  busyRestoring: boolean;
  expiresIn: number;
  primaryLabel: string;
  multi: boolean;
  onToggle: () => void;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <>
      <tr className={TABLE_ROW}>
        <td className={cn(TABLE_TD, "max-w-0")}>
          <div className="flex items-center gap-2">
            {multi ? (
              <button
                type="button"
                onClick={onToggle}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                title={isOpen ? "Collapse" : "Show items"}
              >
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <span className="w-[18px] shrink-0" />
            )}
            <span className="truncate font-medium text-foreground" title={primaryLabel}>
              {primaryLabel}
            </span>
            {multi && (
              <Badge variant="secondary" className="shrink-0 text-[10px] tabular-nums">
                +{batch.total - 1} more
              </Badge>
            )}
          </div>
        </td>
        <td className={cn(TABLE_TD, "whitespace-nowrap text-muted-foreground")}>
          {timeAgo(batch.deleted_at)}
        </td>
        <td
          className={cn(
            TABLE_TD,
            "hidden whitespace-nowrap text-muted-foreground sm:table-cell"
          )}
        >
          {batch.deleted_by_name ?? <span className="italic">System</span>}
        </td>
        <td className={cn(TABLE_TD, "whitespace-nowrap")}>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs",
              expiresIn <= 3 ? "text-warning" : "text-muted-foreground"
            )}
          >
            <Clock className="h-3 w-3" />
            {expiresIn === 0 ? "today" : `${expiresIn}d`}
          </span>
        </td>
        <td className={cn(TABLE_TD, "whitespace-nowrap text-right")}>
          <div className="inline-flex items-center gap-1.5">
            <Button size="sm" onClick={onRestore} disabled={busy}>
              {busyRestoring ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              <span className="ml-1.5 hidden sm:inline">Restore</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onPurge}
              disabled={busy}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              title="Delete forever"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
      </tr>
      {multi && isOpen && (
        <tr className="bg-secondary/20">
          <td colSpan={5} className="px-3 py-2">
            <ul className="space-y-0.5">
              {batch.records.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-xs">
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
          </td>
        </tr>
      )}
    </>
  );
}
