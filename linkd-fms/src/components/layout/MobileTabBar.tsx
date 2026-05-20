import { NavLink } from "react-router-dom";
import {
  Home,
  ClipboardList,
  Lightbulb,
  Droplets,
  Bell,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/database";

interface TabItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

function getTabsForRole(role: UserRole): TabItem[] {
  switch (role) {
    case "admin":
      return [
        { to: ROUTES.taskDashboard, label: "Home", icon: Home },
        { to: ROUTES.dashboard, label: "All Tasks", icon: ClipboardList },
        { to: ROUTES.concepts, label: "Concepts", icon: Lightbulb },
        { to: ROUTES.notifications, label: "Alerts", icon: Bell },
      ];
    case "design_coordinator":
      return [
        { to: ROUTES.taskDashboard, label: "Home", icon: Home },
        { to: ROUTES.dashboard, label: "All Tasks", icon: ClipboardList },
        { to: ROUTES.sampling, label: "Sampling", icon: Droplets },
        { to: ROUTES.notifications, label: "Alerts", icon: Bell },
      ];
    case "designer":
      return [
        { to: ROUTES.taskDashboard, label: "Home", icon: Home },
        { to: ROUTES.dashboard, label: "My Board", icon: ClipboardList },
        { to: ROUTES.concepts, label: "Concepts", icon: Lightbulb },
        { to: ROUTES.notifications, label: "Alerts", icon: Bell },
      ];
  }
}

interface Props {
  role: UserRole;
  unreadCount: number;
  onMoreClick: () => void;
}

export function MobileTabBar({ role, unreadCount }: Props) {
  const tabs = getTabsForRole(role);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-stretch border-t border-border bg-card/95 backdrop-blur-lg md:hidden safe-area-pb">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-all active:scale-95",
              isActive ? "text-primary" : "text-muted-foreground"
            )
          }
        >
          {({ isActive }) => (
            <>
              <div className="relative">
                <tab.icon
                  className={cn("h-5 w-5", isActive && "text-primary")}
                />
                {tab.to === ROUTES.notifications && unreadCount > 0 && (
                  <span className="absolute -right-1.5 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-destructive px-1 text-[8px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </div>
              <span>{tab.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
