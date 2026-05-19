import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { Notification } from "@/types/database";

// ============================================================================
// Types
// ============================================================================

export type MutationResult<T> = { data: T | null; error: string | null };

type NotificationOp = "markAsRead" | "markAllAsRead";

export interface UseNotifications {
  /** All notifications for the current user, newest first. */
  notifications: Notification[];
  /** Count of is_read = false. */
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** Mark a single notification as read. */
  markAsRead: (notificationId: string) => Promise<MutationResult<Notification>>;
  /** Mark ALL unread notifications as read. */
  markAllAsRead: () => Promise<MutationResult<{ count: number }>>;
  /** Per-operation pending state (same pattern as useTaskMutations). */
  isPending: (op: NotificationOp, id?: string) => boolean;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Notifications for the current user.
 *
 * - Fetches on mount + exposes `refetch()`.
 * - Subscribes to Supabase Realtime for INSERT events scoped to the user's
 *   `user_id`. New notifications are prepended to the list and the
 *   `unreadCount` incremented without a full refetch.
 * - Cleans up the Realtime channel on unmount.
 */
export function useNotifications(): UseNotifications {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  // Ref to hold the Realtime channel so we can unsubscribe on cleanup.
  const channelRef = useRef<ReturnType<
    typeof supabase.channel
  > | null>(null);

  // ── Pending helpers ──────────────────────────────────────────────────

  const setOpPending = useCallback((key: string, value: boolean) => {
    setPending((prev) => {
      if (value) return { ...prev, [key]: true };
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const isPending = useCallback(
    (op: NotificationOp, id?: string): boolean => {
      const key = id ? `${op}:${id}` : op;
      return !!pending[key];
    },
    [pending]
  );

  // ── Fetch ────────────────────────────────────────────────────────────

  const refetch = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (err) {
      console.error("[useNotifications] fetch error", err);
      setError(err.message);
      setNotifications([]);
    } else {
      setNotifications(data ?? []);
    }
    setIsLoading(false);
  }, [userId]);

  // ── Initial fetch ────────────────────────────────────────────────────

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // ── Realtime subscription ────────────────────────────────────────────

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on<Notification>(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newRow = payload.new;
          // Prepend — newest first.
          setNotifications((prev) => [newRow, ...prev]);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId]);

  // ── Derived state ────────────────────────────────────────────────────

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // ── Mutations ────────────────────────────────────────────────────────

  const markAsRead = useCallback(
    async (
      notificationId: string
    ): Promise<MutationResult<Notification>> => {
      if (!userId) return { data: null, error: "Not authenticated" };

      const key = `markAsRead:${notificationId}`;
      setOpPending(key, true);
      try {
        const { data, error: err } = await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("id", notificationId)
          .eq("user_id", userId) // RLS safety: only own
          .select("*")
          .single();

        if (err) return { data: null, error: err.message };

        // Optimistically update local state.
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
        );

        return { data, error: null };
      } finally {
        setOpPending(key, false);
      }
    },
    [userId, setOpPending]
  );

  const markAllAsRead = useCallback(async (): Promise<
    MutationResult<{ count: number }>
  > => {
    if (!userId) return { data: null, error: "Not authenticated" };

    const key = "markAllAsRead";
    setOpPending(key, true);
    try {
      // Supabase JS doesn't return a count directly from UPDATE. We
      // count unread before the update and return that as the "affected"
      // count. The actual DB update is a bulk WHERE.
      const unread = notifications.filter((n) => !n.is_read).length;

      const { error: err } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (err) return { data: null, error: err.message };

      // Optimistically mark everything locally.
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));

      return { data: { count: unread }, error: null };
    } finally {
      setOpPending(key, false);
    }
  }, [userId, notifications, setOpPending]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    refetch,
    markAsRead,
    markAllAsRead,
    isPending,
  };
}
