import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { useNotifications } from "@/hooks/useNotifications";
import { useDeadlineAlerts } from "@/hooks/useDeadlineAlerts";
import type { Profile } from "@/types/database";

export interface AppLayoutProps {
  profile: Profile;
  children: ReactNode;
}

export function AppLayout({ profile, children }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { unreadCount } = useNotifications();
  useDeadlineAlerts();

  return (
    <div className="min-h-screen bg-background">
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
          key={location.pathname}
          className="animate-fade-in px-4 pb-24 pt-20 sm:px-6 md:px-8 md:pb-10"
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
