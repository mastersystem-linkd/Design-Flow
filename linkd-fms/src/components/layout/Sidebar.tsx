import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  LayoutGrid,
  PlusSquare,
  Lightbulb,
  BarChart3,
  ClipboardList,
  Factory,
  Layers,
  Users,
  Bell,
  Settings,
  LogOut,
  ChevronUp,
  Trophy,
  FolderOpen,
  User as UserIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
} from "@/components/ui/avatar";
import { ROUTES, roleHomePath } from "@/lib/routes";
import { ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Profile, UserRole } from "@/types/database";

// ============================================================================
// Nav config (per-role, in the order the spec lists them)
// ============================================================================

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

function getNavGroups(role: UserRole): NavGroup[] {
  switch (role) {
    case "designer":
      return [
        {
          items: [
            { to: ROUTES.taskDashboard, label: "Dashboards", icon: ClipboardList },
            { to: ROUTES.dashboard, label: "My Board", icon: LayoutGrid },
            { to: ROUTES.concepts, label: "Concepts", icon: Lightbulb },
            { to: ROUTES.files, label: "Files", icon: FolderOpen },
          ],
        },
      ];
    case "admin":
      return [
        {
          items: [
            { to: ROUTES.taskDashboard, label: "Dashboards", icon: ClipboardList },
            { to: ROUTES.dashboard, label: "All Tasks", icon: LayoutGrid },
            { to: ROUTES.concepts, label: "Concepts", icon: Lightbulb },
          ],
        },
        {
          label: "Manage",
          items: [
            { to: ROUTES.sampling, label: "Sampling", icon: Factory },
            { to: ROUTES.salvedge, label: "Salvedge", icon: Layers },
            { to: ROUTES.files, label: "Files", icon: FolderOpen },
            { to: ROUTES.team, label: "Team", icon: Users },
            { to: ROUTES.scorecards, label: "Scorecards", icon: Trophy },
            { to: ROUTES.system, label: "Settings", icon: Settings },
          ],
        },
      ];
    case "design_coordinator":
      return [
        {
          items: [
            { to: ROUTES.taskDashboard, label: "Dashboards", icon: ClipboardList },
            { to: ROUTES.dashboard, label: "All Tasks", icon: LayoutGrid },
            { to: ROUTES.concepts, label: "Concepts", icon: Lightbulb },
          ],
        },
        {
          label: "Manage",
          items: [
            { to: ROUTES.sampling, label: "Sampling", icon: Factory },
            { to: ROUTES.salvedge, label: "Salvedge", icon: Layers },
            { to: ROUTES.files, label: "Files", icon: FolderOpen },
            { to: ROUTES.team, label: "Team", icon: Users },
            { to: ROUTES.system, label: "Settings", icon: Settings },
          ],
        },
      ];
    case "deo":
      // DEO sees ONLY the kitting queue + notifications. Per spec they have
      // a restricted dashboard: view assigned kitting tasks, input data into
      // the digital form. No access to tasks, concepts, files, team, etc.
      return [
        {
          items: [
            { to: ROUTES.kitting, label: "Knitting Queue", icon: ClipboardList },
          ],
        },
      ];
  }
}

/** Background tint for the avatar inside the sidebar. */
const ROLE_AVATAR_CLASS: Record<UserRole, string> = {
  admin: "bg-primary text-white",
  design_coordinator: "bg-primary/20 text-primary",
  designer: "bg-white/20 text-white",
  deo: "bg-warning/30 text-foreground",
};

// ============================================================================
// Sidebar
// ============================================================================

export interface SidebarProps {
  profile: Profile;
  mobileOpen: boolean;
  onClose: () => void;
  notificationCount?: number;
}

