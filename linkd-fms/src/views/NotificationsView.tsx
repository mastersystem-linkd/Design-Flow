import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Info,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  CheckCheck,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  isToday,
  isYesterday,
  isThisWeek,
  formatDistanceToNow,
} from "date-fns";
import { useNotifications } from "@/hooks/useNotifications";
import {
  Button,
  Badge,
  EmptyState,
  SkeletonText,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Notification, NotificationType } from "@/types/database";

// ============================================================================
// Constants
// ============================================================================

const TYPE_CONFIG: Record<
  NotificationType,
  { icon: typeof Info; dotClass: string; label: string }
> = {
  info: { icon: Info, dotClass: "text-primary", label: "Info" },
  warning: { icon: AlertTriangle, dotClass: "text-warning", label: "Warning" },
  urgent: { icon: AlertOctagon, dotClass: "text-destructive", label: "Urgent" },
  success: { icon: CheckCircle2, dotClass: "text-success", label: "Success" },
};

type FilterTab = "all" | "unread" | NotificationType;

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "info", label: "Info" },
  { id: "warning", label: "Warning" },
  { id: "urgent", label: "Urgent" },
  { id: "success", label: "Success" },
];

const PAGE_SIZE = 20;

// ============================================================================
// Date grouping
// ============================================================================

interface DateGroup {
  label: string;
  items: Notification[];
}

function groupByDate(items: Notification[]): DateGroup[] {
  const groups: Record<string, Notification[]> = {};
  const order: string[] = [];

  for (const n of items) {
    const d = new Date(n.created_at);
    let label: string;
    if (isToday(d)) label = "Today";
    else if (isYesterday(d)) label = "Yesterday";
    else if (isThisWeek(d)) label = "This Week";
    else label = "Older";

    if (!groups[label]) {
      groups[label] = [];
      order.push(label);
    }
    groups[label].push(n);
  }

  return order.map((label) => ({ label, items: groups[label] }));
}

// ============================================================================
// View
// ============================================================================

export function NotificationsView() {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    isLoading,
    refetch,
    markAsRead,
    markAllAsRead,
    isPending,
  } = useNotifications();

  const [tab, setTab] = useState<FilterTab>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // ── Filter ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (tab === "all") return notifications;
    if (tab === "unread") return notifications.filter((n) => !n.is_read);
    return notifications.filter((n) => n.type === tab);
  }, [notifications, tab]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  const dateGroups = useMemo(() => groupByDate(visible), [visible]);

  // ── Tab counts ──────────────────────────────────────────────────────

  const tabCounts: Record<FilterTab, number> = useMemo(() => {
    const c: Record<FilterTab, number> = {
      all: notifications.length,
      unread: unreadCount,
      info: 0,
      warning: 0,
      urgent: 0,
      success: 0,
    };
    for (const n of notifications) c[n.type]++;
    return c;
  }, [notifications, unreadCount]);

  // ── Handlers ────────────────────────────────────────────────────────

  async function handleClick(n: Notification) {
    if (!n.is_read) void markAsRead(n.id);
    if (n.link) navigate(n.link);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_TABS.map((t) => {
            const active = tab === t.id;
            const count = tabCounts[t.id];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  setVisibleCount(PAGE_SIZE);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                    active
                      ? "bg-white/20 text-white"
                      : "bg-secondary text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
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
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void markAllAsRead()}
              disabled={isPending("markAllAsRead")}
              className="gap-1.5"
            >
              {isPending("markAllAsRead") ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5" />
              )}
              Mark all as read
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <SkeletonText lines={8} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-10 w-10 text-success" />}
          title="All caught up!"
          description={
            tab === "all"
              ? "You have no notifications."
              : tab === "unread"
                ? "No unread notifications."
                : `No ${tab} notifications.`
          }
        />
      ) : (
        <div className="space-y-6">
          {dateGroups.map((group) => (
            <section key={group.label}>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </h2>
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                {group.items.map((n, i) => (
                  <NotificationRow
                    key={n.id}
                    notification={n}
                    onClick={() => handleClick(n)}
                    isLast={i === group.items.length - 1}
                  />
                ))}
              </div>
            </section>
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="text-center">
              <Button
                variant="outline"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              >
                Load more ({filtered.length - visibleCount} remaining)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Row
// ============================================================================

function NotificationRow({
  notification: n,
  onClick,
  isLast,
}: {
  notification: Notification;
  onClick: () => void;
  isLast: boolean;
}) {
  const config = TYPE_CONFIG[n.type];
  const Icon = config.icon;
  const timeAgo = formatDistanceToNow(new Date(n.created_at), {
    addSuffix: true,
  });

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full gap-4 px-4 py-3.5 text-left transition-colors hover:bg-secondary/50",
        !n.is_read && "bg-primary/5",
        !isLast && "border-b border-border"
      )}
    >
      {/* Icon */}
      <div className="mt-0.5 shrink-0">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            n.type === "info" && "bg-primary/10",
            n.type === "warning" && "bg-warning/10",
            n.type === "urgent" && "bg-destructive/10",
            n.type === "success" && "bg-success/10"
          )}
        >
          <Icon className={cn("h-4 w-4", config.dotClass)} />
        </div>
      </div>

      {/* Content — NOT truncated on full page */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p
            className={cn(
              "text-sm leading-snug",
              n.is_read
                ? "text-muted-foreground"
                : "font-semibold text-foreground"
            )}
          >
            {n.title}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              className={cn(
                "px-1.5 py-0 text-[9px]",
                n.type === "info" &&
                  "bg-primary/10 text-primary border border-primary/20",
                n.type === "warning" &&
                  "bg-warning/10 text-warning border border-warning/20",
                n.type === "urgent" &&
                  "bg-destructive/10 text-destructive border border-destructive/20",
                n.type === "success" &&
                  "bg-success/10 text-success border border-success/20"
              )}
            >
              {config.label}
            </Badge>
            {!n.is_read && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
            )}
          </div>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {n.message}
        </p>
        <p className="mt-1.5 text-[10px] tabular-nums text-muted-foreground/60">
          {timeAgo}
        </p>
      </div>
    </button>
  );
}
