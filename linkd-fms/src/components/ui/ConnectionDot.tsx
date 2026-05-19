import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type ConnState = "connected" | "connecting" | "disconnected";

const LABEL: Record<ConnState, string> = {
  connected: "Realtime: connected",
  connecting: "Realtime: reconnecting…",
  disconnected: "Realtime: disconnected for >30s",
};

const DOT_CLASS: Record<ConnState, string> = {
  connected: "bg-emerald-500",
  connecting: "bg-amber-500 animate-pulse",
  disconnected: "bg-destructive",
};

const DISCONNECT_GRACE_MS = 30_000;

/**
 * Tiny status pip for the top nav. Subscribes to a lightweight Supabase
 * Realtime channel and reflects its state:
 *
 *   green        – channel is SUBSCRIBED
 *   yellow pulse – channel is in transition / disconnected for ≤30s
 *   red          – disconnected for >30s
 *
 * Mount once in TopNav. Channel is cleaned up on unmount.
 */
export function ConnectionDot({ className }: { className?: string }) {
  const [state, setState] = useState<ConnState>("connecting");
  const disconnectedSinceRef = useRef<number | null>(null);

  useEffect(() => {
    const ch = supabase.channel("ux-heartbeat", {
      config: { broadcast: { self: false } },
    });

    function reconcile(rawConnected: boolean) {
      if (rawConnected) {
        disconnectedSinceRef.current = null;
        setState("connected");
        return;
      }
      if (!disconnectedSinceRef.current) {
        disconnectedSinceRef.current = Date.now();
      }
      const elapsed = Date.now() - disconnectedSinceRef.current;
      setState(elapsed > DISCONNECT_GRACE_MS ? "disconnected" : "connecting");
    }

    ch.subscribe((status) => {
      // status: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'
      reconcile(status === "SUBSCRIBED");
    });

    // Periodic re-check so we flip to red exactly when the grace expires,
    // not only when the next status event arrives.
    const interval = setInterval(() => {
      if (disconnectedSinceRef.current) {
        const elapsed = Date.now() - disconnectedSinceRef.current;
        if (elapsed > DISCONNECT_GRACE_MS) {
          setState((s) => (s === "disconnected" ? s : "disconnected"));
        }
      }
    }, 5_000);

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(ch);
    };
  }, []);

  return (
    <span
      role="status"
      aria-label={LABEL[state]}
      title={LABEL[state]}
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      <span
        className={cn("h-2 w-2 rounded-full", DOT_CLASS[state])}
        aria-hidden
      />
    </span>
  );
}
