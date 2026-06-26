import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Info,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  CheckCheck,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNotificationsContext } from "@/hooks/NotificationsProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { Notification, NotificationType } from "@/types/database";

// ============================================================================
// Icon + color mapping per notification type
// ============================================================================

const TYPE_CONFIG: Record<
  NotificationType,
  { icon: typeof Info; dotClass: string }
> = {
  info: { icon: Info, dotClass: "text-primary" },
  warning: { icon: AlertTriangle, dotClass: "text-warning" },
  urgent: { icon: AlertOctagon, dotClass: "text-destructive" },
  success: { icon: CheckCircle2, dotClass: "text-success" },
};

// ============================================================================
// Component
// ============================================================================

export function NotificationBell() {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    isPending,
  } = useNotificationsContext();

  const [open, setOpen] = useState(false);
  const [prevCount, setPrevCount] = useState(unreadCount);
  const [pulse, setPulse] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Bell-icon pulse when unread count climbs. The browser-tab title flash
  // used to live here too but it now belongs to `useNotifications` (so it
  // can react to the exact realtime INSERT moment + visibility state),
  // avoiding two competing intervals fighting over `document.title`.
  useEffect(() => {
    if (unreadCount > prevCount) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 2500);
      return () => clearTimeout(t);
    }
    setPrevCount(unreadCount);
  }, [unreadCount, prevCount]);

  // Close on click outside.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function handleItemClick(n: Notification) {
    if (!n.is_read) {
      void markAsRead(n.id);
    }
    setOpen(false);
    if (n.link) {
      navigate(n.link);
    }
  }

  const displayBadge =
    unreadCount > 0 ? (unreadCount > 9 ? "9+" : String(unreadCount)) : null;

  // Show at most 15 in the dropdown.
  const dropdownItems = notifications.slice(0, 15);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* ── Bell button ─────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative rounded-lg p-2 transition-colors hover:bg-secondary",
          open && "bg-secondary"
        )}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell
          className={cn(
            "h-5 w-5 text-muted-foreground transition-colors",
            unreadCount > 0 && "text-foreground",
            pulse && "animate-urgent-pulse"
          )}
        />
        {displayBadge && (
          <>
            {/* Outer ring pulse for attention — sits behind the readable badge */}
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 inline-flex h-4 w-4 animate-ping rounded-full bg-destructive opacity-60 motion-reduce:animate-none"
            />
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold tabular-nums text-destructive-foreground"
              aria-live="polite"
            >
              {displayBadge}
            </span>
          </>
        )}
      </button>

      {/* ── Dropdown ────────────────────────────────────────── */}
      {open && (
        <div
          className={cn(
            "absolute right-0 top-full z-50 mt-2 w-[360px] overflow-hidden rounded-xl border border-border bg-card shadow-xl",
            "animate-fade-in"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                disabled={isPending("markAllAsRead")}
                className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80 disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {dropdownItems.length === 0 ? (
              <div className="py-8">
                <EmptyState
                  icon={<CheckCircle2 className="h-8 w-8 text-success" />}
                  title="All caught up!"
                  description="No notifications right now."
                />
              </div>
            ) : (
              <ul>
                {dropdownItems.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onClick={() => handleItemClick(n)}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-border px-4 py-2.5 text-center">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate("/notifications");
                }}
                className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Single item
// ============================================================================

function NotificationItem({
  notification: n,
  onClick,
}: {
  notification: Notification;
  onClick: () => void;
}) {
  const config = TYPE_CONFIG[n.type];
  const Icon = config.icon;
  const timeAgo = formatDistanceToNow(new Date(n.created_at), {
    addSuffix: true,
  });

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50",
          !n.is_read && "bg-primary/5"
        )}
      >
        {/* Type icon */}
        <div className="mt-0.5 shrink-0">
          <Icon className={cn("h-4 w-4", config.dotClass)} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
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
            {!n.is_read && (
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
            )}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
            {n.message}
          </p>
          <p className="mt-1 text-[10px] tabular-nums text-muted-foreground/70">
            {timeAgo}
          </p>
        </div>
      </button>
    </li>
  );
}
