-- ═══════════════════════════════════════════════════════════════════════
-- split_my_claim — designer splits off part of their OWN full claim
-- ═══════════════════════════════════════════════════════════════════════
-- A designer who claimed a whole task as an individual (tasks.assigned_to =
-- them, not split) decides to keep only part of it and release the rest to the
-- pool. This needs to (1) insert their kept work as a task_assignment and
-- (2) null tasks.assigned_to + mark it split — ATOMICALLY.
--
-- A designer CANNOT do step 2 from the client: RLS (`tasks_update_assignee_or_creator`)
-- only lets them write a row where the NEW assigned_to is still themselves, so
-- setting assigned_to = NULL is rejected (42501). Doing the two writes separately
-- would also leave an orphan assignment if step 2 fails. So both run here, in one
-- transaction, as SECURITY DEFINER (same pattern as update_assignment_claim /
-- finalize_parent_task). Ownership + state are validated server-side.

CREATE OR REPLACE FUNCTION public.split_my_claim(
  p_task_id UUID,
  p_keep    INTEGER
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_task RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, qty, qty_completed, assigned_to, status, is_split,
         concept, fabric, planned_deadline, started_at
    INTO v_task
  FROM public.tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  -- ── Authoritative guards ──
  IF v_task.assigned_to IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'You can only split a task that is assigned to you';
  END IF;
  IF v_task.is_split THEN
    RAISE EXCEPTION 'This task is already split';
  END IF;
  IF v_task.status NOT IN ('in_progress', 'full_kitting') THEN
    RAISE EXCEPTION 'You can only split a task that is in progress';
  END IF;
  IF p_keep IS NULL OR p_keep < 1 OR p_keep >= v_task.qty THEN
    RAISE EXCEPTION 'Keep between 1 and % designs', v_task.qty - 1;
  END IF;
  IF p_keep < COALESCE(v_task.qty_completed, 0) THEN
    RAISE EXCEPTION 'You cannot keep fewer than the % already completed',
      v_task.qty_completed;
  END IF;

  -- 1) Kept work becomes the designer's own portion. The recalc trigger rolls
  --    this up to the parent (qty_remaining = qty − keep > 0 → pool-claimable).
  INSERT INTO public.task_assignments
    (task_id, designer_id, assigned_by, qty_assigned, qty_completed, status,
     planned_deadline, started_at, design_type, completion_fabric)
  VALUES
    (p_task_id, v_uid, v_uid, p_keep, COALESCE(v_task.qty_completed, 0),
     'in_progress', v_task.planned_deadline, COALESCE(v_task.started_at, now()),
     v_task.concept, NULLIF(v_task.fabric, ''));

  -- 2) Release the rest: drop the full-task ownership + mark it split.
  UPDATE public.tasks
  SET assigned_to = NULL,
      is_split    = TRUE
  WHERE id = p_task_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.split_my_claim(UUID, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
