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
  Bell,
  Settings,
  LogOut,
  ChevronUp,
  Trophy,
  FolderOpen,
  ShoppingCart,
  User as UserIcon,
  PanelLeftClose,
  PanelLeftOpen,
  ListTodo,
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
            { to: ROUTES.salvedge, label: "Salvedge", icon: Layers },
            { to: ROUTES.files, label: "Files", icon: FolderOpen },
          ],
        },
      ];
    case "super_admin":
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
            { to: ROUTES.orders, label: "Orders", icon: ShoppingCart },
            { to: ROUTES.sampling, label: "Sampling", icon: Factory },
            { to: ROUTES.salvedge, label: "Salvedge", icon: Layers },
            { to: ROUTES.coordinatorTasks, label: "Coordinator", icon: ListTodo },
            { to: ROUTES.files, label: "Files", icon: FolderOpen },
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
            { to: ROUTES.orders, label: "Orders", icon: ShoppingCart },
            { to: ROUTES.sampling, label: "Sampling", icon: Factory },
            { to: ROUTES.salvedge, label: "Salvedge", icon: Layers },
            { to: ROUTES.coordinatorTasks, label: "My Tasks", icon: ListTodo },
            { to: ROUTES.files, label: "Files", icon: FolderOpen },
            { to: ROUTES.scorecards, label: "Scorecards", icon: Trophy },
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
  super_admin: "bg-primary text-primary-foreground",
  admin: "bg-primary text-primary-foreground",
  design_coordinator: "bg-primary/20 text-primary",
  designer: "bg-primary/10 text-primary",
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
  /** Desktop: pinned-collapsed (slim icon rail) when true. */
  collapsed?: boolean;
  /** Toggle the pinned collapse state. */
  onToggleCollapsed?: () => void;
}

