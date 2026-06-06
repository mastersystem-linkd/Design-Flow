CREATE OR REPLACE FUNCTION public.recalc_task_from_assignments()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_task_id       UUID;
  v_task_qty      INTEGER;
  v_n             INTEGER;
  v_completed     INTEGER;
  v_done_plus     INTEGER;
  v_sum_assigned  INTEGER;
  v_sum_completed INTEGER;
  v_remaining     INTEGER;
  v_new_status    public.task_status;
BEGIN
  v_task_id := COALESCE(NEW.task_id, OLD.task_id);

  SELECT qty INTO v_task_qty FROM public.tasks WHERE id = v_task_id;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status IN ('done','completed')),
    COALESCE(SUM(qty_assigned), 0),
    COALESCE(SUM(qty_completed), 0)
  INTO v_n, v_completed, v_done_plus, v_sum_assigned, v_sum_completed
  FROM public.task_assignments
  WHERE task_id = v_task_id;

  -- Last portion removed → return the whole task to the pool.
  IF v_n = 0 THEN
    UPDATE public.tasks
       SET status        = 'pool',
           assigned_to   = NULL,
           started_at    = NULL,
           is_split      = false,
           qty_remaining = NULL,
           qty_completed = 0
     WHERE id = v_task_id;
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_remaining := GREATEST(v_task_qty - v_sum_assigned, 0);

  -- DECISION 6: completed only when ALL portions completed AND nothing left unclaimed.
  -- Any task with assignment rows must be in_progress (at minimum) — never stay "pool".
  IF v_completed = v_n AND v_remaining = 0 THEN
    v_new_status := 'completed';
  ELSIF v_done_plus = v_n AND v_remaining = 0 THEN
    v_new_status := 'done';
  ELSE
    v_new_status := 'in_progress';
  END IF;

  UPDATE public.tasks
     SET qty_completed = v_sum_completed,
         qty_remaining = v_remaining,
         is_split      = (v_n > 1),
         status        = v_new_status
   WHERE id = v_task_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;
