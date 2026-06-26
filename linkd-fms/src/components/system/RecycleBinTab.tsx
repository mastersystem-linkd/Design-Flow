import { useCallback, useMemo, useState } from "react";
import {
  ArchiveRestore,
  Trash2,
  RotateCcw,
  AlertTriangle,
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
import {
  useRecycleBin,
  type RecycleRow,
  type RecycleSection,
} from "@/hooks/useRecycleBin";
import { TABLE_HEAD, TABLE_TH, TABLE_ROW, TABLE_TD } from "@/lib/tableStyles";
import { cn } from "@/lib/utils";

// ============================================================================
// RecycleBinTab — restore or permanently purge deleted data (super-admin).
//   Grouped into MODULE sections; each section is that module's table with its
//   own columns (one row per deleted entity). Restore/purge act on the whole
//   restore point (batch) so cascaded children come back together.
// ============================================================================

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
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export function RecycleBinTab() {
  const {
    sections,
    isLoading,
    error,
    refetch,
    restore,
    purge,
    isRestoring,
    isPurging,
  } = useRecycleBin();

  const [confirmRestore, setConfirmRestore] = useState<RecycleRow | null>(null);
  const [purgeStage1, setPurgeStage1] = useState<RecycleRow | null>(null);
  const [purgeStage2, setPurgeStage2] = useState<RecycleRow | null>(null);
  const [verifyInput, setVerifyInput] = useState("");
  const [busyBatch, setBusyBatch] = useState<number | null>(null);

  const totalItems = useMemo(
    () => sections.reduce((s, sec) => s + sec.rows.length, 0),
    [sections]
  );

  const doRestore = useCallback(
    async (row: RecycleRow) => {
      setBusyBatch(row.batch_id);
      const { data, error: err } = await restore({ batch_id: row.batch_id });
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
    async (row: RecycleRow) => {
      setBusyBatch(row.batch_id);
      const { data, error: err } = await purge({ batch_id: row.batch_id });
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
              permanently removed. Grouped by module — restore or delete for good.
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
      ) : totalItems === 0 ? (
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
          {sections.map((section) => (
            <ModuleSection
              key={section.module}
              section={section}
              busyBatch={busyBatch}
              isRestoring={isRestoring}
              isPurging={isPurging}
              onRestore={setConfirmRestore}
              onPurge={setPurgeStage1}
            />
          ))}
        </div>
      )}

      {/* Restore confirm */}
      <ConfirmDialog
        open={!!confirmRestore}
        title="Restore this item?"
        description={
          confirmRestore
            ? `This re-creates ${confirmRestore.batch_total} item${
                confirmRestore.batch_total === 1 ? "" : "s"
              } (the record and anything deleted with it) and puts them back.`
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
        title="Permanently delete this item?"
        description={
          purgeStage1
            ? `This permanently removes ${purgeStage1.batch_total} item${
                purgeStage1.batch_total === 1 ? "" : "s"
              } (the record and anything deleted with it). This cannot be undone.`
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
              permanently remove {purgeStage2 ? purgeStage2.batch_total : 0} item
              {purgeStage2 && purgeStage2.batch_total === 1 ? "" : "s"}. This is
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
              disabled={verifyInput.trim().toUpperCase() !== "DELETE" || isPurging}
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

// ── One module = its own table with module-specific columns ──────────────────
function ModuleSection({
  section,
  busyBatch,
  isRestoring,
  isPurging,
  onRestore,
  onPurge,
}: {
  section: RecycleSection;
  busyBatch: number | null;
  isRestoring: boolean;
  isPurging: boolean;
  onRestore: (row: RecycleRow) => void;
  onPurge: (row: RecycleRow) => void;
}) {
  const Icon = MODULE_ICON[section.module] ?? Package;
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-0.5">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{section.module}</h3>
        <Badge variant="secondary" className="text-[10px] tabular-nums">
          {section.rows.length}
        </Badge>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className={TABLE_HEAD}>
              <tr>
                {section.columns.map((c, i) => (
                  <th
                    key={c.key}
                    className={cn(TABLE_TH, i === 0 && "w-full")}
                  >
                    {c.label}
                  </th>
                ))}
                <th className={cn(TABLE_TH, "hidden md:table-cell")}>Deleted</th>
                <th className={cn(TABLE_TH, "hidden lg:table-cell")}>By</th>
                <th className={TABLE_TH}>Expires</th>
                <th className={cn(TABLE_TH, "text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row) => {
                const busy = busyBatch === row.batch_id;
                const expiresIn = daysUntil(row.expires_at);
                return (
                  <tr key={row.id} className={TABLE_ROW}>
                    {section.columns.map((c, i) => (
                      <td
                        key={c.key}
                        className={cn(
                          TABLE_TD,
                          i === 0
                            ? "max-w-0 truncate font-medium text-foreground"
                            : "whitespace-nowrap text-muted-foreground"
                        )}
                        title={row.cells[c.key] ?? ""}
                      >
                        {row.cells[c.key] ?? "—"}
                      </td>
                    ))}
                    <td className={cn(TABLE_TD, "hidden whitespace-nowrap text-muted-foreground md:table-cell")}>
                      {timeAgo(row.deleted_at)}
                    </td>
                    <td className={cn(TABLE_TD, "hidden whitespace-nowrap text-muted-foreground lg:table-cell")}>
                      {row.deleted_by_name ?? <span className="italic">System</span>}
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
                        <Button
                          size="sm"
                          onClick={() => onRestore(row)}
                          disabled={busy}
                          title={
                            row.batch_total > 1
                              ? `Restores this and ${row.batch_total - 1} related item(s)`
                              : "Restore"
                          }
                        >
                          {busy && isRestoring ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                          <span className="ml-1.5 hidden sm:inline">Restore</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onPurge(row)}
                          disabled={busy || isPurging}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title="Delete forever"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
