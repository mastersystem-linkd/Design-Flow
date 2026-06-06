CREATE OR REPLACE FUNCTION public.update_assignment_claim(p_id UUID, p_new_qty INTEGER)
RETURNS TABLE (new_qty INTEGER, deleted BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_designer UUID;
  v_task_id  UUID;
  v_qty_done INTEGER;
  v_status   TEXT;
  v_task_qty INTEGER;
  v_others   INTEGER;
  v_ceiling  INTEGER;
BEGIN
  SELECT designer_id, task_id, qty_completed, status
    INTO v_designer, v_task_id, v_qty_done, v_status
  FROM public.task_assignments WHERE id = p_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found'; END IF;

  -- Owner or admin/coordinator only.
  IF auth.uid() <> v_designer AND NOT public.is_admin_or_coordinator() THEN
    RAISE EXCEPTION 'Not allowed to edit this assignment';
  END IF;

  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'Cannot change a completed portion';
  END IF;

  -- Lock parent so sibling sums are consistent.
  SELECT qty INTO v_task_qty FROM public.tasks WHERE id = v_task_id FOR UPDATE;

  SELECT COALESCE(SUM(qty_assigned), 0) INTO v_others
  FROM public.task_assignments WHERE task_id = v_task_id AND id <> p_id;

  v_ceiling := v_task_qty - v_others;  -- max this portion can grow to

  -- Abandon (release everything) — only when nothing completed yet.
  IF p_new_qty <= 0 THEN
    IF v_qty_done > 0 THEN
      RAISE EXCEPTION 'Cannot drop to 0 — % designs already completed', v_qty_done;
    END IF;
    DELETE FROM public.task_assignments WHERE id = p_id;
    new_qty := 0; deleted := true; RETURN NEXT; RETURN;
  END IF;

  IF p_new_qty < v_qty_done THEN
    RAISE EXCEPTION 'Cannot claim fewer than the % already completed', v_qty_done;
  END IF;

  IF p_new_qty > v_ceiling THEN
    RAISE EXCEPTION 'Only % designs remain in the pool', GREATEST(v_ceiling - v_qty_done, 0);
  END IF;

  UPDATE public.task_assignments SET qty_assigned = p_new_qty WHERE id = p_id;
  new_qty := p_new_qty; deleted := false; RETURN NEXT; RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_assignment_claim(UUID, INTEGER) TO authenticated;
