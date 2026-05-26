import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { useNotifications } from "@/hooks/useNotifications";
import type { Profile } from "@/types/database";

export interface AppLayoutProps {
  profile: Profile;
  children: ReactNode;
}

export function AppLayout({ profile, children }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { unreadCount } = useNotifications();

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
      />

      <div className="md:pl-[220px]">
        <TopNav
          profile={profile}
          onMobileMenuClick={() => setMobileOpen(true)}
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
          className="animate-fade-in px-4 pb-20 pt-[68px] sm:px-6 md:px-8 md:pb-8 outline-none"
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
