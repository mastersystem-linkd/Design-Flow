import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  CheckCheck,
  Loader2,
  RefreshCw,
  Palette,
  ClipboardList,
  Package,
  Layers,
  Bell,
  BellRing,
  ArrowDownToLine,
  Pause,
  Send,
  RotateCcw,
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  Sparkles,
  Volume2,
  VolumeX,
  Monitor,
  Settings2,
} from "lucide-react";
import {
  isToday,
  isYesterday,
  isThisWeek,
  formatDistanceToNow,
} from "date-fns";
import { type DesktopPermission } from "@/hooks/useNotifications";
import { useNotificationsContext } from "@/hooks/NotificationsProvider";
import { useProfiles } from "@/hooks/useProfiles";
import {
  Button,
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
// Type config
// ============================================================================

const TYPE_CONFIG: Record<NotificationType, {
  label: string;
  border: string;
  bg: string;
  text: string;
  badgeBg: string;
  icon: typeof Bell;
}> = {
  warning: { label: "On Hold", border: "border-l-orange-500", bg: "bg-orange-500/8", text: "text-orange-400", badgeBg: "bg-orange-500/15 text-orange-400 ring-orange-500/25", icon: Pause },
  info: { label: "Info", border: "border-l-primary", bg: "bg-primary/5", text: "text-primary", badgeBg: "bg-primary/15 text-primary ring-primary/25", icon: Send },
  success: { label: "Completed", border: "border-l-emerald-500", bg: "bg-emerald-500/8", text: "text-emerald-400", badgeBg: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/25", icon: CheckCircle2 },
  urgent: { label: "Urgent", border: "border-l-red-500", bg: "bg-red-500/8", text: "text-red-400", badgeBg: "bg-red-500/15 text-red-400 ring-red-500/25", icon: AlertTriangle },
};

// ============================================================================
// Smart parsing
// ============================================================================

function getCategoryIcon(title: string) {
  const t = title.toLowerCase();
  if (t.includes("concept") && t.includes("re-submitted")) return RotateCcw;
  if (t.includes("concept")) return Palette;
  if (t.includes("task") || t.includes("brief")) return ClipboardList;
  if (t.includes("claim") || t.includes("pool")) return ArrowDownToLine;
  if (t.includes("sample") || t.includes("sampling")) return Package;
  if (t.includes("knitting") || t.includes("kitting")) return Layers;
  if (t.includes("approved") || t.includes("approval")) return Sparkles;
  return Bell;
}

const ACTOR_BLOCKLIST = new Set([
  "Your", "You", "You've", "You're",
  "Concept", "Task", "Sample", "Salvedge", "Design", "Designs",
  "Changes", "Revision", "New", "Reminder", "System",
  "DF", "C",
]);
function extractActorName(message: string): string | null {
  const m = message.match(/^([A-Z][\w'\-]*(?:\s+[A-Z][\w'\-]*){0,2})\s+[a-z]/);
  if (!m) return null;
  const name = m[1].trim();
  if (ACTOR_BLOCKLIST.has(name)) return null;
  const first = name.split(/\s+/, 1)[0];
  if (ACTOR_BLOCKLIST.has(first)) return null;
  return name;
}

function extractTaskId(message: string): string | null {
  const m = message.match(/((?:DF|C)-[\w-]+)/);
  return m ? m[1] : null;
}

function getBadgeLabel(title: string, type: NotificationType): string {
  const t = title.toLowerCase();
  if (t.includes("re-submitted")) return "Re-submitted";
  if (t.includes("hold") || t.includes("paused")) return "On Hold";
  if (t.includes("completed") || t.includes("done")) return "Completed";
  if (t.includes("claimed")) return "Claimed";
  if (t.includes("approved")) return "Approved";
  if (t.includes("rejected")) return "Rejected";
  if (t.includes("revision")) return "Revision";
  if (t.includes("submitted")) return "Submitted";
  if (t.includes("resumed")) return "Resumed";
  return TYPE_CONFIG[type].label;
}

// ============================================================================
// Grouping
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
  return items.map((n) => ({
    key: n.id,
    notifications: [n],
    title: n.title,
    message: n.message,
    type: n.type,
    link: n.link,
    is_read: n.is_read,
    created_at: n.created_at,
    count: 1,
    actorName: extractActorName(n.message),
  }));
}

