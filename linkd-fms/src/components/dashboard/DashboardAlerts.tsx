import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Clock,
  Lightbulb,
  Inbox,
  ChevronDown,
  X,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { TaskWithRelations, UserRole } from "@/types/database";

interface AlertDef {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  to: string;
  border: string;
  bg: string;
  textColor: string;
  severity: number; // lower = more severe
}

export function DashboardAlerts({
  stats,
  tasks,
  role,
  isAdmin,
  myConceptsThisMonth,
}: {
  stats: {
    urgent: number;
    overdue: number;
    pendingConcepts: number;
    pool: number;
  };
  tasks: TaskWithRelations[];
  role: UserRole;
  isAdmin: boolean;
  myConceptsThisMonth: number;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);

  // Build alerts in severity order
  const alerts: AlertDef[] = [];

  if (stats.urgent > 0) {
    alerts.push({
      id: "urgent",
      icon: AlertTriangle,
      text: `${stats.urgent} urgent task${stats.urgent !== 1 ? "s" : ""} needing attention`,
      to: ROUTES.dashboard,
      border: "border-destructive/30",
      bg: "bg-destructive/5 hover:bg-destructive/10",
      textColor: "text-destructive",
      severity: 1,
    });
  }

  if (stats.overdue > 0) {
    alerts.push({
      id: "overdue",
      icon: Clock,
      text: `${stats.overdue} task${stats.overdue !== 1 ? "s are" : " is"} past deadline`,
      to: ROUTES.dashboard,
      border: "border-warning/30",
      bg: "bg-warning/5 hover:bg-warning/10",
      textColor: "text-warning",
      severity: 2,
    });
  }

  // Stale pool — pool tasks > 3 days old with no assignee
  if (isAdmin) {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const stalePool = tasks.filter(
      (t) =>
        t.status === "pool" &&
        !t.assigned_to &&
        new Date(t.created_at) < threeDaysAgo
    ).length;

    if (stalePool > 0) {
      alerts.push({
        id: "stale-pool",
        icon: Inbox,
        text: `${stalePool} task${stalePool !== 1 ? "s have" : " has"} been in the pool for over 3 days`,
        to: ROUTES.dashboard,
        border: "border-warning/30",
        bg: "bg-warning/5 hover:bg-warning/10",
        textColor: "text-warning",
        severity: 3,
      });
    }
  }

  if (isAdmin && stats.pendingConcepts > 0) {
    alerts.push({
      id: "pending-concepts",
      icon: Lightbulb,
      text: `${stats.pendingConcepts} concept${stats.pendingConcepts !== 1 ? "s" : ""} awaiting your review`,
      to: ROUTES.concepts,
      border: "border-primary/30",
      bg: "bg-primary/5 hover:bg-primary/10",
      textColor: "text-primary",
      severity: 4,
    });
  }

  // Designer monthly concept reminder
  if (role === "designer") {
    const dayOfMonth = new Date().getDate();
    const lastDay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const daysLeft = lastDay - dayOfMonth;

    if (dayOfMonth > 7 && myConceptsThisMonth < 3) {
      alerts.push({
        id: "concept-reminder",
        icon: Lightbulb,
        text: `You've submitted ${myConceptsThisMonth}/3 concepts this month — ${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining`,
        to: ROUTES.concepts,
        border: "border-primary/30",
        bg: "bg-primary/5 hover:bg-primary/10",
        textColor: "text-primary",
        severity: 5,
      });
    }
  }

  // Sort by severity, filter dismissed
  const visible = alerts
    .sort((a, b) => a.severity - b.severity)
    .filter((a) => !dismissed.has(a.id));

  if (visible.length === 0) return null;

  const shown = expanded ? visible : visible.slice(0, 2);
  const hiddenCount = visible.length - 2;

  return (
    <div className="space-y-2">
      {shown.map((alert) => (
        <div
          key={alert.id}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
            alert.border,
            alert.bg,
            alert.textColor
          )}
        >
          <alert.icon className="h-4 w-4 shrink-0" />
          <Link to={alert.to} className="flex-1 hover:underline">
            {alert.text}
          </Link>
          <button
            type="button"
            onClick={() =>
              setDismissed((prev) => new Set(prev).add(alert.id))
            }
            className="shrink-0 rounded p-0.5 opacity-50 transition-opacity hover:opacity-100"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className="h-3 w-3" />
          and {hiddenCount} more alert{hiddenCount !== 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}
