import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type {
  FileRecord,
  Profile,
  TaskLog,
  TaskWithRelations,
} from "@/types/database";

type ProfileLite = Pick<Profile, "id" | "full_name" | "role" | "avatar_url">;

export interface FileWithUploader extends FileRecord {
  uploader: ProfileLite | null;
}

export interface TaskLogWithUser extends TaskLog {
  changer: ProfileLite | null;
}

interface TaskDetailBundle {
  task: TaskWithRelations | null;
  files: FileWithUploader[];
  logs: TaskLogWithUser[];
}

export interface UseTaskDetailResult extends TaskDetailBundle {
  isLoading: boolean;
  error: string | null;
  refetch: () => unknown;
}

const TASK_SELECT = `
  *,
  client:clients!tasks_client_id_fkey(id, party_name),
  assignee:profiles!tasks_assigned_to_fkey(id, full_name, role, avatar_url),
  creator:profiles!tasks_created_by_fkey(id, full_name, role, avatar_url),
  filler:profiles!completion_filled_by(id, full_name, role, avatar_url),
  carry_forwarder:profiles!tasks_carry_forward_from_fkey(id, full_name, role, avatar_url),
  files(id, file_name)
`;

const FILE_SELECT = `
  *,
  uploader:profiles!files_uploaded_by_fkey(id, full_name, role, avatar_url)
`;

const LOG_SELECT = `
  *,
  changer:profiles!task_logs_changed_by_fkey(id, full_name, role, avatar_url)
`;

async function fetchTaskDetail(taskId: string): Promise<TaskDetailBundle> {
  const [taskRes, filesRes, logsRes] = await Promise.all([
    supabase.from("tasks").select(TASK_SELECT).eq("id", taskId).single(),
    supabase
      .from("files")
      .select(FILE_SELECT)
      .eq("task_id", taskId)
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("task_logs")
      .select(LOG_SELECT)
      .eq("task_id", taskId)
      .order("timestamp", { ascending: false }),
  ]);

  if (taskRes.error) throw taskRes.error;
  return {
    task: taskRes.data as unknown as TaskWithRelations,
    files: (filesRes.data ?? []) as unknown as FileWithUploader[],
    logs: (logsRes.data ?? []) as unknown as TaskLogWithUser[],
  };
}

/**
 * Fetches a task + its files + its activity log in parallel. Re-runs whenever
 * `taskId` changes. Pass `null` to disable.
 */
export function useTaskDetail(taskId: string | null): UseTaskDetailResult {
  const enabled = !!taskId;
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.tasks.detail(taskId ?? ""),
    queryFn: () => fetchTaskDetail(taskId as string),
    enabled,
  });

  return {
    task: data?.task ?? null,
    files: data?.files ?? [],
    logs: data?.logs ?? [],
    isLoading: enabled ? isLoading : false,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}
