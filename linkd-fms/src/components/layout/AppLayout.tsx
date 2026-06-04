import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { useNotifications } from "@/hooks/useNotifications";
import { useConceptReminders } from "@/hooks/useConceptReminders";
import { useHeldConceptAlerts } from "@/hooks/useHeldConceptAlerts";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/database";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

export interface AppLayoutProps {
  profile: Profile;
  children: ReactNode;
}

export function AppLayout({ profile, children }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Desktop sidebar collapse — persisted per device. Collapsed = slim icon
  // rail that expands on hover; expanded = pinned open. Defaults to expanded.
  const [collapsed, setCollapsed] = useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1"
  );
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore quota / private-mode errors */
      }
      return next;
    });
  }
  const location = useLocation();
  const { unreadCount } = useNotifications();
  useConceptReminders();
  useHeldConceptAlerts();

  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-4 focus:left-4 focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg"
      >
        Skip to main content
      </a>
      <Sidebar
        profile={profile}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        notificationCount={unreadCount}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />

      {/* Content padding follows the PINNED state only (hover-expand overlays,
          so it doesn't reflow the page). */}
      <div
        className={cn(
          "transition-[padding] duration-slow ease-spring",
          collapsed ? "md:pl-[64px]" : "md:pl-[220px]"
        )}
      >
        <TopNav
          profile={profile}
          onMobileMenuClick={() => setMobileOpen(true)}
          collapsed={collapsed}
        />
        <main
          ref={mainRef}
          id="main-content"
          tabIndex={-1}
          key={location.pathname}
          // pt-[68px] = 56px topnav + 12px breathing room.
          // pb-20 on mobile clears the 64px MobileTabBar + 16px of
          // breathing room so the last data row isn't pinned under the
          // bar; desktop drops back to pb-8.
          // `overflow-x-clip` stops any single over-wide child (a fixed-width
          // table, a long unbroken string, etc.) from making the WHOLE page
          // scroll/shift sideways on mobile. `clip` (not `hidden`) avoids
          // turning this into a vertical scroll container, so sticky headers
          // and normal window scrolling keep working.
          className="animate-spring-fade-in overflow-x-clip px-4 pb-20 pt-[72px] sm:px-6 md:px-8 lg:px-10 md:pb-8 outline-none"
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar — hidden on desktop */}
      <MobileTabBar
        role={profile.role}
        unreadCount={unreadCount}
        onMoreClick={() => setMobileOpen(true)}
      />

    </div>
  );
}
