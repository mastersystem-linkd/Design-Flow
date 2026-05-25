import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Archive,
  Calendar,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  Badge,
  SkeletonText,
  EmptyState,
} from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { kittingDetailPath } from "@/lib/routes";
import { formatDate, cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { priorityFromEnum } from "@/lib/kitting";
import { CompletedKittingPanel } from "@/components/tasks/CompletedKittingPanel";

// ============================================================================
// KittingQueueView — tabbed kitting list (Queue / Completed)
// ============================================================================
//
// Queue tab: reads from the `deo_kitting_queue` view (0023). Cards with
// thumbnails for the DEO to pick up.
//
// Completed tab: delegates to the shared `CompletedKittingPanel` so this
// page and the All Tasks → Full Kitting sub-folder render the exact same
// wide table + CSV export.
// ============================================================================

interface QueueRow {
  id: string;
  task_id: string | null;
  image_url: string | null;
  party_name: string | null;
  priority:
    | "very_urgent"
    | "2_days"
    | "3_days"
    | "4_days"
    | "5_days"
    | null;
  data_entry_status: "pending_deo" | "in_progress";
  form_date: string | null;
  created_at: string;
  task_code: string | null;
  concept: string | null;
  client_party_name: string | null;
}

type Tab = "queue" | "completed";

const STATUS_PILL: Record<QueueRow["data_entry_status"], string> = {
  pending_deo: "bg-warning/10 text-warning border-warning/30",
  in_progress: "bg-primary/10 text-primary border-primary/30",
};

const STATUS_LABEL: Record<QueueRow["data_entry_status"], string> = {
  pending_deo: "Pending",
  in_progress: "In progress",
};

const PRIORITY_PILL: Record<
  NonNullable<QueueRow["priority"]>,
  string
> = {
  very_urgent: "bg-destructive/10 text-destructive border-destructive/30",
  "2_days": "bg-warning/10 text-warning border-warning/30",
  "3_days": "bg-warning/10 text-warning border-warning/30",
  "4_days": "bg-primary/10 text-primary border-primary/30",
  "5_days": "bg-success/10 text-success border-success/30",
};

export default function KittingQueueView() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("queue");

  // Queue state — only the in-flight stuff. Completed is owned by the
  // CompletedKittingPanel child and reported back via its onCountChange.
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  async function loadQueue() {
    setRefreshing(true);
    const { data, error: err } = await supabase
      .from("deo_kitting_queue")
      .select("*")
      .order("created_at", { ascending: true });
    setRefreshing(false);
    if (err) {
      setQueueError(err.message);
      return;
    }
    setQueueError(null);
    setRows((data ?? []) as unknown as QueueRow[]);
  }

  // Cheap count-only query for the Completed tab badge. Runs on mount so
  // the badge reads the real number even before the user opens the tab;
  // CompletedKittingPanel's onCountChange refreshes it after that.
  async function loadCompletedCount() {
    const { count } = await supabase
      .from("full_kitting_details")
      .select("id", { count: "exact", head: true })
      .eq("data_entry_status", "completed");
    setCompletedCount(count ?? 0);
  }

  useEffect(() => {
    if (tab === "queue") void loadQueue();
  }, [tab]);

  // Run the count fetch once on mount so the Completed badge is accurate
  // from the first paint, not after the user clicks into the tab.
  useEffect(() => {
    void loadCompletedCount();
  }, []);

  const pendingCount = useMemo(
    () => rows?.filter((r) => r.data_entry_status === "pending_deo").length ?? 0,
    [rows]
  );
  const inProgressCount = useMemo(
    () => rows?.filter((r) => r.data_entry_status === "in_progress").length ?? 0,
    [rows]
  );
  const queueCount = pendingCount + inProgressCount;

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Knitting
            </h1>
            <p className="text-xs text-muted-foreground">
              {profile?.role === "deo"
                ? "Your knitting workspace"
                : "Knitting queue + archive"}
            </p>
          </div>
        </div>
        {tab === "queue" && (
          <button
            type="button"
            onClick={() => void loadQueue()}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </button>
        )}
      </div>

      {/* ── Tab strip ── */}
      <div className="flex items-center gap-1 border-b border-border">
        <TabButton
          active={tab === "queue"}
          onClick={() => setTab("queue")}
          icon={<ClipboardList className="h-3.5 w-3.5" />}
          label="Queue"
          count={queueCount}
          tone="primary"
        />
        <TabButton
          active={tab === "completed"}
          onClick={() => setTab("completed")}
          icon={<Archive className="h-3.5 w-3.5" />}
          label="Completed"
          count={completedCount}
          tone="success"
        />
      </div>

      {/* ── Tab body ── */}
      {tab === "queue" ? (
        <QueueTab
          rows={rows}
          error={queueError}
          onReload={() => void loadQueue()}
          onOpen={(id) => navigate(kittingDetailPath(id))}
          pendingCount={pendingCount}
          inProgressCount={inProgressCount}
        />
      ) : (
        // Shared component — same wide table + CSV export as the
        // /dashboard?tab=kitting sub-folder. onCountChange feeds the
        // tab badge count up here.
        <CompletedKittingPanel onCountChange={setCompletedCount} />
      )}
    </div>
  );
}

