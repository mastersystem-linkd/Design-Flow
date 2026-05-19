import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowRight,
  LayoutGrid,
} from "lucide-react";
import {
  Card,
  CardContent,
  Badge,
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
} from "@/components/ui";
import { STATUS_LABELS, STATUS_COLORS, COLUMN_DOT, PRIORITY_COLORS } from "@/lib/constants";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { TaskWithRelations, TaskStatus, UserRole } from "@/types/database";

// ============================================================================
// Action verb mapping
// ============================================================================

const ACTION_VERBS: Record<TaskStatus, string> = {
  pool: "created",
  todo: "claimed",
  in_progress: "started working on",
  full_kitting: "submitted for review",
  approved: "approved",
  sampling: "sent to sampling",
  done: "completed",
};

// ============================================================================
// Component
// ============================================================================

export function DashboardTimeline({
  tasks,
  role,
  userId,
}: {
  tasks: TaskWithRelations[];
  role: UserRole;
  userId: string | undefined;
}) {
  // Filter: designers see only their tasks, admin sees all
  const filtered =
    role === "designer" && userId
      ? tasks.filter((t) => t.assigned_to === userId)
      : tasks;

  // Sort by updated_at DESC, take last 10
  const feed = [...filtered]
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
    .slice(0, 10);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">
          Recent Activity
        </h2>
        <Link
          to={ROUTES.dashboard}
          className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          View all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-3">
        {feed.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <LayoutGrid className="h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                No tasks yet. Create a brief to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-xl border border-border bg-card divide-y divide-border/50">
            {feed.map((task) => (
              <TimelineEvent key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Single timeline event
// ============================================================================

function TimelineEvent({ task }: { task: TaskWithRelations }) {
  const actor = task.assignee ?? task.creator;
  const actorName = actor?.full_name ?? "Someone";
  const verb = ACTION_VERBS[task.status] ?? "updated";

  return (
    <Link
      to={ROUTES.dashboard}
      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-secondary/30"
    >
      {/* Avatar */}
      <Avatar className="mt-0.5 h-8 w-8 shrink-0">
        {actor?.avatar_url ? <AvatarImage src={actor.avatar_url} /> : null}
        <AvatarFallback className="text-[10px]">
          {getInitials(actorName)}
        </AvatarFallback>
      </Avatar>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium text-foreground">{actorName}</span>{" "}
          <span className="text-muted-foreground">{verb}</span>{" "}
          <span className="font-mono text-xs text-primary">
            {task.task_code}
          </span>
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {task.concept}
          {task.client?.party_name ? ` — ${task.client.party_name}` : ""}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground/60">
          {formatDistanceToNow(new Date(task.updated_at), { addSuffix: true })}
        </p>
      </div>

      {/* Badges */}
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge className={cn("text-[9px]", STATUS_COLORS[task.status])}>
          {STATUS_LABELS[task.status]}
        </Badge>
        {task.priority === "urgent" && (
          <Badge className={cn("text-[9px]", PRIORITY_COLORS.urgent)}>
            Urgent
          </Badge>
        )}
      </div>
    </Link>
  );
}
