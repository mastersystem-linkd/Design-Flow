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
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  Card,
  CardContent,
} from "@/components/ui";
import { isAdmin as isAdminCheck, isAdminOrCoordinator } from "@/lib/permissions";
import { cn } from "@/lib/utils";

import { ConceptCategoriesTab } from "@/components/system/ConceptCategoriesTab";
import { FabricsTab } from "@/components/system/FabricsTab";
import { ClientManagementTab } from "@/components/system/ClientManagementTab";
import { DesignerCodesTab } from "@/components/system/DesignerCodesTab";
import { StorageTab } from "@/components/system/StorageTab";
import { AppInfoTab } from "@/components/system/AppInfoTab";
import { DangerZoneTab } from "@/components/system/DangerZoneTab";

// ============================================================================
// SystemView — Settings & Admin
// ============================================================================
//
// Tabbed admin hub. Left rail on desktop (w-56 column), horizontal scrollable
// pills on mobile (<md). Each tab renders an independently-developed component.
//
// Access:
//   - Page entry: isAdminOrCoordinator (admins + coordinators)
//   - Per-tab guards: each tab is gated further (e.g. lookup data + storage +
//     danger zone require admin, not coordinator)
//
// Default tab: "App Info" — read-only, safe landing. Direct destructive paths
// are buried inside the Danger Zone tab behind a double confirmation.

type TabId =
  | "app-info"
  | "concepts"
  | "fabrics"
  | "clients"
  | "designer-codes"
  | "storage"
  | "danger";

interface TabSpec {
  id: TabId;
  label: string;
  icon: typeof Info;
  /** Returns true when the user is allowed to see this tab. */
  canAccess: (role: "admin" | "design_coordinator" | "designer") => boolean;
  /** When true, the tab uses destructive coloring in the nav. */
  destructive?: boolean;
}

const TABS: TabSpec[] = [
  {
    id: "app-info",
    label: "App Info",
    icon: Info,
    canAccess: () => true, // anyone on the page; the page itself is gated
  },
  // Lookup tables — concept categories and fabrics, each with their own
  // search + filter rather than stacked in one tab.
  {
    id: "concepts",
    label: "Concept Categories",
    icon: Lightbulb,
    canAccess: (role) => role === "admin",
  },
  {
    id: "fabrics",
    label: "Fabrics",
    icon: Layers,
    canAccess: (role) => role === "admin",
  },
  {
    id: "clients",
    label: "Clients",
    icon: Building2,
    canAccess: (role) => role === "admin" || role === "design_coordinator",
  },
  {
    id: "designer-codes",
    label: "Designer Codes",
    icon: Tag,
    canAccess: (role) => role === "admin",
  },
  {
    id: "storage",
    label: "Storage",
    icon: HardDrive,
    canAccess: (role) => role === "admin",
  },
  {
    id: "danger",
    label: "Danger Zone",
    icon: AlertTriangle,
    canAccess: (role) => role === "admin",
    destructive: true,
  },
];

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

  return (
    <div className="space-y-4">
      {/* Page header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Settings &amp; Admin
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Manage lookup data, clients, designer codes, storage, and system
              maintenance.
            </p>
          </div>
        </div>
      </header>

      {/* Layout: vertical tab rail on desktop, horizontal pills on mobile */}
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

        {/* DESKTOP — vertical tab rail */}
        <aside className="hidden w-56 shrink-0 md:block">
          <Card>
            <CardContent className="p-1.5">
              <ul className="space-y-0.5">
                {visibleTabs.map((t) => (
                  <li key={t.id}>
                    <DesktopTabButton
                      spec={t}
                      active={active?.id === t.id}
                      onClick={() => setActiveId(t.id)}
                    />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
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

function renderTab(
  id: TabId,
  role: "admin" | "design_coordinator" | "designer"
) {
  // Defense-in-depth: re-verify role permissions per tab. This protects
  // against future bugs where the nav filter and the renderer drift apart.
  const adminOnly = (component: React.ReactNode) =>
    isAdminCheck(role) ? component : <AccessRestricted />;

  switch (id) {
    case "app-info":
      return <AppInfoTab />;
    case "concepts":
      return adminOnly(<ConceptCategoriesTab />);
    case "fabrics":
      return adminOnly(<FabricsTab />);
    case "clients":
      return <ClientManagementTab />;
    case "designer-codes":
      return adminOnly(<DesignerCodesTab />);
    case "storage":
      return adminOnly(<StorageTab />);
    case "danger":
      return adminOnly(<DangerZoneTab />);
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
        "flex w-full items-center gap-2 rounded-md border-l-2 px-3 py-2 text-left text-sm font-medium transition-colors",
        active
          ? spec.destructive
            ? "border-destructive bg-destructive/5 text-destructive"
            : "border-primary bg-primary/10 text-primary"
          : "border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
        spec.destructive && !active && "text-destructive/70 hover:text-destructive"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{spec.label}</span>
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
