import { useState } from "react";
import {
  Copy,
  Check,
  RefreshCw,
  Loader2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Send,
  Eye,
  EyeOff,
  Plus,
  Power,
  Key,
  Webhook,
  Globe,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import {
  Card,
  CardContent,
  Badge,
  Button,
  ConfirmDialog,
  toast,
  SkeletonCard,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui";
import {
  TABLE_HEAD,
  TABLE_TH,
  TABLE_ROW,
  TABLE_TD,
} from "@/lib/tableStyles";
import { cn, formatDate } from "@/lib/utils";
import { useIntegration } from "@/hooks/useIntegration";
import { formatDistanceToNow } from "date-fns";

// ============================================================================
// Integrations Tab — admin-only Sales ERP integration management
// ============================================================================

const SUPABASE_FN_BASE = (() => {
  const url = import.meta.env.VITE_SUPABASE_URL ?? "";
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!match) return url.replace(/\/$/, "") + "/functions/v1";
  return `https://${match[1]}.functions.supabase.co`;
})();

const ENDPOINTS = [
  { method: "POST", path: "/ext-create-task", desc: "Push design task into pool (with optional FK)" },
  { method: "PUT", path: "/ext-update-task", desc: "Update task — add FK details, change priority" },
  { method: "POST", path: "/ext-create-sample", desc: "Push sample request (with optional development details)" },
  { method: "PUT", path: "/ext-update-sample", desc: "Update sample — add development details, change fabric" },
  { method: "GET", path: "/ext-status", desc: "Poll task/sample status" },
];

function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
      title="Copy"
    >
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

// ── Secret reveal dialog ──

function RevealSecretDialog({
  open,
  onOpenChange,
  label,
  value,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Copy this now — you won't see it again.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 p-3">
            <code className="flex-1 break-all text-xs font-medium text-foreground">
              {value}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(value);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="shrink-0 rounded-md border border-border bg-card p-1.5 hover:bg-secondary"
            >
              {copied ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function IntegrationsTab() {
  const {
    config,
    configLoading,
    events,
    eventsLoading,
    queueStats,
    queueLoading,
    refetchEvents,
    refetchQueue,
    createIntegration,
    toggleActive,
    updateWebhookUrl,
    regenerateApiKey,
    regenerateWebhookSecret,
    sendTestPing,
    retryFailed,
  } = useIntegration();

  // Local state
  const [busy, setBusy] = useState<string | null>(null);
  const [webhookDraft, setWebhookDraft] = useState<string | null>(null);
  const [revealSecret, setRevealSecret] = useState<{ label: string; value: string } | null>(null);
  const [confirmRegenKey, setConfirmRegenKey] = useState(false);
  const [confirmRegenSecret, setConfirmRegenSecret] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  if (configLoading) return <SkeletonCard />;

  // ── No integration yet — create button ──
  if (!config) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Integrations</h2>
          <p className="text-sm text-muted-foreground">
            Connect external systems to push tasks and samples into Design Flow.
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 px-4 py-12 text-center">
            <Globe className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-medium text-foreground">No integration configured</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Set up the Sales ERP integration to receive tasks and samples from
                your ERP system.
              </p>
            </div>
            <Button
              disabled={busy === "create"}
              onClick={async () => {
                setBusy("create");
                const res = await createIntegration();
                setBusy(null);
                if (res.error) {
                  toast.error(res.error);
                  return;
                }
                if (res.key) {
                  setRevealSecret({ label: "Your API Key", value: res.key });
                }
                toast.success("Integration created");
              }}
            >
              {busy === "create" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              <span className="hidden sm:inline">Create Sales ERP Integration</span>
              <span className="sm:hidden">Create Integration</span>
            </Button>
          </CardContent>
        </Card>
        <EndpointReference />
      </div>
    );
  }

  // ── Integration exists ──
  const webhookUrl = webhookDraft ?? config.webhook_url ?? "";
  const webhookDirty = webhookDraft !== null && webhookDraft !== (config.webhook_url ?? "");

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Integrations</h2>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Manage the Sales ERP connection, API credentials, and webhook delivery.
        </p>
      </div>

      {/* ── Section 1: Connection ── */}
      <Card>
        <CardContent className="space-y-4 sm:space-y-5 p-4 sm:pt-6">
          {/* Header row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Globe className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground">Sales ERP</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                  Last used {ago(config.last_used_at)}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={busy === "toggle"}
              onClick={async () => {
                setBusy("toggle");
                const res = await toggleActive(config.id, !config.is_active);
                setBusy(null);
                if (res.error) toast.error(res.error);
                else toast.success(config.is_active ? "Deactivated" : "Activated");
              }}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
                config.is_active ? "bg-success" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                  config.is_active ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Key className="mr-1 inline h-3 w-3" />
              API Key
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 min-w-0 rounded-lg border border-border bg-secondary/40 px-3 py-2">
                <code className="text-xs text-foreground break-all">
                  {config.api_key_prefix ?? "sk_live_"}••••••••••••
                </code>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 self-start"
                disabled={busy === "regenKey"}
                onClick={() => setConfirmRegenKey(true)}
              >
                {busy === "regenKey" ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3 w-3" />
                )}
                Regenerate
              </Button>
            </div>
          </div>

          {/* Webhook URL */}
          <div className="space-y-1.5">
            <label className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Webhook className="mr-1 inline h-3 w-3" />
              Webhook URL
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={webhookUrl}
                onChange={(e) => setWebhookDraft(e.target.value)}
                placeholder="https://your-erp.example.com/webhook"
                className="flex-1 font-mono text-xs"
              />
              {webhookDirty && (
                <Button
                  size="sm"
                  className="shrink-0 self-start"
                  disabled={busy === "saveUrl"}
                  onClick={async () => {
                    setBusy("saveUrl");
                    const res = await updateWebhookUrl(config.id, webhookDraft!);
                    setBusy(null);
                    if (res.error) toast.error(res.error);
                    else {
                      toast.success("Webhook URL saved");
                      setWebhookDraft(null);
                    }
                  }}
                >
                  {busy === "saveUrl" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  Save
                </Button>
              )}
            </div>
          </div>

          {/* Webhook Secret */}
          <div className="space-y-1.5">
            <label className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Key className="mr-1 inline h-3 w-3" />
              Webhook Secret (HMAC)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex flex-1 min-w-0 items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2">
                <code className="flex-1 text-xs text-foreground break-all">
                  {showSecret && config.webhook_secret
                    ? config.webhook_secret
                    : config.webhook_secret
                      ? "whsec_••••••••••••••••"
                      : "Not set"}
                </code>
                {config.webhook_secret && (
                  <button
                    type="button"
                    onClick={() => setShowSecret((p) => !p)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 self-start"
                disabled={busy === "regenSecret"}
                onClick={() => setConfirmRegenSecret(true)}
              >
                {busy === "regenSecret" ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3 w-3" />
                )}
                Regenerate
              </Button>
            </div>
          </div>

          {/* Test ping */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 border-t border-border pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={busy === "ping" || !config.webhook_url}
              onClick={async () => {
                setBusy("ping");
                const res = await sendTestPing(config.id);
                setBusy(null);
                if (res.error) toast.error(res.error);
                else toast.success("Test ping enqueued — check the sync log");
              }}
            >
              {busy === "ping" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-3.5 w-3.5" />
              )}
              Test Webhook
            </Button>
            {!config.webhook_url && (
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Set a webhook URL first
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Sync Log ── */}
      <SyncLog
        events={events}
        isLoading={eventsLoading}
        onRefresh={() => void refetchEvents()}
      />

      {/* ── Section 3: Queue Health ── */}
      <QueueHealth
        stats={queueStats}
        isLoading={queueLoading}
        onRefresh={() => void refetchQueue()}
        onRetry={async () => {
          setBusy("retry");
          const res = await retryFailed();
          setBusy(null);
          if (res.error) toast.error(res.error);
          else toast.success("Failed webhooks reset to pending");
        }}
        retrying={busy === "retry"}
      />

      {/* ── Section 4: Endpoint Reference ── */}
      <EndpointReference />

      {/* ── Dialogs ── */}
      <ConfirmDialog
        open={confirmRegenKey}
        title="Regenerate API Key?"
        description="The current key will stop working immediately. Any system using it will need the new key."
        confirmLabel="Regenerate"
        variant="danger"
        onCancel={() => setConfirmRegenKey(false)}
        onConfirm={async () => {
          setConfirmRegenKey(false);
          setBusy("regenKey");
          const res = await regenerateApiKey(config.id);
          setBusy(null);
          if (res.error) {
            toast.error(res.error);
            return;
          }
          if (res.key) {
            setRevealSecret({ label: "New API Key", value: res.key });
          }
          toast.success("API key regenerated");
        }}
      />
      <ConfirmDialog
        open={confirmRegenSecret}
        title="Regenerate Webhook Secret?"
        description="The current secret will be replaced. Webhook signature verification on the receiving end will break until updated."
        confirmLabel="Regenerate"
        variant="danger"
        onCancel={() => setConfirmRegenSecret(false)}
        onConfirm={async () => {
          setConfirmRegenSecret(false);
          setBusy("regenSecret");
          const res = await regenerateWebhookSecret(config.id);
          setBusy(null);
          if (res.error) {
            toast.error(res.error);
            return;
          }
          if (res.secret) {
            setRevealSecret({ label: "New Webhook Secret", value: res.secret });
          }
          toast.success("Webhook secret regenerated");
        }}
      />
      {revealSecret && (
        <RevealSecretDialog
          open
          onOpenChange={() => setRevealSecret(null)}
          label={revealSecret.label}
          value={revealSecret.value}
        />
      )}
    </div>
  );
}

// ============================================================================
// Section 2 — Sync Log (mobile card + desktop table)
// ============================================================================

function SyncLog({
  events,
  isLoading,
  onRefresh,
}: {
  events: ReturnType<typeof useIntegration>["events"];
  isLoading: boolean;
  onRefresh: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:pt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Sync Log</h3>
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            <RefreshCw className="mr-1 h-3 w-3" /> <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>

        {isLoading ? (
          <SkeletonCard />
        ) : events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No integration events yet.
          </p>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="space-y-2 sm:hidden">
              {events.map((e) => (
                <div key={e.id} className="rounded-lg border border-border bg-secondary/20 p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {e.direction === "inbound" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                          <ArrowDownToLine className="h-3 w-3" /> IN
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-600 dark:text-purple-400">
                          <ArrowUpFromLine className="h-3 w-3" /> OUT
                        </span>
                      )}
                      {e.status === "success" ? (
                        <Badge className="bg-success/10 text-success text-[10px]">
                          <Check className="mr-0.5 h-2.5 w-2.5" /> success
                        </Badge>
                      ) : (
                        <Badge className="bg-destructive/10 text-destructive text-[10px]">
                          <AlertTriangle className="mr-0.5 h-2.5 w-2.5" /> {e.status || "error"}
                        </Badge>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {ago(e.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-medium text-foreground">{e.event}</code>
                    {e.ref_id && (
                      <span className="font-mono text-[10px] text-muted-foreground">{e.ref_id}</span>
                    )}
                  </div>
                  {e.detail && (
                    <p className="text-[10px] text-muted-foreground line-clamp-2 break-words">
                      {typeof e.detail === "object"
                        ? Object.entries(e.detail)
                            .filter(([, v]) => v != null && v !== "")
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ") || "—"
                        : String(e.detail)}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead className={TABLE_HEAD}>
                  <tr>
                    <th className={TABLE_TH}>Time</th>
                    <th className={TABLE_TH}>Direction</th>
                    <th className={TABLE_TH}>Event</th>
                    <th className={TABLE_TH}>Ref ID</th>
                    <th className={TABLE_TH}>Status</th>
                    <th className={TABLE_TH}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className={TABLE_ROW}>
                      <td className={cn(TABLE_TD, "whitespace-nowrap text-xs text-muted-foreground")}>
                        {ago(e.created_at)}
                      </td>
                      <td className={TABLE_TD}>
                        {e.direction === "inbound" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                            <ArrowDownToLine className="h-3 w-3" /> In
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 dark:text-purple-400">
                            <ArrowUpFromLine className="h-3 w-3" /> Out
                          </span>
                        )}
                      </td>
                      <td className={cn(TABLE_TD, "font-mono text-xs")}>{e.event}</td>
                      <td className={cn(TABLE_TD, "font-mono text-xs text-muted-foreground")}>
                        {e.ref_id || "—"}
                      </td>
                      <td className={TABLE_TD}>
                        {e.status === "success" ? (
                          <Badge className="bg-success/10 text-success">
                            <Check className="mr-0.5 h-2.5 w-2.5" /> success
                          </Badge>
                        ) : (
                          <Badge className="bg-destructive/10 text-destructive">
                            <AlertTriangle className="mr-0.5 h-2.5 w-2.5" /> {e.status || "error"}
                          </Badge>
                        )}
                      </td>
                      <td className={cn(TABLE_TD, "max-w-[250px] truncate text-xs text-muted-foreground")}
                        title={e.detail ? JSON.stringify(e.detail) : undefined}
                      >
                        {e.detail
                          ? typeof e.detail === "object"
                            ? Object.entries(e.detail)
                                .filter(([, v]) => v != null && v !== "")
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(" · ") || "—"
                            : String(e.detail)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Section 3 — Queue Health
// ============================================================================

function QueueHealth({
  stats,
  isLoading,
  onRefresh,
  onRetry,
  retrying,
}: {
  stats: { pending: number; failed: number; sent: number };
  isLoading: boolean;
  onRefresh: () => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:pt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Webhook Queue</h3>
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            <RefreshCw className="mr-1 h-3 w-3" /> <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>

        {isLoading ? (
          <SkeletonCard />
        ) : (
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <StatChip label="Pending" value={stats.pending} color="text-warning" />
            <StatChip label="Failed" value={stats.failed} color="text-destructive" />
            <StatChip label="Sent" value={stats.sent} color="text-success" />
            {stats.failed > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={retrying}
                onClick={onRetry}
              >
                {retrying ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <RotateCcw className="mr-1 h-3 w-3" />
                )}
                Retry Failed
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-2.5 py-1.5 sm:px-3 sm:py-2">
      <span className="text-[10px] sm:text-xs font-medium text-muted-foreground">{label}</span>
      <span className={cn("text-xs sm:text-sm font-bold tabular-nums", color)}>{value}</span>
    </div>
  );
}

// ============================================================================
// Section 4 — Endpoint Reference
// ============================================================================

function EndpointReference() {
  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:pt-6">
        <h3 className="text-sm font-semibold text-foreground">
          Endpoint Reference
        </h3>
        <p className="text-[10px] sm:text-xs text-muted-foreground">
          Share these with the Sales ERP team. All endpoints require{" "}
          <code className="rounded bg-secondary px-1 py-0.5 text-[10px]">
            Authorization: Bearer &lt;API key&gt;
          </code>
        </p>
        <div className="space-y-2">
          {ENDPOINTS.map((ep) => (
            <div
              key={ep.path}
              className="rounded-lg border border-border bg-secondary/30 px-3 py-2"
            >
              <div className="flex items-start gap-2">
                <Badge
                  className={cn(
                    "shrink-0 mt-0.5 text-[10px]",
                    ep.method === "GET"
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : ep.method === "PUT"
                        ? "bg-warning/10 text-warning"
                        : "bg-success/10 text-success"
                  )}
                >
                  {ep.method}
                </Badge>
                <code className="flex-1 min-w-0 break-all text-[10px] sm:text-xs text-foreground">
                  {SUPABASE_FN_BASE}{ep.path}
                </code>
                <CopyButton text={`${SUPABASE_FN_BASE}${ep.path}`} />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground sm:hidden">
                {ep.desc}
              </p>
              <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block sm:pl-[52px]">
                {ep.desc}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
