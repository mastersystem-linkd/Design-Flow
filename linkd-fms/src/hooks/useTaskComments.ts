import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { TaskCommentWithAuthor } from "@/types/database";

export type MutationResult<T> = { data: T | null; error: string | null };

export interface UseTaskComments {
  comments: TaskCommentWithAuthor[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addComment: (body: string) => Promise<MutationResult<TaskCommentWithAuthor>>;
  editComment: (
    id: string,
    body: string
  ) => Promise<MutationResult<TaskCommentWithAuthor>>;
  deleteComment: (id: string) => Promise<MutationResult<{ id: string }>>;
}

const SELECT = `
  *,
  author:profiles!task_comments_user_id_fkey(id, full_name, avatar_url, role)
`;

/**
 * Comment thread for a single task. Backed by `task_comments` (migration 0017).
 *
 *  - Reads: `select` joins author profile so the UI can render avatar + name
 *    without a second round-trip.
 *  - Mutations return `{ data, error }` — never throw.
 *  - Realtime: subscribes to INSERTs on this task's row so a new comment
 *    posted from another tab/session appears live without a refetch.
 *
 * Pass `null` to disable (e.g. when no task is selected in the drawer).
 */
export function useTaskComments(taskId: string | null): UseTaskComments {
  const { user } = useAuth();
  const [comments, setComments] = useState<TaskCommentWithAuthor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!taskId) {
      setComments([]);
      setIsLoading(false);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("task_comments")
      .select(SELECT)
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    if (err) {
      console.error("[useTaskComments] query error", err);
      setError(err.message);
      setComments([]);
    } else {
      setComments((data ?? []) as unknown as TaskCommentWithAuthor[]);
    }
    setIsLoading(false);
  }, [taskId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // ── Realtime: prepend new comments live (other tabs / sessions) ──
  useEffect(() => {
    if (!taskId) return;
    const channel = supabase
      .channel(`task-comments-${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "task_comments",
          filter: `task_id=eq.${taskId}`,
        },
        () => {
          // Cheapest correct behavior: refetch the small list. We could
          // hand-merge the payload but the joined author isn't in payload.new,
          // so a refetch keeps avatar + name accurate.
          void refetch();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [taskId, refetch]);

  // ── Mutations ──────────────────────────────────────────────────────

  const addComment = useCallback<UseTaskComments["addComment"]>(
    async (body) => {
      if (!user) return { data: null, error: "Not authenticated" };
      if (!taskId) return { data: null, error: "No task selected" };
      const trimmed = body.trim();
      if (!trimmed) return { data: null, error: "Comment is empty" };
      if (trimmed.length > 2000)
        return { data: null, error: "Comment too long (max 2000 chars)" };

      const { data, error: err } = await supabase
        .from("task_comments")
        .insert({ task_id: taskId, user_id: user.id, body: trimmed })
        .select(SELECT)
        .single();

      if (err) {
        console.error("[useTaskComments] insert", err);
        return { data: null, error: err.message };
      }
      const row = data as unknown as TaskCommentWithAuthor;
      // Optimistic local append — Realtime would re-fire but the dedup-by-id
      // below keeps the list clean.
      setComments((prev) =>
        prev.some((c) => c.id === row.id) ? prev : [...prev, row]
      );
      return { data: row, error: null };
    },
    [taskId, user]
  );

  const editComment = useCallback<UseTaskComments["editComment"]>(
    async (id, body) => {
      if (!user) return { data: null, error: "Not authenticated" };
      const trimmed = body.trim();
      if (!trimmed) return { data: null, error: "Comment is empty" };
      if (trimmed.length > 2000)
        return { data: null, error: "Comment too long (max 2000 chars)" };

      const { data, error: err } = await supabase
        .from("task_comments")
        .update({ body: trimmed })
        .eq("id", id)
        .select(SELECT)
        .single();

      if (err) {
        console.error("[useTaskComments] update", err);
        return { data: null, error: err.message };
      }
      const row = data as unknown as TaskCommentWithAuthor;
      setComments((prev) => prev.map((c) => (c.id === id ? row : c)));
      return { data: row, error: null };
    },
    [user]
  );

  const deleteComment = useCallback<UseTaskComments["deleteComment"]>(
    async (id) => {
      if (!user) return { data: null, error: "Not authenticated" };
      const { error: err } = await supabase
        .from("task_comments")
        .delete()
        .eq("id", id);
      if (err) {
        console.error("[useTaskComments] delete", err);
        return { data: null, error: err.message };
      }
      setComments((prev) => prev.filter((c) => c.id !== id));
      return { data: { id }, error: null };
    },
    [user]
  );

  return {
    comments,
    isLoading,
    error,
    refetch,
    addComment,
    editComment,
    deleteComment,
  };
}
