-- ═══════════════════════════════════════════════════════════════════════
-- 0090 — create_fk_coordinator_task returns whether it created a NEW to-do
-- ═══════════════════════════════════════════════════════════════════════
-- The "Full Knitting Needed" coordinator notification was firing on EVERY
-- flag (each claim + each "Ask Coordinator" click), so one FK task produced
-- multiple identical pings in the coordinator's feed. The to-do itself was
-- already deduped per task (0072); this makes the RPC report whether a NEW
-- to-do was actually created so the client can notify ONLY on the first flag.
--
-- Dedup must be server-side: `notifications` RLS is own-only, so a designer's
-- client can't check whether coordinators were already pinged.
--
-- Behaviour is otherwise identical to 0072 — only the return type changes
-- (void → boolean: true = created, false = an open to-do already existed).

DROP FUNCTION IF EXISTS public.create_fk_coordinator_task(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_fk_coordinator_task(
  p_task_id       UUID,
  p_task_code     TEXT,
  p_designer_name TEXT
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Dedup: an OPEN FK to-do for this task already exists → created nothing.
  IF EXISTS (
    SELECT 1 FROM public.coordinator_tasks
    WHERE is_completed = false
      AND (
        (p_task_id IS NOT NULL AND related_task_id = p_task_id)
        OR description LIKE 'Add Full Knitting details for ' || p_task_code || '%'
      )
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.coordinator_tasks
    (requester_name, description, requested_at, created_by, related_task_id)
  VALUES (
    COALESCE(NULLIF(p_designer_name, ''), 'A designer'),
    'Add Full Knitting details for ' || COALESCE(p_task_code, 'a task')
      || ' — designer started working without them.',
    now(),
    auth.uid(),
    p_task_id
  );

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_fk_coordinator_task(UUID, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
