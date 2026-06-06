-- RPC: finalize_parent_task
-- Called after the last portion is completed. The recalc trigger sets
-- status='completed' but never stamps completed_at. This RPC does both,
-- and also acts as a safety net if the trigger didn't fire.

CREATE OR REPLACE FUNCTION public.finalize_parent_task(p_task_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n             INTEGER;
  v_completed     INTEGER;
  v_remaining     INTEGER;
  v_current       public.task_status;
BEGIN
  SELECT status INTO v_current FROM public.tasks WHERE id = p_task_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Already completed — nothing to do.
  IF v_current = 'completed' THEN
    -- Just ensure completed_at is stamped (backfill if trigger missed it).
    UPDATE public.tasks
       SET completed_at = COALESCE(completed_at, now())
     WHERE id = p_task_id AND completed_at IS NULL;
    RETURN;
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    GREATEST((SELECT qty FROM public.tasks WHERE id = p_task_id)
             - COALESCE(SUM(qty_assigned), 0), 0)
  INTO v_n, v_completed, v_remaining
  FROM public.task_assignments
  WHERE task_id = p_task_id;

  -- All portions completed and nothing left unclaimed → finalize.
  IF v_n > 0 AND v_completed = v_n AND v_remaining = 0 THEN
    UPDATE public.tasks
       SET status       = 'completed',
           completed_at = COALESCE(completed_at, now()),
           qty_completed = (SELECT COALESCE(SUM(qty_completed), 0)
                            FROM public.task_assignments WHERE task_id = p_task_id)
     WHERE id = p_task_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_parent_task(UUID) TO authenticated;
