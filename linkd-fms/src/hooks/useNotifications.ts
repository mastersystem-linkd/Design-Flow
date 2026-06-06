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
  /** Play the chime once on demand — bypasses the visibility check and 10s
   *  debounce. Wire to a "Test sound" button so users can verify the chime
   *  works after the browser's audio autoplay policy unlocks. */
  testNotificationSound: () => void;
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

  const refetch = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!userId) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }
    // `quiet` = a background re-sync (focus / interval) — don't toggle the
    // loading state or wipe the list on a transient error, so the feed and
    // badge update silently without flashing a spinner.
    if (!opts?.quiet) setIsLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (err) {
      console.error("[useNotifications] fetch error", err);
      if (!opts?.quiet) {
        setError(err.message);
        setNotifications([]);
      }
    } else {
      setNotifications(data ?? []);
    }
    if (!opts?.quiet) setIsLoading(false);
  }, [userId]);

  // ── Initial fetch ────────────────────────────────────────────────────

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // ── Notification sound + tab flash ───────────────────────────────────
  // Two complementary cues for a fresh Realtime INSERT:
  //
  //   • Tab is VISIBLE  → play a two-tone ding-dong (A5 → E6, ~250ms, Web
  //                       Audio, debounced 10s)
  //   • Tab is HIDDEN   → flash the browser tab title for 10s
  //
  // These are mutually exclusive — we never play sound to a backgrounded
  // tab (most browsers throttle that anyway) and never flash the title of
  // a tab the user is already looking at (visual noise).
  //
  // Both fire only on the realtime INSERT moment. The initial fetch on
  // mount never plays sound or flashes — that would be annoying every page
  // load for users who haven't checked their unread queue.
  //
  // **Autoplay-policy gotcha (was silently breaking the chime):** Chrome,
  // Safari and Firefox now require a user gesture before an AudioContext
  // can produce sound. The old code created a *new* `AudioContext()` per
  // chime, which always started in `suspended` state — `osc.start()`
  // queued the tone but no audio came out. The fix: keep ONE shared
  // context for the whole tab and `resume()` it on the first click /
  // keypress / touch the user performs. After that gesture every future
  // chime plays normally.

  const lastSoundTime = useRef<number>(0);
  const titleFlashIntervalRef = useRef<number | null>(null);
  const titleFlashTimeoutRef = useRef<number | null>(null);
  const originalTitleRef = useRef<string>("");

  // Shared AudioContext — created lazily, kept for the life of the tab.
  const audioCtxRef = useRef<AudioContext | null>(null);

  const ensureAudioCtx = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (audioCtxRef.current) return audioCtxRef.current;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return null; // Safari < 14.1 / no Web Audio
    try {
      audioCtxRef.current = new Ctx();
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  // Unlock the AudioContext on the FIRST user gesture (any click / keypress
  // / touchstart anywhere on the page). After this the chime is free to
  // play whenever realtime fires, even without a fresh interaction.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function unlock() {
      const ctx = ensureAudioCtx();
      if (!ctx) return;
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {
          /* still locked — will retry on next gesture */
        });
      }
    }
    // `passive: true` keeps scroll/touch perf untouched. We re-arm on every
    // gesture so a context that gets re-suspended by the browser (mobile
    // background tab eviction) gets resumed the next time the user taps.
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
    window.addEventListener("touchstart", unlock, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, [ensureAudioCtx]);

  // Play a single tone on the shared context. Used by both the two-tone
  // notification chime and the louder "Test sound" button.
  const playTone = useCallback(
    (ctx: AudioContext, freq: number, startOffset: number, duration: number, peakGain: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g);
      g.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;

      const t = ctx.currentTime + startOffset;
      // 20ms attack → hold → 60ms exponential release. Avoids the click
      // you get from a hard square envelope.
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peakGain, t + 0.02);
      g.gain.setValueAtTime(peakGain, t + Math.max(0.05, duration - 0.06));
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      osc.start(t);
      osc.stop(t + duration + 0.02);
    },
    []
  );

  const ringChime = useCallback(() => {
    const ctx = ensureAudioCtx();
    if (!ctx) {
      console.warn("[Notifications] No AudioContext available");
      return;
    }
    if (ctx.state === "suspended") {
      ctx.resume().then(() => {
        playTone(ctx, 880, 0, 0.15, 0.4);
        playTone(ctx, 1318.5, 0.12, 0.2, 0.35);
      }).catch(() => {
        console.warn("[Notifications] AudioContext still suspended — user gesture needed");
      });
      return;
    }
    playTone(ctx, 880, 0, 0.15, 0.4);
    playTone(ctx, 1318.5, 0.12, 0.2, 0.35);
  }, [ensureAudioCtx, playTone]);

  const playNotificationSound = useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.visibilityState !== "visible") return;

    // Debounce: don't fire if we played in the last 10s. Prevents a burst
    // of inserts (e.g. a batch send) from machine-gunning the user.
    const now = Date.now();
    if (now - lastSoundTime.current < 10_000) return;
    lastSoundTime.current = now;

    ringChime();
  }, [ringChime]);

  // Public helper — wired to the Notifications page's "Test" button so the
  // user can confirm the chime is working without waiting for a real INSERT.
  // Bypasses the visibility check and the 10s debounce.
  const testNotificationSound = useCallback(() => {
    ringChime();
  }, [ringChime]);

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

  // ── Self-heal the unread badge ───────────────────────────────────────
  // The realtime channel above only carries INSERTs, so changes that REMOVE
  // rows never reach this instance — another tab/device, a mark-all-read
  // elsewhere, or an admin wiping the table via the service-role API. The
  // derived `unreadCount` then drifts (classic symptom: sidebar/bell stuck on
  // an old count while the feed is empty). Re-sync quietly on tab focus and on
  // a slow interval so it converges to the DB truth without a manual reload.
  useEffect(() => {
    if (!userId) return;
    const resync = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        void refetch({ quiet: true });
      }
    };
    window.addEventListener("focus", resync);
    document.addEventListener("visibilitychange", resync);
    const id = window.setInterval(resync, 45_000);
    return () => {
      window.removeEventListener("focus", resync);
      document.removeEventListener("visibilitychange", resync);
      window.clearInterval(id);
    };
  }, [userId, refetch]);

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
    testNotificationSound,
  };
}
