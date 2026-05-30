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
  Palette,
  ClipboardList,
  Package,
  Layers,
  Bell,
  ArrowDownToLine,
  ExternalLink,
} from "lucide-react";
import {
  isToday,
  isYesterday,
  isThisWeek,
  formatDistanceToNow,
} from "date-fns";
import { useNotifications } from "@/hooks/useNotifications";
import { useProfiles } from "@/hooks/useProfiles";
import {
  Button,
  Badge,
  EmptyState,
  SkeletonText,
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Notification, NotificationType } from "@/types/database";

// ============================================================================
// Constants
// ============================================================================

const TYPE_CONFIG: Record<
  NotificationType,
  { label: string; borderClass: string; bgClass: string; textClass: string }
> = {
  info: { label: "Info", borderClass: "border-l-primary", bgClass: "bg-primary/5", textClass: "text-primary" },
  warning: { label: "Warning", borderClass: "border-l-warning", bgClass: "bg-warning/5", textClass: "text-warning" },
  urgent: { label: "Urgent", borderClass: "border-l-destructive", bgClass: "bg-destructive/5", textClass: "text-destructive" },
  success: { label: "Success", borderClass: "border-l-success", bgClass: "bg-success/5", textClass: "text-success" },
};

function getCategoryIcon(title: string) {
  const t = title.toLowerCase();
  if (t.includes("concept")) return Palette;
  if (t.includes("task") || t.includes("brief") || t.includes("claim")) return ClipboardList;
  if (t.includes("sample") || t.includes("sampling")) return Package;
  if (t.includes("knitting") || t.includes("kitting")) return Layers;
  if (t.includes("pool") || t.includes("claim")) return ArrowDownToLine;
  return Bell;
}

