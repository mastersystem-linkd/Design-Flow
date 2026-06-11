-- ═══════════════════════════════════════════════════════════════════════
-- FK coordinator to-do: hard link to the task + auto-complete on FK-add
-- ═══════════════════════════════════════════════════════════════════════
-- Builds on 0071. The "Add Full Knitting details for …" to-do now carries a
-- hard link (related_task_id) to the task it's about, so:
--   • the coordinator can jump straight from the to-do to that task, and
--   • the to-do auto-closes the moment the coordinator adds Full Knitting.
-- Both RPCs stay SECURITY DEFINER (coordinator_tasks RLS is admin/coord-only,
-- but the create call is triggered by a designer's claim).

-- ── 1. Link column ───────────────────────────────────────────────────────
ALTER TABLE public.coordinator_tasks
  ADD COLUMN IF NOT EXISTS related_task_id UUID
    REFERENCES public.tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coordinator_tasks_related_task
  ON public.coordinator_tasks(related_task_id)
  WHERE related_task_id IS NOT NULL;

-- ── 2. Re-create the "create" RPC with the task id ──────────────────────
-- (Adding a param changes the signature → drop the old 2-arg version first.)
DROP FUNCTION IF EXISTS public.create_fk_coordinator_task(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_fk_coordinator_task(
  p_task_id       UUID,
  p_task_code     TEXT,
  p_designer_name TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Dedup: skip if an OPEN FK to-do for this task already exists. Match on
  -- the hard link OR the legacy description (absorbs pre-0072 rows).
  IF EXISTS (
    SELECT 1 FROM public.coordinator_tasks
    WHERE is_completed = false
      AND (
        (p_task_id IS NOT NULL AND related_task_id = p_task_id)
        OR description LIKE 'Add Full Knitting details for ' || p_task_code || '%'
      )
  ) THEN
    RETURN;
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_fk_coordinator_task(UUID, TEXT, TEXT) TO authenticated;

-- ── 3. Auto-complete RPC — fired when the coordinator adds Full Knitting ──
-- Closes EVERY open FK to-do for the task (hard link OR legacy description),
-- so re-claims that piled up multiple to-dos all resolve at once.
CREATE OR REPLACE FUNCTION public.complete_fk_coordinator_task(
  p_task_id   UUID,
  p_task_code TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.coordinator_tasks
  SET is_completed = true,
      completed_at = now()
  WHERE is_completed = false
    AND (
      (p_task_id IS NOT NULL AND related_task_id = p_task_id)
      OR description LIKE 'Add Full Knitting details for ' || p_task_code || '%'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_fk_coordinator_task(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
