import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Menu, LogOut } from "lucide-react";
import { ConnectionDot } from "@/components/ui/ConnectionDot";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
} from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { Profile, UserRole } from "@/types/database";

// ============================================================================
// Page title resolution from current pathname + role
// ============================================================================

interface RouteTitle {
  title: string;
  breadcrumb?: string[];
}

function getPageTitle(pathname: string, role: UserRole): RouteTitle {
  if (pathname === ROUTES.home || pathname.startsWith(ROUTES.home + "/")) {
    return { title: "Dashboard" };
  }
  if (pathname === ROUTES.dashboard || pathname.startsWith(ROUTES.dashboard + "/")) {
    return { title: role === "designer" ? "My Board" : "All Tasks" };
  }
  if (pathname.startsWith(ROUTES.briefNew)) {
    return { title: "New Brief", breadcrumb: ["Dashboard", "New Brief"] };
  }
  if (pathname.startsWith(ROUTES.concepts)) {
    return { title: "Concepts" };
  }
  if (pathname.startsWith(ROUTES.analytics)) {
    return { title: "Concept Dashboard" };
  }
  if (pathname.startsWith(ROUTES.taskDashboard)) {
    return { title: "Task Dashboard" };
  }
  if (pathname.startsWith(ROUTES.system)) {
    return { title: "Settings & Admin" };
  }
  if (pathname.startsWith(ROUTES.salvedge)) {
    return { title: "Salvedge" };
  }
  if (pathname.startsWith(ROUTES.sampling)) {
    return { title: "Sampling Queue" };
  }
  if (pathname.startsWith(ROUTES.team)) {
    return { title: "Team Management" };
  }
  if (pathname.startsWith(ROUTES.scorecards)) {
    return { title: "Scorecards" };
  }
  if (pathname.startsWith(ROUTES.profile)) {
    return { title: "Profile" };
  }
  if (pathname.startsWith(ROUTES.notifications)) {
    return { title: "Notifications" };
  }
  if (pathname.startsWith(ROUTES.files)) {
    return { title: "Files" };
  }
  return { title: "LinkD FMS" };
}

// ============================================================================
// TopNav
// ============================================================================

export interface TopNavProps {
  profile: Profile;
  onMobileMenuClick: () => void;
}

export function TopNav({ profile, onMobileMenuClick }: TopNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { title, breadcrumb } = getPageTitle(location.pathname, profile.role);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  async function handleSignOut() {
    await signOut();
    setConfirmSignOut(false);
    navigate(ROUTES.login, { replace: true });
  }

  return (
    <>
      <header
        className={cn(
          "fixed left-0 right-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl",
          "md:left-[220px] md:px-6"
        )}
      >
        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={onMobileMenuClick}
          className="rounded-lg p-2 text-foreground hover:bg-secondary md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* ----- LEFT: title + breadcrumb ----- */}
        <div className="flex min-w-0 items-baseline gap-2">
          {breadcrumb && breadcrumb.length > 1 && (
            <span className="hidden text-[11px] uppercase tracking-wider text-muted-foreground md:inline">
              {breadcrumb.slice(0, -1).join(" › ")} ›
            </span>
          )}
          <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
            {title}
          </h1>
        </div>

        {/* ----- RIGHT: status + user + sign out ----- */}
        <div className="ml-auto flex items-center gap-3">
          <ConnectionDot className="hidden sm:inline-flex" />
          <NotificationBell />
          <div className="hidden items-center gap-2.5 sm:flex">
            <span className="text-sm font-medium text-foreground">
              {profile.full_name.split(" ")[0]}
            </span>
            <Avatar className="h-7 w-7 ring-2 ring-border">
              {profile.avatar_url ? (
                <AvatarImage src={profile.avatar_url} />
              ) : null}
              <AvatarFallback className="text-[10px]">
                {getInitials(profile.full_name)}
              </AvatarFallback>
            </Avatar>
          </div>
          <button
            type="button"
            onClick={() => setConfirmSignOut(true)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden md:inline">Sign out</span>
          </button>
        </div>
      </header>

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out?"
        description="You'll need to sign in again to continue using LinkD FMS."
        confirmLabel="Sign out"
        variant="default"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={handleSignOut}
      />
    </>
  );
}