// ============================================================================
// Date grouping
// ============================================================================

interface DateGroup { label: string; items: GroupedNotification[] }

function groupByDate(items: GroupedNotification[]): DateGroup[] {
  const groups: Record<string, GroupedNotification[]> = {};
  const order: string[] = [];
  for (const n of items) {
    const d = new Date(n.created_at);
    const label = isToday(d) ? "TODAY" : isYesterday(d) ? "YESTERDAY" : isThisWeek(d) ? "THIS WEEK" : "OLDER";
    if (!groups[label]) { groups[label] = []; order.push(label); }
    groups[label].push(n);
  }
  return order.map((label) => ({ label, items: groups[label] }));
}

// ============================================================================
// Filter tabs
// ============================================================================

type FilterTab = "all" | "unread" | "warning" | "info" | "success" | "urgent";
const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "warning", label: "On Hold" },
  { id: "info", label: "Submitted" },
  { id: "success", label: "Completed" },
  { id: "urgent", label: "Urgent" },
];

const PAGE_SIZE = 25;

// ============================================================================
// Main View
// ============================================================================

export function NotificationsView() {
  const navigate = useNavigate();
  const {
    notifications, unreadCount, isLoading, refetch, markAsRead,
    markAllAsRead, isPending, testNotificationSound,
    prefs, setSoundEnabled, setDesktopEnabled,
    desktopPermission, requestDesktopPermission,
  } = useNotificationsContext();
  const { profiles } = useProfiles();

  const profileMap = useMemo(() => {
    const m = new Map<string, { full_name: string; avatar_url: string | null }>();
    for (const p of profiles ?? []) m.set(p.full_name, { full_name: p.full_name, avatar_url: p.avatar_url });
    return m;
  }, [profiles]);

  const [tab, setTab] = useState<FilterTab>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

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
    if (expandedId === g.key) {
      setExpandedId(null);
    } else {
      setExpandedId(g.key);
      for (const n of g.notifications) {
        if (!n.is_read) void markAsRead(n.id);
      }
    }
  }

  function handleNavigate(g: GroupedNotification) {
    if (g.link) navigate(g.link);
  }

  return (
    <div className="space-y-4">
      {/* ── Header card ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card shadow-card">
        {/* Top row */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-inset ring-primary/25">
              <BellRing className="h-[18px] w-[18px]" />
            </span>
            <div className="leading-tight">
              <h1 className="font-display text-base font-bold tracking-[-0.02em] text-foreground sm:text-lg">
                Activity Feed
              </h1>
              <p className="text-[11px] font-medium text-muted-foreground">
                {unreadCount > 0
                  ? `${unreadCount} unread update${unreadCount !== 1 ? "s" : ""}`
                  : "All caught up"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowSettings((s) => !s)}
              className={cn(
                "rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                showSettings && "bg-secondary text-foreground"
              )}
              title="Notification settings"
            >
              <Settings2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={testNotificationSound}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="Test notification sound"
            >
              <Volume2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isLoading}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </button>
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void markAllAsRead()}
                disabled={isPending("markAllAsRead")}
                className="ml-1 gap-1.5 text-xs"
              >
                {isPending("markAllAsRead")
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <CheckCheck className="h-3 w-3" />
                }
                <span className="hidden sm:inline">Mark all read</span>
              </Button>
            )}
          </div>
        </div>

        {/* ── Settings panel (collapsible) ─────────────────────────── */}
        <div className={cn(
          "grid overflow-hidden transition-all duration-300 ease-out",
          showSettings ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}>
          <div className="min-h-0">
            <div className="border-t border-border px-4 py-3 sm:px-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {/* Sound toggle */}
                <SettingRow
                  icon={prefs.soundEnabled ? Volume2 : VolumeX}
                  title="Sound alerts"
                  description="Play a chime when a new notification arrives"
                  active={prefs.soundEnabled}
                  onToggle={() => setSoundEnabled(!prefs.soundEnabled)}
                  action={
                    <button
                      type="button"
                      onClick={testNotificationSound}
                      className="rounded-md px-2 py-1 text-[10px] font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      Test
                    </button>
                  }
                />
                {/* Desktop alerts toggle */}
                <SettingRow
                  icon={Monitor}
                  title="Desktop alerts"
                  description={
                    desktopPermission === "denied"
                      ? "Blocked by browser — check site permissions"
                      : "Show native OS notifications when tab is in background"
                  }
                  active={prefs.desktopEnabled && desktopPermission === "granted"}
                  onToggle={
                    desktopPermission === "granted"
                      ? () => setDesktopEnabled(!prefs.desktopEnabled)
                      : desktopPermission === "denied"
                        ? undefined
                        : () => void requestDesktopPermission()
                  }
                  disabled={desktopPermission === "denied"}
                  action={
                    desktopPermission === "default" ? (
                      <button
                        type="button"
                        onClick={() => void requestDesktopPermission()}
                        className="rounded-md bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/20"
                      >
                        Enable
                      </button>
                    ) : desktopPermission === "denied" ? (
                      <span className="rounded-md bg-destructive/10 px-2 py-1 text-[10px] font-medium text-destructive">
                        Blocked
                      </span>
                    ) : null
                  }
                />
              </div>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="border-t border-border">
          <div className="no-scrollbar flex items-center gap-1 overflow-x-auto px-4 py-2 sm:px-5">
            {FILTER_TABS.map((t) => {
              const active = tab === t.id;
              const count = tabCounts[t.id];
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setTab(t.id); setVisibleCount(PAGE_SIZE); setExpandedId(null); }}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all",
                    active
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  {t.label}
                  <span className={cn(
                    "inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums",
                    active ? "bg-white/20" : "bg-secondary"
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <SkeletonText lines={8} />
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16">
          <EmptyState
            icon={<CheckCircle2 className="h-12 w-12 text-success" />}
            title="All caught up!"
            description={
              tab === "all"
                ? "You have no notifications."
                : tab === "unread"
                  ? "No unread notifications."
                  : `No ${FILTER_TABS.find((t) => t.id === tab)?.label.toLowerCase()} notifications.`
            }
          />
        </div>
      ) : (
        <div className="space-y-5">
          {dateGroups.map((group) => (
            <section key={group.label}>
              <h2 className="mb-2 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/60">
                <span className="h-px flex-1 bg-border" />
                {group.label}
                <span className="h-px flex-1 bg-border" />
              </h2>
              <div className="space-y-1.5">
                {group.items.map((g) => (
                  <NotificationCard
                    key={g.key}
                    group={g}
                    profileMap={profileMap}
                    expanded={expandedId === g.key}
                    onClick={() => handleClick(g)}
                    onNavigate={() => handleNavigate(g)}
                  />
                ))}
              </div>
            </section>
          ))}

          {hasMore && (
            <div className="text-center">
              <Button variant="outline" size="sm" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
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
// Settings row
// ============================================================================

function SettingRow({
  icon: Icon,
  title,
  description,
  active,
  onToggle,
  disabled,
  action,
}: {
  icon: typeof Volume2;
  title: string;
  description: string;
  active: boolean;
  onToggle?: () => void;
  disabled?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn(
      "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
      active ? "border-primary/20 bg-primary/[0.03]" : "border-border bg-card",
      disabled && "opacity-60"
    )}>
      <span className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
        active ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
      )}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <p className="text-[10px] text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        {onToggle && (
          <button
            type="button"
            role="switch"
            aria-checked={active}
            onClick={onToggle}
            disabled={disabled}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              active ? "bg-primary" : "bg-secondary",
              disabled && "cursor-not-allowed"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200",
                active ? "translate-x-[18px]" : "translate-x-[3px]"
              )}
            />
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Premium Notification Card
// ============================================================================

function NotificationCard({
  group: g,
  profileMap,
  expanded,
  onClick,
  onNavigate,
}: {
  group: GroupedNotification;
  profileMap: Map<string, { full_name: string; avatar_url: string | null }>;
  expanded: boolean;
  onClick: () => void;
  onNavigate: () => void;
}) {
  const config = TYPE_CONFIG[g.type];
  const CategoryIcon = getCategoryIcon(g.title);
  const actor = g.actorName ? profileMap.get(g.actorName) : null;
  const timeAgo = formatDistanceToNow(new Date(g.created_at), { addSuffix: true });

  const taskId = extractTaskId(g.message);
  const badgeLabel = getBadgeLabel(g.title, g.type);

  return (
    <div
      className={cn(
        "group rounded-xl border border-l-[3px] transition-all duration-200",
        config.border,
        !g.is_read
          ? "border-border/30 bg-white/[0.055] dark:bg-white/[0.055]"
          : "border-border/15 bg-white/[0.02] dark:bg-white/[0.02]",
        expanded && "ring-1 ring-primary/20"
      )}
    >
      {/* Main row */}
      <button type="button" onClick={onClick} className="flex w-full gap-3 px-3 py-2.5 text-left">
        {/* Avatar */}
        <div className="mt-0.5 shrink-0">
          {actor?.avatar_url ? (
            <Avatar className="h-9 w-9 ring-2 ring-card">
              <AvatarImage src={actor.avatar_url} />
              <AvatarFallback className={cn("text-[10px] font-semibold", config.text)}>{getInitials(actor.full_name)}</AvatarFallback>
            </Avatar>
          ) : g.actorName ? (
            <Avatar className="h-9 w-9 ring-2 ring-card">
              <AvatarFallback className={cn("text-[10px] font-semibold", config.bg, config.text)}>
                {getInitials(g.actorName)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-full", config.bg)}>
              <CategoryIcon className={cn("h-4 w-4", config.text)} />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <p
              className={cn(
                "min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight",
                g.is_read ? "text-foreground/70" : "text-foreground"
              )}
            >
              {g.title}
              {g.count > 1 && (
                <span
                  className={cn(
                    "ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums",
                    config.badgeBg
                  )}
                >
                  ×{g.count}
                </span>
              )}
            </p>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
              {timeAgo}
            </span>
          </div>

          {g.message && (
            <p
              className={cn(
                "mt-0.5 line-clamp-2 text-xs leading-snug",
                g.is_read ? "text-muted-foreground" : "text-foreground/80"
              )}
            >
              {g.message}
            </p>
          )}

          {/* Meta row */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ring-1 ring-inset", config.badgeBg)}>
              <config.icon className="h-2.5 w-2.5" />
              {badgeLabel}
            </span>
            {taskId && (
              <span className="rounded bg-secondary/80 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                {taskId}
              </span>
            )}
            <CategoryIcon className="h-3 w-3 text-muted-foreground/30" />
            {!g.is_read && (
              <span className={cn(
                "ml-auto h-2 w-2 rounded-full",
                g.type === "urgent" ? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]"
                  : g.type === "warning" ? "bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.4)]"
                  : g.type === "success" ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]"
                  : "bg-primary shadow-[0_0_6px_rgba(79,110,247,0.4)]"
              )} />
            )}
          </div>
        </div>

        <ChevronDown className={cn("mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/30 transition-transform duration-200", expanded && "rotate-180")} />
      </button>

      {/* Expanded detail */}
      <div className={cn("grid overflow-hidden transition-all duration-200 ease-out", expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="min-h-0">
          <div className="border-t border-border/20 px-3 py-2.5">
            <p className="text-xs leading-relaxed text-muted-foreground">{g.message}</p>
            {g.link && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onNavigate(); }}
                className={cn("mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors", config.badgeBg, "hover:opacity-80")}>
                <ExternalLink className="h-3 w-3" />
                View Details
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
