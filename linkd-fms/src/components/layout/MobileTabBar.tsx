import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutGrid,
  Lightbulb,
  Bell,
  Menu,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/database";

interface TabItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

function getTabsForRole(role: UserRole): TabItem[] {
  const tabs: TabItem[] = [
    { to: ROUTES.dashboard, label: "Tasks", icon: LayoutGrid },
  ];

  // Concepts — available to all roles
  if (role === "admin" || role === "design_coordinator" || role === "designer") {
    tabs.push({ to: ROUTES.concepts, label: "Concepts", icon: Lightbulb });
  }

  tabs.push({ to: ROUTES.notifications, label: "Alerts", icon: Bell });

  return tabs;
}

interface Props {
  role: UserRole;
  unreadCount: number;
  onMoreClick: () => void;
}

export function MobileTabBar({ role, unreadCount, onMoreClick }: Props) {
  const tabs = getTabsForRole(role);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch border-t border-border bg-card/95 backdrop-blur-xl md:hidden safe-area-pb">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              isActive
                ? "text-primary"
                : "text-muted-foreground"
            )
          }
        >
          {({ isActive }) => (
            <>
              <div className="relative">
                <tab.icon className={cn("h-5 w-5", isActive && "text-primary")} />
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

      {/* More button — opens sidebar drawer */}
      <button
        type="button"
        onClick={onMoreClick}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground transition-colors active:text-primary"
      >
        <Menu className="h-5 w-5" />
        <span>More</span>
      </button>
    </nav>
  );
}
