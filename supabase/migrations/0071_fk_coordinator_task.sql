-- ═══════════════════════════════════════════
-- "Continue Without Full Knitting" → coordinator to-do
-- ═══════════════════════════════════════════
-- When a designer claims a task that needs Full Knitting but the coordinator
-- hasn't added the details, the designer can choose "Continue Without Full
-- Knitting". That should drop a to-do into the coordinator's task list so they
-- add the FK details. coordinator_tasks RLS is admin/coordinator-only, so a
-- designer can't INSERT directly — this SECURITY DEFINER RPC does it for them
-- (same pattern as the notify_user RPC). Deduped: one open FK to-do per task.

CREATE OR REPLACE FUNCTION public.create_fk_coordinator_task(
  p_task_code     TEXT,
  p_designer_name TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Dedup: skip if an OPEN FK to-do for this task already exists.
  IF EXISTS (
    SELECT 1 FROM public.coordinator_tasks
    WHERE description LIKE '%' || p_task_code || '%'
      AND is_completed = false
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.coordinator_tasks (requester_name, description, requested_at, created_by)
  VALUES (
    COALESCE(NULLIF(p_designer_name, ''), 'A designer'),
    'Add Full Knitting details for ' || COALESCE(p_task_code, 'a task')
      || ' — designer started working without them.',
    now(),
    auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_fk_coordinator_task(TEXT, TEXT) TO authenticated;
