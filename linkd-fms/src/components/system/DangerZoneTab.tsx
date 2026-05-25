import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BellOff,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  Badge,
  Button,
  Input,
  Label,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  toast,
} from "@/components/ui";
import { cn } from "@/lib/utils";

// ============================================================================
// Danger Zone Tab
// ============================================================================
//
// Permanent deletes. Every action goes through a two-step confirmation:
//   1. ConfirmDialog (variant=danger) — "I understand"
//   2. Type "DELETE" into an input — exact match required
//
// The previous SystemView only had step 1. After it deleted production data
// by accident once, we added step 2 — it's a cheap insurance against a
// mis-click.
//
// The "Clear All Notifications" action is a softer flow (single confirm) —
// notifications can be regenerated and are low-impact compared to tasks.

/**
 * Allowed table identifiers — must match the Supabase Database['public']['Tables']
 * union. Listing them explicitly here lets us drop the cast at every
 * `.from(...)` call site.
 */
type ClearableTable =
  | "task_logs"
  | "files"
  | "full_kitting_details"
  | "task_comments"
  | "tasks"
  | "concepts"
  | "samples"
  | "salvedge_records"
  | "notifications"
  | "sampling_logs";

interface TableSpec {
  key: string;
  table: ClearableTable;
  label: string;
  description: string;
  /** Other tables that get cleared too via FK cascade (or via explicit chain in handler). */
  dependents?: string[];
}

// FK-safe order — descendants first, parents last.
const TABLE_SPECS: TableSpec[] = [
  {
    key: "task_logs",
    table: "task_logs",
    label: "Task Logs",
    description: "Per-task activity audit trail.",
  },
  {
    key: "files",
    table: "files",
    label: "Task Files",
    description: "File metadata (storage objects are NOT deleted).",
  },
  {
    key: "full_kitting_details",
    table: "full_kitting_details",
    label: "Full Knitting",
    description: "Structured knitting form submissions.",
  },
  {
    key: "task_comments",
    table: "task_comments",
    label: "Task Comments",
    description: "Discussion thread on each task.",
  },
  {
    key: "tasks",
    table: "tasks",
    label: "Tasks",
    description: "All design briefs / tasks.",
    dependents: ["task_logs", "files", "full_kitting_details", "task_comments"],
  },
  {
    key: "concepts",
    table: "concepts",
    label: "Concepts",
    description: "Concept submissions and reviews.",
  },
  {
    key: "samples",
    table: "samples",
    label: "Samples",
    description: "Sampling records.",
  },
  {
    key: "salvedge_records",
    table: "salvedge_records",
    label: "Salvedge",
    description: "Challan-based fabric distribution.",
  },
  {
    key: "notifications",
    table: "notifications",
    label: "Notifications",
    description: "In-app notification rows.",
  },
  {
    key: "sampling_logs",
    table: "sampling_logs",
    label: "Sampling Logs",
    description: "Legacy sampling event log.",
  },
];

// Order used by "Clear All Transactional Data" — same shape, more rigid.
const CLEAR_ALL_ORDER: string[] = [
  "task_logs",
  "files",
  "full_kitting_details",
  "task_comments",
  "tasks",
  "concepts",
  "samples",
  "salvedge_records",
  "notifications",
  "sampling_logs",
];

type TableKey = (typeof TABLE_SPECS)[number]["key"];

