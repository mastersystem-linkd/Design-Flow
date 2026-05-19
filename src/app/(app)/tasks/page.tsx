import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { STATUS_LABELS, STATUS_COLORS, PRIORITY_COLORS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { requireProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { TaskStatus } from "@/types/database";

const BOARD_COLUMNS: TaskStatus[] = [
  "pool",
  "todo",
  "in_progress",
  "full_kitting",
  "approved",
  "sampling",
  "done",
];

export default async function TasksPage() {
  const me = await requireProfile();
  const supabase = createClient();
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select(
      `*, client:clients(id, party_name), assignee:profiles!tasks_assigned_to_fkey(id, full_name, avatar_url, role)`
    )
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load tasks: {error.message}
      </div>
    );
  }

  const grouped = BOARD_COLUMNS.reduce<Record<TaskStatus, typeof tasks>>(
    (acc, col) => {
      acc[col] = [];
      return acc;
    },
    {} as Record<TaskStatus, typeof tasks>
  );

  for (const t of tasks ?? []) {
    (grouped[t.status as TaskStatus] ??= []).push(t);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            Kanban view across the design pipeline.
          </p>
        </div>
        {can(me.role, "tasks:create") && (
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            New task
          </Button>
        )}
      </div>

      <div className="grid auto-cols-[280px] grid-flow-col gap-4 overflow-x-auto pb-4">
        {BOARD_COLUMNS.map((status) => (
          <div key={status} className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[status]}`}
              >
                {STATUS_LABELS[status]}
              </span>
              <span className="text-xs text-muted-foreground">
                {grouped[status].length}
              </span>
            </div>
            <div className="space-y-2">
              {grouped[status].length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                  No tasks
                </div>
              ) : (
                grouped[status].map((task) => (
                  <Card key={task.id} className="hover:shadow">
                    <CardContent className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium leading-tight">
                          {task.concept}
                        </div>
                        <Badge
                          variant="secondary"
                          className={PRIORITY_COLORS[task.priority]}
                        >
                          {task.priority}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {task.client?.party_name ?? "—"} · {task.qty}m ·{" "}
                        {task.fabric}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {task.assignee?.full_name ?? "Unassigned"}
                        </span>
                        <span>
                          Due {formatDate(task.planned_deadline)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
