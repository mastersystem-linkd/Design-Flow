import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import type { Profile } from "@/types/database";

// ============================================================================
// TopNav — thin utility bar (status · notifications · account). The page title
// is intentionally NOT shown here: every page renders its own in-content
// heading, so a topnav title would just repeat it and waste space.
// ============================================================================

const GREETING_GRADIENTS: Record<string, string> = {
  morning: "linear-gradient(90deg, rgb(var(--warning)), rgb(var(--primary)))",
  afternoon: "linear-gradient(90deg, rgb(var(--primary)), rgb(var(--primary) / 0.6))",
  evening: "linear-gradient(90deg, rgb(var(--primary)), rgb(var(--warning)))",
  night: "linear-gradient(90deg, rgb(var(--primary) / 0.55), rgb(var(--primary) / 0.35))",
};

export interface TopNavProps {
  profile: Profile;
  onMobileMenuClick: () => void;
  /** Pinned-collapsed state of the desktop sidebar. Controls how far in from
   *  the left the topnav starts so it reflows when the sidebar is collapsed. */
  collapsed?: boolean;
}

export function TopNav({ profile, onMobileMenuClick, collapsed = false }: TopNavProps) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 4);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const now = new Date();
  const hour = now.getHours();
  const timeBand =
    hour < 5 ? "night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";
  const greeting =
    timeBand === "night" ? "Good night" : timeBand === "morning" ? "Good morning" : timeBand === "afternoon" ? "Good afternoon" : "Good evening";
  const greetingGradient = GREETING_GRADIENTS[timeBand];
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  async function handleSignOut() {
    await signOut();
    setConfirmSignOut(false);
    navigate(ROUTES.login, { replace: true });
  }

  return (
    <>
      <header
        className={cn(
          "topnav topnav-glass fixed left-0 right-0 top-0 z-30 flex h-14 items-center gap-4 border-b px-4 transition-[left,background-color,box-shadow] duration-normal ease-spring md:px-6",
          collapsed ? "md:left-[64px]" : "md:left-[220px]",
          scrolled && "topnav-scrolled"
        )}
        style={{ borderColor: "var(--border-default)" }}
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

        {/* ----- LEFT: greeting + date (anchors the bar) ----- */}
        <div className="flex min-w-0 flex-col justify-center leading-tight">
          <span className="truncate text-sm font-semibold text-foreground">
            <span
              className="greeting-gradient"
              style={{ backgroundImage: greetingGradient }}
            >
              {greeting}
            </span>
            , {profile.full_name.split(" ")[0]}
          </span>
          <span className="hidden truncate text-xs text-muted-foreground sm:block">
            {dateLabel}
          </span>
        </div>

        {/* ----- RIGHT: status + user + sign out ----- */}
        <div className="ml-auto flex items-center gap-3.5">
          <ConnectionDot className="hidden sm:inline-flex" />
          <NotificationBell />
          <Avatar className="hidden h-7 w-7 ring-2 ring-border sm:inline-flex">
            {profile.avatar_url ? <AvatarImage src={profile.avatar_url} /> : null}
            <AvatarFallback className="text-[10px]">
              {getInitials(profile.full_name)}
            </AvatarFallback>
          </Avatar>
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
