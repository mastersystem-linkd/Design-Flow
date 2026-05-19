import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertOctagon, Zap, Clock, ArrowUpRight } from "lucide-react";
import {
  Card,
  CardContent,
  Badge,
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
  EmptyState,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { differenceInDays, parseISO, format } from "date-fns";
import { STATUS_LABELS } from "@/lib/constants";
import { ROUTES } from "@/lib/routes";
import type { TaskWithRelations } from "@/types/database";

type TabKey = "overdue" | "urgent";

interface Props {
  tasks: TaskWithRelations[];
}

/**
 * AtRiskTasks
 * -------------------------------------------------------------------------
 * Compact "what needs attention now" panel. Tabs between overdue items
 * (past planned_deadline + not done) and urgent items (priority='urgent'
 * + not done). Sorted by oldest / most-overdue first.
 */
export function AtRiskTasks({ tasks }: Props) {
  const [tab, setTab] = useState<TabKey>("overdue");

  const overdue = useMemo(() => {
    const now = new Date();
    return tasks
      .filter(
        (t) =>
          t.status !== "done" &&
          t.planned_deadline &&
          new Date(t.planned_deadline) < now
      )
      .map((t) => ({
        task: t,
        daysLate: Math.abs(
          differenceInDays(parseISO(t.planned_deadline!), now)
        ),
      }))
      .sort((a, b) => b.daysLate - a.daysLate)
      .slice(0, 8);
  }, [tasks]);

  const urgent = useMemo(() => {
    return tasks
      .filter((t) => t.priority === "urgent" && t.status !== "done")
      .map((t) => ({
        task: t,
        ageDays: differenceInDays(new Date(), parseISO(t.created_at)),
      }))
      .sort((a, b) => b.ageDays - a.ageDays)
      .slice(0, 8);
  }, [tasks]);

  const overdueCount = overdue.length;
  const urgentCount = urgent.length;

  return (
    <Card>
      <CardContent className="py-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertOctagon className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-semibold text-foreground">
              Needs Attention
            </h3>
          </div>
          <div className="inline-flex rounded-lg bg-secondary p-1">
            <TabBtn
              active={tab === "overdue"}
              onClick={() => setTab("overdue")}
              label="Overdue"
              count={overdueCount}
              tone="warning"
            />
            <TabBtn
              active={tab === "urgent"}
              onClick={() => setTab("urgent")}
              label="Urgent"
              count={urgentCount}
              tone="destructive"
            />
          </div>
        </div>

        {tab === "overdue" ? (
          overdue.length === 0 ? (
            <EmptyState
              icon={<Clock className="h-8 w-8" />}
              title="Nothing overdue"
              description="Every active task is within its deadline."
            />
          ) : (
            <ul className="space-y-2">
              {overdue.map(({ task, daysLate }) => (
                <RiskRow key={task.id} task={task} subValue={`${daysLate}d late`} subTone="destructive" />
              ))}
            </ul>
          )
        ) : urgent.length === 0 ? (
          <EmptyState
            icon={<Zap className="h-8 w-8" />}
            title="No urgent backlog"
            description="No urgent priority tasks waiting."
          />
        ) : (
          <ul className="space-y-2">
            {urgent.map(({ task, ageDays }) => (
              <RiskRow key={task.id} task={task} subValue={`${ageDays}d old`} subTone="warning" />
            ))}
          </ul>
        )}

        {/* See all link */}
        {(overdueCount > 8 || urgentCount > 8) && (
          <Link
            to={ROUTES.dashboard}
            className="mt-3 flex items-center justify-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View all in dashboard
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function TabBtn({
  active,
  onClick,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone: "warning" | "destructive";
}) {
  const toneActive: Record<typeof tone, string> = {
    warning: "bg-warning text-white",
    destructive: "bg-destructive text-white",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
        active
          ? toneActive[tone]
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[10px] font-bold tabular-nums",
          active ? "bg-white/25" : "bg-secondary/80"
        )}
      >
        {count}
      </span>
    </button>
  );
}

function RiskRow({
  task,
  subValue,
  subTone,
}: {
  task: TaskWithRelations;
  subValue: string;
  subTone: "warning" | "destructive";
}) {
  const toneClass: Record<typeof subTone, string> = {
    warning: "bg-warning/15 text-warning border-warning/30",
    destructive: "bg-destructive/15 text-destructive border-destructive/30",
  };

  return (
    <li className="group flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 transition-all hover:border-primary/30 hover:bg-primary/[0.03]">
      <Avatar className="h-7 w-7 shrink-0">
        {task.assignee?.avatar_url ? (
          <AvatarImage src={task.assignee.avatar_url} />
        ) : null}
        <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
          {task.assignee ? getInitials(task.assignee.full_name) : "—"}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">
          {task.concept || task.task_code}
        </p>
        <p className="truncate text-[10px] text-muted-foreground">
          {task.task_code} · {task.client?.party_name ?? "—"} ·{" "}
          {STATUS_LABELS[task.status as keyof typeof STATUS_LABELS] ?? task.status}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <Badge className={cn("text-[10px] border", toneClass[subTone])}>
          {subValue}
        </Badge>
        {task.planned_deadline && (
          <p className="mt-0.5 text-[9px] text-muted-foreground">
            due {format(parseISO(task.planned_deadline), "MMM d")}
          </p>
        )}
      </div>
    </li>
  );
}