export function Sidebar({
  profile,
  mobileOpen,
  onClose,
  notificationCount = 0,
}: SidebarProps) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const groups = getNavGroups(profile.role);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  async function performSignOut() {
    await signOut();
    setConfirmSignOut(false);
    navigate(ROUTES.login, { replace: true });
  }

  function handleLogoClick() {
    onClose();
    navigate(roleHomePath(profile.role));
  }

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
        aria-hidden
      />

      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen w-[220px] max-w-[80vw] flex-col bg-sidebar text-white transition-transform duration-200",
          "md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Primary navigation"
      >
        {/* ============ Brand ============ */}
        <button
          type="button"
          onClick={handleLogoClick}
          className="flex w-full flex-col items-start gap-1.5 border-b border-white/[0.06] px-4 py-4 text-left transition-colors hover:bg-white/5 focus:outline-none focus-visible:bg-white/10"
          aria-label="Go to home"
        >
          {/* LinkD wordmark — capped at 120px wide (was 170px). Sits
               directly on the dark sidebar; the source PNG is transparent
               so no halo. The smaller size also gives the subtitle room
               to sit tighter underneath without crowding. */}
          <img
            src="/logo.png"
            alt="LinkD"
            className="block h-auto w-[100px] max-w-full"
            draggable={false}
          />
          {/* Subtitle — 12px bold full-white, single line. Trimmed 1pt
               from the prior 13px so it visually balances the smaller
               wordmark above. */}
          <span className="pl-0.5 text-[12px] font-bold uppercase tracking-[0.08em] text-white whitespace-nowrap">
            Design Flow System
          </span>
        </button>

        {/* ============ Nav groups ============ */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {groups.map((group, i) => (
            <div key={i}>
              {i > 0 && (
                <div className="my-2 h-px bg-white/[0.06]" aria-hidden />
              )}
              {group.label && (
                <p className="mb-1.5 mt-1 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/30">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <NavRow key={item.to} item={item} onNavigate={onClose} />
                ))}
              </ul>
            </div>
          ))}

          {/* Notifications — always present */}
          <div className="my-2 h-px bg-white/[0.06]" aria-hidden />
          <ul>
            <NavRow
              item={{
                to: ROUTES.notifications,
                label: "Notifications",
                icon: Bell,
                count: notificationCount,
              }}
              onNavigate={onClose}
            />
          </ul>
        </nav>

        {/* ============ Theme toggle ============ */}
        <div className="px-3 pb-1">
          <ThemeToggle className="w-full justify-start text-white/50 hover:text-white" />
        </div>

        {/* ============ User profile block ============ */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-3 border-t border-white/[0.06] px-4 py-3 text-left transition-colors hover:bg-white/5 focus:outline-none focus-visible:bg-white/10"
              aria-label={`Account menu for ${profile.full_name}`}
            >
              <Avatar className="h-8 w-8">
                {profile.avatar_url ? (
                  <AvatarImage src={profile.avatar_url} />
                ) : null}
                <AvatarFallback
                  className={cn("text-[10px]", ROLE_AVATAR_CLASS[profile.role])}
                >
                  {getInitials(profile.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-medium text-white">
                  {profile.full_name}
                </div>
                <div className="truncate text-[10px] text-white/40">
                  {ROLE_LABELS[profile.role]}
                </div>
              </div>
              <ChevronUp className="h-3.5 w-3.5 shrink-0 text-white/30" aria-hidden />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              side="top"
              align="end"
              sideOffset={8}
              className="z-50 min-w-[180px] rounded-lg border border-border bg-card py-1 shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0"
            >
              <DropdownMenu.Item
                onSelect={() => {
                  onClose();
                  navigate(ROUTES.profile);
                }}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-foreground outline-none transition-colors data-[highlighted]:bg-secondary"
              >
                <UserIcon className="h-4 w-4" />
                Profile
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  setConfirmSignOut(true);
                }}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-foreground outline-none transition-colors data-[highlighted]:bg-secondary"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </aside>

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out?"
        description="You'll need to sign in again to continue using LinkD FMS."
        confirmLabel="Sign out"
        variant="default"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={performSignOut}
      />
    </>
  );
}

// ============================================================================
// Single nav row
// ============================================================================

function NavRow({
  item,
  onNavigate,
  isComingSoon,
}: {
  item: NavItem;
  onNavigate: () => void;
  isComingSoon?: boolean;
}) {
  const Icon = item.icon;
  return (
    <li>
      <NavLink
        to={item.to}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            "relative flex min-h-[40px] items-center gap-3 rounded-lg pl-4 pr-3 py-2.5 text-[13px] font-medium transition-all duration-150",
            isActive
              ? "bg-[rgba(129,140,248,0.15)] text-[#A5B4FC] before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[2px] before:-translate-y-1/2 before:rounded-r-full before:bg-[#6366F1]"
              : "text-white/60 hover:bg-white/[0.07] hover:text-white",
            isComingSoon && "pointer-events-none opacity-40"
          )
        }
        aria-disabled={isComingSoon || undefined}
        title={isComingSoon ? "Coming soon" : undefined}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
        {!!item.count && item.count > 0 && (
          <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-destructive-foreground">
            {item.count > 99 ? "99+" : item.count}
          </span>
        )}
      </NavLink>
    </li>
  );
}
