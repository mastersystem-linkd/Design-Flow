import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
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

export interface UseTaskDetailResult {
  task: TaskWithRelations | null;
  files: FileWithUploader[];
  logs: TaskLogWithUser[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const TASK_SELECT = `
  *,
  client:clients!tasks_client_id_fkey(id, party_name),
  assignee:profiles!tasks_assigned_to_fkey(id, full_name, role, avatar_url),
  creator:profiles!tasks_created_by_fkey(id, full_name, role, avatar_url),
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

/**
 * Fetches a task + its files + its activity log in parallel. Re-runs whenever
 * `taskId` changes. Pass `null` to disable.
 */
export function useTaskDetail(taskId: string | null): UseTaskDetailResult {
  const [task, setTask] = useState<TaskWithRelations | null>(null);
  const [files, setFiles] = useState<FileWithUploader[]>([]);
  const [logs, setLogs] = useState<TaskLogWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!taskId) {
      setTask(null);
      setFiles([]);
      setLogs([]);
      setError(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);

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

    if (taskRes.error) {
      setError(taskRes.error.message);
      setTask(null);
      setFiles([]);
      setLogs([]);
    } else {
      setTask(taskRes.data as unknown as TaskWithRelations);
      setFiles((filesRes.data ?? []) as unknown as FileWithUploader[]);
      setLogs((logsRes.data ?? []) as unknown as TaskLogWithUser[]);
    }
    setIsLoading(false);
  }, [taskId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  return { task, files, logs, isLoading, error, refetch: fetchAll };
}
