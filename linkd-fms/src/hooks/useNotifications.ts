import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { DATA_RESTORED_EVENT } from "@/lib/recycleFiles";
import type { Notification } from "@/types/database";

// ============================================================================
// Types
// ============================================================================

export type MutationResult<T> = { data: T | null; error: string | null };

type NotificationOp = "markAsRead" | "markAllAsRead";

export type DesktopPermission = "default" | "granted" | "denied";

export interface NotificationPrefs {
  soundEnabled: boolean;
  desktopEnabled: boolean;
}

const PREFS_KEY = "linkd-notification-prefs";

function loadPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { soundEnabled: true, desktopEnabled: false, ...JSON.parse(raw) };
  } catch { /* corrupt — use defaults */ }
  return { soundEnabled: true, desktopEnabled: false };
}

function savePrefs(p: NotificationPrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* quota */ }
}

export interface UseNotifications {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<MutationResult<Notification>>;
  markAllAsRead: () => Promise<MutationResult<{ count: number }>>;
  isPending: (op: NotificationOp, id?: string) => boolean;
  testNotificationSound: () => void;
  prefs: NotificationPrefs;
  setSoundEnabled: (v: boolean) => void;
  setDesktopEnabled: (v: boolean) => void;
  desktopPermission: DesktopPermission;
  requestDesktopPermission: () => Promise<DesktopPermission>;
}

// ============================================================================
// Hook
// ============================================================================

export function useNotifications(): UseNotifications {
  const { user, profile } = useAuth();
  const userId = user?.id ?? null;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  // ── Preferences (localStorage-backed) ─────────────────────────────
  const [prefs, setPrefsState] = useState<NotificationPrefs>(loadPrefs);

  const setSoundEnabled = useCallback((v: boolean) => {
    setPrefsState((p) => {
      const next = { ...p, soundEnabled: v };
      savePrefs(next);
      return next;
    });
  }, []);

  const setDesktopEnabled = useCallback((v: boolean) => {
    setPrefsState((p) => {
      const next = { ...p, desktopEnabled: v };
      savePrefs(next);
      return next;
    });
  }, []);

  // ── Desktop notification permission ───────────────────────────────
  const [desktopPermission, setDesktopPermission] = useState<DesktopPermission>(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "denied";
    return window.Notification.permission as DesktopPermission;
  });

  const requestDesktopPermission = useCallback(async (): Promise<DesktopPermission> => {
    if (typeof window === "undefined" || !("Notification" in window)) return "denied";
    try {
      const result = await window.Notification.requestPermission();
      const perm = result as DesktopPermission;
      setDesktopPermission(perm);
      if (perm === "granted") {
        setDesktopEnabled(true);
        new window.Notification("Notifications enabled", {
          body: `You'll now receive desktop alerts from ${profile?.full_name ? "LinkD FMS" : "LinkD FMS"}.`,
          icon: "/logo.png",
        });
      }
      return perm;
    } catch {
      return "denied";
    }
  }, [setDesktopEnabled, profile?.full_name]);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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

  // Re-pull after a Recycle Bin restore so recovered notifications reappear.
  useEffect(() => {
    const h = () => void refetch({ quiet: true });
    window.addEventListener(DATA_RESTORED_EVENT, h);
    return () => window.removeEventListener(DATA_RESTORED_EVENT, h);
  }, [refetch]);

  // ── Notification sound ──────────────────────────────────────────────
  // Web Audio two-tone chime (A5 → E6, ~250ms). Plays on realtime INSERT
  // regardless of tab visibility so users hear it even while on another
  // tab. Browser autoplay policy is satisfied by unlocking the shared
  // AudioContext on the first user gesture (click / keypress / touch).

  const lastSoundTime = useRef<number>(0);
  const titleFlashIntervalRef = useRef<number | null>(null);
  const titleFlashTimeoutRef = useRef<number | null>(null);
  const originalTitleRef = useRef<string>("");

  const audioCtxRef = useRef<AudioContext | null>(null);

  const ensureAudioCtx = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (audioCtxRef.current) return audioCtxRef.current;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return null;
    try {
      audioCtxRef.current = new Ctx();
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    function unlock() {
      const ctx = ensureAudioCtx();
      if (!ctx) return;
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => { /* retry on next gesture */ });
      }
    }
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
    window.addEventListener("touchstart", unlock, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, [ensureAudioCtx]);

  const playTone = useCallback(
    (ctx: AudioContext, freq: number, startOffset: number, duration: number, peakGain: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g);
      g.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;

      const t = ctx.currentTime + startOffset;
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
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().then(() => {
        playTone(ctx, 880, 0, 0.15, 0.4);
        playTone(ctx, 1318.5, 0.12, 0.2, 0.35);
      }).catch(() => { /* still locked */ });
      return;
    }
    playTone(ctx, 880, 0, 0.15, 0.4);
    playTone(ctx, 1318.5, 0.12, 0.2, 0.35);
  }, [ensureAudioCtx, playTone]);

  // Use a ref to read prefs without re-creating the callback on every
  // pref change (avoids re-subscribing the realtime channel).
  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);

  const playNotificationSound = useCallback(() => {
    if (!prefsRef.current.soundEnabled) return;
    const now = Date.now();
    if (now - lastSoundTime.current < 10_000) return;
    lastSoundTime.current = now;
    ringChime();
  }, [ringChime]);

  const testNotificationSound = useCallback(() => {
    ringChime();
  }, [ringChime]);

  // ── Desktop notification ────────────────────────────────────────────

  const fireDesktopNotification = useCallback((n: Notification) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (!prefsRef.current.desktopEnabled) return;
    if (window.Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;

    try {
      const notif = new window.Notification(n.title, {
        body: n.message,
        icon: "/logo.png",
        tag: `linkd-${n.id}`,
      });
      notif.onclick = () => {
        window.focus();
        if (n.link) window.location.href = n.link;
        notif.close();
      };
    } catch { /* some browsers block in workers */ }
  }, []);

  // ── Tab title flash ─────────────────────────────────────────────────

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
    document.title = "🔔 New Notification";

    titleFlashTimeoutRef.current = window.setTimeout(() => {
      stopTitleFlash();
    }, 10_000);
  }, [stopTitleFlash]);

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
          setNotifications((prev) => [newRow, ...prev]);

          // Sound plays regardless of tab visibility
          playNotificationSound();

          // Desktop notification + title flash when tab is hidden
          if (typeof document !== "undefined" && document.visibilityState === "hidden") {
            fireDesktopNotification(newRow);
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
  }, [userId, playNotificationSound, startTitleFlash, fireDesktopNotification]);

  // ── Self-heal the unread badge ───────────────────────────────────────
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
          .eq("user_id", userId)
          .select("*")
          .single();

        if (err) return { data: null, error: err.message };

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
      const unread = notifications.filter((n) => !n.is_read).length;

      const { error: err } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (err) return { data: null, error: err.message };

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
    prefs,
    setSoundEnabled,
    setDesktopEnabled,
    desktopPermission,
    requestDesktopPermission,
  };
}