// ============================================================================
// Tab button
// ============================================================================

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  tone: "primary" | "success";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 py-0 text-[10px] font-semibold tabular-nums",
          active
            ? tone === "primary"
              ? "bg-primary text-white"
              : "bg-success text-white"
            : "bg-secondary text-muted-foreground"
        )}
      >
        {count}
      </span>
      {active && (
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-0 -bottom-px h-[2px]",
            tone === "primary" ? "bg-primary" : "bg-success"
          )}
        />
      )}
    </button>
  );
}

// ============================================================================
// QueueTab — structured list/table of pending + in_progress knitting tasks
// ============================================================================
//
// Replaces the previous card grid. Includes a date-range filter on the
// record's created_at so coordinators can narrow the queue to "today",
// "this week", etc. All cells left-aligned, sticky right "Open" column for
// quick access at any horizontal scroll position.
// ============================================================================

function QueueTab({
  rows,
  error,
  onReload,
  onOpen,
  pendingCount,
  inProgressCount,
}: {
  rows: QueueRow[] | null;
  error: string | null;
  onReload: () => void;
  onOpen: (recordId: string) => void;
  pendingCount: number;
  inProgressCount: number;
}) {
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (!fromDate && !toDate) return rows;
    return rows.filter((r) => {
      const ts = new Date(r.created_at).getTime();
      if (fromDate && ts < new Date(`${fromDate}T00:00:00`).getTime()) return false;
      if (toDate && ts > new Date(`${toDate}T23:59:59`).getTime()) return false;
      return true;
    });
  }, [rows, fromDate, toDate]);

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" onClick={onReload}>Retry</Button>
        </CardContent>
      </Card>
    );
  }
  if (rows === null) {
    return (
      <Card>
        <CardContent className="py-6">
          <SkeletonText lines={6} />
        </CardContent>
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10">
          <EmptyState
            icon={<CheckCircle2 className="h-10 w-10 text-success" />}
            title="Nothing pending"
            description="No knitting forms are waiting on data entry right now."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {/* Toolbar: date-range filter + summary */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <span className="text-[11px] font-medium text-muted-foreground">From</span>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 w-[150px] text-sm"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">To</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 w-[150px] text-sm"
            />
          </div>
          {(fromDate || toDate) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setFromDate("");
                setToDate("");
              }}
              className="gap-1 text-muted-foreground"
            >
              <X className="h-3 w-3" />
              Clear
            </Button>
          )}
          <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
            {filtered.length} of {rows.length} · {pendingCount} pending · {inProgressCount} in progress
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] text-sm">
            <thead className="border-y border-border bg-secondary/60 text-left text-[11px] font-bold uppercase tracking-wider text-foreground whitespace-nowrap">
              <tr>
                <th className="px-3 py-2 text-left font-bold">Status</th>
                <th className="px-3 py-2 text-left font-bold">UID</th>
                <th className="px-3 py-2 text-left font-bold">Party Name</th>
                <th className="px-3 py-2 text-left font-bold">Concept</th>
                <th className="px-3 py-2 text-left font-bold">Priority</th>
                <th className="px-3 py-2 text-left font-bold">Uploaded At</th>
                <th className="sticky right-0 z-10 bg-secondary/80 px-3 py-2 text-right font-bold shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                  Open
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-xs italic text-muted-foreground"
                  >
                    No knitting forms match the selected date range.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-b border-border/40 transition-colors hover:bg-secondary/30"
                    onClick={() => onOpen(r.id)}
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-left align-middle">
                      <Badge
                        variant="outline"
                        className={cn(
                          "border text-[10px]",
                          STATUS_PILL[r.data_entry_status]
                        )}
                      >
                        {STATUS_LABEL[r.data_entry_status]}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-left align-middle font-mono text-[11px] text-primary">
                      {r.task_code ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-left align-middle font-medium text-foreground">
                      {r.client_party_name ?? r.party_name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-left align-middle text-foreground">
                      <span className="block max-w-[260px] truncate" title={r.concept ?? ""}>
                        {r.concept ?? "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-left align-middle">
                      {r.priority ? (
                        <Badge
                          variant="outline"
                          className={cn("border text-[10px]", PRIORITY_PILL[r.priority])}
                        >
                          {priorityFromEnum(r.priority)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-left align-middle text-[11px] text-muted-foreground">
                      {formatDate(r.created_at)}
                    </td>
                    <td className="sticky right-0 z-10 bg-card px-3 py-2 text-right align-middle shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(r.id);
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary transition-colors hover:bg-primary/20"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