function extractActorName(message: string): string | null {
  const patterns = [
    /^(\w[\w\s]+?)\s(?:submitted|approved|rejected|completed|claimed|paused|resumed|addressed|started|marked)/i,
    /^(\w[\w\s]+?)\s(?:re-submitted|put on hold)/i,
  ];
  for (const p of patterns) {
    const m = message.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

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
// Grouping — collapse identical notifications from same person within 1 hour
// ============================================================================

interface GroupedNotification {
  key: string;
  notifications: Notification[];
  title: string;
  message: string;
  type: NotificationType;
  link: string | null;
  is_read: boolean;
  created_at: string;
  count: number;
  actorName: string | null;
}

function groupNotifications(items: Notification[]): GroupedNotification[] {
  const groups: GroupedNotification[] = [];
  const seen = new Map<string, number>();

  for (const n of items) {
    const actor = extractActorName(n.message);
    const groupKey = `${n.title}|${actor || ""}|${n.type}`;
    const existingIdx = seen.get(groupKey);

    if (existingIdx !== undefined) {
      const existing = groups[existingIdx];
      const timeDiff = new Date(existing.created_at).getTime() - new Date(n.created_at).getTime();
      if (timeDiff < 3600000) {
        existing.notifications.push(n);
        existing.count++;
        existing.is_read = existing.is_read && n.is_read;
        continue;
      }
    }

    seen.set(groupKey, groups.length);
    groups.push({
      key: n.id,
      notifications: [n],
      title: n.title,
      message: n.message,
      type: n.type,
      link: n.link,
      is_read: n.is_read,
      created_at: n.created_at,
      count: 1,
      actorName: actor,
    });
  }

  return groups;
}

// ============================================================================
// Date grouping
// ============================================================================

interface DateGroup {
  label: string;
  items: GroupedNotification[];
}

function groupByDate(items: GroupedNotification[]): DateGroup[] {
  const groups: Record<string, GroupedNotification[]> = {};
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
  const { profiles } = useProfiles();

  const profileMap = useMemo(() => {
    const m = new Map<string, { full_name: string; avatar_url: string | null }>();
    for (const p of profiles ?? []) {
      m.set(p.full_name, { full_name: p.full_name, avatar_url: p.avatar_url });
    }
    return m;
  }, [profiles]);

  const [tab, setTab] = useState<FilterTab>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    if (tab === "all") return notifications;
    if (tab === "unread") return notifications.filter((n) => !n.is_read);
    return notifications.filter((n) => n.type === tab);
  }, [notifications, tab]);

  const grouped = useMemo(() => groupNotifications(filtered), [filtered]);
  const visible = grouped.slice(0, visibleCount);
  const hasMore = visibleCount < grouped.length;
  const dateGroups = useMemo(() => groupByDate(visible), [visible]);

  const tabCounts: Record<FilterTab, number> = useMemo(() => {
    const c: Record<FilterTab, number> = { all: notifications.length, unread: unreadCount, info: 0, warning: 0, urgent: 0, success: 0 };
    for (const n of notifications) c[n.type]++;
    return c;
  }, [notifications, unreadCount]);

  function handleClick(g: GroupedNotification) {
    for (const n of g.notifications) {
      if (!n.is_read) void markAsRead(n.id);
    }
    if (g.link) navigate(g.link);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
          {FILTER_TABS.map((t) => {
            const active = tab === t.id;
            const count = tabCounts[t.id];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTab(t.id); setVisibleCount(PAGE_SIZE); }}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {t.label}
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] tabular-nums", active ? "bg-white/20 text-white" : "bg-secondary text-muted-foreground")}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => void markAllAsRead()} disabled={isPending("markAllAsRead")} className="gap-1.5">
              {isPending("markAllAsRead") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
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
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-10 w-10 text-success" />}
          title="All caught up!"
          description={tab === "all" ? "You have no notifications." : tab === "unread" ? "No unread notifications." : `No ${tab} notifications.`}
        />
      ) : (
        <div className="space-y-4">
          {dateGroups.map((group) => (
            <section key={group.label}>
              <h2 className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </h2>
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                {group.items.map((g, i) => (
                  <NotificationCard
                    key={g.key}
                    group={g}
                    profileMap={profileMap}
                    onClick={() => handleClick(g)}
                    isLast={i === group.items.length - 1}
                  />
                ))}
              </div>
            </section>
          ))}

          {hasMore && (
            <div className="text-center">
              <Button variant="outline" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                Load more ({grouped.length - visibleCount} remaining)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Notification Card — rich, grouped, with avatars and category icons
// ============================================================================

function NotificationCard({
  group: g,
  profileMap,
  onClick,
  isLast,
}: {
  group: GroupedNotification;
  profileMap: Map<string, { full_name: string; avatar_url: string | null }>;
  onClick: () => void;
  isLast: boolean;
}) {
  const config = TYPE_CONFIG[g.type];
  const CategoryIcon = getCategoryIcon(g.title);
  const actor = g.actorName ? profileMap.get(g.actorName) : null;
  const timeAgo = formatDistanceToNow(new Date(g.created_at), { addSuffix: true });
  const isHighPriority = g.type === "urgent" || g.type === "warning";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full gap-3 border-l-[3px] text-left transition-colors hover:bg-secondary/40",
        config.borderClass,
        !g.is_read && config.bgClass,
        !isLast && "border-b border-border/50",
        isHighPriority && !g.is_read ? "px-3 py-3" : "px-3 py-2"
      )}
    >
      {/* Avatar / Icon */}
      <div className="mt-0.5 shrink-0">
        {actor?.avatar_url ? (
          <Avatar className={cn(isHighPriority ? "h-8 w-8" : "h-6 w-6", "ring-1 ring-border")}>
            <AvatarImage src={actor.avatar_url} />
            <AvatarFallback className={cn(isHighPriority ? "text-[9px]" : "text-[8px]", config.textClass)}>{getInitials(actor.full_name)}</AvatarFallback>
          </Avatar>
        ) : g.actorName ? (
          <Avatar className={cn(isHighPriority ? "h-8 w-8" : "h-6 w-6", "ring-1 ring-border")}>
            <AvatarFallback className={cn(isHighPriority ? "text-[9px]" : "text-[8px]", config.bgClass, config.textClass)}>
              {getInitials(g.actorName)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className={cn("flex items-center justify-center rounded-full", isHighPriority ? "h-8 w-8" : "h-6 w-6", config.bgClass)}>
            <CategoryIcon className={cn(isHighPriority ? "h-4 w-4" : "h-3 w-3", config.textClass)} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn(
            "min-w-0 flex-1 truncate",
            isHighPriority ? "text-sm" : "text-xs",
            g.is_read ? "text-muted-foreground" : "font-semibold text-foreground"
          )}>
            {g.title}
            {g.count > 1 && (
              <span className={cn("ml-1.5 rounded px-1 py-0.5 text-[9px] font-semibold tabular-nums", config.bgClass, config.textClass)}>
                ×{g.count}
              </span>
            )}
          </p>
          <span className={cn("shrink-0 text-[9px] tabular-nums", g.is_read ? "text-muted-foreground/40" : "text-muted-foreground")}>
            {timeAgo}
          </span>
          {!g.is_read && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", g.type === "urgent" ? "bg-destructive animate-pulse" : g.type === "warning" ? "bg-warning" : "bg-primary")} />}
          {g.link && (
            <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[9px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
              View
            </span>
          )}
        </div>
        {(isHighPriority || !g.is_read) && (
          <p className={cn("mt-0.5 truncate", isHighPriority ? "text-xs text-muted-foreground" : "text-[11px] text-muted-foreground/70")}>
            {g.count > 1 ? `${g.actorName || "Someone"} — ${g.count} times` : g.message}
          </p>
        )}
      </div>
    </button>
  );
}
