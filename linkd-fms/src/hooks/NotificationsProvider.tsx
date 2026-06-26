import { createContext, useContext, type ReactNode } from "react";
import { useNotifications, type UseNotifications } from "@/hooks/useNotifications";

// ============================================================================
// NotificationsProvider — ONE shared notification store for the whole app.
//
// `useNotifications` is local useState (list + unreadCount + a realtime channel
// + a 45s poll). Calling it in multiple components (sidebar, bell, the feed)
// gave each its OWN copy, so "mark all read" in the feed never updated the
// sidebar/bell badge until their own resync — three different counts on screen.
//
// Mounting it once here and sharing via context means: one realtime channel,
// one poll, one source of truth → the unread badge is identical everywhere and
// updates instantly when anything is read.
// ============================================================================

const NotificationsContext = createContext<UseNotifications | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const value = useNotifications();
  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsContext(): UseNotifications {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error(
      "useNotificationsContext must be used within <NotificationsProvider>"
    );
  }
  return ctx;
}
