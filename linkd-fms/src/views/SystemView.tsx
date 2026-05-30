import { useState } from "react";
import {
  Lightbulb,
  Layers,
  Building2,
  Tag,
  HardDrive,
  Info,
  AlertTriangle,
  Shield,
  Settings,
  Palette,
  Paintbrush,
  Users,
  ListChecks,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types/database";
import {
  Card,
  CardContent,
} from "@/components/ui";
import { isAdmin as isAdminCheck, isAdminOrCoordinator } from "@/lib/permissions";
import { cn } from "@/lib/utils";

import { ConceptCategoriesTab } from "@/components/system/ConceptCategoriesTab";
import { FabricsTab } from "@/components/system/FabricsTab";
import { DropdownsTab } from "@/components/system/DropdownsTab";
import { ClientManagementTab } from "@/components/system/ClientManagementTab";
import { DesignerCodesTab } from "@/components/system/DesignerCodesTab";
import { StorageTab } from "@/components/system/StorageTab";
import { AppInfoTab } from "@/components/system/AppInfoTab";
import { AppearanceTab } from "@/components/system/AppearanceTab";
import { DangerZoneTab } from "@/components/system/DangerZoneTab";
import { TeamView } from "@/views/TeamView";

// ============================================================================
// SystemView — Settings & Admin
// ============================================================================
//
// Tabbed admin hub. Left rail on desktop (w-56 column), horizontal scrollable
// pills on mobile (<md). Each tab renders an independently-developed component.
//
// Access:
//   - Page entry: isAdminOrCoordinator (admins + coordinators)
//   - Per-tab guards: each tab is gated further. Lookup data (Concept
//     Categories / Fabrics / Dropdowns / Party Name) is admin + coordinator.
//     Danger Zone is also admin + coordinator — the two-step confirmation in
//     DangerZoneTab is the actual safety net, and coordinators run the same
//     hygiene operations admins do. Storage + Designer Codes stay admin-only
//     (bucket-level + identity-mapping concerns).
//
// Default tab: "App Info" — read-only, safe landing. Direct destructive paths
// are buried inside the Danger Zone tab behind a double confirmation.

type TabId =
  | "app-info"
  | "appearance"
  | "team"
  | "concepts"
  | "fabrics"
  | "dropdowns"
  | "clients"
  | "designer-codes"
  | "storage"
  | "danger";

interface TabSpec {
  id: TabId;
  label: string;
  icon: typeof Info;
  desc: string;
  group: "general" | "data" | "system";
  canAccess: (role: UserRole) => boolean;
  destructive?: boolean;
}

const TABS: TabSpec[] = [
  {
    id: "app-info",
    label: "App Info",
    icon: Info,
    desc: "System overview & environment",
    group: "general",
    canAccess: () => true,
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: Paintbrush,
    desc: "Theme & display preferences",
    group: "general",
    canAccess: () => true,
  },
  {
    id: "team",
    label: "Team Management",
    icon: Users,
    desc: "Users, roles & designer codes",
    group: "general",
    canAccess: (role) => role === "admin" || role === "design_coordinator",
  },
  {
    id: "concepts",
    label: "Concept Categories",
    icon: Lightbulb,
    desc: "Design style lookup data",
    group: "data",
    canAccess: (role) => isAdminOrCoordinator(role),
  },
  {
    id: "fabrics",
    label: "Fabrics",
    icon: Layers,
    desc: "Fabric type lookup data",
    group: "data",
    canAccess: (role) => isAdminOrCoordinator(role),
  },
  {
    id: "dropdowns",
    label: "Dropdowns",
    icon: ListChecks,
    desc: "Assigned By (per form) + Full Knitting's Received By",
    group: "data",
    canAccess: (role) => isAdminOrCoordinator(role),
  },
  {
    id: "clients",
    label: "Party Name",
    icon: Building2,
    desc: "Party names & dedup merge",
    group: "data",
    canAccess: (role) => role === "admin" || role === "design_coordinator",
  },
  {
    id: "designer-codes",
    label: "Designer Codes",
    icon: Tag,
    desc: "Unique code letters for designers",
    group: "data",
    canAccess: (role) => role === "admin",
  },
  {
    id: "storage",
    label: "Storage",
    icon: HardDrive,
    desc: "Bucket usage & file monitoring",
    group: "system",
    canAccess: (role) => role === "admin",
  },
  {
    id: "danger",
    label: "Danger Zone",
    icon: AlertTriangle,
    desc: "Permanent data deletion",
    group: "system",
    // Coordinators run the same data-hygiene operations admins do
    // (year-end resets, clearing test data, etc.) so they need the
    // Danger Zone tab too. The two-step confirmation in DangerZoneTab
    // is the real safety net, not the role gate. Supabase RLS on the
    // affected tables already permits is_admin_or_coordinator() to
    // delete, so the destructive calls succeed under either role.
    canAccess: (role) => role === "admin" || role === "design_coordinator",
    destructive: true,
  },
];

const GROUP_LABELS: Record<TabSpec["group"], string> = {
  general: "General",
  data: "Data Management",
  system: "System",
};

export function SystemView() {
  const { profile } = useAuth();
  const role = profile?.role ?? "designer";
  const [activeId, setActiveId] = useState<TabId>("app-info");

  // Page-level gate — coordinators get in, designers don't.
  if (!isAdminOrCoordinator(role)) {
    return (
      <div className="mx-auto max-w-lg py-20">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8">
            <Shield className="h-10 w-10 text-destructive" />
            <p className="text-sm font-medium text-foreground">Admin Only</p>
            <p className="text-xs text-muted-foreground">
              The Settings &amp; Admin page is restricted.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const visibleTabs = TABS.filter((t) => t.canAccess(role));
  const active =
    visibleTabs.find((t) => t.id === activeId) ?? visibleTabs[0];

  const groups = (["general", "data", "system"] as const).map((g) => ({
    key: g,
    label: GROUP_LABELS[g],
    tabs: visibleTabs.filter((t) => t.group === g),
  })).filter((g) => g.tabs.length > 0);

  return (
    <div className="space-y-4">
      {/* ── Settings Banner — consistent with Design Studio style ── */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-r from-primary/5 via-card to-card">
        <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary via-success to-warning" />
        <svg
          className="absolute right-0 top-0 h-full w-40 opacity-[0.03]"
          viewBox="0 0 160 80"
          aria-hidden="true"
        >
          {Array.from({ length: 20 }).map((_, i) => (
            <line key={`h${i}`} x1="0" y1={i * 4} x2="160" y2={i * 4} stroke="currentColor" strokeWidth="1" />
          ))}
          {Array.from({ length: 40 }).map((_, i) => (
            <line key={`v${i}`} x1={i * 4} y1="0" x2={i * 4} y2="80" stroke="currentColor" strokeWidth="0.5" />
          ))}
        </svg>
        <div className="relative flex items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Settings className="h-[18px] w-[18px] text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Settings &amp; Admin</p>
              <p className="text-[11px] text-muted-foreground">
                Manage data, system configuration &amp; maintenance
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-1 sm:flex" title="Design studio">
            <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-sm" />
            <span className="h-2.5 w-2.5 rounded-full bg-success shadow-sm" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning shadow-sm" />
            <span className="h-2.5 w-2.5 rounded-full bg-destructive shadow-sm" />
          </div>
        </div>
      </div>

      {/* Layout */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        {/* MOBILE — horizontal scrollable pill bar */}
        <nav
          aria-label="Admin sections"
          className="-mx-1 flex shrink-0 gap-1.5 overflow-x-auto px-1 pb-1 md:hidden"
        >
          {visibleTabs.map((t) => (
            <MobilePill
              key={t.id}
              spec={t}
              active={active?.id === t.id}
              onClick={() => setActiveId(t.id)}
            />
          ))}
        </nav>

        {/* DESKTOP — grouped vertical nav */}
        <aside className="hidden w-52 shrink-0 space-y-5 md:block">
          {groups.map((g) => (
            <div key={g.key}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.label}
              </p>
              <ul className="space-y-0.5">
                {g.tabs.map((t) => (
                  <li key={t.id}>
                    <DesktopTabButton
                      spec={t}
                      active={active?.id === t.id}
                      onClick={() => setActiveId(t.id)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        {/* CONTENT */}
        <main className="min-w-0 flex-1">
          {active ? renderTab(active.id, role) : null}
        </main>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Tab content router. Per-tab access already filtered at the nav level — but
// we double-check at render time in case the user navigates manually somehow.
// ----------------------------------------------------------------------------

function renderTab(id: TabId, role: UserRole) {
  // Defense-in-depth: re-verify role permissions per tab. This protects
  // against future bugs where the nav filter and the renderer drift apart.
  const adminOnly = (component: React.ReactNode) =>
    isAdminCheck(role) ? component : <AccessRestricted />;
  // Lookup data (concepts / fabrics / assigned-by) is managed by admins AND
  // design coordinators.
  const coordOk = (component: React.ReactNode) =>
    isAdminOrCoordinator(role) ? component : <AccessRestricted />;

  switch (id) {
    case "app-info":
      return <AppInfoTab />;
    case "appearance":
      return <AppearanceTab />;
    case "team":
      return <TeamView />;
    case "concepts":
      return coordOk(<ConceptCategoriesTab />);
    case "fabrics":
      return coordOk(<FabricsTab />);
    case "dropdowns":
      return coordOk(<DropdownsTab />);
    case "clients":
      return <ClientManagementTab />;
    case "designer-codes":
      return adminOnly(<DesignerCodesTab />);
    case "storage":
      return adminOnly(<StorageTab />);
    case "danger":
      return coordOk(<DangerZoneTab />);
    default:
      return null;
  }
}

function AccessRestricted() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <Shield className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          This section is admin-only
        </p>
        <p className="text-xs text-muted-foreground">
          Coordinators can access most settings — this one requires the admin
          role.
        </p>
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Desktop tab button — sits in the left rail
// ----------------------------------------------------------------------------

function DesktopTabButton({
  spec,
  active,
  onClick,
}: {
  spec: TabSpec;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = spec.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all",
        active
          ? spec.destructive
            ? "bg-destructive/10 text-destructive"
            : "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
        spec.destructive && !active && "text-destructive/70 hover:text-destructive"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate text-[13px] font-medium">{spec.label}</span>
    </button>
  );
}

// ----------------------------------------------------------------------------
// Mobile pill — horizontal scroll
// ----------------------------------------------------------------------------

function MobilePill({
  spec,
  active,
  onClick,
}: {
  spec: TabSpec;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = spec.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? spec.destructive
            ? "border-destructive bg-destructive/10 text-destructive"
            : "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
        spec.destructive && !active && "text-destructive/70"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {spec.label}
    </button>
  );
}
