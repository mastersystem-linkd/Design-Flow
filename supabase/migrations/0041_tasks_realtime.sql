-- ============================================================================
-- 0041_tasks_realtime.sql
-- ----------------------------------------------------------------------------
-- Pool System fix: make the `tasks` table broadcast Realtime changes.
--
-- `useTasks` already subscribes to postgres_changes on public.tasks and
-- invalidates the React Query cache on any change — BUT the table was never
-- added to the `supabase_realtime` publication (only `notifications` was, in
-- 0013). Result: the subscription fired on nothing, so a task claimed by one
-- designer stayed visible in everyone else's Pool until a manual refresh.
--
-- Adding the table to the publication makes claims/assignments propagate live
-- (~1s) across all open sessions. The optimistic-lock guards in
-- useTaskMutations still protect data integrity within the sub-second race
-- window; this just keeps the UI honest.
-- ============================================================================

DO $$
BEGIN
  -- Add only if not already a member (ALTER PUBLICATION ... ADD TABLE errors
  -- if the table is already published).
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  END IF;
END $$;

-- REPLICA IDENTITY FULL so UPDATE events carry the old row too — lets clients
-- that filter on column changes (e.g. status leaving 'pool') react reliably.
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