export function DangerZoneTab() {
  // Counts per table — fed by `head: true` count queries that cost almost
  // nothing to run.
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countsLoading, setCountsLoading] = useState(true);
  const [busyTable, setBusyTable] = useState<string | null>(null);

  // Stage-1 confirmation state — which action got the "I understand" click.
  const [stage1, setStage1] = useState<
    | { kind: "clear-notifs" }
    | { kind: "clear-table"; spec: TableSpec }
    | { kind: "clear-all" }
    | null
  >(null);

  // Stage-2 confirmation state — same action surfaced as a "type DELETE" modal.
  const [stage2, setStage2] = useState<typeof stage1>(null);

  // The "DELETE" verification input value.
  const [verifyInput, setVerifyInput] = useState("");

  const fetchCounts = useCallback(async () => {
    setCountsLoading(true);
    const next: Record<string, number> = {};
    await Promise.all(
      TABLE_SPECS.map(async (spec) => {
        const { count } = await supabase
          .from(spec.table)
          .select("*", { count: "exact", head: true });
        next[spec.key] = count ?? 0;
      })
    );
    setCounts(next);
    setCountsLoading(false);
  }, []);

  useEffect(() => {
    void fetchCounts();
  }, [fetchCounts]);

  // Single-row sentinel used by `.delete()` so PostgREST allows the call.
  const NIL_ID = "00000000-0000-0000-0000-000000000000";

  async function deleteTable(
    table: ClearableTable
  ): Promise<{ error: string | null }> {
    const { error } = await supabase.from(table).delete().neq("id", NIL_ID);
    return { error: error ? error.message : null };
  }

  // ── Action handlers ──────────────────────────────────────────────────

  async function executeClearNotifs() {
    setBusyTable("notifications-soft");
    const count = counts["notifications"] ?? 0;
    const { error } = await deleteTable("notifications");
    setBusyTable(null);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`${count.toLocaleString()} notifications cleared`);
    void fetchCounts();
  }

  async function executeClearTable(spec: TableSpec) {
    setBusyTable(spec.key);
    const count = counts[spec.key] ?? 0;
    const { error } = await deleteTable(spec.table);
    setBusyTable(null);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(
      `${count.toLocaleString()} record${count !== 1 ? "s" : ""} cleared from ${spec.label}`
    );
    void fetchCounts();
  }

  async function executeClearAll() {
    setBusyTable("__all__");
    for (const tableKey of CLEAR_ALL_ORDER) {
      const spec = TABLE_SPECS.find((s) => s.key === tableKey);
      if (!spec) continue;
      const { error } = await deleteTable(spec.table);
      if (error) {
        toast.error(`Failed clearing ${spec.label}: ${error}`);
        setBusyTable(null);
        await fetchCounts();
        return;
      }
    }
    // Reset the per-year task counter so codes restart at NN=01.
    await supabase.from("task_counters" as never).delete().neq("year", -1);
    setBusyTable(null);
    toast.success("All transactional data cleared");
    void fetchCounts();
  }

  // ── Stage transitions ────────────────────────────────────────────────

  function onStage1Confirm() {
    // Hand off to stage 2 — same action, second gate.
    setStage2(stage1);
    setStage1(null);
    setVerifyInput("");
  }

  async function onStage2Confirm() {
    if (verifyInput.trim().toUpperCase() !== "DELETE") return;
    const action = stage2;
    setStage2(null);
    setVerifyInput("");
    if (!action) return;

    if (action.kind === "clear-notifs") {
      // Should never get here — notifications use stage1 only — but kept
      // for completeness if we promote it to double-confirm later.
      await executeClearNotifs();
    } else if (action.kind === "clear-table") {
      await executeClearTable(action.spec);
    } else if (action.kind === "clear-all") {
      await executeClearAll();
    }
  }

  // Build the stage-1 dialog props from the queued action.
  const stage1Dialog = (() => {
    if (!stage1) return null;
    if (stage1.kind === "clear-notifs") {
      const n = counts["notifications"] ?? 0;
      return {
        title: "Clear all notifications?",
        description: `Removes ${n.toLocaleString()} notification rows for every user. Useful after fixing notification spam — users can still see new notifications going forward.`,
        confirmLabel: "Clear notifications",
        variant: "warning" as const,
        onConfirm: () => {
          setStage1(null);
          void executeClearNotifs();
        },
      };
    }
    if (stage1.kind === "clear-table") {
      const n = counts[stage1.spec.key] ?? 0;
      return {
        title: `Clear all ${stage1.spec.label}?`,
        description: `This permanently deletes ${n.toLocaleString()} record${n !== 1 ? "s" : ""}. ${
          stage1.spec.dependents?.length
            ? `Related rows in ${stage1.spec.dependents.join(", ")} will be removed by cascade.`
            : ""
        } This cannot be undone.`,
        confirmLabel: "I understand, continue",
        variant: "danger" as const,
        onConfirm: onStage1Confirm,
      };
    }
    // clear-all
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    return {
      title: "Clear ALL transactional data?",
      description: `Permanently deletes ${total.toLocaleString()} records across every transactional table (tasks, concepts, samples, salvedge, notifications, logs). Preserves: user accounts, profiles, clients, designer codes, lookup data.`,
      confirmLabel: "I understand, continue",
      variant: "danger" as const,
      onConfirm: onStage1Confirm,
    };
  })();

  const stage2Title = (() => {
    if (!stage2) return "";
    if (stage2.kind === "clear-all") return "Final confirmation";
    if (stage2.kind === "clear-table") return `Confirm clearing ${stage2.spec.label}`;
    return "Confirm";
  })();

  const verifyOk = verifyInput.trim().toUpperCase() === "DELETE";

  return (
    <div className="space-y-5">
      {/* Header banner */}
      <Card className="border-destructive/30 bg-destructive/[0.06]">
        <CardContent className="flex items-start gap-3 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-semibold text-destructive">
              Permanent data deletion
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Actions here permanently delete data. User accounts, profiles,
              clients, designer codes, and lookup tables are never affected.
              Every action requires two confirmations including typing{" "}
              <span className="font-mono font-semibold text-foreground">DELETE</span>.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void fetchCounts()}
            className="ml-auto gap-1.5"
            disabled={countsLoading}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", countsLoading && "animate-spin")}
            />
            Refresh
          </Button>
        </CardContent>
      </Card>

      {/* Soft action: clear notifications (single confirm) */}
      <Card className="border-warning/30 bg-warning/[0.04]">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-start gap-3">
            <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Clear all notifications
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {(counts["notifications"] ?? 0).toLocaleString()} rows · removes
                the in-app feed for every user. Use after fixing notification spam.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busyTable === "notifications-soft" || (counts["notifications"] ?? 0) === 0}
            onClick={() => setStage1({ kind: "clear-notifs" })}
            className="gap-1.5 border-warning/40 text-warning hover:bg-warning/10"
          >
            {busyTable === "notifications-soft" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <BellOff className="h-3.5 w-3.5" />
            )}
            Clear notifications
          </Button>
        </CardContent>
      </Card>

      {/* Per-table list */}
      <Card>
        <CardContent className="p-0">
          <header className="border-b border-border px-5 py-4">
            <h3 className="text-sm font-semibold text-foreground">
              Per-table clear
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Delete every row from a single table. Each row shows the current
              count — empty tables are disabled.
            </p>
          </header>

          <ul>
            {TABLE_SPECS.map((spec) => {
              const count = counts[spec.key] ?? 0;
              const isBusy = busyTable === spec.key;
              const isEmpty = !countsLoading && count === 0;
              return (
                <li
                  key={spec.key}
                  className="flex flex-wrap items-center gap-3 border-b border-border/60 px-5 py-3 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground">{spec.label}</p>
                      {countsLoading ? (
                        <Badge variant="secondary" className="text-[10px]">…</Badge>
                      ) : (
                        <Badge variant="secondary" className="tabular-nums text-[10px]">
                          {count.toLocaleString()}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {spec.description}
                    </p>
                  </div>
                  {isEmpty ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Empty
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isBusy || countsLoading}
                      onClick={() => setStage1({ kind: "clear-table", spec })}
                      className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                    >
                      {isBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Clear
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Nuclear: clear everything */}
      <Card className="border-destructive/40 bg-destructive/[0.05]">
        <CardContent className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div className="flex max-w-md items-start gap-3">
            <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-bold text-destructive">
                Clear ALL transactional data
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Deletes tasks, concepts, samples, salvedge, notifications, files,
                comments, and all logs. Resets the task-code counter. Preserves
                user accounts, profiles, clients, designer codes, and lookup data.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busyTable === "__all__" || countsLoading}
            onClick={() => setStage1({ kind: "clear-all" })}
            className="gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10"
          >
            {busyTable === "__all__" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Clear all data
          </Button>
        </CardContent>
      </Card>

      {/* Stage 1 — ConfirmDialog */}
      {stage1Dialog && (
        <ConfirmDialog
          open={!!stage1}
          title={stage1Dialog.title}
          description={stage1Dialog.description}
          variant={stage1Dialog.variant}
          confirmLabel={stage1Dialog.confirmLabel}
          onConfirm={stage1Dialog.onConfirm}
          onCancel={() => setStage1(null)}
        />
      )}

      {/* Stage 2 — type DELETE to confirm */}
      <Dialog
        open={!!stage2}
        onOpenChange={(o) => {
          if (!o) {
            setStage2(null);
            setVerifyInput("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {stage2Title}
            </DialogTitle>
            <DialogDescription>
              Type{" "}
              <span className="font-mono font-bold text-foreground">DELETE</span>{" "}
              below to permanently execute this action. There is no undo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="delete-confirm" className="text-xs text-muted-foreground">
              Confirmation
            </Label>
            <Input
              id="delete-confirm"
              value={verifyInput}
              onChange={(e) => setVerifyInput(e.target.value)}
              placeholder="DELETE"
              autoFocus
              className="font-mono"
              onKeyDown={(e) => {
                if (e.key === "Enter" && verifyOk) void onStage2Confirm();
                if (e.key === "Escape") {
                  setStage2(null);
                  setVerifyInput("");
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setStage2(null);
                setVerifyInput("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              disabled={!verifyOk}
              onClick={() => void onStage2Confirm()}
              className={cn(
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                !verifyOk && "opacity-50"
              )}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Force typecheck on the keys union — surfaces typos in CLEAR_ALL_ORDER.
const _typeCheck: TableKey[] = CLEAR_ALL_ORDER as TableKey[];
void _typeCheck;
