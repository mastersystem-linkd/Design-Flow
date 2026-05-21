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

  // ── Notification sound + tab flash ───────────────────────────────────
  // Two complementary cues for a fresh Realtime INSERT:
  //
  //   • Tab is VISIBLE  → play a short A5 chime (Web Audio, debounced 10s)
  //   • Tab is HIDDEN   → flash the browser tab title for 10s
  //
  // These are mutually exclusive — we never play sound to a backgrounded
  // tab (most browsers throttle that anyway) and never flash the title of
  // a tab the user is already looking at (visual noise).
  //
  // Both fire only on the realtime INSERT moment. The initial fetch on
  // mount never plays sound or flashes — that would be annoying every page
  // load for users who haven't checked their unread queue.

  const lastSoundTime = useRef<number>(0);
  const titleFlashIntervalRef = useRef<number | null>(null);
  const titleFlashTimeoutRef = useRef<number | null>(null);
  const originalTitleRef = useRef<string>("");

  const playNotificationSound = useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.visibilityState !== "visible") return;

    // Debounce: don't fire if we played in the last 10s. Prevents a burst
    // of inserts (e.g. a batch send) from machine-gunning the user.
    const now = Date.now();
    if (now - lastSoundTime.current < 10_000) return;
    lastSoundTime.current = now;

    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return; // Safari < 14.1 / no Web Audio
      const ctx = new Ctx();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880; // A5

      const start = ctx.currentTime;
      gain.gain.setValueAtTime(0.3, start);
      // 200ms total: hold for 100ms, then exponential fade to silence.
      gain.gain.setValueAtTime(0.3, start + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);

      osc.start(start);
      osc.stop(start + 0.2);

      // Close context once the tone finishes so we don't leak audio nodes.
      window.setTimeout(() => {
        ctx.close().catch(() => { /* already closed */ });
      }, 400);
    } catch {
      // AudioContext blocked (no user gesture yet) / browser unsupported —
      // silent failure is the right behaviour, not a thrown error.
    }
  }, []);

  // Clear any in-flight title flash and restore the original tab title.
  const stopTitleFlash = useCallback(() => {
    if (titleFlashIntervalRef.current !== null) {
      window.clearInterval(titleFlashIntervalRef.current);
      titleFlashIntervalRef.current = null;
    }
    if (titleFlashTimeoutRef.current !== null) {
      window.clearTimeout(titleFlashTimeoutRef.current);
      titleFlashTimeoutRef.current = null;
    }
    if (originalTitleRef.current && typeof document !== "undefined") {
      document.title = originalTitleRef.current;
    }
  }, []);

  const startTitleFlash = useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.visibilityState !== "hidden") return;

    // Don't start a second flash if one is already running — the user
    // already knows something arrived; replacing the interval would just
    // reset the 10s countdown unnecessarily.
    if (titleFlashIntervalRef.current !== null) return;

    if (!originalTitleRef.current) {
      originalTitleRef.current = document.title;
    }
    const original = originalTitleRef.current;
    let showing = true;

    titleFlashIntervalRef.current = window.setInterval(() => {
      document.title = showing ? "🔔 New Notification" : original;
      showing = !showing;
    }, 2_000);
    // Initial tick — start with the alert state immediately, the interval
    // alternates from there.
    document.title = "🔔 New Notification";

    titleFlashTimeoutRef.current = window.setTimeout(() => {
      stopTitleFlash();
    }, 10_000);
  }, [stopTitleFlash]);

  // When the user returns to the tab, cancel any flash mid-cycle.
  useEffect(() => {
    if (typeof document === "undefined") return;
    function onVis() {
      if (document.visibilityState === "visible") {
        stopTitleFlash();
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      stopTitleFlash();
    };
  }, [stopTitleFlash]);

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
          // Pick exactly one cue based on tab visibility.
          if (typeof document !== "undefined" && document.visibilityState === "visible") {
            playNotificationSound();
          } else {
            startTitleFlash();
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId, playNotificationSound, startTitleFlash]);

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