export function Sidebar({
  profile,
  mobileOpen,
  onClose,
  notificationCount = 0,
  collapsed = false,
  onToggleCollapsed,
}: SidebarProps) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const groups = getNavGroups(profile.role);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  // Desktop hover-to-peek: when pinned-collapsed, hovering temporarily expands
  // the rail (as an overlay) so the user can switch menus.
  const [hovered, setHovered] = useState(false);
  // "Show as a slim icon rail" (desktop only) — collapsed AND not peeking.
  const railed = collapsed && !hovered;

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
          "fixed inset-0 z-30 bg-foreground/50 backdrop-blur-md transition-opacity md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
        aria-hidden
      />

      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen w-[220px] max-w-[80vw] flex-col border-r border-border bg-card text-foreground transition-[transform,width] duration-slow ease-spring dark:bg-sidebar dark:text-white",
          "md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed
            ? railed
              ? "md:w-16"
              : "md:w-[220px] md:shadow-card-elevated"
            : "md:w-[220px]"
        )}
        aria-label="Primary navigation"
      >
        {/* ============ Brand ============ */}
        <button
          type="button"
          onClick={handleLogoClick}
          className={cn(
            "flex w-full items-start gap-1.5 border-b border-border px-4 py-4 text-left transition-colors duration-200 hover:bg-foreground/5 focus:outline-none",
            railed && "md:items-center md:justify-center md:px-0"
          )}
          aria-label="Go to home"
        >
          {/* Railed brand mark (desktop, collapsed) — compact "LD" tile. */}
          <span
            className={cn(
              "hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-extrabold tracking-tight text-primary",
              railed && "md:flex"
            )}
            aria-hidden
          >
            LD
          </span>
          {/* Full wordmark + subtitle (hidden on the slim rail). */}
          <span
            className={cn(
              "flex flex-col items-start gap-1.5",
              railed && "md:hidden"
            )}
          >
            <img
              src="/logo.png"
              alt="LinkD"
              className="block h-auto w-[100px] max-w-full"
              draggable={false}
            />
            <span className="pl-0.5 text-[12px] font-bold uppercase tracking-[0.08em] text-foreground whitespace-nowrap">
              Design Flow System
            </span>
          </span>
        </button>

        {/* ============ Collapse / pin toggle (desktop only) ============ */}
        {onToggleCollapsed && (
          <div className="hidden px-3 pt-2 md:block">
            <button
              type="button"
              onClick={onToggleCollapsed}
              title={collapsed ? "Pin sidebar open" : "Collapse sidebar"}
              aria-label={collapsed ? "Pin sidebar open" : "Collapse sidebar"}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg pl-4 pr-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground",
                railed && "md:justify-center md:px-0"
              )}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" />
              ) : (
                <PanelLeftClose className="h-[18px] w-[18px] shrink-0" />
              )}
              <span className={cn("flex-1 truncate text-left", railed && "md:hidden")}>
                {collapsed ? "Pin open" : "Collapse"}
              </span>
            </button>
          </div>
        )}

        {/* ============ Nav groups ============ */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {groups.map((group, i) => (
            <div key={i}>
              {i > 0 && (
                <div className="my-2 h-px bg-border" aria-hidden />
              )}
              {group.label && (
                <p
                  className={cn(
                    "mb-1.5 mt-1 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60",
                    railed && "md:hidden"
                  )}
                >
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <NavRow
                    key={item.to}
                    item={item}
                    onNavigate={onClose}
                    collapsed={railed}
                  />
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
              collapsed={railed}
            />
          </ul>
        </nav>

        {/* ============ Theme toggle ============ */}
        <div className="px-3 pb-1">
          <ThemeToggle
            className={cn(
              "w-full justify-start text-muted-foreground hover:text-foreground",
              railed && "md:justify-center"
            )}
            labelClassName={cn(railed && "md:hidden")}
          />
        </div>

        {/* ============ User profile block ============ */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-3 border-t border-border px-4 py-3 text-left transition-colors duration-200 hover:bg-foreground/5 focus:outline-none",
                railed && "md:justify-center md:px-0"
              )}
              aria-label={`Account menu for ${profile.full_name}`}
              title={railed ? profile.full_name : undefined}
            >
              <Avatar className="h-8 w-8 shrink-0">
                {profile.avatar_url ? (
                  <AvatarImage src={profile.avatar_url} />
                ) : null}
                <AvatarFallback
                  className={cn("text-[10px]", ROLE_AVATAR_CLASS[profile.role])}
                >
                  {getInitials(profile.full_name)}
                </AvatarFallback>
              </Avatar>
              <div
                className={cn(
                  "min-w-0 flex-1 leading-tight",
                  railed && "md:hidden"
                )}
              >
                <div className="truncate text-sm font-medium text-foreground">
                  {profile.full_name}
                </div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {ROLE_LABELS[profile.role]}
                </div>
              </div>
              <ChevronUp
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground",
                  railed && "md:hidden"
                )}
                aria-hidden
              />
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
        description="You'll need to sign in again to continue using Design Flow."
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
  collapsed,
}: {
  item: NavItem;
  onNavigate: () => void;
  isComingSoon?: boolean;
  /** Slim icon-rail mode (desktop, collapsed): hide label, center icon. */
  collapsed?: boolean;
}) {
  const Icon = item.icon;
  const hasCount = !!item.count && item.count > 0;
  return (
    <li>
      <NavLink
        to={item.to}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            "relative flex min-h-[40px] items-center gap-3 rounded-lg pl-4 pr-3 py-2.5 text-[13px] font-medium transition-[colors,background-color,transform] duration-normal ease-spring",
            isActive
              ? "nav-selvedge-active"
              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
            collapsed && "md:justify-center md:px-0",
            isComingSoon && "pointer-events-none opacity-40"
          )
        }
        aria-disabled={isComingSoon || undefined}
        title={isComingSoon ? "Coming soon" : collapsed ? item.label : undefined}
      >
        <span className="relative shrink-0">
          <Icon className="h-[18px] w-[18px]" />
          {/* On the slim rail, a count shows as a small dot on the icon. */}
          {hasCount && collapsed && (
            <span className="absolute -right-1 -top-1 hidden h-2 w-2 rounded-full bg-destructive ring-2 ring-card dark:ring-sidebar md:block" />
          )}
        </span>
        <span className={cn("flex-1 truncate", collapsed && "md:hidden")}>
          {item.label}
        </span>
        {hasCount && (
          <span
            className={cn(
              "rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-white",
              collapsed && "md:hidden"
            )}
          >
            {item.count! > 99 ? "99+" : item.count}
          </span>
        )}
      </NavLink>
    </li>
  );
}
