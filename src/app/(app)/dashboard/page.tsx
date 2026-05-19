import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";
import type { TaskStatus } from "@/types/database";

const STATUS_ORDER: TaskStatus[] = [
  "pool",
  "todo",
  "in_progress",
  "full_kitting",
  "approved",
  "sampling",
  "done",
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { forbidden?: string };
}) {
  const supabase = createClient();
  const { data: tasks } = await supabase.from("tasks").select("status");

  const counts = STATUS_ORDER.reduce<Record<TaskStatus, number>>((acc, s) => {
    acc[s] = 0;
    return acc;
  }, {} as Record<TaskStatus, number>);

  for (const t of tasks ?? []) {
    counts[t.status as TaskStatus] = (counts[t.status as TaskStatus] ?? 0) + 1;
  }

  const total = tasks?.length ?? 0;

  return (
    <div className="space-y-6">
      {searchParams.forbidden && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You don't have access to that page. Ask an admin if you need it.
        </div>
      )}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {total} task{total === 1 ? "" : "s"} across the pipeline.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATUS_ORDER.map((status) => (
          <Card key={status}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {STATUS_LABELS[status]}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold">{counts[status]}</span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[status]}`}
                >
                  {status}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
